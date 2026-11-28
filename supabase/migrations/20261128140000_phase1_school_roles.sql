-- Phase 1: school identity and roles.
-- Class levels and enrolment sources, class reps, student offices (SUG and others),
-- code attendance, one-step admission, automatic class assignment, the school's
-- student list, badges, and scoped announcements.

-- ---------------------------------------------------------------------------
-- Classes: level and join approval; enrolments remember how they were made
-- ---------------------------------------------------------------------------
alter table public.class_offerings
  add column if not exists level text,
  add column if not exists join_approval boolean not null default false;

alter table public.class_enrollments
  add column if not exists source text not null default 'manual';
alter table public.class_enrollments drop constraint if exists class_enrollments_source_check;
alter table public.class_enrollments
  add constraint class_enrollments_source_check check (source in ('auto', 'code', 'manual', 'csv'));

-- ---------------------------------------------------------------------------
-- Class reps live in class_staff, with an invitation the student must accept
-- ---------------------------------------------------------------------------
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.class_staff'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%role%'
  loop
    execute format('alter table public.class_staff drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.class_staff
  add constraint class_staff_role_check check (role in ('co_lecturer', 'ta', 'class_rep', 'assistant_rep'));
alter table public.class_staff
  add column if not exists status text not null default 'active',
  add column if not exists appointed_by uuid references auth.users(id) on delete set null,
  add column if not exists term_ends_on date,
  add column if not exists responded_at timestamptz;
alter table public.class_staff drop constraint if exists class_staff_status_check;
alter table public.class_staff
  add constraint class_staff_status_check check (status in ('invited', 'active', 'declined', 'ended'));

-- Reps never get lecturer powers (grades, rosters): only co-lecturers and TAs manage a class.
create or replace function public.can_manage_class(p_class_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_staff()
    or exists (select 1 from public.class_offerings c where c.id = p_class_id and c.lecturer_user_id = auth.uid())
    or exists (
      select 1 from public.class_staff s
      where s.class_id = p_class_id and s.user_id = auth.uid()
        and s.role in ('co_lecturer', 'ta') and s.status = 'active'
    );
$$;

create or replace function public.is_class_rep(p_class_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.class_staff s
    where s.class_id = p_class_id and s.user_id = auth.uid()
      and s.role in ('class_rep', 'assistant_rep') and s.status = 'active'
      and (s.term_ends_on is null or s.term_ends_on >= current_date)
  );
$$;

drop policy if exists class_staff_all on public.class_staff;
drop policy if exists class_staff_read on public.class_staff;
drop policy if exists class_staff_write on public.class_staff;
create policy class_staff_read on public.class_staff for select using (
  public.can_manage_class(class_id) or public.is_staff()
  or user_id = auth.uid() or public.is_enrolled_in_class(class_id)
);
-- Reps are appointed and removed only through appoint_class_rep / remove_class_rep.
create policy class_staff_write on public.class_staff for all
  using ((public.can_manage_class(class_id) or public.is_staff()) and role in ('co_lecturer', 'ta'))
  with check ((public.can_manage_class(class_id) or public.is_staff()) and role in ('co_lecturer', 'ta'));

alter table public.class_announcements
  add column if not exists author_role text not null default 'lecturer';

-- ---------------------------------------------------------------------------
-- Student offices: SUG President, VP, faculty and department leaders, custom titles
-- ---------------------------------------------------------------------------
create table if not exists public.student_offices (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  office text not null,
  title text not null check (length(trim(title)) between 2 and 60),
  scope text not null default 'school' check (scope in ('school', 'faculty', 'department')),
  scope_id uuid,
  scope_label text,
  status text not null default 'invited' check (status in ('invited', 'active', 'declined', 'ended')),
  term_starts_on date not null default current_date,
  term_ends_on date,
  appointed_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists student_offices_institution_idx on public.student_offices (institution_id, status);
create index if not exists student_offices_user_idx on public.student_offices (user_id);

alter table public.student_offices enable row level security;
drop policy if exists student_offices_read on public.student_offices;
create policy student_offices_read on public.student_offices for select using (
  user_id = auth.uid() or status = 'active'
  or public.is_school_admin_for(institution_id) or public.is_staff()
);
revoke all on public.student_offices from anon;
revoke insert, update, delete, truncate on public.student_offices from authenticated;
grant select on public.student_offices to authenticated;

-- ---------------------------------------------------------------------------
-- Announcements from student leaders reach only their scope
-- ---------------------------------------------------------------------------
alter table public.school_announcements
  add column if not exists office_id uuid references public.student_offices(id) on delete set null,
  add column if not exists scope text not null default 'school',
  add column if not exists scope_id uuid,
  add column if not exists author_label text;
alter table public.school_announcements drop constraint if exists school_announcements_scope_check;
alter table public.school_announcements
  add constraint school_announcements_scope_check check (scope in ('school', 'faculty', 'department'));

create or replace function public.notify_school_announcement()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, title, body, link)
  select distinct cm.user_id,
         'Campus announcement: ' || new.title,
         left(coalesce(case when new.author_label is not null then new.author_label || ': ' else '' end, '') || coalesce(new.body, ''), 300),
         '/notifications'
    from public.campus_memberships cm
   where cm.institution_id = new.institution_id
     and cm.user_id is distinct from new.author_user_id
     and (
       new.scope = 'school'
       or (new.scope = 'department' and cm.department_id = new.scope_id)
       or (new.scope = 'faculty' and exists (
             select 1 from public.departments d where d.id = cm.department_id and d.faculty_id = new.scope_id))
     );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Code attendance: a 6-digit code that changes every 30 seconds
-- ---------------------------------------------------------------------------
alter table public.class_attendance_sessions
  add column if not exists method text not null default 'manual',
  add column if not exists code_secret text,
  add column if not exists opens_at timestamptz,
  add column if not exists closes_at timestamptz,
  add column if not exists taken_by uuid references auth.users(id) on delete set null;
alter table public.class_attendance_sessions drop constraint if exists class_attendance_sessions_method_check;
alter table public.class_attendance_sessions
  add constraint class_attendance_sessions_method_check check (method in ('manual', 'code'));

create table if not exists public.class_attendance_attempts (
  session_id uuid not null references public.class_attendance_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  wrong int not null default 0,
  primary key (session_id, user_id)
);
alter table public.class_attendance_attempts enable row level security;
revoke all on public.class_attendance_attempts from anon, authenticated;

create or replace function public.attendance_code_for(p_secret text, p_bucket bigint)
returns text
language sql immutable
set search_path = public
as $$
  select lpad((abs(('x' || substr(md5(p_secret || ':' || p_bucket::text), 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0');
$$;
revoke execute on function public.attendance_code_for(text, bigint) from public, anon, authenticated;

create or replace function public.open_code_attendance(p_class uuid, p_minutes int default 10, p_label text default null)
returns uuid
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  sid uuid;
  mins int := least(greatest(coalesce(p_minutes, 10), 2), 60);
begin
  if me is null then raise exception 'Sign in first'; end if;
  if not (public.can_manage_class(p_class) or public.is_class_rep(p_class)) then
    raise exception 'Only the lecturer or a class rep can take attendance';
  end if;
  update public.class_attendance_sessions
     set closes_at = now()
   where class_id = p_class and method = 'code' and closes_at > now();
  insert into public.class_attendance_sessions (class_id, held_at, label, created_by, method, code_secret, opens_at, closes_at, taken_by)
  values (p_class, now(), coalesce(nullif(trim(p_label), ''), to_char(now() at time zone 'Africa/Lagos', 'Dy DD Mon, HH12:MI AM')),
          me, 'code', encode(gen_random_bytes(16), 'hex'), now(), now() + make_interval(mins => mins), me)
  returning id into sid;
  return sid;
end;
$$;

create or replace function public.attendance_code(p_session uuid)
returns table (code text, seconds_left int, present int, enrolled int, closes_at timestamptz)
language plpgsql security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  s public.class_attendance_sessions%rowtype;
  bucket bigint := floor(extract(epoch from now()) / 30)::bigint;
begin
  select * into s from public.class_attendance_sessions where id = p_session;
  if not found then raise exception 'Attendance not found'; end if;
  if not (public.can_manage_class(s.class_id) or public.is_class_rep(s.class_id)) then
    raise exception 'Not allowed';
  end if;
  return query select
    case when s.closes_at > now() then public.attendance_code_for(s.code_secret, bucket) else null end,
    (30 - (floor(extract(epoch from now()))::bigint % 30))::int,
    (select count(*)::int from public.class_attendance_records r where r.session_id = s.id and r.status in ('present', 'late')),
    (select count(*)::int from public.class_enrollments e where e.class_id = s.class_id and e.status = 'active'),
    s.closes_at;
end;
$$;

create or replace function public.close_attendance(p_session uuid)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  s public.class_attendance_sessions%rowtype;
  marked int;
begin
  select * into s from public.class_attendance_sessions where id = p_session;
  if not found then raise exception 'Attendance not found'; end if;
  if not (public.can_manage_class(s.class_id) or public.is_class_rep(s.class_id)) then
    raise exception 'Not allowed';
  end if;
  update public.class_attendance_sessions set closes_at = least(coalesce(closes_at, now()), now()) where id = s.id;
  insert into public.class_attendance_records (session_id, student_user_id, status)
  select s.id, e.student_user_id, 'absent'
    from public.class_enrollments e
   where e.class_id = s.class_id and e.status = 'active'
  on conflict (session_id, student_user_id) do nothing;
  select count(*)::int into marked from public.class_attendance_records where session_id = s.id and status in ('present', 'late');
  return marked;
end;
$$;

-- Open attendance for a class, as the student sees it.
create or replace function public.class_open_attendance(p_class uuid)
returns table (session_id uuid, label text, closes_at timestamptz, marked boolean)
language sql stable security definer
set search_path = public
as $$
  select s.id, s.label, s.closes_at,
         exists (select 1 from public.class_attendance_records r
                 where r.session_id = s.id and r.student_user_id = auth.uid() and r.status in ('present', 'late'))
    from public.class_attendance_sessions s
   where s.class_id = p_class and s.method = 'code' and s.closes_at > now()
     and (public.is_enrolled_in_class(p_class) or public.can_manage_class(p_class) or public.is_class_rep(p_class))
   order by s.opens_at desc
   limit 1;
$$;

-- Returns ok, already, wrong, locked or closed. Wrong codes are counted, so it never raises for them.
create or replace function public.mark_attendance_with_code(p_class uuid, p_code text)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  s public.class_attendance_sessions%rowtype;
  bucket bigint := floor(extract(epoch from now()) / 30)::bigint;
  tries int;
  clean text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
begin
  if me is null then raise exception 'Sign in first'; end if;
  if not public.is_enrolled_in_class(p_class) then raise exception 'You are not in this class'; end if;
  select * into s from public.class_attendance_sessions
   where class_id = p_class and method = 'code' and closes_at > now()
   order by opens_at desc limit 1;
  if not found then return 'closed'; end if;
  if exists (select 1 from public.class_attendance_records r
             where r.session_id = s.id and r.student_user_id = me and r.status in ('present', 'late')) then
    return 'already';
  end if;
  select wrong into tries from public.class_attendance_attempts where session_id = s.id and user_id = me;
  if coalesce(tries, 0) >= 5 then return 'locked'; end if;
  if clean in (public.attendance_code_for(s.code_secret, bucket), public.attendance_code_for(s.code_secret, bucket - 1)) then
    insert into public.class_attendance_records (session_id, student_user_id, status)
    values (s.id, me, 'present')
    on conflict (session_id, student_user_id) do update set status = 'present';
    return 'ok';
  end if;
  insert into public.class_attendance_attempts (session_id, user_id, wrong) values (s.id, me, 1)
  on conflict (session_id, user_id) do update set wrong = public.class_attendance_attempts.wrong + 1;
  return 'wrong';
end;
$$;

-- ---------------------------------------------------------------------------
-- Automatic class assignment from the student's school, department and level
-- ---------------------------------------------------------------------------
create or replace function public.level_digits(p text)
returns text
language sql immutable
as $$ select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '') $$;

create or replace function public.add_class_timetable_for(p_class uuid, p_user uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  cls public.class_offerings%rowtype;
  lecturer_name text;
begin
  select * into cls from public.class_offerings where id = p_class;
  if not found then return; end if;
  select coalesce(p.preferred_name, p.full_name, p.first_name, 'Lecturer') into lecturer_name
    from public.profiles p where p.id = cls.lecturer_user_id;
  delete from public.timetable_entries te using public.class_timetable_slots s
   where te.class_slot_id = s.id and s.class_id = p_class and te.user_id = p_user;
  insert into public.timetable_entries (user_id, course_code, course_title, day_of_week, start_time, end_time, venue, lecturer, class_slot_id)
  select p_user, cls.course_code, cls.course_title, s.day_of_week, s.start_time, s.end_time, s.venue, lecturer_name, s.id
    from public.class_timetable_slots s where s.class_id = p_class;
end;
$$;

create or replace function public.assign_student_classes(p_user uuid)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  m record;
  lvl text;
  cls record;
  added int := 0;
  n int;
begin
  select institution_id, campus_id, department_id, year_of_study into m
    from public.campus_memberships
   where user_id = p_user and is_primary
   order by created_at desc limit 1;
  if not found then return 0; end if;
  lvl := public.level_digits(m.year_of_study);

  -- Automatic enrolments that no longer fit (new school, department or level) are removed.
  delete from public.timetable_entries te using public.class_timetable_slots s, public.class_enrollments e, public.class_offerings c
   where te.class_slot_id = s.id and s.class_id = e.class_id and te.user_id = p_user
     and e.student_user_id = p_user and e.source = 'auto' and c.id = e.class_id
     and not (c.institution_id = m.institution_id
              and (c.campus_id is null or m.campus_id is null or c.campus_id = m.campus_id)
              and (c.department_id is null or c.department_id = m.department_id)
              and (c.level is null or lvl is null or public.level_digits(c.level) = lvl));
  delete from public.class_enrollments e using public.class_offerings c
   where e.student_user_id = p_user and e.source = 'auto' and c.id = e.class_id
     and not (c.institution_id = m.institution_id
              and (c.campus_id is null or m.campus_id is null or c.campus_id = m.campus_id)
              and (c.department_id is null or c.department_id = m.department_id)
              and (c.level is null or lvl is null or public.level_digits(c.level) = lvl));

  for cls in
    select c.id from public.class_offerings c
     where c.is_active and c.auto_enroll and c.institution_id = m.institution_id
       and (c.campus_id is null or m.campus_id is null or c.campus_id = m.campus_id)
       and (c.department_id is null or c.department_id = m.department_id)
       and (c.level is null or lvl is null or public.level_digits(c.level) = lvl)
  loop
    insert into public.class_enrollments (class_id, student_user_id, status, added_by, source)
    values (cls.id, p_user, 'active', p_user, 'auto')
    on conflict (class_id, student_user_id) do nothing;
    get diagnostics n = row_count;
    if n > 0 then
      perform public.add_class_timetable_for(cls.id, p_user);
      added := added + 1;
    end if;
  end loop;
  return added;
end;
$$;

-- Kept for older app versions: saves the department, then assigns classes.
create or replace function public.auto_enroll_student_for_school(
  p_institution_id uuid,
  p_campus_id uuid default null,
  p_department_id uuid default null,
  p_department_name text default null
)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  dept uuid := p_department_id;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if dept is null and nullif(trim(p_department_name), '') is not null then
    select d.id into dept from public.departments d
     where d.institution_id = p_institution_id and lower(d.name) = lower(trim(p_department_name))
     limit 1;
  end if;
  update public.campus_memberships set
    department_id = coalesce(dept, department_id),
    department = coalesce(nullif(trim(p_department_name), ''), department)
  where user_id = uid and institution_id = p_institution_id;
  update public.student_enrollments set department_id = coalesce(dept, department_id)
  where user_id = uid and institution_id = p_institution_id;
  return public.assign_student_classes(uid);
end;
$$;

-- When a lecturer creates or opens a class with auto-join, students already in the school join it.
create or replace function public.class_offerings_auto_join()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  m record;
  lvl text := public.level_digits(new.level);
  n int;
begin
  if not (new.is_active and new.auto_enroll) then return new; end if;
  for m in
    select distinct cm.user_id from public.campus_memberships cm
     where cm.is_primary and cm.institution_id = new.institution_id
       and (new.campus_id is null or cm.campus_id is null or cm.campus_id = new.campus_id)
       and (new.department_id is null or cm.department_id = new.department_id)
       and (lvl is null or public.level_digits(cm.year_of_study) is null or public.level_digits(cm.year_of_study) = lvl)
       and cm.user_id <> new.lecturer_user_id
  loop
    insert into public.class_enrollments (class_id, student_user_id, status, added_by, source)
    values (new.id, m.user_id, 'active', new.lecturer_user_id, 'auto')
    on conflict (class_id, student_user_id) do nothing;
    get diagnostics n = row_count;
    if n > 0 then perform public.add_class_timetable_for(new.id, m.user_id); end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists class_offerings_auto_join on public.class_offerings;
create trigger class_offerings_auto_join
  after insert or update of auto_enroll, is_active, department_id, level, campus_id on public.class_offerings
  for each row execute function public.class_offerings_auto_join();

-- Joining by code is recorded as such, so a department change never removes it.
create or replace function public.join_class_by_code(p_code text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  cls public.class_offerings%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into cls from public.class_offerings
   where upper(join_code) = upper(trim(p_code)) and is_active = true
   limit 1;
  if not found then raise exception 'Invalid join code'; end if;
  insert into public.class_enrollments (class_id, student_user_id, status, added_by, source)
  values (cls.id, auth.uid(), case when cls.join_approval then 'invited' else 'active' end, auth.uid(), 'code')
  on conflict (class_id, student_user_id) do update
    set status = case when public.class_enrollments.status = 'active' then 'active'
                      when cls.join_approval then 'invited' else 'active' end,
        source = case when public.class_enrollments.source = 'auto' then 'code' else public.class_enrollments.source end;
  if not cls.join_approval then perform public.add_class_timetable_for(cls.id, auth.uid()); end if;
  return cls.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- One step for "I have been admitted" and for school onboarding
-- ---------------------------------------------------------------------------
create or replace function public.complete_admission(
  p_institution uuid,
  p_campus uuid,
  p_department_id uuid default null,
  p_department_name text default null,
  p_level text default null
)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  dept uuid := p_department_id;
  dept_name text;
  fac_name text;
  lvl text := public.level_digits(p_level);
  was_prep boolean;
  added int;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if not exists (select 1 from public.institutions i where i.id = p_institution and i.is_active) then
    raise exception 'Choose your school';
  end if;
  if p_campus is null or not exists (select 1 from public.campuses c where c.id = p_campus and c.institution_id = p_institution) then
    raise exception 'Choose your campus';
  end if;
  if dept is not null and not exists (select 1 from public.departments d where d.id = dept and d.institution_id = p_institution) then
    dept := null;
  end if;
  if dept is null and nullif(trim(p_department_name), '') is not null then
    select d.id into dept from public.departments d
     where d.institution_id = p_institution and lower(d.name) = lower(trim(p_department_name))
     limit 1;
  end if;
  select d.name, f.name into dept_name, fac_name
    from public.departments d left join public.faculties f on f.id = d.faculty_id
   where d.id = dept;
  dept_name := coalesce(dept_name, nullif(trim(p_department_name), ''));

  select kind = 'exam_prep' into was_prep from public.student_profiles where user_id = me;

  perform set_config('app.kind_change', '1', true);
  insert into public.student_profiles (user_id, kind, student_status, academic_level, department_name, faculty_name, updated_at)
  values (me, 'enrolled', 'current', lvl, dept_name, fac_name, now())
  on conflict (user_id) do update set
    kind = 'enrolled',
    student_status = case when public.student_profiles.kind = 'exam_prep' then 'fresher' else public.student_profiles.student_status end,
    academic_level = coalesce(excluded.academic_level, public.student_profiles.academic_level),
    department_name = coalesce(excluded.department_name, public.student_profiles.department_name),
    faculty_name = coalesce(excluded.faculty_name, public.student_profiles.faculty_name),
    updated_at = now();

  update public.campus_memberships set is_primary = false where user_id = me and campus_id <> p_campus;
  insert into public.campus_memberships (user_id, institution_id, campus_id, department, department_id, year_of_study, is_primary)
  values (me, p_institution, p_campus, dept_name, dept, lvl, true)
  on conflict (user_id, campus_id) do update set
    institution_id = excluded.institution_id,
    department = coalesce(excluded.department, public.campus_memberships.department),
    department_id = coalesce(excluded.department_id, public.campus_memberships.department_id),
    year_of_study = coalesce(excluded.year_of_study, public.campus_memberships.year_of_study),
    is_primary = true;

  update public.student_enrollments set is_primary = false where user_id = me and institution_id <> p_institution;
  insert into public.student_enrollments (user_id, institution_id, campus_id, department_id, is_primary, verification_status)
  values (me, p_institution, p_campus, dept, true, 'unverified')
  on conflict (user_id, institution_id, campus_id) do update set
    department_id = coalesce(excluded.department_id, public.student_enrollments.department_id),
    is_primary = true;

  added := public.assign_student_classes(me);

  if coalesce(was_prep, false) then
    insert into public.notifications (user_id, title, body, link)
    values (me, 'Welcome to your school',
            case when added > 0 then added || ' class' || case when added = 1 then '' else 'es' end || ' from your department were added.'
                 else 'Your courses, timetable and CGPA tools are ready.' end,
            '/study/classes');
  elsif added > 0 then
    insert into public.notifications (user_id, title, body, link)
    values (me, 'Your classes are ready',
            added || ' class' || case when added = 1 then '' else 'es' end || ' from your department were added.',
            '/study/classes');
  end if;

  return json_build_object('classes_added', added, 'department_id', dept, 'switched', coalesce(was_prep, false));
end;
$$;

-- ---------------------------------------------------------------------------
-- The school's student list (school authority only)
-- ---------------------------------------------------------------------------
create or replace function public.school_students(
  p_institution uuid,
  p_search text default null,
  p_department uuid default null,
  p_level text default null,
  p_verified text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  user_id uuid,
  full_name text,
  avatar_url text,
  email text,
  matric_number text,
  department text,
  department_id uuid,
  faculty text,
  level text,
  verification_status text,
  joined_at timestamptz,
  roles text[],
  total bigint
)
language plpgsql stable security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  q text := nullif(trim(coalesce(p_search, '')), '');
  lvl text := public.level_digits(p_level);
begin
  if not public.is_school_admin_for(p_institution) then
    raise exception 'Only the school authority can see this list';
  end if;
  return query
  with base as (
    select distinct on (cm.user_id)
      cm.user_id, cm.department, cm.department_id, cm.year_of_study, cm.created_at
    from public.campus_memberships cm
    where cm.institution_id = p_institution
    order by cm.user_id, cm.is_primary desc, cm.created_at desc
  )
  select
    b.user_id,
    coalesce(nullif(trim(p.full_name), ''), nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Student')::text,
    p.avatar_url,
    u.email::text,
    sp.matric_number,
    coalesce(d.name, b.department, sp.department_name)::text,
    b.department_id,
    f.name::text,
    coalesce(public.level_digits(b.year_of_study), public.level_digits(sp.academic_level))::text,
    coalesce(se.verification_status, 'unverified')::text,
    b.created_at,
    array(
      select o.title || case when o.scope <> 'school' and o.scope_label is not null then ' (' || o.scope_label || ')' else '' end
        from public.student_offices o
       where o.user_id = b.user_id and o.institution_id = p_institution and o.status in ('active', 'invited')
         and (o.term_ends_on is null or o.term_ends_on >= current_date)
      union all
      select case s.role when 'assistant_rep' then 'Assistant class rep' else 'Class rep' end || ' · ' || c.course_code
        from public.class_staff s join public.class_offerings c on c.id = s.class_id
       where s.user_id = b.user_id and c.institution_id = p_institution
         and s.role in ('class_rep', 'assistant_rep') and s.status in ('active', 'invited')
    ),
    count(*) over ()
  from base b
  join public.profiles p on p.id = b.user_id
  left join auth.users u on u.id = b.user_id
  left join public.student_profiles sp on sp.user_id = b.user_id
  left join public.student_enrollments se on se.user_id = b.user_id and se.institution_id = p_institution and se.is_primary
  left join public.departments d on d.id = b.department_id
  left join public.faculties f on f.id = d.faculty_id
  where coalesce(sp.kind, 'enrolled') = 'enrolled'
    and not exists (select 1 from public.lecturer_profiles lp where lp.user_id = b.user_id)
    and not exists (select 1 from public.school_authority_profiles sa where sa.user_id = b.user_id)
    and (q is null
         or p.full_name ilike '%' || q || '%'
         or concat_ws(' ', p.first_name, p.last_name) ilike '%' || q || '%'
         or p.preferred_name ilike '%' || q || '%'
         or sp.matric_number ilike '%' || q || '%'
         or u.email ilike '%' || q || '%')
    and (p_department is null or b.department_id = p_department)
    and (lvl is null or coalesce(public.level_digits(b.year_of_study), public.level_digits(sp.academic_level)) = lvl)
    and (p_verified is null
         or (p_verified = 'verified' and se.verification_status = 'verified')
         or (p_verified = 'unverified' and coalesce(se.verification_status, 'unverified') <> 'verified'))
  order by b.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Appointing student leaders and class reps
-- ---------------------------------------------------------------------------
create or replace function public.appoint_office(
  p_institution uuid,
  p_user uuid,
  p_office text,
  p_title text,
  p_scope text default 'school',
  p_scope_id uuid default null,
  p_term_ends_on date default null
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  label text;
  oid uuid;
  t text := trim(coalesce(p_title, ''));
begin
  if not public.is_school_admin_for(p_institution) then
    raise exception 'Only the school authority can appoint student leaders';
  end if;
  if length(t) < 2 or length(t) > 60 then raise exception 'Enter a title between 2 and 60 characters'; end if;
  if coalesce(p_scope, 'school') not in ('school', 'faculty', 'department') then raise exception 'Unknown scope'; end if;
  if not exists (select 1 from public.campus_memberships cm where cm.user_id = p_user and cm.institution_id = p_institution) then
    raise exception 'This student is not at your school';
  end if;
  if p_scope = 'faculty' then
    select name into label from public.faculties where id = p_scope_id and institution_id = p_institution;
    if label is null then raise exception 'Choose a faculty'; end if;
  elsif p_scope = 'department' then
    select name into label from public.departments where id = p_scope_id and institution_id = p_institution;
    if label is null then raise exception 'Choose a department'; end if;
  end if;
  if p_term_ends_on is not null and p_term_ends_on < current_date then
    raise exception 'The term end date has passed';
  end if;
  if exists (
    select 1 from public.student_offices o
     where o.institution_id = p_institution and o.user_id = p_user and o.status in ('invited', 'active')
       and lower(o.title) = lower(t) and o.scope = coalesce(p_scope, 'school')
       and o.scope_id is not distinct from (case when p_scope = 'school' then null else p_scope_id end)
  ) then
    raise exception 'This student already holds or was offered this office';
  end if;

  insert into public.student_offices (institution_id, user_id, office, title, scope, scope_id, scope_label, term_ends_on, appointed_by)
  values (p_institution, p_user, coalesce(nullif(trim(p_office), ''), 'custom'), t, coalesce(p_scope, 'school'),
          case when p_scope = 'school' then null else p_scope_id end, label, p_term_ends_on, me)
  returning id into oid;

  insert into public.notifications (user_id, title, body, link)
  values (p_user, 'You have been appointed ' || t,
          coalesce('For ' || label || '. ', '') || 'Open My roles to accept or decline.', '/roles');
  return oid;
end;
$$;

create or replace function public.end_office(p_office uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  o public.student_offices%rowtype;
begin
  select * into o from public.student_offices where id = p_office;
  if not found then raise exception 'Office not found'; end if;
  if not (o.user_id = auth.uid() or public.is_school_admin_for(o.institution_id)) then
    raise exception 'Not allowed';
  end if;
  update public.student_offices set status = 'ended', ended_at = now() where id = p_office and status in ('invited', 'active');
end;
$$;

create or replace function public.appoint_class_rep(p_class uuid, p_user uuid, p_role text default 'class_rep')
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  cls public.class_offerings%rowtype;
  sid uuid;
  role_name text := case when p_role = 'assistant_rep' then 'assistant_rep' else 'class_rep' end;
begin
  select * into cls from public.class_offerings where id = p_class;
  if not found then raise exception 'Class not found'; end if;
  if not (public.can_manage_class(p_class) or public.is_school_admin_for(cls.institution_id)) then
    raise exception 'Only the lecturer or the school authority can appoint a class rep';
  end if;
  if not exists (select 1 from public.class_enrollments e where e.class_id = p_class and e.student_user_id = p_user and e.status = 'active') then
    raise exception 'The student must be in this class';
  end if;
  insert into public.class_staff (class_id, user_id, role, status, appointed_by)
  values (p_class, p_user, role_name, 'invited', me)
  on conflict (class_id, user_id) do update set role = excluded.role, status = 'invited', appointed_by = me, responded_at = null
  returning id into sid;
  insert into public.notifications (user_id, title, body, link)
  values (p_user,
          case when role_name = 'assistant_rep' then 'You have been made assistant class rep' else 'You have been made class rep' end,
          cls.course_code || ' · ' || cls.course_title || '. Open My roles to accept or decline.', '/roles');
  return sid;
end;
$$;

create or replace function public.remove_class_rep(p_class uuid, p_user uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  cls public.class_offerings%rowtype;
begin
  select * into cls from public.class_offerings where id = p_class;
  if not found then raise exception 'Class not found'; end if;
  if not (public.can_manage_class(p_class) or public.is_school_admin_for(cls.institution_id) or p_user = auth.uid()) then
    raise exception 'Not allowed';
  end if;
  update public.class_staff set status = 'ended'
   where class_id = p_class and user_id = p_user and role in ('class_rep', 'assistant_rep') and status in ('invited', 'active');
end;
$$;

create or replace function public.respond_role_invite(p_kind text, p_id uuid, p_accept boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  o public.student_offices%rowtype;
  s public.class_staff%rowtype;
  who text;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select coalesce(nullif(trim(preferred_name), ''), nullif(trim(full_name), '')) into who from public.profiles where id = me;
  who := coalesce(who, 'A student');

  if p_kind = 'office' then
    select * into o from public.student_offices where id = p_id and user_id = me and status = 'invited';
    if not found then raise exception 'This invitation is no longer open'; end if;
    if p_accept then
      -- Named offices have one holder per scope; the previous holder steps down.
      if o.office <> 'custom' then
        update public.student_offices set status = 'ended', ended_at = now()
         where institution_id = o.institution_id and office = o.office and scope = o.scope
           and scope_id is not distinct from o.scope_id and status = 'active' and id <> o.id;
      end if;
      update public.student_offices set status = 'active', responded_at = now(), term_starts_on = current_date where id = o.id;
    else
      update public.student_offices set status = 'declined', responded_at = now() where id = o.id;
    end if;
    if o.appointed_by is not null then
      insert into public.notifications (user_id, title, body, link)
      values (o.appointed_by, who || case when p_accept then ' accepted ' else ' declined ' end || o.title,
              coalesce(o.scope_label, 'Whole school'), '/notifications');
    end if;

  elsif p_kind = 'class_rep' then
    select * into s from public.class_staff
     where id = p_id and user_id = me and status = 'invited' and role in ('class_rep', 'assistant_rep');
    if not found then raise exception 'This invitation is no longer open'; end if;
    if p_accept then
      update public.class_staff set status = 'ended'
       where class_id = s.class_id and role = s.role and status = 'active' and id <> s.id;
      update public.class_staff set status = 'active', responded_at = now() where id = s.id;
    else
      update public.class_staff set status = 'declined', responded_at = now() where id = s.id;
    end if;
    if s.appointed_by is not null then
      insert into public.notifications (user_id, title, body, link)
      select s.appointed_by,
             who || case when p_accept then ' accepted' else ' declined' end || ' the class rep role',
             c.course_code || ' · ' || c.course_title, '/notifications'
        from public.class_offerings c where c.id = s.class_id;
    end if;
  else
    raise exception 'Unknown role';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Badges shown on profiles
-- ---------------------------------------------------------------------------
create or replace function public.profile_badges(p_user uuid)
returns table (kind text, label text, detail text, rank int)
language sql stable security definer
set search_path = public
as $$
  select 'authority', 'Official', sa.title || coalesce(' · ' || i.short_name, ' · ' || i.name), 1
    from public.school_authority_profiles sa join public.institutions i on i.id = sa.institution_id
   where sa.user_id = p_user
  union all
  select 'office', o.title, coalesce(o.scope_label || ' · ', '') || coalesce(i.short_name, i.name), 2
    from public.student_offices o join public.institutions i on i.id = o.institution_id
   where o.user_id = p_user and o.status = 'active' and (o.term_ends_on is null or o.term_ends_on >= current_date)
  union all
  select 'lecturer', 'Lecturer', coalesce(d.name || ' · ', '') || coalesce(i.short_name, i.name), 3
    from public.lecturer_profiles lp
    join public.institutions i on i.id = lp.institution_id
    left join public.departments d on d.id = lp.department_id
   where lp.user_id = p_user and lp.status = 'approved'
  union all
  select 'class_rep', case s.role when 'assistant_rep' then 'Assistant class rep' else 'Class rep' end,
         c.course_code || coalesce(' · ' || c.level || 'L', ''), 4
    from public.class_staff s join public.class_offerings c on c.id = s.class_id
   where s.user_id = p_user and s.role in ('class_rep', 'assistant_rep') and s.status = 'active'
     and (s.term_ends_on is null or s.term_ends_on >= current_date) and c.is_active
  union all
  select 'verified', 'Verified student', null, 9
    from public.student_profiles sp
   where sp.user_id = p_user and sp.verification_level = 'verified'
  order by 4, 2;
$$;

-- ---------------------------------------------------------------------------
-- Announcements by class reps and student leaders
-- ---------------------------------------------------------------------------
create or replace function public.publish_class_announcement(p_class_id uuid, p_title text, p_body text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  cls public.class_offerings%rowtype;
  ann_id uuid;
  as_rep boolean;
  heading text;
begin
  select * into cls from public.class_offerings where id = p_class_id;
  if not found then raise exception 'Class not found'; end if;
  as_rep := not (cls.lecturer_user_id = auth.uid() or public.can_manage_class(p_class_id)) and public.is_class_rep(p_class_id);
  if not (cls.lecturer_user_id = auth.uid() or public.can_manage_class(p_class_id) or as_rep) then
    raise exception 'Only the lecturer or a class rep can announce';
  end if;
  if length(trim(coalesce(p_title, ''))) = 0 or length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Add a title and a message';
  end if;

  insert into public.class_announcements (class_id, author_user_id, title, body, author_role)
  values (p_class_id, auth.uid(), trim(p_title), trim(p_body), case when as_rep then 'class_rep' else 'lecturer' end)
  returning id into ann_id;

  heading := case when as_rep then 'Class rep · ' || cls.course_code || ': ' else cls.course_code || ': ' end || trim(p_title);
  insert into public.notifications (user_id, title, body, link)
  select e.student_user_id, heading, left(trim(p_body), 500), '/study/class/' || p_class_id
    from public.class_enrollments e
   where e.class_id = p_class_id and e.status = 'active' and e.student_user_id <> auth.uid();

  return ann_id;
end;
$$;

create or replace function public.post_office_announcement(p_office uuid, p_title text, p_body text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  o public.student_offices%rowtype;
  today_count int;
  aid uuid;
begin
  select * into o from public.student_offices
   where id = p_office and user_id = auth.uid() and status = 'active'
     and (term_ends_on is null or term_ends_on >= current_date);
  if not found then raise exception 'You do not hold this office'; end if;
  if length(trim(coalesce(p_title, ''))) = 0 or length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Add a title and a message';
  end if;
  select count(*) into today_count from public.school_announcements
   where office_id = o.id and created_at > date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos';
  if today_count >= 3 then raise exception 'You can post up to 3 announcements a day for this office'; end if;

  insert into public.school_announcements (institution_id, author_user_id, title, body, audience, office_id, scope, scope_id, author_label)
  values (o.institution_id, auth.uid(), left(trim(p_title), 120), left(trim(p_body), 2000), 'students',
          o.id, o.scope, o.scope_id, o.title)
  returning id into aid;
  return aid;
end;
$$;

-- ---------------------------------------------------------------------------
-- One daily "new students" summary per school authority (5 PM Lagos)
-- ---------------------------------------------------------------------------
create or replace function public.school_new_students_digest()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    with fresh as (
      select cm.institution_id, coalesce(d.name, nullif(trim(cm.department), ''), 'No department yet') dept, count(distinct cm.user_id) n
        from public.campus_memberships cm
        left join public.departments d on d.id = cm.department_id
       where cm.created_at > now() - interval '24 hours'
         and not exists (select 1 from public.lecturer_profiles lp where lp.user_id = cm.user_id)
       group by 1, 2
    ),
    per_school as (
      select institution_id, sum(n)::int total,
             string_agg(n || ' ' || dept, ', ' order by n desc) parts
        from fresh group by 1
    )
    select ps.*, sa.user_id
      from per_school ps
      join public.school_authority_profiles sa on sa.institution_id = ps.institution_id
  loop
    insert into public.notifications (user_id, title, body, link)
    values (r.user_id,
            r.total || ' new student' || case when r.total = 1 then '' else 's' end || ' joined today',
            left(r.parts, 300), '/notifications');
  end loop;
end;
$$;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'campusos-school-digest';
  perform cron.schedule('campusos-school-digest', '0 16 * * *', 'select public.school_new_students_digest()');
end $$;

-- Class links count as lecture alerts in notification preferences.
create or replace function public.alert_switch_for(p_link text, p_title text)
returns text
language sql immutable
set search_path = public
as $$
  select case
    when p_title like 'Assignment graded%' then null
    when p_title = 'New room that fits you' then 'housing_alerts'
    when p_link like '/study/groups%' then 'study_group_messages'
    when p_link like '/study/exams%' then 'examination_alerts'
    when p_link like '/study/assignments%' or p_link like '/study/planner%' then 'academic_reminders'
    when p_link like '/study/timetable%' or p_link like '/study/classes%' or p_link like '/study/class/%' then 'lecture_alerts'
    when p_link = '/notifications' and p_title like 'Campus announcement:%' then 'campus_announcements'
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------
revoke execute on function public.assign_student_classes(uuid) from public, anon, authenticated;
revoke execute on function public.add_class_timetable_for(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.class_offerings_auto_join() from public, anon, authenticated;
revoke execute on function public.school_new_students_digest() from public, anon, authenticated;

revoke execute on function public.complete_admission(uuid, uuid, uuid, text, text) from public, anon;
revoke execute on function public.school_students(uuid, text, uuid, text, text, int, int) from public, anon;
revoke execute on function public.appoint_office(uuid, uuid, text, text, text, uuid, date) from public, anon;
revoke execute on function public.end_office(uuid) from public, anon;
revoke execute on function public.appoint_class_rep(uuid, uuid, text) from public, anon;
revoke execute on function public.remove_class_rep(uuid, uuid) from public, anon;
revoke execute on function public.respond_role_invite(text, uuid, boolean) from public, anon;
revoke execute on function public.profile_badges(uuid) from public, anon;
revoke execute on function public.post_office_announcement(uuid, text, text) from public, anon;
revoke execute on function public.open_code_attendance(uuid, int, text) from public, anon;
revoke execute on function public.attendance_code(uuid) from public, anon;
revoke execute on function public.close_attendance(uuid) from public, anon;
revoke execute on function public.class_open_attendance(uuid) from public, anon;
revoke execute on function public.mark_attendance_with_code(uuid, text) from public, anon;

grant execute on function public.complete_admission(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.school_students(uuid, text, uuid, text, text, int, int) to authenticated;
grant execute on function public.appoint_office(uuid, uuid, text, text, text, uuid, date) to authenticated;
grant execute on function public.end_office(uuid) to authenticated;
grant execute on function public.appoint_class_rep(uuid, uuid, text) to authenticated;
grant execute on function public.remove_class_rep(uuid, uuid) to authenticated;
grant execute on function public.respond_role_invite(text, uuid, boolean) to authenticated;
grant execute on function public.profile_badges(uuid) to authenticated;
grant execute on function public.post_office_announcement(uuid, text, text) to authenticated;
grant execute on function public.open_code_attendance(uuid, int, text) to authenticated;
grant execute on function public.attendance_code(uuid) to authenticated;
grant execute on function public.close_attendance(uuid) to authenticated;
grant execute on function public.class_open_attendance(uuid) to authenticated;
grant execute on function public.mark_attendance_with_code(uuid, text) to authenticated;
grant execute on function public.is_class_rep(uuid) to authenticated;

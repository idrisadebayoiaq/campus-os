-- Student alerts: study reminders, live classes, housing matches, wallet top-ups and group posts.
-- Each one becomes a notifications row, which the notifications_push trigger sends as a push.

create table if not exists public.reminder_log (
  kind text not null,
  ref_id uuid not null,
  user_id uuid not null,
  on_date date not null default (now() at time zone 'Africa/Lagos')::date,
  sent_at timestamptz not null default now(),
  primary key (kind, ref_id, user_id, on_date)
);
alter table public.reminder_log enable row level security;

-- True unless the student switched this alert (or push as a whole) off.
create or replace function public.wants_alert(p_user uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select coalesce((to_jsonb(np) ->> p_key)::boolean, true) and coalesce(np.channel_push, true)
       from public.notification_preferences np where np.user_id = p_user),
    true);
$$;

-- Sends a reminder once per (kind, ref, user, day). Returns true when it was sent.
create or replace function public.remind_once(
  p_kind text, p_ref uuid, p_user uuid, p_pref text, p_title text, p_body text, p_link text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_user is null or not public.wants_alert(p_user, p_pref) then
    return false;
  end if;
  insert into public.reminder_log (kind, ref_id, user_id) values (p_kind, p_ref, p_user)
  on conflict do nothing;
  if not found then
    return false;
  end if;
  perform public.notify_user(p_user, p_title, p_body, p_link);
  return true;
end;
$$;

create or replace function public.send_study_reminders()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  n integer := 0;
  lagos_now timestamp := now() at time zone 'Africa/Lagos';
  hm text;
begin
  -- Assignments: a day before and two hours before.
  for r in
    select id, user_id, title, course_code, due_at from public.academic_tasks
    where not coalesce(is_done, false) and due_at > now() and due_at <= now() + interval '24 hours'
  loop
    hm := to_char(r.due_at at time zone 'Africa/Lagos', 'FMHH12:MI AM');
    if r.due_at <= now() + interval '2 hours' then
      if public.remind_once('task_2h', r.id, r.user_id, 'academic_reminders',
           'Due soon: ' || r.title, coalesce(r.course_code || ' · ', '') || 'Due at ' || hm, '/study/assignments') then n := n + 1; end if;
    else
      if public.remind_once('task_24h', r.id, r.user_id, 'academic_reminders',
           'Due tomorrow: ' || r.title, coalesce(r.course_code || ' · ', '') || 'Due at ' || hm, '/study/assignments') then n := n + 1; end if;
    end if;
  end loop;

  -- Exams: a day before and two hours before.
  for r in
    select id, user_id, title, course_code, venue, starts_at from public.exam_entries
    where starts_at > now() and starts_at <= now() + interval '24 hours'
  loop
    hm := to_char(r.starts_at at time zone 'Africa/Lagos', 'FMHH12:MI AM');
    if public.remind_once(case when r.starts_at <= now() + interval '2 hours' then 'exam_2h' else 'exam_24h' end,
         r.id, r.user_id, 'examination_alerts',
         case when r.starts_at <= now() + interval '2 hours' then 'Exam soon: ' else 'Exam tomorrow: ' end || coalesce(r.course_code, r.title),
         hm || coalesce(' · ' || r.venue, ''), '/study/exams') then n := n + 1; end if;
  end loop;

  -- Timetable classes starting in the next 15 minutes (Lagos time).
  for r in
    select id, user_id, course_code, course_title, venue, start_time from public.timetable_entries
    where day_of_week = extract(dow from lagos_now)::int
      and start_time ~ '^\d{1,2}:\d{2}'
      and (date_trunc('day', lagos_now) + start_time::time) > lagos_now
      and (date_trunc('day', lagos_now) + start_time::time) <= lagos_now + interval '15 minutes'
  loop
    if public.remind_once('class_15m', r.id, r.user_id, 'lecture_alerts',
         coalesce(r.course_code, r.course_title, 'Class') || ' in 15 min',
         coalesce(r.venue, 'Check your timetable'), '/study/timetable') then n := n + 1; end if;
  end loop;

  -- Live classes starting in the next 15 minutes, for every enrolled student.
  for r in
    select s.id, s.title, s.scheduled_at, e.student_user_id, o.course_code
    from public.class_live_sessions s
    join public.class_offerings o on o.id = s.class_id
    join public.class_enrollments e on e.class_id = s.class_id and coalesce(e.status, 'active') = 'active'
    where s.status = 'scheduled' and s.scheduled_at > now() and s.scheduled_at <= now() + interval '15 minutes'
  loop
    if public.remind_once('live_15m', r.id, r.student_user_id, 'lecture_alerts',
         'Live class in 15 min', coalesce(r.course_code || ' · ', '') || r.title, '/study/classes') then n := n + 1; end if;
  end loop;

  return n;
end;
$$;

-- A lecturer schedules a live class: tell the class.
create or replace function public.notify_live_class_scheduled()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  code text;
begin
  select course_code into code from public.class_offerings where id = new.class_id;
  insert into public.notifications (user_id, title, body, link)
  select e.student_user_id,
         'Live class: ' || coalesce(code, new.title),
         new.title || ' · ' || to_char(new.scheduled_at at time zone 'Africa/Lagos', 'Dy DD Mon, FMHH12:MI AM'),
         '/study/classes'
  from public.class_enrollments e
  where e.class_id = new.class_id
    and coalesce(e.status, 'active') = 'active'
    and e.student_user_id <> new.created_by
    and public.wants_alert(e.student_user_id, 'lecture_alerts');
  return new;
end;
$$;

drop trigger if exists class_live_sessions_notify on public.class_live_sessions;
create trigger class_live_sessions_notify
  after insert on public.class_live_sessions
  for each row when (new.status = 'scheduled')
  execute function public.notify_live_class_scheduled();

-- Wallet top-ups.
create or replace function public.notify_wallet_topup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.notify_user(
    new.user_id,
    'Wallet funded',
    '₦' || to_char(new.amount, 'FM999,999,999,990') || ' added · Balance ₦' || to_char(coalesce(new.balance_after, 0), 'FM999,999,999,990'),
    '/wallet');
  return new;
end;
$$;

drop trigger if exists wallet_entries_topup_notify on public.wallet_entries;
create trigger wallet_entries_topup_notify
  after insert on public.wallet_entries
  for each row when (new.kind = 'topup' and new.amount > 0)
  execute function public.notify_wallet_topup();

-- Study group posts: tell the other members.
create or replace function public.notify_study_group_post()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  g text;
  who text;
begin
  select title into g from public.study_groups where id = new.group_id;
  select coalesce(nullif(trim(full_name), ''), 'Someone') into who from public.profiles where id = new.user_id;
  insert into public.notifications (user_id, title, body, link)
  select m.user_id, coalesce(g, 'Study group'), coalesce(who, 'Someone') || ': ' || left(new.body, 120), '/study/groups'
  from public.study_group_members m
  where m.group_id = new.group_id
    and m.user_id <> new.user_id
    and public.wants_alert(m.user_id, 'study_group_messages');
  return new;
end;
$$;

drop trigger if exists study_group_posts_notify on public.study_group_posts;
create trigger study_group_posts_notify
  after insert on public.study_group_posts
  for each row execute function public.notify_study_group_post();

-- A room goes live: tell students whose housing preferences match.
create or replace function public.notify_housing_match()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  p record;
  pref_type text[];
  yearly numeric;
begin
  if not new.is_published or coalesce(new.status::text, 'available') not in ('available', 'vacant', 'open') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.is_published then
    return new;
  end if;
  select id, campus_id, title into p from public.properties where id = new.property_id;
  if p.id is null then
    return new;
  end if;

  pref_type := case new.unit_type::text
    when 'hostel_bed' then array['hostel']
    when 'room' then array['single_room', 'room_and_parlour']
    when 'self_contained' then array['self_contain']
    when 'shared_apartment' then array['shared_room', 'flat']
    else array[]::text[] end;
  yearly := coalesce(new.rent_base, 0) * case new.rent_period::text when 'month' then 12 when 'semester' then 2 else 1 end;

  insert into public.notifications (user_id, title, body, link)
  select hp.user_id,
         'New room that fits you',
         coalesce(new.title, p.title, 'A room') || ' · ₦' || to_char(coalesce(new.rent_base, 0), 'FM999,999,999,990') || ' / ' || coalesce(new.rent_period::text, 'year'),
         '/housing/' || new.id::text
  from public.housing_preferences hp
  join public.campus_memberships cm on cm.user_id = hp.user_id and cm.is_primary
  where hp.alerts_enabled
    and cm.campus_id = p.campus_id
    and (hp.max_budget is null or yearly <= hp.max_budget * case hp.budget_period when 'month' then 12 when 'semester' then 2 else 1 end)
    and (coalesce(cardinality(hp.accommodation_types), 0) = 0 or hp.accommodation_types && pref_type)
    and public.wants_alert(hp.user_id, 'housing_alerts')
  limit 500;
  return new;
end;
$$;

drop trigger if exists property_units_housing_match on public.property_units;
create trigger property_units_housing_match
  after insert or update of is_published on public.property_units
  for each row execute function public.notify_housing_match();

revoke execute on function public.wants_alert(uuid, text) from public, anon, authenticated;
revoke execute on function public.remind_once(text, uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.send_study_reminders() from public, anon, authenticated;
revoke execute on function public.notify_live_class_scheduled() from public, anon, authenticated;
revoke execute on function public.notify_wallet_topup() from public, anon, authenticated;
revoke execute on function public.notify_study_group_post() from public, anon, authenticated;
revoke execute on function public.notify_housing_match() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('campusos-study-reminders');
exception when others then null;
end $$;
select cron.schedule('campusos-study-reminders', '*/5 * * * *', 'select public.send_study_reminders();');

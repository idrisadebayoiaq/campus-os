-- Student verification hardening + staff↔student meetings (LiveKit).

alter table public.student_enrollments
  add column if not exists verified_by uuid references public.profiles (id) on delete set null,
  add column if not exists verified_at timestamptz;

alter table public.student_verifications
  add column if not exists verified_by uuid references public.profiles (id) on delete set null,
  add column if not exists reviewed_by uuid references public.profiles (id) on delete set null;

comment on column public.student_verifications.method is
  'school_email | institution_invite | id_document';
comment on column public.student_verifications.status is
  'pending | approved | rejected';

-- Private ID evidence bucket
insert into storage.buckets (id, name, public)
values ('student-id-evidence', 'student-id-evidence', false)
on conflict (id) do nothing;

drop policy if exists "student_id_evidence_owner_insert" on storage.objects;
create policy "student_id_evidence_owner_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'student-id-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "student_id_evidence_owner_select" on storage.objects;
create policy "student_id_evidence_owner_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'student-id-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "student_id_evidence_staff_select" on storage.objects;
create policy "student_id_evidence_staff_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'student-id-evidence'
    and (
      public.has_role('admin')
      or public.has_role('moderator')
      or exists (
        select 1 from public.school_authority_profiles sap
        where sap.user_id = auth.uid()
      )
      or exists (
        select 1 from public.lecturer_profiles lp
        where lp.user_id = auth.uid() and lp.status = 'approved'
      )
    )
  );

-- Mark student verified (staff or self after email match)
create or replace function public.mark_student_verified(
  p_user_id uuid,
  p_method text,
  p_verified_by uuid default null,
  p_evidence_path text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.student_verifications (user_id, method, status, evidence_path, verified_by, reviewed_at)
  values (
    p_user_id,
    p_method,
    'approved',
    p_evidence_path,
    coalesce(p_verified_by, auth.uid()),
    now()
  );

  update public.student_enrollments
  set
    verification_status = 'verified',
    verified_by = coalesce(p_verified_by, auth.uid()),
    verified_at = now()
  where user_id = p_user_id;

  update public.student_profiles
  set verification_level = 'verified', updated_at = now()
  where user_id = p_user_id;
end;
$$;

grant execute on function public.mark_student_verified(uuid, text, uuid, text) to authenticated;

-- 1:1 office hours / meetings
create table if not exists public.staff_student_meetings (
  id uuid primary key default gen_random_uuid(),
  lecturer_user_id uuid not null references public.profiles (id) on delete cascade,
  student_user_id uuid not null references public.profiles (id) on delete cascade,
  class_id uuid references public.class_offerings (id) on delete set null,
  title text not null,
  mode text not null default 'video' check (mode in ('video', 'voice')),
  scheduled_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'ended', 'cancelled')),
  room_name text not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists staff_student_meetings_student_idx
  on public.staff_student_meetings (student_user_id, scheduled_at desc);
create index if not exists staff_student_meetings_lecturer_idx
  on public.staff_student_meetings (lecturer_user_id, scheduled_at desc);

alter table public.staff_student_meetings enable row level security;

drop policy if exists "meetings_participant_select" on public.staff_student_meetings;
create policy "meetings_participant_select"
  on public.staff_student_meetings for select to authenticated
  using (
    student_user_id = auth.uid()
    or lecturer_user_id = auth.uid()
    or public.has_role('admin')
  );

drop policy if exists "meetings_staff_insert" on public.staff_student_meetings;
create policy "meetings_staff_insert"
  on public.staff_student_meetings for insert to authenticated
  with check (
    lecturer_user_id = auth.uid()
    or public.has_role('admin')
  );

drop policy if exists "meetings_staff_update" on public.staff_student_meetings;
create policy "meetings_staff_update"
  on public.staff_student_meetings for update to authenticated
  using (
    lecturer_user_id = auth.uid()
    or student_user_id = auth.uid()
    or public.has_role('admin')
  );

grant select, insert, update on public.staff_student_meetings to authenticated;

-- Staff can read pending ID verifications for review queues
drop policy if exists "staff_select_student_verifications" on public.student_verifications;
create policy "staff_select_student_verifications"
  on public.student_verifications for select to authenticated
  using (
    auth.uid() = user_id
    or public.has_role('admin')
    or public.has_role('moderator')
    or exists (select 1 from public.school_authority_profiles sap where sap.user_id = auth.uid())
  );

create or replace function public.review_student_id_verification(
  p_verification_id uuid,
  p_approve boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if not (
    public.has_role('admin')
    or public.has_role('moderator')
    or exists (select 1 from public.school_authority_profiles where user_id = auth.uid())
  ) then
    raise exception 'Not authorized to review verifications';
  end if;

  select user_id into v_user
  from public.student_verifications
  where id = p_verification_id and status = 'pending'
  for update;

  if v_user is null then
    raise exception 'Pending verification not found';
  end if;

  if p_approve then
    update public.student_verifications
    set status = 'approved', review_note = p_note, reviewed_at = now(), reviewed_by = auth.uid(), verified_by = auth.uid()
    where id = p_verification_id;

    update public.student_enrollments
    set verification_status = 'verified', verified_by = auth.uid(), verified_at = now()
    where user_id = v_user;

    update public.student_profiles
    set verification_level = 'verified', updated_at = now()
    where user_id = v_user;
  else
    update public.student_verifications
    set status = 'rejected', review_note = p_note, reviewed_at = now(), reviewed_by = auth.uid()
    where id = p_verification_id;
  end if;
end;
$$;

grant execute on function public.review_student_id_verification(uuid, boolean, text) to authenticated;

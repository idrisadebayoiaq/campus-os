-- Student app fixes: class policy recursion, notifications feed, support chat
-- handled by staff, campus guides, and preset-only AI avatars.

-- 1) Class policies --------------------------------------------------------
-- class_offerings read checked class_enrollments, whose policies read
-- class_offerings again ("infinite recursion detected in policy"). Several
-- read policies also compared e.class_id = e.class_id, which let any enrolled
-- student read every class. Security-definer helpers break the cycle.

create or replace function public.is_class_lecturer(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.class_offerings c
    where c.id = p_class_id and c.lecturer_user_id = auth.uid()
  );
$$;

create or replace function public.is_enrolled_in_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.class_enrollments e
    where e.class_id = p_class_id
      and e.student_user_id = auth.uid()
      and e.status = 'active'
  );
$$;

revoke all on function public.is_class_lecturer(uuid) from public, anon;
revoke all on function public.is_enrolled_in_class(uuid) from public, anon;
grant execute on function public.is_class_lecturer(uuid) to authenticated;
grant execute on function public.is_enrolled_in_class(uuid) to authenticated;

drop policy if exists "classes read" on public.class_offerings;
create policy "classes read" on public.class_offerings
  for select to authenticated
  using (
    lecturer_user_id = auth.uid()
    or public.is_staff()
    or public.is_school_admin_for(institution_id)
    or public.is_enrolled_in_class(id)
  );

drop policy if exists "enrollments read" on public.class_enrollments;
create policy "enrollments read" on public.class_enrollments
  for select to authenticated
  using (
    student_user_id = auth.uid()
    or public.is_class_lecturer(class_id)
    or public.is_staff()
  );

drop policy if exists "enrollments lecturer write" on public.class_enrollments;
create policy "enrollments lecturer write" on public.class_enrollments
  for all to authenticated
  using (public.is_class_lecturer(class_id) or public.is_staff())
  with check (public.is_class_lecturer(class_id) or public.is_staff());

drop policy if exists "announcements read" on public.class_announcements;
create policy "announcements read" on public.class_announcements
  for select to authenticated
  using (
    public.is_class_lecturer(class_id)
    or public.is_staff()
    or public.is_enrolled_in_class(class_id)
  );

drop policy if exists "announcements lecturer write" on public.class_announcements;
create policy "announcements lecturer write" on public.class_announcements
  for insert to authenticated
  with check (public.is_class_lecturer(class_id) or public.is_staff());

drop policy if exists "class_assignments_read" on public.class_assignments;
create policy "class_assignments_read" on public.class_assignments
  for select to authenticated
  using (public.can_manage_class(class_id) or public.is_enrolled_in_class(class_id));

drop policy if exists "class_live_read" on public.class_live_sessions;
create policy "class_live_read" on public.class_live_sessions
  for select to authenticated
  using (public.can_manage_class(class_id) or public.is_enrolled_in_class(class_id));

drop policy if exists "materials_read" on public.class_materials;
create policy "materials_read" on public.class_materials
  for select to authenticated
  using (public.can_manage_class(class_id) or public.is_enrolled_in_class(class_id));

drop policy if exists "pq_rw" on public.class_past_questions;
create policy "pq_rw" on public.class_past_questions
  for select to authenticated
  using (public.can_manage_class(class_id) or public.is_enrolled_in_class(class_id));

drop policy if exists "slots read" on public.class_timetable_slots;
create policy "slots read" on public.class_timetable_slots
  for select to authenticated
  using (
    public.is_class_lecturer(class_id)
    or public.is_staff()
    or public.is_enrolled_in_class(class_id)
  );

drop policy if exists "slots lecturer write" on public.class_timetable_slots;
create policy "slots lecturer write" on public.class_timetable_slots
  for all to authenticated
  using (public.is_class_lecturer(class_id) or public.is_staff())
  with check (public.is_class_lecturer(class_id) or public.is_staff());

-- 2) Notifications feed -----------------------------------------------------

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

create or replace function public.notify_user(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_link text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, title, body, link)
  select p_user_id, p_title, p_body, p_link
  where p_user_id is not null;
$$;

revoke all on function public.notify_user(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.notify_inspection_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  unit_title text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  select u.title into unit_title
  from public.property_units u where u.id = new.unit_id;

  perform public.notify_user(
    new.student_id,
    case new.status::text
      when 'accepted' then 'Viewing accepted'
      when 'declined' then 'Viewing declined'
      when 'rescheduled' then 'Viewing rescheduled'
      when 'completed' then 'Viewing completed'
      when 'cancelled' then 'Viewing cancelled'
      else 'Viewing update'
    end,
    coalesce(unit_title, 'Your room') ||
      coalesce(' · ' || nullif(trim(new.provider_note), ''), ''),
    '/housing/' || new.unit_id::text
  );
  return new;
end;
$$;

drop trigger if exists inspection_requests_notify on public.inspection_requests;
create trigger inspection_requests_notify
  after update of status on public.inspection_requests
  for each row execute function public.notify_inspection_status();

create or replace function public.notify_food_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  biz_name text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  select display_name into biz_name from public.business_profiles where id = new.business_id;

  perform public.notify_user(
    new.student_id,
    case new.status::text
      when 'accepted' then 'Order accepted'
      when 'preparing' then 'Order being prepared'
      when 'ready' then 'Order ready for pickup'
      when 'collected' then 'Order collected'
      when 'completed' then 'Order completed'
      when 'declined' then 'Order declined'
      when 'cancelled' then 'Order cancelled'
      else 'Order update'
    end,
    coalesce(biz_name, 'Your order'),
    null
  );
  return new;
end;
$$;

drop trigger if exists food_orders_notify on public.food_orders;
create trigger food_orders_notify
  after update of status on public.food_orders
  for each row execute function public.notify_food_order_status();

create or replace function public.notify_verification_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status not in ('approved', 'rejected') then
    return new;
  end if;
  perform public.notify_user(
    new.user_id,
    case
      when new.status = 'approved' then 'Student ID verified'
      else 'Student ID not verified'
    end,
    coalesce(nullif(trim(new.review_note), ''), 'Open Verify student ID for details.'),
    '/verify'
  );
  return new;
end;
$$;

drop trigger if exists student_verifications_notify on public.student_verifications;
create trigger student_verifications_notify
  after update of status on public.student_verifications
  for each row execute function public.notify_verification_status();

create or replace function public.notify_meeting_scheduled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_user(
    new.student_user_id,
    'Meeting scheduled',
    coalesce(new.title, 'Meeting with your lecturer') || ' · ' ||
      to_char(new.scheduled_at at time zone 'Africa/Lagos', 'Dy DD Mon, HH24:MI'),
    '/meetings'
  );
  return new;
end;
$$;

drop trigger if exists staff_student_meetings_notify on public.staff_student_meetings;
create trigger staff_student_meetings_notify
  after insert on public.staff_student_meetings
  for each row execute function public.notify_meeting_scheduled();

-- 3) Support chat answered by CampusOS staff ---------------------------------

create or replace function public.is_support_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id and c.kind = 'support'
  );
$$;

revoke all on function public.is_support_conversation(uuid) from public, anon;
grant execute on function public.is_support_conversation(uuid) to authenticated;

drop policy if exists conversations_select_staff_support on public.conversations;
create policy conversations_select_staff_support on public.conversations
  for select to authenticated
  using (kind = 'support' and public.is_staff());

drop policy if exists messages_select_staff_support on public.messages;
create policy messages_select_staff_support on public.messages
  for select to authenticated
  using (public.is_staff() and public.is_support_conversation(conversation_id));

drop policy if exists messages_insert_staff_support on public.messages;
create policy messages_insert_staff_support on public.messages
  for insert to authenticated
  with check (
    public.is_staff()
    and public.is_support_conversation(conversation_id)
    and sender_id = auth.uid()
  );

create or replace function public.notify_support_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  if new.sender_id is null then
    return new;
  end if;
  select c.created_by into owner_id
  from public.conversations c
  where c.id = new.conversation_id and c.kind = 'support';
  if owner_id is null or owner_id = new.sender_id then
    return new;
  end if;
  perform public.notify_user(
    owner_id,
    'CampusOS Support replied',
    left(coalesce(new.body, ''), 140),
    '/support'
  );
  return new;
end;
$$;

drop trigger if exists messages_notify_support_reply on public.messages;
create trigger messages_notify_support_reply
  after insert on public.messages
  for each row execute function public.notify_support_reply();

-- 3b) Whoever creates a conversation can add its members --------------------
-- Adding [me, agent] in one insert failed: the policy only saw rows that
-- existed before the statement, so housing, business, direct and group chats
-- never got their participants.

create or replace function public.is_conversation_creator(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id and c.created_by = auth.uid()
  );
$$;

revoke all on function public.is_conversation_creator(uuid) from public, anon;
grant execute on function public.is_conversation_creator(uuid) to authenticated;

drop policy if exists conversation_participants_insert_auth on public.conversation_participants;
create policy conversation_participants_insert_auth on public.conversation_participants
  for insert to authenticated
  with check (
    user_id = auth.uid()
    or public.is_conversation_participant(conversation_id)
    or public.is_conversation_creator(conversation_id)
  );

-- 4) Campus guides ----------------------------------------------------------

create table if not exists public.campus_guides (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid references public.campuses (id) on delete cascade,
  slug text,
  title text not null,
  summary text,
  body text,
  created_at timestamptz not null default now()
);

alter table public.campus_guides enable row level security;
grant select on public.campus_guides to authenticated;
grant insert, update, delete on public.campus_guides to authenticated;

drop policy if exists campus_guides_read on public.campus_guides;
create policy campus_guides_read on public.campus_guides
  for select to authenticated using (true);

drop policy if exists campus_guides_staff_write on public.campus_guides;
create policy campus_guides_staff_write on public.campus_guides
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

insert into public.campus_guides (slug, title, summary, body)
select v.slug, v.title, v.summary, v.body
from (values
  ('first-week', 'Your first week on campus',
   'Registration, ID card, and finding your lecture halls.',
   'Complete course registration on your school portal early, collect your ID card from Student Affairs, and walk your timetable route once before lectures start.'),
  ('safe-housing', 'Renting safely off campus',
   'Inspect before you pay and keep every receipt.',
   'Always inspect the room in person, confirm the agent on CampusOS, never pay full rent before seeing the room, and keep receipts for rent, agency, and caution fees.'),
  ('study-routine', 'Building a study routine',
   'Use the planner, focus timer, and past questions together.',
   'Block study time in the planner each week, use the focus timer for 25-minute sessions, and practise past questions two weeks before exams.'),
  ('money', 'Managing money as a student',
   'Set a monthly budget for food, transport, and data.',
   'Split your allowance into food, transport, data, and savings. Order from campus vendors you trust and compare prices on the Market tab.')
) as v(slug, title, summary, body)
where not exists (select 1 from public.campus_guides g where g.slug = v.slug and g.campus_id is null);

-- 5) AI companion avatars are built-in presets only ------------------------

update public.ai_companion_profiles
set avatar_url = null
where avatar_url is not null and avatar_url !~ '^preset:ai-[1-8]$';

alter table public.ai_companion_profiles
  drop constraint if exists ai_companion_avatar_preset;
alter table public.ai_companion_profiles
  add constraint ai_companion_avatar_preset
  check (avatar_url is null or avatar_url ~ '^preset:ai-[1-8]$');

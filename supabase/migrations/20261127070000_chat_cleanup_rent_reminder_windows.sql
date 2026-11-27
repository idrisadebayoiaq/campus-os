-- Chat cleanup (delete message, clear chat, delete chat) and staged rent reminders.

-- ---------------------------------------------------------------------------
-- Chat: per-person clear + delete
-- ---------------------------------------------------------------------------

alter table public.conversation_participants
  add column if not exists cleared_at timestamptz;

-- Delete one message. Your own messages in any chat; any message in your own AI tutor chat.
create or replace function public.delete_message(p_message uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.messages;
  k text;
begin
  select * into m from public.messages where id = p_message;
  if m.id is null then raise exception 'Message not found'; end if;
  if not exists (
    select 1 from public.conversation_participants p
    where p.conversation_id = m.conversation_id and p.user_id = auth.uid()
  ) then raise exception 'Not allowed'; end if;
  select kind into k from public.conversations where id = m.conversation_id;
  if m.sender_id is distinct from auth.uid() and k is distinct from 'ai' then
    raise exception 'You can only delete your own messages';
  end if;
  update public.messages set deleted_at = now() where id = p_message;
end;
$$;

-- Clear a chat for yourself. AI tutor chats are wiped completely so the tutor forgets the history.
create or replace function public.clear_conversation(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
begin
  if not exists (
    select 1 from public.conversation_participants p
    where p.conversation_id = p_conversation and p.user_id = auth.uid()
  ) then raise exception 'Not allowed'; end if;
  select kind into k from public.conversations where id = p_conversation;
  if k = 'ai' then
    delete from public.messages where conversation_id = p_conversation and message_type <> 'system';
  end if;
  update public.conversation_participants
    set cleared_at = now(), last_read_at = now()
    where conversation_id = p_conversation and user_id = auth.uid();
end;
$$;

-- Remove a chat from your list. It comes back only if someone sends a new message.
create or replace function public.delete_conversation(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
begin
  if not exists (
    select 1 from public.conversation_participants p
    where p.conversation_id = p_conversation and p.user_id = auth.uid()
  ) then raise exception 'Not allowed'; end if;
  select kind into k from public.conversations where id = p_conversation;
  if k = 'support' then raise exception 'Support chats cannot be deleted'; end if;
  if k = 'ai' then
    delete from public.messages where conversation_id = p_conversation and message_type <> 'system';
  end if;
  update public.conversation_participants
    set archived = true, cleared_at = now(), last_read_at = now()
    where conversation_id = p_conversation and user_id = auth.uid();
end;
$$;

create or replace function public.messages_unarchive_on_new()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.message_type <> 'system' then
    update public.conversation_participants
      set archived = false
      where conversation_id = new.conversation_id and archived and user_id is distinct from new.sender_id;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_unarchive_on_new on public.messages;
create trigger messages_unarchive_on_new
  after insert on public.messages
  for each row execute function public.messages_unarchive_on_new();

revoke all on function public.delete_message(uuid), public.clear_conversation(uuid), public.delete_conversation(uuid) from public, anon;
grant execute on function public.delete_message(uuid), public.clear_conversation(uuid), public.delete_conversation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Rent reminders: a month, a week, 3 days, 24 hours, due, then overdue
-- ---------------------------------------------------------------------------

alter table public.tenancies
  add column if not exists reminded_hours integer[] not null default '{}';

create or replace function public.send_rent_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  windows constant integer[] := array[-168, -24, 0, 24, 72, 168, 720];
  t record;
  sent integer := 0;
  hours_left numeric;
  w integer;
  title text;
  detail text;
  notify_team boolean;
begin
  for t in
    select x.*, u.title as unit_title
    from public.tenancies x join public.property_units u on u.id = x.unit_id
    where x.status = 'active' and x.next_due_on is not null
  loop
    -- Rent is due at the start of the due date, Nigerian time.
    hours_left := extract(epoch from ((t.next_due_on::timestamp at time zone 'Africa/Lagos') - now())) / 3600.0;

    -- A new due date (after a payment) starts a fresh reminder cycle.
    if t.reminded_for is distinct from t.next_due_on then
      t.reminded_hours := '{}';
    end if;

    -- The most urgent window we are inside.
    w := null;
    for i in 1 .. array_length(windows, 1) loop
      if hours_left <= windows[i] then w := windows[i]; exit; end if;
    end loop;
    continue when w is null;
    continue when w = any (t.reminded_hours);

    notify_team := false;
    if w = 720 then
      title := 'Rent due in a month';
      detail := 'Rent of N' || t.rent_amount::bigint || ' for ' || coalesce(t.unit_title, 'your room') || ' is due on ' || to_char(t.next_due_on, 'DD Mon YYYY') || '.';
    elsif w = 168 then
      title := 'Rent due in a week';
      detail := 'Rent of N' || t.rent_amount::bigint || ' for ' || coalesce(t.unit_title, 'your room') || ' is due on ' || to_char(t.next_due_on, 'DD Mon YYYY') || '.';
    elsif w = 72 then
      title := 'Rent due in 3 days';
      detail := 'Rent of N' || t.rent_amount::bigint || ' for ' || coalesce(t.unit_title, 'your room') || ' is due on ' || to_char(t.next_due_on, 'DD Mon YYYY') || '.';
    elsif w = 24 then
      title := 'Rent due in 24 hours';
      detail := 'Rent of N' || t.rent_amount::bigint || ' for ' || coalesce(t.unit_title, 'your room') || ' is due tomorrow.';
    elsif w = 0 then
      title := 'Rent is due today';
      detail := 'Rent of N' || t.rent_amount::bigint || ' for ' || coalesce(t.unit_title, 'your room') || ' is due today.';
      notify_team := true;
    elsif w = -24 then
      title := 'Your rent is overdue';
      detail := 'Rent of N' || t.rent_amount::bigint || ' for ' || coalesce(t.unit_title, 'your room') || ' was due on ' || to_char(t.next_due_on, 'DD Mon YYYY') || '. Please pay your agent.';
      notify_team := true;
    else
      title := 'Rent is a week overdue';
      detail := 'Rent of N' || t.rent_amount::bigint || ' for ' || coalesce(t.unit_title, 'your room') || ' was due on ' || to_char(t.next_due_on, 'DD Mon YYYY') || '.';
      notify_team := true;
    end if;

    perform public.notify_user(t.student_id, title, detail, '/apartment');
    if notify_team then
      perform public.notify_business_team(
        t.business_id,
        case when w = 0 then 'Rent due today' else 'Rent overdue' end,
        coalesce(t.unit_title, 'A room') || ' rent was due ' || to_char(t.next_due_on, 'DD Mon') || '.',
        '/tenancies'
      );
    end if;

    -- Mark this window and every longer one as done so a late-created tenancy is not spammed.
    update public.tenancies
      set reminded_for = t.next_due_on,
          reminded_hours = (
            select coalesce(array_agg(distinct v), '{}') from unnest(t.reminded_hours || array(select x from unnest(windows) x where x >= w)) v
          )
      where id = t.id;
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

revoke all on function public.send_rent_reminders() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('campusos-rent-reminders');
exception when others then null;
end $$;
select cron.schedule('campusos-rent-reminders', '5 * * * *', 'select public.send_rent_reminders()');

-- Let the app react to a handover / ended tenancy straight away.
do $$
begin
  alter publication supabase_realtime add table public.tenancies;
exception when others then null;
end $$;

-- Phase 2: richer chat. Attachments, replies, reactions, stars, edit and delete rules,
-- who may send in a conversation, class chats, and richer notification rows.

-- ---------------------------------------------------------------------------
-- Messages and conversations
-- ---------------------------------------------------------------------------
alter table public.messages
  add column if not exists reply_to_id uuid references public.messages(id) on delete set null,
  add column if not exists forwarded boolean not null default false;

alter table public.messages drop constraint if exists messages_message_type_check;
alter table public.messages add constraint messages_message_type_check
  check (message_type = any (array['text','audio','system','image','assistant','video','file','location','contact']));

alter table public.conversations
  add column if not exists send_policy text not null default 'all' check (send_policy in ('all', 'admins')),
  add column if not exists class_id uuid references public.class_offerings(id) on delete cascade;

do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.conversations'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%' loop
    execute format('alter table public.conversations drop constraint %I', c);
  end loop;
end $$;
alter table public.conversations add constraint conversations_kind_check
  check (kind = any (array['direct','support','listing','order','group','ai','assistant','room','class']));
create unique index if not exists conversations_class_uidx on public.conversations (class_id) where class_id is not null;

-- Who may send: everyone, or only admins of the conversation.
create or replace function public.can_send_in(p_conversation uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversations c
     where c.id = p_conversation
       and (c.send_policy = 'all'
            or exists (select 1 from public.conversation_participants p
                        where p.conversation_id = c.id and p.user_id = auth.uid() and p.role = 'admin'))
  );
$$;

drop policy if exists messages_insert_participant on public.messages;
create policy messages_insert_participant on public.messages for insert to authenticated
  with check (
    public.is_conversation_participant(conversation_id)
    and (sender_id = auth.uid() or sender_id is null)
    and message_type <> 'assistant'
    and public.can_send_in(conversation_id)
  );

-- Edits go through edit_message, which enforces the time window.
drop policy if exists messages_update_own on public.messages;
create policy messages_update_own on public.messages for update to authenticated
  using (sender_id = auth.uid()) with check (sender_id = auth.uid());
revoke update on public.messages from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Attachments, reactions, stars, hidden messages
-- ---------------------------------------------------------------------------
create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  kind text not null check (kind in ('image', 'video', 'audio', 'file')),
  path text not null,
  name text,
  mime text,
  size_bytes bigint,
  width int,
  height int,
  duration_ms int,
  created_at timestamptz not null default now()
);
create index if not exists message_attachments_message_idx on public.message_attachments (message_id);
create index if not exists message_attachments_conv_idx on public.message_attachments (conversation_id, created_at desc);

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists message_reactions_conv_idx on public.message_reactions (conversation_id);

create table if not exists public.message_stars (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

create table if not exists public.message_hidden (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  primary key (user_id, message_id)
);

alter table public.message_attachments enable row level security;
alter table public.message_reactions enable row level security;
alter table public.message_stars enable row level security;
alter table public.message_hidden enable row level security;

revoke all on public.message_attachments, public.message_reactions, public.message_stars, public.message_hidden from anon, authenticated;
grant select on public.message_attachments, public.message_reactions, public.message_stars, public.message_hidden to authenticated;

drop policy if exists message_attachments_read on public.message_attachments;
create policy message_attachments_read on public.message_attachments for select to authenticated
  using (public.is_conversation_participant(conversation_id));
drop policy if exists message_reactions_read on public.message_reactions;
create policy message_reactions_read on public.message_reactions for select to authenticated
  using (public.is_conversation_participant(conversation_id));
drop policy if exists message_stars_read on public.message_stars;
create policy message_stars_read on public.message_stars for select to authenticated using (user_id = auth.uid());
drop policy if exists message_hidden_read on public.message_hidden;
create policy message_hidden_read on public.message_hidden for select to authenticated using (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['message_attachments', 'message_reactions'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Private storage for chat files (signed links only)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-files', 'chat-files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "chat files read" on storage.objects;
create policy "chat files read" on storage.objects for select to authenticated
  using (bucket_id = 'chat-files'
         and case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then public.is_conversation_participant(((storage.foldername(name))[1])::uuid) else false end);
drop policy if exists "chat files upload" on storage.objects;
create policy "chat files upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-files'
              and case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                       then public.is_conversation_participant(((storage.foldername(name))[1])::uuid)
                            and public.can_send_in(((storage.foldername(name))[1])::uuid)
                       else false end);
drop policy if exists "chat files delete own" on storage.objects;
create policy "chat files delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'chat-files' and owner = auth.uid());

-- ---------------------------------------------------------------------------
-- Sending, editing, deleting, reacting, starring
-- ---------------------------------------------------------------------------
create or replace function public.send_message(
  p_conversation uuid,
  p_type text default 'text',
  p_body text default '',
  p_attachments jsonb default '[]'::jsonb,
  p_reply_to uuid default null,
  p_client_id uuid default null,
  p_forwarded boolean default false
)
returns public.messages
language plpgsql security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  m public.messages;
  att jsonb;
  att_kind text;
  v_body text := left(coalesce(p_body, ''), 4000);
begin
  if me is null then raise exception 'Sign in first'; end if;
  if not public.is_conversation_participant(p_conversation) then raise exception 'You are not in this chat'; end if;
  if not public.can_send_in(p_conversation) then raise exception 'Only admins can send messages here'; end if;
  if p_type not in ('text', 'image', 'video', 'audio', 'file', 'location', 'contact') then
    raise exception 'Unsupported message type';
  end if;
  if jsonb_typeof(coalesce(p_attachments, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) > 10 then
    raise exception 'Too many attachments';
  end if;
  if p_type = 'text' and length(trim(v_body)) = 0 then raise exception 'Write a message first'; end if;
  if p_type in ('image', 'video', 'audio', 'file') and jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) = 0 then
    raise exception 'Attach a file first';
  end if;
  if p_reply_to is not null and not exists (
    select 1 from public.messages r where r.id = p_reply_to and r.conversation_id = p_conversation
  ) then raise exception 'The message you replied to is gone'; end if;

  insert into public.messages (conversation_id, sender_id, body, message_type, reply_to_id, forwarded, client_id)
  values (p_conversation, me, v_body, p_type, p_reply_to, coalesce(p_forwarded, false), p_client_id)
  returning * into m;

  for att in select value from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
    att_kind := att ->> 'kind';
    if att_kind is null or att_kind not in ('image', 'video', 'audio', 'file') then
      raise exception 'Unknown attachment type';
    end if;
    if (att ->> 'path') is null or (att ->> 'path') not like (p_conversation::text || '/%') then
      raise exception 'Attachment is not in this chat';
    end if;
    if coalesce((att ->> 'size_bytes')::bigint, 0) > (case when att_kind = 'file' then 26214400 else 52428800 end) then
      raise exception 'That file is too large';
    end if;
    insert into public.message_attachments (message_id, conversation_id, kind, path, name, mime, size_bytes, width, height, duration_ms)
    values (m.id, p_conversation, att_kind, att ->> 'path', left(att ->> 'name', 200), left(att ->> 'mime', 100),
            (att ->> 'size_bytes')::bigint, (att ->> 'width')::int, (att ->> 'height')::int, (att ->> 'duration_ms')::int);
  end loop;
  return m;
end;
$$;

create or replace function public.edit_message(p_message uuid, p_body text)
returns public.messages
language plpgsql security definer
set search_path = public
as $$
declare
  m public.messages;
begin
  select * into m from public.messages where id = p_message;
  if m.id is null or m.deleted_at is not null then raise exception 'Message not found'; end if;
  if m.sender_id is distinct from auth.uid() then raise exception 'You can only edit your own messages'; end if;
  if m.message_type not in ('text', 'image', 'video', 'file') then raise exception 'This message cannot be edited'; end if;
  if now() - m.created_at > interval '15 minutes' then raise exception 'You can edit a message for 15 minutes after sending it'; end if;
  if m.message_type = 'text' and length(trim(coalesce(p_body, ''))) = 0 then raise exception 'Write a message first'; end if;
  update public.messages set body = left(coalesce(p_body, ''), 4000), edited_at = now() where id = p_message returning * into m;
  return m;
end;
$$;

create or replace function public.delete_message(p_message uuid)
returns void
language plpgsql security definer
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
  if k is distinct from 'ai' then
    if m.sender_id is distinct from auth.uid() then raise exception 'You can only delete your own messages'; end if;
    if now() - m.created_at > interval '1 hour' then
      raise exception 'You can delete for everyone within an hour. Use Delete for me instead.';
    end if;
  end if;
  update public.messages set deleted_at = now() where id = p_message;
end;
$$;

create or replace function public.hide_message(p_message uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  cid uuid;
begin
  select conversation_id into cid from public.messages where id = p_message;
  if cid is null or not public.is_conversation_participant(cid) then raise exception 'Not allowed'; end if;
  insert into public.message_hidden (user_id, message_id) values (auth.uid(), p_message) on conflict do nothing;
end;
$$;

-- One reaction per person per message. Sending the same emoji again, or null, removes it.
create or replace function public.react_message(p_message uuid, p_emoji text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  cid uuid;
  current_emoji text;
  e text := nullif(trim(coalesce(p_emoji, '')), '');
begin
  select conversation_id into cid from public.messages where id = p_message and deleted_at is null;
  if cid is null or not public.is_conversation_participant(cid) then raise exception 'Not allowed'; end if;
  select emoji into current_emoji from public.message_reactions where message_id = p_message and user_id = auth.uid();
  if e is null or e = current_emoji then
    delete from public.message_reactions where message_id = p_message and user_id = auth.uid();
  else
    insert into public.message_reactions (message_id, conversation_id, user_id, emoji)
    values (p_message, cid, auth.uid(), left(e, 16))
    on conflict (message_id, user_id) do update set emoji = excluded.emoji, created_at = now();
  end if;
end;
$$;

create or replace function public.toggle_star(p_message uuid)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  cid uuid;
begin
  select conversation_id into cid from public.messages where id = p_message;
  if cid is null or not public.is_conversation_participant(cid) then raise exception 'Not allowed'; end if;
  if exists (select 1 from public.message_stars where user_id = auth.uid() and message_id = p_message) then
    delete from public.message_stars where user_id = auth.uid() and message_id = p_message;
    return false;
  end if;
  insert into public.message_stars (user_id, message_id) values (auth.uid(), p_message);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Class chats: every class has a room for the lecturer, reps and students
-- ---------------------------------------------------------------------------
create or replace function public.class_room_id(p_class uuid)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  cid uuid;
  c public.class_offerings%rowtype;
begin
  select id into cid from public.conversations where class_id = p_class;
  if cid is not null then return cid; end if;
  select * into c from public.class_offerings where id = p_class;
  if not found then return null; end if;
  insert into public.conversations (kind, subject, created_by, class_id)
  values ('class', c.course_code || ' · ' || c.course_title, c.lecturer_user_id, p_class)
  on conflict (class_id) where class_id is not null do nothing
  returning id into cid;
  if cid is null then select id into cid from public.conversations where class_id = p_class; end if;
  insert into public.conversation_participants (conversation_id, user_id, role, last_read_at)
  values (cid, c.lecturer_user_id, 'admin', now())
  on conflict do nothing;
  insert into public.conversation_participants (conversation_id, user_id, role, last_read_at)
  select cid, e.student_user_id, 'member', now()
    from public.class_enrollments e where e.class_id = p_class and e.status = 'active'
  on conflict do nothing;
  insert into public.conversation_participants (conversation_id, user_id, role, last_read_at)
  select cid, s.user_id, 'admin', now()
    from public.class_staff s where s.class_id = p_class and s.status = 'active'
  on conflict do nothing;
  update public.conversation_participants p set role = 'admin'
   where p.conversation_id = cid and p.user_id in (select s.user_id from public.class_staff s where s.class_id = p_class and s.status = 'active');
  return cid;
end;
$$;

create or replace function public.class_room_on_class()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.class_room_id(new.id);
  elsif new.course_code is distinct from old.course_code or new.course_title is distinct from old.course_title then
    update public.conversations set subject = new.course_code || ' · ' || new.course_title where class_id = new.id;
  end if;
  return null;
end;
$$;
drop trigger if exists class_room_on_class on public.class_offerings;
create trigger class_room_on_class after insert or update of course_code, course_title on public.class_offerings
  for each row execute function public.class_room_on_class();

create or replace function public.class_room_on_enrollment()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  cid uuid;
  cls uuid := coalesce(new.class_id, old.class_id);
  uid uuid := coalesce(new.student_user_id, old.student_user_id);
begin
  cid := public.class_room_id(cls);
  if cid is null then return null; end if;
  if tg_op <> 'DELETE' and new.status = 'active' then
    insert into public.conversation_participants (conversation_id, user_id, role, last_read_at)
    values (cid, uid, 'member', now()) on conflict do nothing;
  else
    delete from public.conversation_participants where conversation_id = cid and user_id = uid and role = 'member';
  end if;
  return null;
end;
$$;
drop trigger if exists class_room_on_enrollment on public.class_enrollments;
create trigger class_room_on_enrollment after insert or update of status or delete on public.class_enrollments
  for each row execute function public.class_room_on_enrollment();

create or replace function public.class_room_on_staff()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  cid uuid;
  cls uuid := coalesce(new.class_id, old.class_id);
  uid uuid := coalesce(new.user_id, old.user_id);
  active boolean := tg_op <> 'DELETE' and new.status = 'active';
begin
  cid := public.class_room_id(cls);
  if cid is null then return null; end if;
  if active then
    insert into public.conversation_participants (conversation_id, user_id, role, last_read_at)
    values (cid, uid, 'admin', now())
    on conflict (conversation_id, user_id) do update set role = 'admin';
  else
    update public.conversation_participants set role = 'member'
     where conversation_id = cid and user_id = uid
       and exists (select 1 from public.class_enrollments e where e.class_id = cls and e.student_user_id = uid and e.status = 'active');
    delete from public.conversation_participants p
     where p.conversation_id = cid and p.user_id = uid
       and not exists (select 1 from public.class_enrollments e where e.class_id = cls and e.student_user_id = uid and e.status = 'active')
       and uid is distinct from (select lecturer_user_id from public.class_offerings where id = cls);
  end if;
  return null;
end;
$$;
drop trigger if exists class_room_on_staff on public.class_staff;
create trigger class_room_on_staff after insert or update of status, role or delete on public.class_staff
  for each row execute function public.class_room_on_staff();

select public.class_room_id(id) from public.class_offerings;

-- ---------------------------------------------------------------------------
-- Notification rows carry what the app needs to draw them
-- ---------------------------------------------------------------------------
alter table public.notifications
  add column if not exists category text,
  add column if not exists actor_id uuid references auth.users(id) on delete set null,
  add column if not exists image_url text,
  add column if not exists group_key text,
  add column if not exists data jsonb;
create index if not exists notifications_user_category_idx on public.notifications (user_id, category, created_at desc);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.can_send_in(uuid) from public, anon;
revoke execute on function public.send_message(uuid, text, text, jsonb, uuid, uuid, boolean) from public, anon;
revoke execute on function public.edit_message(uuid, text) from public, anon;
revoke execute on function public.delete_message(uuid) from public, anon;
revoke execute on function public.hide_message(uuid) from public, anon;
revoke execute on function public.react_message(uuid, text) from public, anon;
revoke execute on function public.toggle_star(uuid) from public, anon;
revoke execute on function public.class_room_id(uuid) from public, anon, authenticated;
revoke execute on function public.class_room_on_class() from public, anon, authenticated;
revoke execute on function public.class_room_on_enrollment() from public, anon, authenticated;
revoke execute on function public.class_room_on_staff() from public, anon, authenticated;
grant execute on function public.can_send_in(uuid) to authenticated, service_role;
grant execute on function public.send_message(uuid, text, text, jsonb, uuid, uuid, boolean) to authenticated, service_role;
grant execute on function public.edit_message(uuid, text) to authenticated, service_role;
grant execute on function public.delete_message(uuid) to authenticated, service_role;
grant execute on function public.hide_message(uuid) to authenticated, service_role;
grant execute on function public.react_message(uuid, text) to authenticated, service_role;
grant execute on function public.toggle_star(uuid) to authenticated, service_role;

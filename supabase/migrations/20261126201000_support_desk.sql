-- Support desk: tickets answered by a support team, plus the knowledge base
-- the CampusOS Assistant answers from before handing a chat to a person.

-- 1) Who is a support agent ------------------------------------------------

create or replace function public.is_support_agent()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('support') or public.is_staff();
$$;

create or replace function public.user_is_support_agent(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = p_user and r.role in ('support', 'admin', 'moderator')
  );
$$;

revoke all on function public.is_support_agent() from public, anon;
grant execute on function public.is_support_agent() to authenticated;
revoke all on function public.user_is_support_agent(uuid) from public, anon, authenticated;

-- 2) Chat kinds ----------------------------------------------------------------

alter table public.conversations drop constraint if exists conversations_kind_check;
alter table public.conversations add constraint conversations_kind_check
  check (kind in ('direct', 'support', 'listing', 'order', 'group', 'ai', 'assistant'));

alter table public.messages drop constraint if exists messages_message_type_check;
alter table public.messages add constraint messages_message_type_check
  check (message_type in ('text', 'audio', 'system', 'image', 'assistant'));

-- 3) Tables --------------------------------------------------------------------

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity (start with 1001) unique,
  conversation_id uuid not null unique references public.conversations (id) on delete cascade,
  requester_id uuid not null references auth.users (id) on delete cascade,
  audience text not null default 'student'
    check (audience in ('student', 'business', 'lecturer', 'school', 'other')),
  subject text not null,
  category text not null default 'other'
    check (category in (
      'account', 'verification', 'housing', 'food', 'marketplace', 'payments',
      'business_setup', 'listings', 'classes', 'technical', 'safety', 'other'
    )),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open'
    check (status in ('open', 'waiting', 'resolved')),
  source text not null default 'direct'
    check (source in ('direct', 'assistant')),
  summary text,
  assistant_transcript text,
  assigned_to uuid references auth.users (id) on delete set null,
  first_response_at timestamptz,
  resolved_at timestamptz,
  last_message_at timestamptz not null default now(),
  rating smallint check (rating between 1 and 5),
  rating_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_status_idx
  on public.support_tickets (status, last_message_at desc);
create index if not exists support_tickets_requester_idx
  on public.support_tickets (requester_id, created_at desc);
create index if not exists support_tickets_assigned_idx
  on public.support_tickets (assigned_to, status);

create table if not exists public.support_ticket_notes (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.support_saved_replies (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  body text not null check (length(trim(body)) > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  body text not null check (length(trim(body)) > 0),
  audience text not null default 'all' check (audience in ('all', 'student', 'business')),
  category text not null default 'other',
  keywords text,
  published boolean not null default true,
  source_ticket_id uuid references public.support_tickets (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(keywords, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B')
  ) stored
);

create index if not exists support_articles_search_idx
  on public.support_articles using gin (search);

create table if not exists public.support_ai_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  question text not null,
  reply text,
  mode text not null default 'search' check (mode in ('ai', 'search')),
  handed_off boolean not null default false,
  ticket_id uuid references public.support_tickets (id) on delete set null,
  article_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists support_ai_runs_created_idx
  on public.support_ai_runs (created_at desc);

create table if not exists public.support_invites (
  email text primary key check (email = lower(email)),
  invited_by uuid references auth.users (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- 4) Row level security ----------------------------------------------------------

alter table public.support_tickets enable row level security;
alter table public.support_ticket_notes enable row level security;
alter table public.support_saved_replies enable row level security;
alter table public.support_articles enable row level security;
alter table public.support_ai_runs enable row level security;
alter table public.support_invites enable row level security;

grant select, update on public.support_tickets to authenticated;
grant select, insert, delete on public.support_ticket_notes to authenticated;
grant select, insert, update, delete on public.support_saved_replies to authenticated;
grant select, insert, update, delete on public.support_articles to authenticated;
grant select on public.support_ai_runs to authenticated;
grant select on public.support_invites to authenticated;

drop policy if exists support_tickets_select on public.support_tickets;
create policy support_tickets_select on public.support_tickets
  for select to authenticated
  using (requester_id = auth.uid() or public.is_support_agent());

drop policy if exists support_tickets_update_agent on public.support_tickets;
create policy support_tickets_update_agent on public.support_tickets
  for update to authenticated
  using (public.is_support_agent())
  with check (public.is_support_agent());

drop policy if exists support_notes_agent on public.support_ticket_notes;
create policy support_notes_agent on public.support_ticket_notes
  for select to authenticated using (public.is_support_agent());

drop policy if exists support_notes_insert on public.support_ticket_notes;
create policy support_notes_insert on public.support_ticket_notes
  for insert to authenticated
  with check (public.is_support_agent() and author_id = auth.uid());

drop policy if exists support_notes_delete on public.support_ticket_notes;
create policy support_notes_delete on public.support_ticket_notes
  for delete to authenticated
  using (author_id = auth.uid() or public.is_staff());

drop policy if exists support_saved_replies_agent on public.support_saved_replies;
create policy support_saved_replies_agent on public.support_saved_replies
  for all to authenticated
  using (public.is_support_agent())
  with check (public.is_support_agent());

drop policy if exists support_articles_read on public.support_articles;
create policy support_articles_read on public.support_articles
  for select to authenticated
  using (published or public.is_support_agent());

drop policy if exists support_articles_write on public.support_articles;
create policy support_articles_write on public.support_articles
  for all to authenticated
  using (public.is_support_agent())
  with check (public.is_support_agent());

drop policy if exists support_ai_runs_agent on public.support_ai_runs;
create policy support_ai_runs_agent on public.support_ai_runs
  for select to authenticated using (public.is_support_agent());

drop policy if exists support_invites_staff on public.support_invites;
create policy support_invites_staff on public.support_invites
  for select to authenticated using (public.is_staff());

-- Support chats: the whole support team (not only admins) can read and reply.
drop policy if exists conversations_select_staff_support on public.conversations;
create policy conversations_select_staff_support on public.conversations
  for select to authenticated
  using (kind = 'support' and public.is_support_agent());

drop policy if exists messages_select_staff_support on public.messages;
create policy messages_select_staff_support on public.messages
  for select to authenticated
  using (public.is_support_agent() and public.is_support_conversation(conversation_id));

drop policy if exists messages_insert_staff_support on public.messages;
create policy messages_insert_staff_support on public.messages
  for insert to authenticated
  with check (
    public.is_support_agent()
    and public.is_support_conversation(conversation_id)
    and sender_id = auth.uid()
    and message_type = 'text'
  );

-- Only the assistant (service role) writes assistant messages.
drop policy if exists messages_insert_participant on public.messages;
create policy messages_insert_participant on public.messages
  for insert to authenticated
  with check (
    public.is_conversation_participant(conversation_id)
    and (sender_id = auth.uid() or sender_id is null)
    and message_type <> 'assistant'
  );

-- 5) Creating tickets --------------------------------------------------------------

create or replace function public.support_audience_for(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.business_profiles b where b.owner_user_id = p_user)
      or exists (select 1 from public.business_applications a where a.user_id = p_user)
      or exists (select 1 from public.user_roles r where r.user_id = p_user and r.role in ('provider', 'vendor'))
      then 'business'
    when exists (select 1 from public.user_roles r where r.user_id = p_user and r.role = 'school_admin')
      then 'school'
    when exists (select 1 from public.user_roles r where r.user_id = p_user and r.role = 'lecturer')
      then 'lecturer'
    when exists (select 1 from public.user_roles r where r.user_id = p_user and r.role = 'student')
      then 'student'
    else 'other'
  end;
$$;

revoke all on function public.support_audience_for(uuid) from public, anon, authenticated;

create or replace function public.create_support_ticket(
  p_requester uuid,
  p_subject text,
  p_message text default null,
  p_category text default 'other',
  p_priority text default 'normal',
  p_source text default 'direct',
  p_summary text default null,
  p_transcript text default null
)
returns public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  conv_id uuid;
  ticket public.support_tickets;
  subj text := left(coalesce(nullif(trim(p_subject), ''), 'Support request'), 120);
  cat text := coalesce(nullif(p_category, ''), 'other');
begin
  if p_requester is null then
    raise exception 'Requester required';
  end if;
  if cat not in (
    'account', 'verification', 'housing', 'food', 'marketplace', 'payments',
    'business_setup', 'listings', 'classes', 'technical', 'safety', 'other'
  ) then
    cat := 'other';
  end if;

  insert into public.conversations (kind, subject, created_by)
  values ('support', subj, p_requester)
  returning id into conv_id;

  insert into public.conversation_participants (conversation_id, user_id, role, last_read_at)
  values (conv_id, p_requester, 'member', now());

  insert into public.support_tickets (
    conversation_id, requester_id, audience, subject, category, priority,
    source, summary, assistant_transcript
  )
  values (
    conv_id, p_requester, public.support_audience_for(p_requester), subj, cat,
    case when p_priority in ('low', 'normal', 'high', 'urgent') then p_priority
         when cat in ('safety', 'payments') then 'high'
         else 'normal' end,
    case when p_source = 'assistant' then 'assistant' else 'direct' end,
    nullif(trim(p_summary), ''),
    nullif(p_transcript, '')
  )
  returning * into ticket;

  insert into public.messages (conversation_id, sender_id, message_type, body)
  values (
    conv_id, null, 'system',
    case when ticket.source = 'assistant'
      then 'CampusOS Assistant passed this chat to the support team. Ticket #' || ticket.number
           || ' — a person will reply here and you''ll get a notification.'
      else 'Ticket #' || ticket.number
           || ' created. A CampusOS support agent will reply here and you''ll get a notification.'
    end
  );

  if nullif(trim(p_message), '') is not null then
    insert into public.messages (conversation_id, sender_id, message_type, body)
    values (conv_id, p_requester, 'text', trim(p_message));
  end if;

  select * into ticket from public.support_tickets where id = ticket.id;
  return ticket;
end;
$$;

revoke all on function public.create_support_ticket(uuid, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_support_ticket(uuid, text, text, text, text, text, text, text)
  to service_role;

create or replace function public.open_support_ticket(
  p_subject text,
  p_message text,
  p_category text default 'other'
)
returns public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Sign in to contact support';
  end if;
  if nullif(trim(p_message), '') is null then
    raise exception 'Tell us what you need help with';
  end if;
  if (
    select count(*) from public.support_tickets
    where requester_id = me and status <> 'resolved'
  ) >= 5 then
    raise exception 'You already have 5 open tickets. Reply in one of them and the team will pick it up.';
  end if;
  return public.create_support_ticket(me, p_subject, p_message, p_category, null, 'direct', null, null);
end;
$$;

revoke all on function public.open_support_ticket(text, text, text) from public, anon;
grant execute on function public.open_support_ticket(text, text, text) to authenticated;

create or replace function public.rate_support_ticket(
  p_ticket uuid,
  p_rating int,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_rating not between 1 and 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;
  update public.support_tickets
  set rating = p_rating, rating_comment = nullif(trim(p_comment), '')
  where id = p_ticket and requester_id = auth.uid() and status = 'resolved';
  if not found then
    raise exception 'You can rate your own resolved tickets only';
  end if;
end;
$$;

revoke all on function public.rate_support_ticket(uuid, int, text) from public, anon;
grant execute on function public.rate_support_ticket(uuid, int, text) to authenticated;

-- 6) Ticket lifecycle triggers -----------------------------------------------------

create or replace function public.support_ticket_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.status = 'resolved' and old.status <> 'resolved' then
    new.resolved_at := now();
  elsif new.status <> 'resolved' and old.status = 'resolved' then
    new.resolved_at := null;
    new.rating := null;
    new.rating_comment := null;
  end if;
  if new.assigned_to is not null
     and new.assigned_to is distinct from old.assigned_to
     and not public.user_is_support_agent(new.assigned_to) then
    raise exception 'Tickets can only be assigned to support agents';
  end if;
  -- Requester-owned fields never change through the agent update path.
  if not public.is_dashboard_session() and auth.uid() is distinct from old.requester_id then
    new.requester_id := old.requester_id;
    new.conversation_id := old.conversation_id;
    if new.rating is distinct from old.rating and new.status = 'resolved' then
      new.rating := old.rating;
      new.rating_comment := old.rating_comment;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists support_tickets_before_update on public.support_tickets;
create trigger support_tickets_before_update
  before update on public.support_tickets
  for each row execute function public.support_ticket_before_update();

create or replace function public.support_ticket_after_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'resolved' and old.status <> 'resolved' then
    insert into public.messages (conversation_id, sender_id, message_type, body)
    values (
      new.conversation_id, null, 'system',
      'Ticket #' || new.number || ' was marked as resolved. Reply here if you still need help.'
    );
    perform public.notify_user(
      new.requester_id,
      'Ticket #' || new.number || ' resolved',
      'Tell us how we did — rate the chat in Help & support.',
      '/support'
    );
  end if;
  if new.assigned_to is not null
     and new.assigned_to is distinct from old.assigned_to
     and new.assigned_to is distinct from auth.uid() then
    perform public.notify_user(
      new.assigned_to,
      'Ticket #' || new.number || ' assigned to you',
      new.subject,
      '/support-desk/' || new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists support_tickets_after_update on public.support_tickets;
create trigger support_tickets_after_update
  after update on public.support_tickets
  for each row execute function public.support_ticket_after_update();

create or replace function public.support_ticket_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  agent record;
  notified int := 0;
begin
  for agent in
    select distinct r.user_id from public.user_roles r where r.role = 'support'
  loop
    perform public.notify_user(
      agent.user_id,
      'New ticket #' || new.number
        || case when new.priority in ('high', 'urgent') then ' · ' || new.priority else '' end,
      new.subject,
      '/support-desk/' || new.id
    );
    notified := notified + 1;
  end loop;
  if notified = 0 then
    for agent in
      select distinct r.user_id from public.user_roles r where r.role = 'admin'
    loop
      perform public.notify_user(
        agent.user_id, 'New ticket #' || new.number, new.subject, '/support-desk/' || new.id
      );
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists support_tickets_after_insert on public.support_tickets;
create trigger support_tickets_after_insert
  after insert on public.support_tickets
  for each row execute function public.support_ticket_after_insert();

-- New messages move the ticket between "open" (team's turn) and "waiting" (user's turn).
create or replace function public.support_message_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.support_tickets;
begin
  if new.sender_id is null then
    return new;
  end if;
  select * into t from public.support_tickets where conversation_id = new.conversation_id;
  if t.id is null then
    return new;
  end if;

  if new.sender_id = t.requester_id then
    update public.support_tickets
    set status = 'open', last_message_at = new.created_at
    where id = t.id;
    if t.assigned_to is not null and t.status <> 'open' then
      perform public.notify_user(
        t.assigned_to,
        'Reply on ticket #' || t.number,
        left(coalesce(new.body, ''), 140),
        '/support-desk/' || t.id
      );
    end if;
  elsif public.user_is_support_agent(new.sender_id) then
    update public.support_tickets
    set status = case when status = 'resolved' then status else 'waiting' end,
        first_response_at = coalesce(first_response_at, new.created_at),
        assigned_to = coalesce(assigned_to, new.sender_id),
        last_message_at = new.created_at
    where id = t.id;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_support_activity on public.messages;
create trigger messages_support_activity
  after insert on public.messages
  for each row execute function public.support_message_activity();

-- Reply notifications point at the ticket list on both the app and the portal.
create or replace function public.notify_support_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.support_tickets;
begin
  if new.sender_id is null or new.message_type <> 'text' then
    return new;
  end if;
  select * into t from public.support_tickets where conversation_id = new.conversation_id;
  if t.id is null or t.requester_id = new.sender_id then
    return new;
  end if;
  perform public.notify_user(
    t.requester_id,
    'CampusOS Support replied · #' || t.number,
    left(coalesce(new.body, ''), 140),
    '/support'
  );
  return new;
end;
$$;

-- 7) Support desk reads ----------------------------------------------------------------

create or replace function public.support_queue(p_view text default 'open', p_search text default null)
returns table (
  id uuid,
  number bigint,
  conversation_id uuid,
  subject text,
  category text,
  priority text,
  status text,
  source text,
  audience text,
  requester_id uuid,
  requester_name text,
  requester_email text,
  assigned_to uuid,
  assignee_name text,
  last_message text,
  last_message_at timestamptz,
  first_response_at timestamptz,
  created_at timestamptz,
  rating smallint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_support_agent() then
    raise exception 'Support team only';
  end if;
  return query
  select
    t.id, t.number, t.conversation_id, t.subject, t.category, t.priority, t.status,
    t.source, t.audience, t.requester_id,
    coalesce(rp.preferred_name, rp.first_name, rp.full_name, split_part(ru.email, '@', 1))::text,
    ru.email::text,
    t.assigned_to,
    coalesce(ap.preferred_name, ap.first_name, ap.full_name)::text,
    (
      select m.body from public.messages m
      where m.conversation_id = t.conversation_id and m.deleted_at is null
      order by m.created_at desc limit 1
    ),
    t.last_message_at, t.first_response_at, t.created_at, t.rating
  from public.support_tickets t
  join auth.users ru on ru.id = t.requester_id
  left join public.profiles rp on rp.id = t.requester_id
  left join public.profiles ap on ap.id = t.assigned_to
  where (
    case coalesce(p_view, 'open')
      when 'open' then t.status = 'open'
      when 'unassigned' then t.status <> 'resolved' and t.assigned_to is null
      when 'mine' then t.status <> 'resolved' and t.assigned_to = auth.uid()
      when 'waiting' then t.status = 'waiting'
      when 'resolved' then t.status = 'resolved'
      else true
    end
  )
  and (
    p_search is null or p_search = ''
    or t.subject ilike '%' || p_search || '%'
    or ru.email ilike '%' || p_search || '%'
    or t.number::text = ltrim(p_search, '#')
  )
  order by
    case t.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
    t.last_message_at desc
  limit 200;
end;
$$;

revoke all on function public.support_queue(text, text) from public, anon;
grant execute on function public.support_queue(text, text) to authenticated;

create or replace function public.support_queue_counts()
returns table (open_count bigint, unassigned_count bigint, mine_count bigint, waiting_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_support_agent() then
    raise exception 'Support team only';
  end if;
  return query
  select
    count(*) filter (where status = 'open'),
    count(*) filter (where status <> 'resolved' and assigned_to is null),
    count(*) filter (where status <> 'resolved' and assigned_to = auth.uid()),
    count(*) filter (where status = 'waiting')
  from public.support_tickets;
end;
$$;

revoke all on function public.support_queue_counts() from public, anon;
grant execute on function public.support_queue_counts() to authenticated;

create or replace function public.support_requester(p_ticket uuid)
returns table (
  user_id uuid,
  name text,
  email text,
  roles text[],
  joined_at timestamptz,
  location text,
  business_names text[],
  ticket_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_support_agent() then
    raise exception 'Support team only';
  end if;
  return query
  select
    u.id,
    coalesce(p.full_name, p.preferred_name, split_part(u.email, '@', 1))::text,
    u.email::text,
    coalesce(array(select r.role::text from public.user_roles r where r.user_id = u.id), '{}'),
    u.created_at,
    p.location_label,
    coalesce(array(select b.display_name from public.business_profiles b where b.owner_user_id = u.id), '{}'),
    (select count(*) from public.support_tickets x where x.requester_id = u.id)
  from public.support_tickets t
  join auth.users u on u.id = t.requester_id
  left join public.profiles p on p.id = u.id
  where t.id = p_ticket;
end;
$$;

revoke all on function public.support_requester(uuid) from public, anon;
grant execute on function public.support_requester(uuid) to authenticated;

create or replace function public.support_agents()
returns table (user_id uuid, name text, email text, is_support boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_support_agent() then
    raise exception 'Support team only';
  end if;
  return query
  select distinct on (u.id)
    u.id,
    coalesce(p.preferred_name, p.first_name, p.full_name, split_part(u.email, '@', 1))::text,
    u.email::text,
    exists (select 1 from public.user_roles s where s.user_id = u.id and s.role = 'support')
  from public.user_roles r
  join auth.users u on u.id = r.user_id
  left join public.profiles p on p.id = u.id
  where r.role in ('support', 'admin');
end;
$$;

revoke all on function public.support_agents() from public, anon;
grant execute on function public.support_agents() to authenticated;

-- Names of the people in a support chat, for the requester's view.
create or replace function public.support_sender_names(p_conversation uuid)
returns table (user_id uuid, name text, is_agent boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_support_agent() or public.is_conversation_participant(p_conversation)) then
    raise exception 'Not allowed';
  end if;
  return query
  select distinct
    m.sender_id,
    coalesce(p.preferred_name, p.first_name, p.full_name, 'CampusOS')::text,
    public.user_is_support_agent(m.sender_id)
  from public.messages m
  left join public.profiles p on p.id = m.sender_id
  where m.conversation_id = p_conversation and m.sender_id is not null;
end;
$$;

revoke all on function public.support_sender_names(uuid) from public, anon;
grant execute on function public.support_sender_names(uuid) to authenticated;

-- 8) Knowledge base search ---------------------------------------------------------------

create or replace function public.search_support_articles(
  p_query text,
  p_audience text default 'all',
  p_limit int default 4
)
returns table (id uuid, title text, body text, category text, rank real)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select websearch_to_tsquery('english', coalesce(p_query, '')) as strict_q,
           to_tsquery(
             'english',
             coalesce(nullif(array_to_string(array(
               select quote_literal(lexeme) from unnest(to_tsvector('english', coalesce(p_query, '')))
             ), ' | '), ''), 'campusos')
           ) as loose_q
  )
  select a.id, a.title, a.body, a.category,
         (ts_rank(a.search, q.strict_q) * 2 + ts_rank(a.search, q.loose_q))::real as rank
  from public.support_articles a, q
  where a.published
    and (a.audience = 'all' or p_audience is null or p_audience = 'all' or a.audience = p_audience)
    and a.search @@ q.loose_q
  order by rank desc
  limit greatest(1, least(coalesce(p_limit, 4), 10));
$$;

revoke all on function public.search_support_articles(text, text, int) from public, anon;
grant execute on function public.search_support_articles(text, text, int) to authenticated, service_role;

-- 9) Managing the support team -------------------------------------------------------------

create or replace function public.admin_add_support_agent(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
  clean text := lower(trim(p_email));
begin
  if not public.has_role('admin') then
    raise exception 'Only admins can manage the support team';
  end if;
  if clean is null or clean !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address';
  end if;

  select u.id into target from auth.users u where lower(u.email) = clean;

  if target is not null then
    insert into public.user_roles (user_id, role) values (target, 'support')
    on conflict (user_id, role) do nothing;
    insert into public.support_invites (email, invited_by, user_id, accepted_at)
    values (clean, auth.uid(), target, now())
    on conflict (email) do update set user_id = excluded.user_id, accepted_at = coalesce(public.support_invites.accepted_at, now());
    perform public.notify_user(
      target,
      'You joined the CampusOS support team',
      'Open the Support desk in the CampusOS Portal to start answering requests.',
      '/support-desk'
    );
    return 'added';
  end if;

  insert into public.support_invites (email, invited_by)
  values (clean, auth.uid())
  on conflict (email) do update set invited_by = excluded.invited_by, accepted_at = null, user_id = null;
  return 'invited';
end;
$$;

revoke all on function public.admin_add_support_agent(text) from public, anon;
grant execute on function public.admin_add_support_agent(text) to authenticated;

create or replace function public.admin_remove_support_agent(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean text := lower(trim(p_email));
  target uuid;
begin
  if not public.has_role('admin') then
    raise exception 'Only admins can manage the support team';
  end if;
  select u.id into target from auth.users u where lower(u.email) = clean;
  if target is not null then
    delete from public.user_roles where user_id = target and role = 'support';
    update public.support_tickets set assigned_to = null
    where assigned_to = target and status <> 'resolved';
  end if;
  delete from public.support_invites where email = clean;
end;
$$;

revoke all on function public.admin_remove_support_agent(text) from public, anon;
grant execute on function public.admin_remove_support_agent(text) to authenticated;

create or replace function public.admin_support_team()
returns table (
  email text,
  user_id uuid,
  name text,
  state text,
  since timestamptz,
  open_tickets bigint,
  resolved_tickets bigint,
  avg_rating numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff only';
  end if;
  return query
  with members as (
    select lower(u.email)::text as email, u.id as user_id, r.created_at as since
    from public.user_roles r join auth.users u on u.id = r.user_id
    where r.role = 'support'
  ),
  pending as (
    select i.email, null::uuid as user_id, i.created_at as since
    from public.support_invites i
    where i.accepted_at is null and not exists (select 1 from members m where m.email = i.email)
  )
  select
    x.email,
    x.user_id,
    coalesce(p.full_name, p.preferred_name, p.first_name)::text,
    case when x.user_id is null then 'invited' else 'active' end,
    x.since,
    (select count(*) from public.support_tickets t where t.assigned_to = x.user_id and t.status <> 'resolved'),
    (select count(*) from public.support_tickets t where t.assigned_to = x.user_id and t.status = 'resolved'),
    (select round(avg(t.rating)::numeric, 1) from public.support_tickets t where t.assigned_to = x.user_id and t.rating is not null)
  from (select * from members union all select * from pending) x
  left join public.profiles p on p.id = x.user_id
  order by x.since desc;
end;
$$;

revoke all on function public.admin_support_team() from public, anon;
grant execute on function public.admin_support_team() to authenticated;

create or replace function public.support_stats(p_days int default 30)
returns table (
  tickets bigint,
  resolved bigint,
  from_assistant bigint,
  assistant_chats bigint,
  assistant_handoffs bigint,
  median_first_reply_minutes numeric,
  avg_rating numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, coalesce(p_days, 30)));
begin
  if not public.is_support_agent() then
    raise exception 'Support team only';
  end if;
  return query
  select
    (select count(*) from public.support_tickets t where t.created_at >= since),
    (select count(*) from public.support_tickets t where t.created_at >= since and t.status = 'resolved'),
    (select count(*) from public.support_tickets t where t.created_at >= since and t.source = 'assistant'),
    (select count(*) from public.support_ai_runs r where r.created_at >= since),
    (select count(*) from public.support_ai_runs r where r.created_at >= since and r.handed_off),
    (
      select round((percentile_cont(0.5) within group (
        order by extract(epoch from (t.first_response_at - t.created_at)) / 60
      ))::numeric, 0)
      from public.support_tickets t
      where t.created_at >= since and t.first_response_at is not null
    ),
    (select round(avg(t.rating)::numeric, 1) from public.support_tickets t where t.created_at >= since and t.rating is not null);
end;
$$;

revoke all on function public.support_stats(int) from public, anon;
grant execute on function public.support_stats(int) to authenticated;

-- 10) Invited people become support agents when they sign up ------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  intent text := coalesce(nullif(meta->>'signup_intent', ''), 'student');
  loc_lat double precision;
  loc_lng double precision;
begin
  begin
    loc_lat := nullif(meta->>'location_lat', '')::double precision;
    loc_lng := nullif(meta->>'location_lng', '')::double precision;
  exception when others then
    loc_lat := null;
    loc_lng := null;
  end;

  insert into public.profiles (
    id, full_name, first_name, last_name, preferred_name,
    location_label, location_lat, location_lng, location_updated_at
  )
  values (
    new.id,
    coalesce(
      meta->>'full_name',
      trim(concat(coalesce(meta->>'first_name', ''), ' ', coalesce(meta->>'last_name', ''))),
      split_part(new.email, '@', 1)
    ),
    nullif(meta->>'first_name', ''),
    nullif(meta->>'last_name', ''),
    nullif(meta->>'preferred_name', ''),
    nullif(meta->>'location_label', ''),
    loc_lat,
    loc_lng,
    case when loc_lat is not null then now() end
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    first_name = coalesce(excluded.first_name, public.profiles.first_name),
    last_name = coalesce(excluded.last_name, public.profiles.last_name),
    preferred_name = coalesce(excluded.preferred_name, public.profiles.preferred_name),
    location_label = coalesce(excluded.location_label, public.profiles.location_label),
    location_lat = coalesce(excluded.location_lat, public.profiles.location_lat),
    location_lng = coalesce(excluded.location_lng, public.profiles.location_lng),
    location_updated_at = coalesce(excluded.location_updated_at, public.profiles.location_updated_at);

  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  if exists (
    select 1 from public.support_invites i
    where i.email = lower(new.email) and i.accepted_at is null
  ) then
    insert into public.user_roles (user_id, role)
    values (new.id, 'support')
    on conflict (user_id, role) do nothing;
    update public.support_invites
    set accepted_at = now(), user_id = new.id
    where email = lower(new.email);
    return new;
  end if;

  if intent = 'student' then
    insert into public.user_roles (user_id, role)
    values (new.id, 'student')
    on conflict (user_id, role) do nothing;

    insert into public.student_profiles (user_id)
    values (new.id)
    on conflict (user_id) do nothing;

    insert into public.student_preferences (user_id)
    values (new.id)
    on conflict (user_id) do nothing;

    insert into public.onboarding_progress (user_id, current_step, setup_tasks)
    values (
      new.id,
      'status',
      array['add_courses','add_timetable','set_housing_budget','set_study_goal']
    )
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

-- 11) Live updates for the support desk ------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_tickets'
  ) then
    alter publication supabase_realtime add table public.support_tickets;
  end if;
end;
$$;

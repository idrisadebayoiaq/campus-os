-- Phase A (rest) + Phase B: reminders, enquiries, opening hours, menu options,
-- delivery, promotions (used by orders), team members, payments and refunds.

-- ---------------------------------------------------------------------------
-- Team members
-- ---------------------------------------------------------------------------

create table if not exists public.business_members (
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('manager', 'staff')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create table if not exists public.business_member_invites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  email text not null,
  role text not null check (role in ('manager', 'staff')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_id, email)
);

alter table public.business_members enable row level security;
alter table public.business_member_invites enable row level security;

-- Owner/manager/staff checks. Owners and platform staff always pass.
create or replace function public.can_operate_business(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_business is not null and (
    exists (select 1 from public.business_profiles b where b.id = p_business and b.owner_user_id = auth.uid())
    or exists (select 1 from public.business_members m where m.business_id = p_business and m.user_id = auth.uid())
    or public.is_staff()
  );
$$;

create or replace function public.can_manage_business(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_business is not null and (
    exists (select 1 from public.business_profiles b where b.id = p_business and b.owner_user_id = auth.uid())
    or exists (
      select 1 from public.business_members m
      where m.business_id = p_business and m.user_id = auth.uid() and m.role = 'manager'
    )
    or public.is_staff()
  );
$$;

create or replace function public.my_business_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select b.id from public.business_profiles b where b.owner_user_id = auth.uid()
  union
  select m.business_id from public.business_members m where m.user_id = auth.uid();
$$;

create or replace function public.business_of_unit(p_unit uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.business_id from public.property_units u
  join public.properties p on p.id = u.property_id
  where u.id = p_unit;
$$;

create or replace function public.business_of_conversation(p_conversation uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.business_id from public.conversations c where c.id = p_conversation;
$$;

drop policy if exists "Team sees members" on public.business_members;
create policy "Team sees members" on public.business_members
  for select to authenticated
  using (user_id = auth.uid() or public.can_operate_business(business_id));

drop policy if exists "Owners see invites" on public.business_member_invites;
create policy "Owners see invites" on public.business_member_invites
  for select to authenticated
  using (
    public.is_staff()
    or exists (select 1 from public.business_profiles b where b.id = business_id and b.owner_user_id = auth.uid())
  );

grant select on public.business_members, public.business_member_invites to authenticated;

create or replace function public.business_team(p_business uuid)
returns table (user_id uuid, name text, email text, role text, pending boolean)
language sql
stable
security definer
set search_path = public
as $$
  select b.owner_user_id, coalesce(nullif(p.full_name, ''), u.email), u.email, 'owner', false
  from public.business_profiles b
  join auth.users u on u.id = b.owner_user_id
  left join public.profiles p on p.id = b.owner_user_id
  where b.id = p_business and public.can_operate_business(p_business)
  union all
  select m.user_id, coalesce(nullif(p.full_name, ''), u.email), u.email, m.role, false
  from public.business_members m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.business_id = p_business and public.can_operate_business(p_business)
  union all
  select null::uuid, i.email, i.email, i.role, true
  from public.business_member_invites i
  where i.business_id = p_business and public.can_operate_business(p_business);
$$;

create or replace function public.add_business_member(p_business uuid, p_email text, p_role text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_user uuid;
  v_name text;
begin
  if not (
    public.is_staff()
    or exists (select 1 from public.business_profiles b where b.id = p_business and b.owner_user_id = auth.uid())
  ) then
    raise exception 'Only the owner can manage the team';
  end if;
  if p_role not in ('manager', 'staff') then
    raise exception 'Role must be manager or staff';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address';
  end if;

  select id into v_user from auth.users where lower(email) = v_email limit 1;
  select display_name into v_name from public.business_profiles where id = p_business;

  if v_user is not null then
    if exists (select 1 from public.business_profiles where id = p_business and owner_user_id = v_user) then
      raise exception 'That person already owns this business';
    end if;
    insert into public.business_members (business_id, user_id, role, invited_by)
    values (p_business, v_user, p_role, auth.uid())
    on conflict (business_id, user_id) do update set role = excluded.role;
    perform public.notify_user(v_user, 'You joined a team', 'You can now help run ' || coalesce(v_name, 'a business') || ' as ' || p_role || '.', '/dashboard');
    return 'added';
  end if;

  insert into public.business_member_invites (business_id, email, role, invited_by)
  values (p_business, v_email, p_role, auth.uid())
  on conflict (business_id, email) do update set role = excluded.role;
  return 'invited';
end;
$$;

create or replace function public.remove_business_member(p_business uuid, p_user uuid default null, p_email text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.is_staff()
    or exists (select 1 from public.business_profiles b where b.id = p_business and b.owner_user_id = auth.uid())
    or p_user = auth.uid()
  ) then
    raise exception 'Only the owner can manage the team';
  end if;
  if p_user is not null then
    delete from public.business_members where business_id = p_business and user_id = p_user;
  end if;
  if p_email is not null then
    delete from public.business_member_invites where business_id = p_business and email = lower(trim(p_email));
  end if;
end;
$$;

create or replace function public.accept_business_invites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.business_members (business_id, user_id, role, invited_by)
  select i.business_id, new.id, i.role, i.invited_by
  from public.business_member_invites i
  where i.email = lower(new.email)
  on conflict (business_id, user_id) do nothing;
  delete from public.business_member_invites where email = lower(new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_accept_business_invites on auth.users;
create trigger on_auth_user_accept_business_invites
  after insert on auth.users
  for each row execute function public.accept_business_invites();

-- Tell the whole team (owner + members) about something.
create or replace function public.notify_business_team(p_business uuid, p_title text, p_body text, p_link text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  for uid in
    select b.owner_user_id from public.business_profiles b where b.id = p_business
    union
    select m.user_id from public.business_members m where m.business_id = p_business
  loop
    perform public.notify_user(uid, p_title, p_body, p_link);
  end loop;
end;
$$;

-- Team policies on the operational tables. Staff run orders, viewings, enquiries
-- and messages; managers also run the menu, slots, deals and boosts.

drop policy if exists "Parties read orders" on public.food_orders;
create policy "Parties read orders" on public.food_orders
  for select to authenticated
  using (auth.uid() = student_id or public.can_operate_business(business_id));

drop policy if exists "Vendors update orders" on public.food_orders;
create policy "Vendors update orders" on public.food_orders
  for update to authenticated
  using (auth.uid() = student_id or public.can_operate_business(business_id))
  with check (auth.uid() = student_id or public.can_operate_business(business_id));

drop policy if exists "Parties read order items" on public.food_order_items;
create policy "Parties read order items" on public.food_order_items
  for select to authenticated
  using (exists (
    select 1 from public.food_orders o
    where o.id = order_id and (o.student_id = auth.uid() or public.can_operate_business(o.business_id))
  ));

drop policy if exists "Students and owners read inspections" on public.inspection_requests;
create policy "Students and owners read inspections" on public.inspection_requests
  for select to authenticated
  using (auth.uid() = student_id or public.can_operate_business(public.business_of_unit(unit_id)));

drop policy if exists "Owners update inspections" on public.inspection_requests;
create policy "Owners update inspections" on public.inspection_requests
  for update to authenticated
  using (auth.uid() = student_id or public.can_operate_business(public.business_of_unit(unit_id)))
  with check (auth.uid() = student_id or public.can_operate_business(public.business_of_unit(unit_id)));

drop policy if exists "Owners manage slots" on public.inspection_slots;
create policy "Owners manage slots" on public.inspection_slots
  for all to authenticated
  using (exists (select 1 from public.properties p where p.id = property_id and public.can_manage_business(p.business_id)))
  with check (exists (select 1 from public.properties p where p.id = property_id and public.can_manage_business(p.business_id)));

drop policy if exists "Read slots" on public.inspection_slots;
create policy "Read slots" on public.inspection_slots
  for select to authenticated
  using (exists (
    select 1 from public.properties p
    where p.id = property_id and (p.is_published or public.can_operate_business(p.business_id))
  ));

drop policy if exists "Owners manage menu" on public.menu_items;
create policy "Owners manage menu" on public.menu_items
  for all to authenticated
  using (public.can_manage_business(business_id))
  with check (public.can_manage_business(business_id));

drop policy if exists "Public read published menu" on public.menu_items;
create policy "Public read published menu" on public.menu_items
  for select
  using (is_published = true or public.can_operate_business(business_id));

drop policy if exists "Parties read enquiries" on public.listing_enquiries;
create policy "Parties read enquiries" on public.listing_enquiries
  for select to authenticated
  using (auth.uid() = student_id or public.can_operate_business(business_id));

drop policy if exists "Business updates enquiries" on public.listing_enquiries;
create policy "Business updates enquiries" on public.listing_enquiries
  for update to authenticated
  using (public.can_operate_business(business_id))
  with check (public.can_operate_business(business_id));

-- Team members can read and answer the business's chats without being added as participants.
drop policy if exists "conversations_select_business_team" on public.conversations;
create policy "conversations_select_business_team" on public.conversations
  for select to authenticated
  using (business_id is not null and public.can_operate_business(business_id));

drop policy if exists "messages_select_business_team" on public.messages;
create policy "messages_select_business_team" on public.messages
  for select to authenticated
  using (public.can_operate_business(public.business_of_conversation(conversation_id)));

drop policy if exists "messages_insert_business_team" on public.messages;
create policy "messages_insert_business_team" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and message_type = 'text'
    and public.can_operate_business(public.business_of_conversation(conversation_id))
  );

-- ---------------------------------------------------------------------------
-- Listing enquiries: status, resolution and quick replies
-- ---------------------------------------------------------------------------

alter table public.listing_enquiries
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'listing_enquiries_status_check'
  ) then
    update public.listing_enquiries set status = 'open' where status is null or status not in ('open', 'resolved');
    alter table public.listing_enquiries
      add constraint listing_enquiries_status_check check (status in ('open', 'resolved'));
  end if;
end $$;

alter table public.listing_enquiries alter column status set default 'open';

create index if not exists listing_enquiries_business_status_idx
  on public.listing_enquiries (business_id, status, created_at desc);

create table if not exists public.business_quick_replies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

alter table public.business_quick_replies enable row level security;
drop policy if exists "Team uses quick replies" on public.business_quick_replies;
create policy "Team uses quick replies" on public.business_quick_replies
  for all to authenticated
  using (public.can_operate_business(business_id))
  with check (public.can_operate_business(business_id));
grant select, insert, update, delete on public.business_quick_replies to authenticated;

-- New enquiry and new viewing request ring the team.
create or replace function public.notify_new_enquiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_business_team(new.business_id, 'New enquiry', coalesce(new.subject, 'A student sent a message'), '/listings/enquiries');
  return new;
end;
$$;

drop trigger if exists listing_enquiries_notify_new on public.listing_enquiries;
create trigger listing_enquiries_notify_new
  after insert on public.listing_enquiries
  for each row execute function public.notify_new_enquiry();

create or replace function public.notify_new_viewing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  biz uuid := public.business_of_unit(new.unit_id);
  unit_title text;
begin
  select title into unit_title from public.property_units where id = new.unit_id;
  perform public.notify_business_team(
    biz,
    'New viewing request',
    coalesce(unit_title, 'A room') || coalesce(' · ' || to_char(new.preferred_at at time zone 'Africa/Lagos', 'Dy DD Mon, HH24:MI'), ''),
    '/listings/inspections'
  );
  return new;
end;
$$;

drop trigger if exists inspection_requests_notify_new on public.inspection_requests;
create trigger inspection_requests_notify_new
  after insert on public.inspection_requests
  for each row execute function public.notify_new_viewing();

-- ---------------------------------------------------------------------------
-- Opening hours and pause orders
-- ---------------------------------------------------------------------------

alter table public.business_profiles
  add column if not exists accepting_orders boolean not null default true;

create or replace function public.business_open_now(p_business uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b record;
  local_ts timestamp := now() at time zone 'Africa/Lagos';
  day_key text := lower(to_char(local_ts, 'dy'));
  h jsonb;
  o time;
  c time;
begin
  select accepting_orders, hours into b from public.business_profiles where id = p_business;
  if not found or not b.accepting_orders then
    return false;
  end if;
  if b.hours is null or b.hours = '{}'::jsonb then
    return true;
  end if;
  h := b.hours -> day_key;
  if h is null or jsonb_typeof(h) <> 'object' or (h->>'open') is null or (h->>'close') is null then
    return false;
  end if;
  o := (h->>'open')::time;
  c := (h->>'close')::time;
  if c > o then
    return local_ts::time between o and c;
  end if;
  return local_ts::time >= o or local_ts::time <= c;
exception when others then
  return true;
end;
$$;

grant execute on function public.business_open_now(uuid) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Menu: option groups (sizes, add-ons) and categories
-- ---------------------------------------------------------------------------

alter table public.menu_items
  add column if not exists sort_order integer not null default 0;

create table if not exists public.menu_option_groups (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  required boolean not null default false,
  multi boolean not null default false,
  sort_order integer not null default 0
);

create table if not exists public.menu_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.menu_option_groups(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  price_delta numeric not null default 0 check (price_delta >= 0),
  in_stock boolean not null default true,
  sort_order integer not null default 0
);

create index if not exists menu_option_groups_item_idx on public.menu_option_groups (menu_item_id);
create index if not exists menu_options_group_idx on public.menu_options (group_id);

alter table public.menu_option_groups enable row level security;
alter table public.menu_options enable row level security;

drop policy if exists "Read option groups" on public.menu_option_groups;
create policy "Read option groups" on public.menu_option_groups for select
  using (exists (select 1 from public.menu_items i where i.id = menu_item_id and (i.is_published or public.can_operate_business(i.business_id))));
drop policy if exists "Manage option groups" on public.menu_option_groups;
create policy "Manage option groups" on public.menu_option_groups for all to authenticated
  using (exists (select 1 from public.menu_items i where i.id = menu_item_id and public.can_manage_business(i.business_id)))
  with check (exists (select 1 from public.menu_items i where i.id = menu_item_id and public.can_manage_business(i.business_id)));

drop policy if exists "Read options" on public.menu_options;
create policy "Read options" on public.menu_options for select
  using (exists (
    select 1 from public.menu_option_groups g join public.menu_items i on i.id = g.menu_item_id
    where g.id = group_id and (i.is_published or public.can_operate_business(i.business_id))
  ));
drop policy if exists "Manage options" on public.menu_options;
create policy "Manage options" on public.menu_options for all to authenticated
  using (exists (
    select 1 from public.menu_option_groups g join public.menu_items i on i.id = g.menu_item_id
    where g.id = group_id and public.can_manage_business(i.business_id)
  ))
  with check (exists (
    select 1 from public.menu_option_groups g join public.menu_items i on i.id = g.menu_item_id
    where g.id = group_id and public.can_manage_business(i.business_id)
  ));

grant select on public.menu_option_groups, public.menu_options to anon, authenticated;
grant insert, update, delete on public.menu_option_groups, public.menu_options to authenticated;

alter table public.food_order_items add column if not exists options jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- Delivery zones and fees
-- ---------------------------------------------------------------------------

create table if not exists public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  label text,
  radius_km numeric not null check (radius_km > 0 and radius_km <= 30),
  fee numeric not null default 0 check (fee >= 0),
  min_order numeric not null default 0 check (min_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists delivery_zones_business_idx on public.delivery_zones (business_id, radius_km);

alter table public.delivery_zones enable row level security;
drop policy if exists "Read delivery zones" on public.delivery_zones;
create policy "Read delivery zones" on public.delivery_zones for select using (true);
drop policy if exists "Manage delivery zones" on public.delivery_zones;
create policy "Manage delivery zones" on public.delivery_zones for all to authenticated
  using (public.can_manage_business(business_id))
  with check (public.can_manage_business(business_id));
grant select on public.delivery_zones to anon, authenticated;
grant insert, update, delete on public.delivery_zones to authenticated;

create or replace function public.distance_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

create or replace function public.delivery_quote(p_business uuid, p_lat double precision, p_lng double precision)
returns table (deliverable boolean, fee numeric, min_order numeric, distance_km double precision, reason text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  biz record;
  d double precision;
  zone record;
begin
  select lat, lng into biz from public.business_profiles where id = p_business;
  if not found or biz.lat is null or biz.lng is null then
    return query select false, 0::numeric, 0::numeric, null::double precision, 'This kitchen has not set its location yet.'::text;
    return;
  end if;
  if p_lat is null or p_lng is null then
    return query select false, 0::numeric, 0::numeric, null::double precision, 'Set your location to see delivery options.'::text;
    return;
  end if;
  d := public.distance_km(biz.lat, biz.lng, p_lat, p_lng);
  select z.fee, z.min_order into zone
  from public.delivery_zones z
  where z.business_id = p_business and z.is_active and z.radius_km >= d
  order by z.radius_km asc
  limit 1;
  if not found then
    return query select false, 0::numeric, 0::numeric, d, 'You are outside this kitchen''s delivery area.'::text;
    return;
  end if;
  return query select true, zone.fee, zone.min_order, d, null::text;
end;
$$;

grant execute on function public.delivery_quote(uuid, double precision, double precision) to authenticated;

-- ---------------------------------------------------------------------------
-- Promotions (specials and discount codes). Managed in Phase C, priced here.
-- ---------------------------------------------------------------------------

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  kind text not null check (kind in ('special', 'discount_code')),
  title text not null check (char_length(title) between 2 and 80),
  description text,
  code text,
  percent_off integer check (percent_off between 1 and 90),
  amount_off numeric check (amount_off > 0),
  menu_item_id uuid references public.menu_items(id) on delete cascade,
  special_price numeric check (special_price >= 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  max_uses integer check (max_uses > 0),
  used_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (kind <> 'discount_code' or (code is not null and (percent_off is not null or amount_off is not null))),
  check (kind <> 'special' or (menu_item_id is not null and special_price is not null))
);

create unique index if not exists promotions_code_unique on public.promotions (business_id, lower(code)) where code is not null;
create index if not exists promotions_active_idx on public.promotions (business_id, is_active, ends_at);

alter table public.promotions enable row level security;
drop policy if exists "Read live promotions" on public.promotions;
create policy "Read live promotions" on public.promotions for select
  using (
    (is_active and kind = 'special' and starts_at <= now() and ends_at > now())
    or public.can_operate_business(business_id)
  );
drop policy if exists "Manage promotions" on public.promotions;
create policy "Manage promotions" on public.promotions for all to authenticated
  using (public.can_manage_business(business_id))
  with check (public.can_manage_business(business_id));
grant select on public.promotions to anon, authenticated;
grant insert, update, delete on public.promotions to authenticated;

-- ---------------------------------------------------------------------------
-- Payments, receipts and refunds
-- ---------------------------------------------------------------------------

alter table public.food_orders
  add column if not exists fulfilment text not null default 'pickup' check (fulfilment in ('pickup', 'delivery')),
  add column if not exists delivery_fee numeric not null default 0,
  add column if not exists delivery_address text,
  add column if not exists delivery_lat double precision,
  add column if not exists delivery_lng double precision,
  add column if not exists discount numeric not null default 0,
  add column if not exists promo_code text,
  add column if not exists payment_method text not null default 'cash' check (payment_method in ('cash', 'card')),
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'pending', 'paid', 'failed', 'refund_requested', 'refunded')),
  add column if not exists paid_at timestamptz;

alter table public.payment_ledger
  add column if not exists food_order_id uuid references public.food_orders(id) on delete set null,
  add column if not exists purpose text not null default 'order' check (purpose in ('order', 'boost', 'subscription', 'refund')),
  add column if not exists platform_fee numeric not null default 0;

create index if not exists payment_ledger_business_idx on public.payment_ledger (business_id, created_at desc);

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.food_orders(id) on delete cascade,
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null check (amount > 0),
  reason text,
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'processed')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists refunds_one_open_per_order on public.refunds (order_id) where status in ('requested', 'approved');

alter table public.refunds enable row level security;
drop policy if exists "Parties read refunds" on public.refunds;
create policy "Parties read refunds" on public.refunds for select to authenticated
  using (student_id = auth.uid() or public.can_operate_business(business_id));
grant select on public.refunds to authenticated;

create or replace function public.request_refund(p_order uuid, p_reason text)
returns public.refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.food_orders;
  r public.refunds;
begin
  select * into o from public.food_orders where id = p_order and student_id = auth.uid();
  if not found then
    raise exception 'Order not found';
  end if;
  if o.payment_status <> 'paid' then
    raise exception 'Only paid orders can be refunded';
  end if;
  insert into public.refunds (order_id, business_id, student_id, amount, reason)
  values (o.id, o.business_id, o.student_id, o.total, nullif(trim(p_reason), ''))
  returning * into r;
  update public.food_orders set payment_status = 'refund_requested' where id = o.id;
  perform public.notify_business_team(o.business_id, 'Refund requested', '₦' || o.total::text || coalesce(' · ' || nullif(trim(p_reason), ''), ''), '/billing');
  return r;
end;
$$;

create or replace function public.decide_refund(p_refund uuid, p_approve boolean)
returns public.refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.refunds;
begin
  select * into r from public.refunds where id = p_refund and status = 'requested';
  if not found then
    raise exception 'Refund request not found';
  end if;
  if not exists (select 1 from public.business_profiles b where b.id = r.business_id and b.owner_user_id = auth.uid())
     and not public.is_staff() then
    raise exception 'Only the owner can decide refunds';
  end if;
  update public.refunds
  set status = case when p_approve then 'approved' else 'rejected' end,
      decided_by = auth.uid(), decided_at = now()
  where id = r.id
  returning * into r;
  if not p_approve then
    update public.food_orders set payment_status = 'paid' where id = r.order_id;
  end if;
  perform public.notify_user(
    r.student_id,
    case when p_approve then 'Refund approved' else 'Refund declined' end,
    case when p_approve then 'Your refund of ₦' || r.amount::text || ' is being processed.' else 'The kitchen declined your refund request.' end,
    '/orders'
  );
  return r;
end;
$$;

grant execute on function public.request_refund(uuid, text) to authenticated;
grant execute on function public.decide_refund(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Ordering: guard and place_food_order v2
-- ---------------------------------------------------------------------------

create or replace function public.guard_food_order_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  is_vendor boolean;
begin
  -- Server-side code (service role, SECURITY DEFINER functions) and platform staff may change anything.
  if auth.uid() is null or current_user not in ('authenticated', 'anon') or public.is_staff() then
    return new;
  end if;

  is_vendor := public.can_operate_business(old.business_id);

  if new.business_id is distinct from old.business_id
     or new.student_id is distinct from old.student_id
     or new.subtotal is distinct from old.subtotal
     or new.packaging_fee is distinct from old.packaging_fee
     or new.total is distinct from old.total
     or new.notes is distinct from old.notes
     or new.delivery_fee is distinct from old.delivery_fee
     or new.discount is distinct from old.discount
     or new.fulfilment is distinct from old.fulfilment
     or new.payment_method is distinct from old.payment_method
     or new.payment_status is distinct from old.payment_status
     or new.paid_at is distinct from old.paid_at then
    raise exception 'Order details cannot be changed';
  end if;

  if is_vendor then
    if new.status is distinct from old.status then
      if not (
        (old.status = 'placed' and new.status in ('accepted', 'declined'))
        or (old.status = 'accepted' and new.status in ('preparing', 'ready', 'declined'))
        or (old.status = 'preparing' and new.status in ('ready', 'declined'))
        or (old.status = 'ready' and new.status in ('collected', 'completed'))
        or (old.status = 'collected' and new.status = 'completed')
      ) then
        raise exception 'An order cannot move from % to %', old.status, new.status;
      end if;
      if new.status = 'accepted' then
        new.accepted_at := now();
      elsif new.status = 'ready' then
        new.ready_at := now();
      elsif new.status = 'declined' and coalesce(trim(new.decline_reason), '') = '' then
        new.decline_reason := 'The kitchen could not take this order.';
      end if;
    end if;
    return new;
  end if;

  if auth.uid() = old.student_id then
    if new.status is distinct from old.status
       and not (old.status = 'placed' and new.status = 'cancelled') then
      raise exception 'You can only cancel an order before the kitchen accepts it';
    end if;
    if new.prep_minutes is distinct from old.prep_minutes
       or new.decline_reason is distinct from old.decline_reason
       or new.accepted_at is distinct from old.accepted_at
       or new.ready_at is distinct from old.ready_at then
      raise exception 'Order details cannot be changed';
    end if;
    return new;
  end if;

  raise exception 'Not allowed';
end;
$$;

drop function if exists public.place_food_order(uuid, jsonb, text);

create or replace function public.place_food_order(
  p_business uuid,
  p_items jsonb,
  p_notes text default null,
  p_fulfilment text default 'pickup',
  p_address text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_promo_code text default null,
  p_payment_method text default 'cash'
)
returns public.food_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  biz public.business_profiles;
  ord public.food_orders;
  line jsonb;
  item public.menu_items;
  special public.promotions;
  promo public.promotions;
  grp public.menu_option_groups;
  opt public.menu_options;
  qty integer;
  unit_price numeric;
  opts jsonb;
  picked integer;
  sub numeric := 0;
  lines integer := 0;
  fee numeric := 0;
  disc numeric := 0;
  quote record;
  priced jsonb := '[]'::jsonb;
  opt_id text;
  has_card_account boolean;
begin
  if me is null then
    raise exception 'Sign in to place an order';
  end if;
  if p_fulfilment not in ('pickup', 'delivery') then
    raise exception 'Choose pickup or delivery';
  end if;
  if p_payment_method not in ('cash', 'card') then
    raise exception 'Choose how you will pay';
  end if;

  select * into biz from public.business_profiles
  where id = p_business and business_type = 'food_vendor' and is_active;
  if not found then
    raise exception 'This kitchen is not taking orders';
  end if;
  if biz.campus_id is null then
    raise exception 'This kitchen is not linked to a campus yet';
  end if;
  if not public.business_open_now(p_business) then
    raise exception 'This kitchen is closed right now';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty';
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception 'Too many different items in one order';
  end if;

  if (
    select count(*) from public.food_orders
    where student_id = me and business_id = p_business and status in ('placed', 'accepted', 'preparing')
  ) >= 3 then
    raise exception 'You already have 3 open orders with this kitchen';
  end if;

  if p_payment_method = 'card' then
    select exists (
      select 1 from public.business_payment_methods m
      where m.business_id = p_business and m.is_verified and m.paystack_subaccount_code is not null
    ) into has_card_account;
    if not has_card_account then
      raise exception 'This kitchen does not take card payments yet';
    end if;
  end if;

  -- Price every line from the menu (and any live special) before the order exists.
  for line in select * from jsonb_array_elements(p_items) loop
    qty := greatest(1, least(20, coalesce((line->>'quantity')::integer, 1)));
    select * into item from public.menu_items
    where id = (line->>'menu_item_id')::uuid
      and business_id = p_business
      and is_published
      and coalesce(in_stock, true);
    if not found then
      raise exception 'An item in your cart is no longer available';
    end if;

    unit_price := coalesce(item.price, 0);
    select * into special from public.promotions
    where business_id = p_business and kind = 'special' and menu_item_id = item.id
      and is_active and starts_at <= now() and ends_at > now()
    order by special_price asc limit 1;
    if found then
      unit_price := least(unit_price, special.special_price);
    end if;

    opts := '[]'::jsonb;
    for grp in select * from public.menu_option_groups where menu_item_id = item.id order by sort_order loop
      picked := 0;
      for opt_id in select jsonb_array_elements_text(coalesce(line->'option_ids', '[]'::jsonb)) loop
        select * into opt from public.menu_options where id = opt_id::uuid and group_id = grp.id;
        if found then
          if not opt.in_stock then
            raise exception '% is sold out', opt.name;
          end if;
          picked := picked + 1;
          unit_price := unit_price + opt.price_delta;
          opts := opts || jsonb_build_array(jsonb_build_object('group', grp.name, 'name', opt.name, 'price', opt.price_delta));
        end if;
      end loop;
      if grp.required and picked = 0 then
        raise exception 'Choose a % option for %', lower(grp.name), item.name;
      end if;
      if not grp.multi and picked > 1 then
        raise exception 'Pick only one % option for %', lower(grp.name), item.name;
      end if;
    end loop;

    sub := sub + unit_price * qty;
    lines := lines + 1;
    priced := priced || jsonb_build_array(jsonb_build_object(
      'menu_item_id', item.id, 'name', item.name, 'unit_price', unit_price, 'quantity', qty, 'options', opts
    ));
  end loop;

  if p_fulfilment = 'delivery' then
    if coalesce(trim(p_address), '') = '' then
      raise exception 'Add a delivery address';
    end if;
    select * into quote from public.delivery_quote(p_business, p_lat, p_lng);
    if not quote.deliverable then
      raise exception '%', quote.reason;
    end if;
    if sub < quote.min_order then
      raise exception 'Minimum order for delivery is ₦%', quote.min_order;
    end if;
    fee := quote.fee;
  end if;

  if coalesce(trim(p_promo_code), '') <> '' then
    select * into promo from public.promotions
    where business_id = p_business and kind = 'discount_code' and lower(code) = lower(trim(p_promo_code))
      and is_active and starts_at <= now() and ends_at > now()
      and (max_uses is null or used_count < max_uses)
    for update;
    if not found then
      raise exception 'That code is not valid';
    end if;
    disc := least(sub, coalesce(round(sub * promo.percent_off / 100.0), 0) + coalesce(promo.amount_off, 0));
    update public.promotions set used_count = used_count + 1 where id = promo.id;
  end if;

  insert into public.food_orders (
    business_id, campus_id, student_id, status, subtotal, packaging_fee, total, notes,
    fulfilment, delivery_fee, delivery_address, delivery_lat, delivery_lng, discount, promo_code,
    payment_method, payment_status
  )
  values (
    p_business, biz.campus_id, me, 'placed', sub, 0, sub - disc + fee, nullif(trim(p_notes), ''),
    p_fulfilment, fee, case when p_fulfilment = 'delivery' then trim(p_address) end,
    case when p_fulfilment = 'delivery' then p_lat end, case when p_fulfilment = 'delivery' then p_lng end,
    disc, case when disc > 0 then upper(trim(p_promo_code)) end,
    p_payment_method, case when p_payment_method = 'card' then 'pending' else 'unpaid' end
  )
  returning * into ord;

  insert into public.food_order_items (order_id, menu_item_id, name, unit_price, quantity, options)
  select ord.id, (x->>'menu_item_id')::uuid, x->>'name', (x->>'unit_price')::numeric, (x->>'quantity')::integer, x->'options'
  from jsonb_array_elements(priced) x;

  perform public.notify_business_team(
    p_business,
    case when p_fulfilment = 'delivery' then 'New delivery order' else 'New order' end,
    lines::text || ' item' || case when lines = 1 then '' else 's' end || ' · ₦' || ord.total::text,
    '/listings/orders'
  );
  return ord;
end;
$$;

grant execute on function public.place_food_order(uuid, jsonb, text, text, text, double precision, double precision, text, text) to authenticated;
revoke execute on function public.place_food_order(uuid, jsonb, text, text, text, double precision, double precision, text, text) from public, anon;

-- ---------------------------------------------------------------------------
-- Reminders and digests (pg_cron)
-- ---------------------------------------------------------------------------

alter table public.inspection_requests add column if not exists reminder_sent_at timestamptz;

create or replace function public.send_viewing_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select q.id, q.student_id, q.unit_id, q.preferred_at, u.title
    from public.inspection_requests q
    join public.property_units u on u.id = q.unit_id
    where q.status = 'accepted'
      and q.reminder_sent_at is null
      and q.preferred_at is not null
      and q.preferred_at > now()
      and q.preferred_at <= now() + interval '2 hours'
  loop
    perform public.notify_user(
      r.student_id,
      'Viewing in about 2 hours',
      coalesce(r.title, 'Your room') || ' · ' || to_char(r.preferred_at at time zone 'Africa/Lagos', 'HH24:MI'),
      '/housing/' || r.unit_id::text
    );
    perform public.notify_business_team(
      public.business_of_unit(r.unit_id),
      'Viewing coming up',
      coalesce(r.title, 'A room') || ' · ' || to_char(r.preferred_at at time zone 'Africa/Lagos', 'HH24:MI'),
      '/listings/inspections'
    );
    update public.inspection_requests set reminder_sent_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- A short morning summary for each business, delivered as a notification.
create or replace function public.send_daily_digests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  orders integer;
  viewings integer;
  enquiries integer;
  parts text[];
  n integer := 0;
  since timestamptz := date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos' - interval '1 day';
  until timestamptz := date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos';
begin
  for b in select id, display_name from public.business_profiles where is_active loop
    select count(*) into orders from public.food_orders where business_id = b.id and created_at >= since and created_at < until;
    select count(*) into viewings from public.inspection_requests q
      where public.business_of_unit(q.unit_id) = b.id and q.created_at >= since and q.created_at < until;
    select count(*) into enquiries from public.listing_enquiries where business_id = b.id and created_at >= since and created_at < until;
    parts := '{}';
    if orders > 0 then parts := parts || (orders::text || ' order' || case when orders = 1 then '' else 's' end); end if;
    if viewings > 0 then parts := parts || (viewings::text || ' viewing request' || case when viewings = 1 then '' else 's' end); end if;
    if enquiries > 0 then parts := parts || (enquiries::text || ' enquir' || case when enquiries = 1 then 'y' else 'ies' end); end if;
    if array_length(parts, 1) > 0 then
      perform public.notify_business_team(b.id, 'Yesterday at ' || b.display_name, array_to_string(parts, ', '), '/dashboard');
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

revoke execute on function public.send_viewing_reminders() from public, anon, authenticated;
revoke execute on function public.send_daily_digests() from public, anon, authenticated;

create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('campusos-viewing-reminders', 'campusos-daily-digest');
  perform cron.schedule('campusos-viewing-reminders', '*/10 * * * *', 'select public.send_viewing_reminders()');
  perform cron.schedule('campusos-daily-digest', '0 6 * * *', 'select public.send_daily_digests()');
end $$;

-- ---------------------------------------------------------------------------
-- Grants for RPCs
-- ---------------------------------------------------------------------------

grant execute on function public.can_operate_business(uuid) to authenticated, anon;
grant execute on function public.can_manage_business(uuid) to authenticated, anon;
grant execute on function public.my_business_ids() to authenticated;
grant execute on function public.business_team(uuid) to authenticated;
grant execute on function public.add_business_member(uuid, text, text) to authenticated;
grant execute on function public.remove_business_member(uuid, uuid, text) to authenticated;
revoke execute on function public.business_of_unit(uuid) from public, anon;
revoke execute on function public.business_of_conversation(uuid) from public, anon;
grant execute on function public.business_of_unit(uuid) to authenticated;
grant execute on function public.business_of_conversation(uuid) to authenticated;
revoke execute on function public.notify_business_team(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.accept_business_invites() from public, anon, authenticated;
revoke execute on function public.notify_new_enquiry() from public, anon, authenticated;
revoke execute on function public.notify_new_viewing() from public, anon, authenticated;
revoke execute on function public.guard_food_order_update() from public, anon, authenticated;
revoke execute on function public.request_refund(uuid, text) from public, anon;
revoke execute on function public.decide_refund(uuid, boolean) from public, anon;
revoke execute on function public.add_business_member(uuid, text, text) from public, anon;
revoke execute on function public.remove_business_member(uuid, uuid, text) from public, anon;
revoke execute on function public.business_team(uuid) from public, anon;
revoke execute on function public.my_business_ids() from public, anon;
revoke execute on function public.delivery_quote(uuid, double precision, double precision) from public, anon;

create or replace function public.set_accepting_orders(p_business uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_operate_business(p_business) then
    raise exception 'Not allowed';
  end if;
  update public.business_profiles set accepting_orders = p_on where id = p_business;
end;
$$;

grant execute on function public.set_accepting_orders(uuid, boolean) to authenticated;
revoke execute on function public.set_accepting_orders(uuid, boolean) from public, anon;
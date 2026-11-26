-- Phase A: close the loop (food ordering, viewing slots, verified-student label).

-- ---------------------------------------------------------------------------
-- Food orders
-- ---------------------------------------------------------------------------

alter table public.food_orders
  add column if not exists prep_minutes integer check (prep_minutes between 1 and 240),
  add column if not exists decline_reason text,
  add column if not exists accepted_at timestamptz,
  add column if not exists ready_at timestamptz;

-- Students used to be able to insert any status/price straight into the table.
-- Orders now come only from place_food_order(), which prices them from the menu.
drop policy if exists "Students create orders" on public.food_orders;
drop policy if exists "Students insert order items" on public.food_order_items;

create or replace function public.guard_food_order_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_vendor boolean;
begin
  if auth.uid() is null or public.is_staff() then
    return new;
  end if;

  select exists (
    select 1 from public.business_profiles b
    where b.id = old.business_id and b.owner_user_id = auth.uid()
  ) into is_vendor;

  if new.business_id is distinct from old.business_id
     or new.student_id is distinct from old.student_id
     or new.subtotal is distinct from old.subtotal
     or new.packaging_fee is distinct from old.packaging_fee
     or new.total is distinct from old.total
     or new.notes is distinct from old.notes then
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

drop trigger if exists food_orders_guard on public.food_orders;
create trigger food_orders_guard
  before update on public.food_orders
  for each row execute function public.guard_food_order_update();

create or replace function public.place_food_order(
  p_business uuid,
  p_items jsonb,
  p_notes text default null
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
  qty integer;
  sub numeric := 0;
  lines integer := 0;
begin
  if me is null then
    raise exception 'Sign in to place an order';
  end if;

  select * into biz from public.business_profiles
  where id = p_business and business_type = 'food_vendor' and is_active;
  if not found then
    raise exception 'This kitchen is not taking orders';
  end if;
  if biz.campus_id is null then
    raise exception 'This kitchen is not linked to a campus yet';
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

  -- Price every line from the menu first, so the order is created with its real total.
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
    sub := sub + coalesce(item.price, 0) * qty;
    lines := lines + 1;
  end loop;

  insert into public.food_orders (business_id, campus_id, student_id, status, subtotal, packaging_fee, total, notes)
  values (p_business, biz.campus_id, me, 'placed', sub, 0, sub, nullif(trim(p_notes), ''))
  returning * into ord;

  for line in select * from jsonb_array_elements(p_items) loop
    qty := greatest(1, least(20, coalesce((line->>'quantity')::integer, 1)));
    select * into item from public.menu_items where id = (line->>'menu_item_id')::uuid;
    insert into public.food_order_items (order_id, menu_item_id, name, unit_price, quantity)
    values (ord.id, item.id, item.name, coalesce(item.price, 0), qty);
  end loop;
  perform public.notify_user(
    biz.owner_user_id,
    'New order',
    lines::text || ' item' || case when lines = 1 then '' else 's' end || ' · ' ||
      '₦' || sub::text,
    '/listings/orders'
  );
  return ord;
end;
$$;

grant execute on function public.place_food_order(uuid, jsonb, text) to authenticated;

create or replace function public.notify_food_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  biz_name text;
  body text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  select display_name into biz_name from public.business_profiles where id = new.business_id;
  body := coalesce(biz_name, 'Your order');

  if new.status = 'accepted' and new.prep_minutes is not null then
    body := body || ' · ready in about ' || new.prep_minutes::text || ' min';
  elsif new.status = 'declined' and new.decline_reason is not null then
    body := body || ' · ' || new.decline_reason;
  end if;

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
    body,
    '/orders'
  );
  return new;
end;
$$;

alter table public.food_orders replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'food_orders'
  ) then
    alter publication supabase_realtime add table public.food_orders;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Verified-student label (providers see a badge, never the documents)
-- ---------------------------------------------------------------------------

create or replace function public.verified_student_ids(p_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct v.user_id
  from public.student_verifications v
  where v.user_id = any (p_ids)
    and v.status = 'approved'
    and (
      public.is_staff()
      or exists (select 1 from public.business_profiles b where b.owner_user_id = auth.uid())
    );
$$;

grant execute on function public.verified_student_ids(uuid[]) to authenticated;

-- Providers also see the student's first name on their own orders and viewings.
create or replace function public.student_first_names(p_ids uuid[])
returns table (id uuid, first_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, coalesce(nullif(p.preferred_name, ''), nullif(p.first_name, ''), split_part(p.full_name, ' ', 1))
  from public.profiles p
  where p.id = any (p_ids)
    and (
      public.is_staff()
      or exists (select 1 from public.business_profiles b where b.owner_user_id = auth.uid())
    );
$$;

grant execute on function public.student_first_names(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Viewing slots
-- ---------------------------------------------------------------------------

create table if not exists public.inspection_slots (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null default 1 check (capacity between 1 and 20),
  note text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists inspection_slots_property_start_idx
  on public.inspection_slots (property_id, starts_at);

alter table public.inspection_slots enable row level security;

drop policy if exists "Read slots" on public.inspection_slots;
create policy "Read slots" on public.inspection_slots
  for select to authenticated
  using (
    exists (select 1 from public.properties p where p.id = property_id and p.is_published)
    or public.is_staff()
    or exists (
      select 1 from public.properties p
      join public.business_profiles b on b.id = p.business_id
      where p.id = property_id and b.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Owners manage slots" on public.inspection_slots;
create policy "Owners manage slots" on public.inspection_slots
  for all to authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.properties p
      join public.business_profiles b on b.id = p.business_id
      where p.id = property_id and b.owner_user_id = auth.uid()
    )
  )
  with check (
    public.is_staff()
    or exists (
      select 1 from public.properties p
      join public.business_profiles b on b.id = p.business_id
      where p.id = property_id and b.owner_user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.inspection_slots to authenticated;

alter table public.inspection_requests
  add column if not exists slot_id uuid references public.inspection_slots(id) on delete set null;

create index if not exists inspection_requests_slot_idx on public.inspection_requests (slot_id);

create or replace function public.check_inspection_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  slot public.inspection_slots;
  unit_property uuid;
  taken integer;
begin
  if not exists (select 1 from public.property_units where id = new.unit_id and status = 'available') then
    raise exception 'This room is not available for viewing right now';
  end if;
  if new.slot_id is null then
    return new;
  end if;
  select * into slot from public.inspection_slots where id = new.slot_id;
  if not found then
    raise exception 'That viewing time is no longer available';
  end if;
  select property_id into unit_property from public.property_units where id = new.unit_id;
  if unit_property is distinct from slot.property_id then
    raise exception 'That viewing time is for a different property';
  end if;
  if slot.starts_at <= now() then
    raise exception 'That viewing time has already started';
  end if;
  select count(*) into taken
  from public.inspection_requests r
  where r.slot_id = slot.id and r.status in ('requested', 'accepted', 'rescheduled');
  if taken >= slot.capacity then
    raise exception 'That viewing time is full. Pick another one.';
  end if;
  if exists (
    select 1 from public.inspection_requests r
    where r.slot_id = slot.id and r.student_id = new.student_id
      and r.status in ('requested', 'accepted', 'rescheduled')
  ) then
    raise exception 'You already booked this time';
  end if;
  new.preferred_at := slot.starts_at;
  return new;
end;
$$;

drop trigger if exists inspection_requests_slot_check on public.inspection_requests;
create trigger inspection_requests_slot_check
  before insert on public.inspection_requests
  for each row execute function public.check_inspection_slot();

-- Students can't read other students' requests, so spots left comes from here.
create or replace function public.inspection_slots_for_unit(p_unit uuid)
returns table (id uuid, starts_at timestamptz, ends_at timestamptz, note text, spots_left integer)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.starts_at, s.ends_at, s.note,
    greatest(0, s.capacity - (
      select count(*)::integer from public.inspection_requests r
      where r.slot_id = s.id and r.status in ('requested', 'accepted', 'rescheduled')
    )) as spots_left
  from public.inspection_slots s
  join public.property_units u on u.property_id = s.property_id
  join public.properties p on p.id = s.property_id
  where u.id = p_unit and p.is_published and s.starts_at > now()
  order by s.starts_at
  limit 40;
$$;

grant execute on function public.inspection_slots_for_unit(uuid) to authenticated;

-- A provider reschedules by moving a request to another slot of the same property.
create or replace function public.reschedule_inspection(p_request uuid, p_slot uuid, p_note text default null)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.inspection_requests;
  slot public.inspection_slots;
  prop uuid;
  taken integer;
begin
  select r.* into req from public.inspection_requests r
  join public.property_units u on u.id = r.unit_id
  join public.properties p on p.id = u.property_id
  join public.business_profiles b on b.id = p.business_id
  where r.id = p_request and (b.owner_user_id = auth.uid() or public.is_staff());
  if not found then
    raise exception 'Request not found';
  end if;
  select * into slot from public.inspection_slots where id = p_slot;
  select property_id into prop from public.property_units where id = req.unit_id;
  if not found or slot.property_id is distinct from prop or slot.starts_at <= now() then
    raise exception 'Pick an upcoming time slot for this property';
  end if;
  select count(*) into taken from public.inspection_requests r
  where r.slot_id = slot.id and r.id <> req.id and r.status in ('requested', 'accepted', 'rescheduled');
  if taken >= slot.capacity then
    raise exception 'That time is full';
  end if;
  update public.inspection_requests
  set slot_id = slot.id,
      preferred_at = slot.starts_at,
      status = 'rescheduled',
      provider_note = coalesce(nullif(trim(p_note), ''), 'New time: ' || to_char(slot.starts_at at time zone 'Africa/Lagos', 'Dy DD Mon, HH24:MI'))
  where id = req.id
  returning * into req;
  return req;
end;
$$;

grant execute on function public.reschedule_inspection(uuid, uuid, text) to authenticated;

-- Live updates for the viewing board.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inspection_requests'
  ) then
    alter publication supabase_realtime add table public.inspection_requests;
  end if;
end $$;

-- Only signed-in users call the RPCs; trigger functions are never called directly.
revoke execute on function public.guard_food_order_update() from public, anon, authenticated;
revoke execute on function public.check_inspection_slot() from public, anon, authenticated;
revoke execute on function public.place_food_order(uuid, jsonb, text) from public, anon;
revoke execute on function public.verified_student_ids(uuid[]) from public, anon;
revoke execute on function public.student_first_names(uuid[]) from public, anon;
revoke execute on function public.inspection_slots_for_unit(uuid) from public, anon;
revoke execute on function public.reschedule_inspection(uuid, uuid, text) from public, anon;

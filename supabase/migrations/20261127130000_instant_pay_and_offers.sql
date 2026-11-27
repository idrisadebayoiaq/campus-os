-- 1) Pending balance + automatic daily payouts for food kitchens
-- 2) Food items sold on the marketplace are paid out as soon as they are handed over
-- 3) Housing: free viewing -> agent sends an offer -> student pays and moves in, or says "Not for me"

-- 1. Pending money ------------------------------------------------------------
-- Money from paid orders that are still in progress. It is not withdrawable yet; it becomes
-- part of the balance when the order is completed.

create or replace function public.business_pending(p_business uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when public.can_operate_business(p_business) then
    coalesce((
      select sum(f.total - coalesce(f.commission, 0))
        from public.food_orders f
       where f.business_id = p_business and f.payment_method = 'wallet' and f.payment_status = 'paid'
         and f.status in ('placed', 'accepted', 'preparing', 'ready')
    ), 0)
    + coalesce((
      select sum(m.amount - round(m.amount * m.commission_pct / 100, 2))
        from public.market_orders m
       where m.seller_business_id = p_business
         and m.status in ('awaiting_seller', 'accepted', 'seller_confirmed', 'disputed')
    ), 0)
  else 0 end;
$$;

create or replace function public.my_pending_earnings()
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((
    select sum(m.amount - round(m.amount * m.commission_pct / 100, 2))
      from public.market_orders m
     where m.seller_user_id = auth.uid()
       and m.status in ('awaiting_seller', 'accepted', 'seller_confirmed', 'disputed')
  ), 0);
$$;

revoke all on function public.business_pending(uuid) from public, anon;
revoke all on function public.my_pending_earnings() from public, anon;
grant execute on function public.business_pending(uuid) to authenticated;
grant execute on function public.my_pending_earnings() to authenticated;

-- 2. Automatic daily payout ----------------------------------------------------

create or replace function public.payout_begin_auto(p_business uuid)
returns payouts
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  biz public.business_profiles;
  bal numeric;
  minimum numeric := public.setting_num('auto_payout_min', 1000);
  p public.payouts;
  ref text := 'pay_' || replace(gen_random_uuid()::text, '-', '');
begin
  select * into biz from public.business_profiles where id = p_business and business_type = 'food_vendor' for update;
  if not found then
    raise exception 'Not a food business';
  end if;
  if not exists (select 1 from public.business_payment_methods m where m.business_id = p_business and m.is_verified) then
    raise exception 'No verified bank account';
  end if;
  if exists (select 1 from public.payouts where business_id = p_business and status in ('requested', 'processing')) then
    raise exception 'A withdrawal is already on its way';
  end if;
  bal := public._business_balance(p_business);
  if bal < minimum then
    raise exception 'Balance is below the automatic payout minimum';
  end if;
  insert into public.payouts (business_id, requested_by, amount, reference)
  values (p_business, biz.owner_user_id, bal, ref)
  returning * into p;
  insert into public.business_entries (business_id, kind, amount, reference, note)
  values (p_business, 'payout', -bal, 'payout_' || p.id, 'Daily payout');
  perform public.notify_business_team(p_business,
    'Daily payout started · ₦' || to_char(bal, 'FM999,999,999,990.00'),
    'It is on its way to your bank account.', '/billing');
  return p;
end;
$$;

create or replace function public.auto_payout_due()
returns table (business_id uuid, balance numeric)
language sql
stable
security definer
set search_path to 'public'
as $$
  select b.id, public._business_balance(b.id)
    from public.business_profiles b
   where b.business_type = 'food_vendor' and b.is_active
     and exists (select 1 from public.business_payment_methods m where m.business_id = b.id and m.is_verified)
     and not exists (select 1 from public.payouts p where p.business_id = b.id and p.status in ('requested', 'processing'))
     and public._business_balance(b.id) >= public.setting_num('auto_payout_min', 1000);
$$;

revoke all on function public.payout_begin_auto(uuid) from public, anon, authenticated;
revoke all on function public.auto_payout_due() from public, anon, authenticated;
grant execute on function public.payout_begin_auto(uuid) to service_role;
grant execute on function public.auto_payout_due() to service_role;

-- Every morning (06:00 Lagos) the payout-auto function sends each kitchen's available balance to its bank.
select cron.schedule('campusos-auto-payouts', '0 5 * * *', $job$
  select net.http_post(
    url := 'https://dwdqeapwesrjsvenbwvk.supabase.co/functions/v1/payout-auto',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sweep-token', (select value from public.internal_secrets where key = 'sweep_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);

-- 3. Food on the marketplace: paid as soon as it is handed over -----------------

create or replace function public.market_is_edible(p_category text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(p_category, '') ~* '(food|drink|snack|meal|cake|pastr|bread|beverage|juice|shawarma|pizza|fruit)';
$$;

create or replace function public.market_seller_confirm(p_order uuid, p_code text, p_photo text)
returns market_orders
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  o public.market_orders;
  edible boolean;
begin
  select * into o from public.market_orders where id = p_order for update;
  if not found or not public._market_is_seller(o) then
    raise exception 'Not allowed';
  end if;
  if o.status <> 'accepted' then
    raise exception 'This order is not waiting for handover';
  end if;
  if trim(coalesce(p_code, '')) <> o.handover_code then
    raise exception 'That code is not right. Ask the buyer for the 6-digit code in their app.';
  end if;
  if p_photo is null or p_photo not like o.id::text || '/' || auth.uid()::text || '/%' then
    raise exception 'Add a photo of the handover';
  end if;

  select public.market_is_edible(l.category) into edible
    from public.marketplace_listings l where l.id = o.listing_id;

  update public.market_orders
  set status = 'seller_confirmed', seller_photo = p_photo,
      release_at = now() + make_interval(hours => public.setting_num('market_release_hours', 48)::int),
      cancel_requested_by = null, updated_at = now()
  where id = o.id returning * into o;

  if coalesce(edible, false) then
    -- Food is eaten straight away, so there is nothing to wait for: pay the seller now.
    o := public._market_release(o);
    perform public.notify_user(o.buyer_id, 'Order completed', '"' || o.title || '" was handed over. Enjoy!', '/market-orders');
    return o;
  end if;

  perform public.notify_user(o.buyer_id, 'Seller marked this as handed over', 'Confirm you received "' || o.title || '" or open a dispute within ' || public.setting_num('market_release_hours', 48)::int || ' hours. After that the payment is released.', '/market-orders');
  return o;
end;
$$;

-- 4. Housing offers -------------------------------------------------------------

alter table public.payment_requests
  add column if not exists unit_id uuid references public.property_units (id) on delete set null,
  add column if not exists inspection_id uuid references public.inspection_requests (id) on delete set null,
  add column if not exists rent_period text,
  add column if not exists start_on date;

alter table public.payment_requests drop constraint if exists payment_requests_status_check;
alter table public.payment_requests add constraint payment_requests_status_check
  check (status = any (array['pending', 'paid', 'cancelled', 'refunded', 'declined']));

create index if not exists payment_requests_inspection_idx on public.payment_requests (inspection_id) where inspection_id is not null;

-- After the viewing, the agent sends the student an offer for the room.
create or replace function public.create_housing_offer(
  p_inspection uuid,
  p_amount numeric,
  p_period text default 'year',
  p_start date default null,
  p_valid_days integer default 3
)
returns payment_requests
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  i public.inspection_requests;
  biz uuid;
  unit_title text;
  r public.payment_requests;
begin
  select * into i from public.inspection_requests where id = p_inspection;
  if not found then
    raise exception 'Viewing not found';
  end if;
  biz := public.business_of_unit(i.unit_id);
  if biz is null or not public.can_manage_business(biz) then
    raise exception 'Not allowed';
  end if;
  if i.status <> 'completed' then
    raise exception 'Mark the viewing as completed first';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > public.setting_num('wallet_cap', 200000) then
    raise exception 'Enter an amount up to ₦%', public.setting_num('wallet_cap', 200000);
  end if;
  if coalesce(p_period, '') not in ('year', 'semester', 'month', 'session') then
    raise exception 'Choose a rent period';
  end if;
  if exists (select 1 from public.payment_requests q where q.inspection_id = p_inspection and q.status = 'pending') then
    raise exception 'An offer is already waiting for this student';
  end if;
  if exists (select 1 from public.payment_requests q where q.unit_id = i.unit_id and q.status = 'pending') then
    raise exception 'Another offer is already waiting for this room';
  end if;
  if exists (select 1 from public.tenancies t where t.unit_id = i.unit_id and t.status in ('active', 'upcoming')) then
    raise exception 'This room already has a tenant';
  end if;

  select title into unit_title from public.property_units where id = i.unit_id;
  insert into public.payment_requests (business_id, student_id, kind, title, amount, due_on, created_by, unit_id, inspection_id, rent_period, start_on)
  values (biz, i.student_id, 'rent', left('Rent · ' || coalesce(unit_title, 'Room'), 120), round(p_amount, 2),
          current_date + greatest(1, least(coalesce(p_valid_days, 3), 14)), auth.uid(), i.unit_id, i.id, p_period, p_start)
  returning * into r;

  -- Hold the room for this student while the offer is open.
  update public.property_units set status = 'reserved' where id = i.unit_id and status = 'available';

  perform public.notify_user(i.student_id, 'Offer for ' || coalesce(unit_title, 'your room'),
    '₦' || to_char(r.amount, 'FM999,999,999,990') || ' per ' || p_period || '. Pay to move in, or choose Not for me.', '/viewings');
  return r;
end;
$$;

-- Frees a room that was only being held for an offer.
create or replace function public._release_offer_unit(p_unit uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.property_units u set status = 'available'
   where u.id = p_unit and u.status = 'reserved'
     and not exists (select 1 from public.payment_requests q where q.unit_id = u.id and q.status = 'pending')
     and not exists (select 1 from public.tenancies t where t.unit_id = u.id and t.status in ('active', 'upcoming'));
$$;

-- Student: "Not for me".
create or replace function public.decline_payment_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r public.payment_requests;
begin
  select * into r from public.payment_requests where id = p_request and student_id = auth.uid() for update;
  if not found then
    raise exception 'Offer not found';
  end if;
  if r.status <> 'pending' then
    raise exception 'This offer is already %', r.status;
  end if;
  update public.payment_requests set status = 'declined' where id = r.id;
  if r.unit_id is not null then
    perform public._release_offer_unit(r.unit_id);
  end if;
  perform public.notify_business_team(r.business_id, 'Offer declined', 'The student chose not to take "' || r.title || '".', '/listings/inspections');
end;
$$;

-- Agent withdraws an offer.
create or replace function public.cancel_payment_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r public.payment_requests;
begin
  update public.payment_requests set status = 'cancelled'
   where id = p_request and status = 'pending' and public.can_manage_business(business_id)
  returning * into r;
  if not found then
    raise exception 'Request not found or already paid';
  end if;
  if r.unit_id is not null then
    perform public._release_offer_unit(r.unit_id);
  end if;
end;
$$;

-- Paying a housing offer also moves the student in. The agent is credited straight away (minus the platform percentage).
create or replace function public.pay_payment_request(p_request uuid)
returns payment_requests
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r public.payment_requests;
  biz public.business_profiles;
  t public.tenancies;
  pct numeric;
  comm numeric;
  receipt text;
  starts date;
  tid uuid;
  unit_title text;
begin
  select * into r from public.payment_requests where id = p_request for update;
  if not found or r.student_id <> auth.uid() then
    raise exception 'Request not found';
  end if;
  if r.status <> 'pending' then
    raise exception 'This request is already %', r.status;
  end if;
  select * into biz from public.business_profiles where id = r.business_id;

  if r.kind = 'rent' and r.tenancy_id is null and r.unit_id is not null then
    if exists (select 1 from public.tenancies x where x.unit_id = r.unit_id and x.status in ('active', 'upcoming')) then
      raise exception 'This room is no longer available';
    end if;
  end if;

  pct := case when r.kind = 'service_fee' then public.setting_num('marketplace_commission_pct', 2) else public.setting_num('rent_commission_pct', 5) end;
  comm := round(r.amount * pct / 100, 2);

  perform public.wallet_apply(r.student_id, -r.amount, 'spend', 'payment_request', 'payment_request', r.id, 'preq_' || r.id, r.title);
  insert into public.business_entries (business_id, kind, amount, reference, note)
  values (r.business_id, 'sale', r.amount, 'preq_sale_' || r.id, r.title)
  on conflict (reference) do nothing;
  if comm > 0 then
    insert into public.business_entries (business_id, kind, amount, reference, note)
    values (r.business_id, 'commission', -comm, 'preq_comm_' || r.id, 'CampusOS commission')
    on conflict (reference) do nothing;
  end if;
  update public.payment_requests set status = 'paid', paid_at = now(), commission = comm where id = r.id returning * into r;

  if r.kind = 'rent' and r.tenancy_id is not null then
    select * into t from public.tenancies where id = r.tenancy_id;
    if found and t.status in ('active', 'upcoming') then
      insert into public.rent_receipts (tenancy_id, amount, method, note, created_by)
      values (t.id, r.amount, 'CampusOS wallet', r.title, r.student_id)
      returning receipt_no into receipt;
      update public.tenancies
      set next_due_on = public.add_months_for(coalesce(next_due_on, current_date), rent_period), status = 'active', reminded_for = null
      where id = t.id;
    end if;
  elsif r.kind = 'rent' and r.tenancy_id is null and r.unit_id is not null then
    -- First payment from an offer: the student becomes the tenant.
    starts := coalesce(r.start_on, current_date);
    begin
      insert into public.tenancies (unit_id, business_id, student_id, start_date, rent_amount, rent_period, next_due_on, status, checklist)
      values (
        r.unit_id, r.business_id, r.student_id, starts, r.amount, coalesce(r.rent_period, 'year'),
        public.add_months_for(starts, coalesce(r.rent_period, 'year')),
        case when starts > current_date then 'upcoming' else 'active' end,
        jsonb_build_array(
          jsonb_build_object('label', 'Inspect the room and note any damage', 'done', false),
          jsonb_build_object('label', 'Photograph the room condition', 'done', false),
          jsonb_build_object('label', 'Record the meter readings', 'done', false),
          jsonb_build_object('label', 'Collect your keys', 'done', false),
          jsonb_build_object('label', 'Sign the tenancy agreement', 'done', false)
        )
      ) returning id into tid;
    exception when unique_violation then
      raise exception 'This room is no longer available';
    end;
    update public.payment_requests set tenancy_id = tid where id = r.id returning * into r;
    insert into public.rent_receipts (tenancy_id, amount, method, note, created_by)
    values (tid, r.amount, 'CampusOS wallet', r.title, r.student_id);
    update public.property_units set status = 'occupied' where id = r.unit_id;
    -- Any other offer for this room is no longer possible.
    update public.payment_requests set status = 'cancelled' where unit_id = r.unit_id and status = 'pending' and id <> r.id;
    select title into unit_title from public.property_units where id = r.unit_id;
    perform public.notify_user(r.student_id, 'You are moving in', 'Your move-in checklist and rent receipts for ' || coalesce(unit_title, 'your room') || ' are in My apartment.', '/apartment');
  end if;

  perform public.notify_business_team(r.business_id, 'Payment received', '₦' || r.amount::text || ' for "' || r.title || '" was paid. ₦' || (r.amount - comm)::text || ' was added to your balance.', '/billing');
  return r;
end;
$$;

-- Offers nobody answered expire and the room is released.
create or replace function public.housing_offer_sweep()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  x record;
begin
  for x in
    with gone as (
      update public.payment_requests
         set status = 'cancelled'
       where status = 'pending' and unit_id is not null and due_on < current_date
      returning id, unit_id, student_id, business_id, title
    )
    select * from gone
  loop
    perform public._release_offer_unit(x.unit_id);
    perform public.notify_user(x.student_id, 'Offer expired', '"' || x.title || '" is no longer open.', '/viewings');
    perform public.notify_business_team(x.business_id, 'Offer expired', '"' || x.title || '" was not answered in time.', '/listings/inspections');
  end loop;
end;
$$;
revoke all on function public.housing_offer_sweep() from public, anon, authenticated;
revoke all on function public._release_offer_unit(uuid) from public, anon, authenticated;

select cron.schedule('campusos-housing-offers', '17 * * * *', $job$select public.housing_offer_sweep()$job$);

revoke all on function public.create_housing_offer(uuid, numeric, text, date, integer) from public, anon;
grant execute on function public.create_housing_offer(uuid, numeric, text, date, integer) to authenticated;
revoke all on function public.decline_payment_request(uuid) from public, anon;
grant execute on function public.decline_payment_request(uuid) to authenticated;

-- Viewing alerts now point to My viewings.
create or replace function public.notify_inspection_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  unit_title text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  select u.title into unit_title from public.property_units u where u.id = new.unit_id;

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
      case when new.status::text = 'completed' then ' · the agent can now send you an offer' else '' end ||
      coalesce(' · ' || nullif(trim(new.provider_note), ''), ''),
    '/viewings'
  );
  return new;
end;
$$;

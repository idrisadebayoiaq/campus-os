-- Wallet-only payments for students: marketplace escrow, payment requests (rent, deposits, fees),
-- subscriptions, and earnings withdrawals for student sellers.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, value, description) values
  ('market_accept_hours', '24', 'Hours a seller has to accept a marketplace order'),
  ('market_handover_days', '5', 'Days to complete the handover after the seller accepts'),
  ('market_release_hours', '48', 'Hours after the seller confirms handover before money is released automatically'),
  ('market_min', '500', 'Smallest marketplace order in naira')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Ledgers: businesses can pay subscriptions from their balance; students can earn
-- ---------------------------------------------------------------------------
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.business_entries'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%escrow_release%'
  loop
    execute format('alter table public.business_entries drop constraint %I', c);
  end loop;
end $$;
alter table public.business_entries add constraint business_entries_kind_check
  check (kind in ('sale', 'commission', 'refund', 'card_clawback', 'payout', 'payout_reversal', 'adjust', 'escrow_release', 'subscription'));

create table if not exists public.user_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('sale', 'commission', 'refund', 'payout', 'payout_reversal', 'adjust')),
  amount numeric(14, 2) not null check (amount <> 0),
  ref_type text,
  ref_id uuid,
  reference text not null unique,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists user_entries_idx on public.user_entries (user_id, created_at desc);

create table if not exists public.user_payout_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_name text not null,
  bank_name text,
  account_number text not null,
  bank_code text not null,
  paystack_recipient_code text,
  is_verified boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.user_entries enable row level security;
alter table public.user_payout_accounts enable row level security;
drop policy if exists "Read own earnings" on public.user_entries;
create policy "Read own earnings" on public.user_entries for select to authenticated using (user_id = auth.uid() or public.is_staff());
drop policy if exists "Read own payout account" on public.user_payout_accounts;
create policy "Read own payout account" on public.user_payout_accounts for select to authenticated using (user_id = auth.uid() or public.is_staff());
grant select on public.user_entries, public.user_payout_accounts to authenticated;

alter table public.payouts alter column business_id drop not null;
alter table public.payouts add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.payouts drop constraint if exists payouts_owner_check;
alter table public.payouts add constraint payouts_owner_check check ((business_id is not null) <> (user_id is not null));
create index if not exists payouts_user_idx on public.payouts (user_id, created_at desc);
drop policy if exists "Users read own payouts" on public.payouts;
create policy "Users read own payouts" on public.payouts for select to authenticated using (user_id = auth.uid());

create or replace function public.my_earnings()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0) from public.user_entries where user_id = auth.uid();
$$;
grant execute on function public.my_earnings() to authenticated;
revoke execute on function public.my_earnings() from public, anon;

-- Starts a withdrawal of a student's whole earnings balance. Called only by the payments function.
create or replace function public.user_payout_begin(p_user uuid)
returns public.payouts
language plpgsql
security definer
set search_path = public
as $$
declare
  bal numeric;
  minimum numeric := public.setting_num('payout_min', 5000);
  p public.payouts;
  ref text := 'pay_' || replace(gen_random_uuid()::text, '-', '');
begin
  perform pg_advisory_xact_lock(hashtext('user_payout_' || p_user::text));
  if not exists (select 1 from public.user_payout_accounts a where a.user_id = p_user and a.is_verified) then
    raise exception 'Add and confirm your bank account first';
  end if;
  if exists (select 1 from public.payouts where user_id = p_user and status in ('requested', 'processing')) then
    raise exception 'A withdrawal is already on its way';
  end if;
  select coalesce(sum(amount), 0) into bal from public.user_entries where user_id = p_user;
  if bal < minimum then
    raise exception 'You can withdraw once your earnings reach ₦%', minimum;
  end if;
  insert into public.payouts (user_id, requested_by, amount, reference) values (p_user, p_user, bal, ref) returning * into p;
  insert into public.user_entries (user_id, kind, amount, ref_type, ref_id, reference, note)
  values (p_user, 'payout', -bal, 'payout', p.id, 'upayout_' || p.id, 'Withdrawal');
  return p;
end;
$$;
revoke all on function public.user_payout_begin(uuid) from public, anon, authenticated;
grant execute on function public.user_payout_begin(uuid) to service_role;

-- payout_finish now also handles student withdrawals.
create or replace function public.payout_finish(p_reference text, p_status text, p_code text default null, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.payouts;
begin
  select * into p from public.payouts where reference = p_reference for update;
  if not found then
    return 'unknown';
  end if;
  if p.status in ('paid', 'failed') then
    return p.status;
  end if;
  if p_status = 'processing' then
    update public.payouts set status = 'processing', transfer_code = coalesce(p_code, transfer_code), updated_at = now() where id = p.id;
    return 'processing';
  elsif p_status = 'paid' then
    update public.payouts set status = 'paid', transfer_code = coalesce(p_code, transfer_code), updated_at = now() where id = p.id;
    if p.business_id is not null then
      perform public.notify_business_team(p.business_id, 'Withdrawal sent', '₦' || p.amount::text || ' is on its way to your bank.', '/billing');
    else
      perform public.notify_user(p.user_id, 'Withdrawal sent', '₦' || p.amount::text || ' is on its way to your bank.', '/earnings');
    end if;
    return 'paid';
  else
    update public.payouts set status = 'failed', failure_reason = left(coalesce(p_reason, 'Transfer failed'), 300), updated_at = now() where id = p.id;
    if p.business_id is not null then
      insert into public.business_entries (business_id, kind, amount, reference, note)
      values (p.business_id, 'payout_reversal', p.amount, 'payout_rev_' || p.id, 'Withdrawal failed, money returned')
      on conflict (reference) do nothing;
      perform public.notify_business_team(p.business_id, 'Withdrawal failed', coalesce(left(p_reason, 140), 'The transfer did not go through.') || ' Your balance was restored.', '/billing');
    else
      insert into public.user_entries (user_id, kind, amount, ref_type, ref_id, reference, note)
      values (p.user_id, 'payout_reversal', p.amount, 'payout', p.id, 'upayout_rev_' || p.id, 'Withdrawal failed, money returned')
      on conflict (reference) do nothing;
      perform public.notify_user(p.user_id, 'Withdrawal failed', coalesce(left(p_reason, 140), 'The transfer did not go through.') || ' Your earnings were restored.', '/earnings');
    end if;
    return 'failed';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Marketplace escrow
-- ---------------------------------------------------------------------------
create table if not exists public.market_orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.marketplace_listings(id) on delete set null,
  title text not null,
  buyer_id uuid not null references auth.users(id),
  seller_business_id uuid references public.business_profiles(id) on delete set null,
  seller_user_id uuid references auth.users(id),
  amount numeric(14, 2) not null check (amount > 0),
  commission_pct numeric not null default 2,
  status text not null default 'awaiting_seller' check (status in (
    'awaiting_seller', 'accepted', 'seller_confirmed', 'completed', 'cancelled', 'declined', 'expired', 'disputed', 'resolved'
  )),
  handover_code text not null,
  accept_by timestamptz not null,
  handover_by timestamptz,
  release_at timestamptz,
  seller_photo text,
  buyer_photo text,
  cancel_requested_by text check (cancel_requested_by in ('buyer', 'seller')),
  cancel_note text,
  dispute_reason text,
  dispute_opened_by uuid references auth.users(id),
  dispute_opened_at timestamptz,
  ruling text check (ruling in ('release', 'refund', 'split')),
  ruling_note text,
  ruled_by uuid references auth.users(id),
  ruled_at timestamptz,
  seller_amount numeric(14, 2),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((seller_business_id is not null) <> (seller_user_id is not null))
);
create index if not exists market_orders_buyer_idx on public.market_orders (buyer_id, created_at desc);
create index if not exists market_orders_seller_user_idx on public.market_orders (seller_user_id, created_at desc);
create index if not exists market_orders_seller_biz_idx on public.market_orders (seller_business_id, created_at desc);
create index if not exists market_orders_status_idx on public.market_orders (status);

alter table public.market_orders enable row level security;
drop policy if exists "Parties read market orders" on public.market_orders;
create policy "Parties read market orders" on public.market_orders for select to authenticated
  using (
    buyer_id = auth.uid()
    or seller_user_id = auth.uid()
    or (seller_business_id is not null and public.can_operate_business(seller_business_id))
    or public.is_staff()
  );

-- The handover code is never readable through the table: only the buyer gets it through market_handover_code().
revoke all on public.market_orders from authenticated, anon;
grant select (
  id, listing_id, title, buyer_id, seller_business_id, seller_user_id, amount, commission_pct, status, accept_by, handover_by,
  release_at, seller_photo, buyer_photo, cancel_requested_by, cancel_note, dispute_reason, dispute_opened_by, dispute_opened_at,
  ruling, ruling_note, ruled_at, seller_amount, completed_at, created_at, updated_at
) on public.market_orders to authenticated;

create or replace function public._market_is_seller(o public.market_orders)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (o.seller_user_id is not null and o.seller_user_id = auth.uid())
      or (o.seller_business_id is not null and public.can_operate_business(o.seller_business_id));
$$;
revoke execute on function public._market_is_seller(public.market_orders) from public, anon, authenticated;

create or replace function public.market_order_party(p_order uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.market_orders o
    where o.id = p_order and (o.buyer_id = auth.uid() or public._market_is_seller(o))
  );
$$;
grant execute on function public.market_order_party(uuid) to authenticated;
revoke execute on function public.market_order_party(uuid) from public, anon;

-- Evidence photos (private bucket). Path: <order id>/<user id>/<file>
insert into storage.buckets (id, name, public) values ('market-evidence', 'market-evidence', false) on conflict (id) do nothing;

drop policy if exists "Market evidence upload" on storage.objects;
create policy "Market evidence upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'market-evidence'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.market_order_party(((storage.foldername(name))[1])::uuid)
  );
drop policy if exists "Market evidence read" on storage.objects;
create policy "Market evidence read" on storage.objects for select to authenticated
  using (
    bucket_id = 'market-evidence'
    and (public.market_order_party(((storage.foldername(name))[1])::uuid) or public.is_staff())
  );

-- Pays the seller (minus commission) from escrow. Idempotent.
create or replace function public._market_credit_seller(o public.market_orders, p_gross numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  comm numeric := round(p_gross * o.commission_pct / 100, 2);
begin
  if p_gross <= 0 then
    return;
  end if;
  if o.seller_business_id is not null then
    insert into public.business_entries (business_id, kind, amount, reference, note)
    values (o.seller_business_id, 'escrow_release', p_gross, 'mkt_rel_' || o.id, 'Sale: ' || o.title)
    on conflict (reference) do nothing;
    if comm > 0 then
      insert into public.business_entries (business_id, kind, amount, reference, note)
      values (o.seller_business_id, 'commission', -comm, 'mkt_comm_' || o.id, 'CampusOS commission')
      on conflict (reference) do nothing;
    end if;
    perform public.notify_business_team(o.seller_business_id, 'Payment released', '₦' || (p_gross - comm)::text || ' for "' || o.title || '" was added to your balance.', '/billing');
  else
    insert into public.user_entries (user_id, kind, amount, ref_type, ref_id, reference, note)
    values (o.seller_user_id, 'sale', p_gross, 'market_order', o.id, 'mkt_rel_' || o.id, 'Sale: ' || o.title)
    on conflict (reference) do nothing;
    if comm > 0 then
      insert into public.user_entries (user_id, kind, amount, ref_type, ref_id, reference, note)
      values (o.seller_user_id, 'commission', -comm, 'market_order', o.id, 'mkt_comm_' || o.id, 'CampusOS commission')
      on conflict (reference) do nothing;
    end if;
    perform public.notify_user(o.seller_user_id, 'Payment released', '₦' || (p_gross - comm)::text || ' for "' || o.title || '" was added to your earnings.', '/earnings');
  end if;
end;
$$;
revoke execute on function public._market_credit_seller(public.market_orders, numeric) from public, anon, authenticated;

create or replace function public._market_refund_buyer(o public.market_orders, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount <= 0 then
    return;
  end if;
  perform public.wallet_apply(o.buyer_id, p_amount, 'refund', 'marketplace', 'market_order', o.id, 'mkt_refund_' || o.id, 'Refund: ' || o.title);
  perform public.notify_user(o.buyer_id, 'Refunded to your wallet', '₦' || p_amount::text || ' for "' || o.title || '" is back in your wallet.', '/wallet');
end;
$$;
revoke execute on function public._market_refund_buyer(public.market_orders, numeric) from public, anon, authenticated;

create or replace function public._market_notify_seller(o public.market_orders, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if o.seller_business_id is not null then
    perform public.notify_business_team(o.seller_business_id, p_title, p_body, '/listings/market-orders');
  else
    perform public.notify_user(o.seller_user_id, p_title, p_body, '/market-orders');
  end if;
end;
$$;
revoke execute on function public._market_notify_seller(public.market_orders, text, text) from public, anon, authenticated;

create or replace function public.market_place_order(p_listing uuid)
returns public.market_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  l public.marketplace_listings;
  o public.market_orders;
  new_id uuid := gen_random_uuid();
  cap numeric := public.setting_num('wallet_cap', 200000);
  minimum numeric := public.setting_num('market_min', 500);
  pct numeric := public.setting_num('marketplace_commission_pct', 2);
begin
  if me is null then
    raise exception 'Sign in to buy';
  end if;
  if not public.setting_bool('wallet_enabled', true) then
    raise exception 'The wallet is not available right now';
  end if;
  select * into l from public.marketplace_listings where id = p_listing for update;
  if not found or l.status <> 'active' then
    raise exception 'This listing is no longer available';
  end if;
  if coalesce(l.price, 0) <= 0 then
    raise exception 'This listing has no price. Message the seller instead.';
  end if;
  if l.price < minimum then
    raise exception 'The smallest order is ₦%', minimum;
  end if;
  if l.price > cap then
    raise exception 'This is above the most a wallet can hold (₦%)', cap;
  end if;
  if l.business_id is null and l.seller_user_id is null then
    raise exception 'This listing has no seller';
  end if;
  if l.seller_user_id = me or (l.business_id is not null and public.can_operate_business(l.business_id)) then
    raise exception 'You cannot buy your own listing';
  end if;
  if exists (
    select 1 from public.market_orders m
    where m.listing_id = l.id and m.status in ('awaiting_seller', 'accepted', 'seller_confirmed', 'disputed')
      and (m.buyer_id = me or not l.is_commercial)
  ) then
    raise exception 'A purchase of this listing is already in progress';
  end if;

  perform public.wallet_apply(me, -l.price, 'escrow_hold', 'marketplace', 'market_order', new_id, 'mkt_hold_' || new_id, 'Held for: ' || l.title);

  insert into public.market_orders (
    id, listing_id, title, buyer_id, seller_business_id, seller_user_id, amount, commission_pct, handover_code, accept_by
  ) values (
    new_id, l.id, l.title, me,
    l.business_id, case when l.business_id is null then l.seller_user_id else null end,
    l.price, pct, lpad((floor(random() * 1000000))::int::text, 6, '0'),
    now() + make_interval(hours => public.setting_num('market_accept_hours', 24)::int)
  ) returning * into o;

  perform public._market_notify_seller(o, 'New paid order', 'Someone paid ₦' || o.amount::text || ' for "' || o.title || '". Accept it within ' || public.setting_num('market_accept_hours', 24)::int || ' hours.');
  return o;
end;
$$;

create or replace function public.market_handover_code(p_order uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  o public.market_orders;
begin
  select * into o from public.market_orders where id = p_order and buyer_id = auth.uid();
  if not found or o.status not in ('accepted', 'seller_confirmed') then
    return null;
  end if;
  return o.handover_code;
end;
$$;

create or replace function public.market_accept(p_order uuid)
returns public.market_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.market_orders;
begin
  select * into o from public.market_orders where id = p_order for update;
  if not found or not public._market_is_seller(o) then
    raise exception 'Not allowed';
  end if;
  if o.status <> 'awaiting_seller' then
    raise exception 'This order can no longer be accepted';
  end if;
  update public.market_orders
  set status = 'accepted', handover_by = now() + make_interval(days => public.setting_num('market_handover_days', 5)::int), updated_at = now()
  where id = o.id returning * into o;
  perform public.notify_user(o.buyer_id, 'Seller accepted your order', 'Meet the seller within ' || public.setting_num('market_handover_days', 5)::int || ' days. Give them your 6-digit code when you receive the item.', '/market-orders');
  return o;
end;
$$;

create or replace function public.market_decline(p_order uuid)
returns public.market_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.market_orders;
begin
  select * into o from public.market_orders where id = p_order for update;
  if not found or not public._market_is_seller(o) then
    raise exception 'Not allowed';
  end if;
  if o.status not in ('awaiting_seller', 'accepted') then
    raise exception 'This order can no longer be declined';
  end if;
  perform public._market_refund_buyer(o, o.amount);
  update public.market_orders set status = case when o.status = 'accepted' then 'cancelled' else 'declined' end, updated_at = now() where id = o.id returning * into o;
  return o;
end;
$$;

-- Buyer cancels: free before the seller accepts, needs the seller's agreement afterwards.
create or replace function public.market_buyer_cancel(p_order uuid, p_note text default null)
returns public.market_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.market_orders;
begin
  select * into o from public.market_orders where id = p_order for update;
  if not found or o.buyer_id <> auth.uid() then
    raise exception 'Not allowed';
  end if;
  if o.status = 'awaiting_seller' then
    perform public._market_refund_buyer(o, o.amount);
    update public.market_orders set status = 'cancelled', updated_at = now() where id = o.id returning * into o;
  elsif o.status = 'accepted' then
    update public.market_orders set cancel_requested_by = 'buyer', cancel_note = left(nullif(trim(p_note), ''), 300), updated_at = now() where id = o.id returning * into o;
    perform public._market_notify_seller(o, 'Buyer wants to cancel', 'The buyer asked to cancel "' || o.title || '". Agree to refund them, or decline and the case can go to CampusOS.');
  else
    raise exception 'This order can no longer be cancelled. Open a dispute if there is a problem.';
  end if;
  return o;
end;
$$;

create or replace function public.market_withdraw_cancel(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.market_orders set cancel_requested_by = null, cancel_note = null, updated_at = now()
  where id = p_order and buyer_id = auth.uid() and cancel_requested_by = 'buyer' and status = 'accepted';
end;
$$;

create or replace function public.market_cancel_respond(p_order uuid, p_agree boolean)
returns public.market_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.market_orders;
begin
  select * into o from public.market_orders where id = p_order for update;
  if not found or not public._market_is_seller(o) then
    raise exception 'Not allowed';
  end if;
  if o.status <> 'accepted' or o.cancel_requested_by is distinct from 'buyer' then
    raise exception 'There is no cancellation to answer';
  end if;
  if p_agree then
    perform public._market_refund_buyer(o, o.amount);
    update public.market_orders set status = 'cancelled', cancel_requested_by = null, updated_at = now() where id = o.id returning * into o;
  else
    update public.market_orders set cancel_requested_by = null, updated_at = now() where id = o.id returning * into o;
    perform public.notify_user(o.buyer_id, 'Seller declined the cancellation', 'You can still complete the order or open a dispute for CampusOS to review.', '/market-orders');
  end if;
  return o;
end;
$$;

-- Seller: enters the buyer's code and a photo as proof of handover.
create or replace function public.market_seller_confirm(p_order uuid, p_code text, p_photo text)
returns public.market_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.market_orders;
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
  update public.market_orders
  set status = 'seller_confirmed', seller_photo = p_photo,
      release_at = now() + make_interval(hours => public.setting_num('market_release_hours', 48)::int),
      cancel_requested_by = null, updated_at = now()
  where id = o.id returning * into o;
  perform public.notify_user(o.buyer_id, 'Seller marked this as handed over', 'Confirm you received "' || o.title || '" or open a dispute within ' || public.setting_num('market_release_hours', 48)::int || ' hours. After that the payment is released.', '/market-orders');
  return o;
end;
$$;

create or replace function public._market_release(o public.market_orders)
returns public.market_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.market_orders;
begin
  perform public._market_credit_seller(o, o.amount);
  update public.market_orders set status = 'completed', completed_at = now(), updated_at = now() where id = o.id returning * into r;
  if o.listing_id is not null then
    update public.marketplace_listings set status = 'sold' where id = o.listing_id and not is_commercial and status = 'active';
  end if;
  return r;
end;
$$;
revoke execute on function public._market_release(public.market_orders) from public, anon, authenticated;

-- Buyer: photo + confirm releases the money straight away.
create or replace function public.market_buyer_confirm(p_order uuid, p_photo text)
returns public.market_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.market_orders;
begin
  select * into o from public.market_orders where id = p_order for update;
  if not found or o.buyer_id <> auth.uid() then
    raise exception 'Not allowed';
  end if;
  if o.status not in ('accepted', 'seller_confirmed') then
    raise exception 'This order cannot be confirmed';
  end if;
  if p_photo is null or p_photo not like o.id::text || '/' || auth.uid()::text || '/%' then
    raise exception 'Add a photo of what you received';
  end if;
  update public.market_orders set buyer_photo = p_photo where id = o.id returning * into o;
  return public._market_release(o);
end;
$$;

create or replace function public.market_open_dispute(p_order uuid, p_reason text, p_photo text default null)
returns public.market_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.market_orders;
  by_buyer boolean;
begin
  select * into o from public.market_orders where id = p_order for update;
  if not found then
    raise exception 'Order not found';
  end if;
  by_buyer := o.buyer_id = auth.uid();
  if not (by_buyer or public._market_is_seller(o)) then
    raise exception 'Not allowed';
  end if;
  if o.status not in ('accepted', 'seller_confirmed') then
    raise exception 'A dispute can only be opened while the order is open';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Explain what went wrong (at least 10 characters)';
  end if;
  if p_photo is not null and p_photo not like o.id::text || '/' || auth.uid()::text || '/%' then
    raise exception 'Invalid photo';
  end if;
  update public.market_orders
  set status = 'disputed', dispute_reason = left(trim(p_reason), 1000), dispute_opened_by = auth.uid(), dispute_opened_at = now(),
      release_at = null, cancel_requested_by = null,
      buyer_photo = case when by_buyer and p_photo is not null then p_photo else buyer_photo end,
      seller_photo = case when not by_buyer and p_photo is not null then p_photo else seller_photo end,
      updated_at = now()
  where id = o.id returning * into o;
  if by_buyer then
    perform public._market_notify_seller(o, 'A dispute was opened', 'The buyer opened a dispute on "' || o.title || '". CampusOS will review it.');
  else
    perform public.notify_user(o.buyer_id, 'A dispute was opened', 'The seller opened a dispute on "' || o.title || '". CampusOS will review it.', '/market-orders');
  end if;
  return o;
end;
$$;

-- Staff ruling: release to the seller, refund the buyer, or split.
create or replace function public.market_staff_rule(p_order uuid, p_ruling text, p_seller_amount numeric default null, p_note text default null)
returns public.market_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.market_orders;
  seller_gross numeric;
begin
  if not public.is_staff() then
    raise exception 'Staff only';
  end if;
  select * into o from public.market_orders where id = p_order for update;
  if not found or o.status <> 'disputed' then
    raise exception 'This order is not in dispute';
  end if;
  if p_ruling = 'release' then
    seller_gross := o.amount;
  elsif p_ruling = 'refund' then
    seller_gross := 0;
  elsif p_ruling = 'split' then
    if p_seller_amount is null or p_seller_amount <= 0 or p_seller_amount >= o.amount then
      raise exception 'For a split, the seller share must be between 0 and the full amount';
    end if;
    seller_gross := round(p_seller_amount, 2);
  else
    raise exception 'Unknown ruling';
  end if;
  perform public._market_credit_seller(o, seller_gross);
  perform public._market_refund_buyer(o, o.amount - seller_gross);
  update public.market_orders
  set status = 'resolved', ruling = p_ruling, ruling_note = left(nullif(trim(p_note), ''), 500), ruled_by = auth.uid(), ruled_at = now(),
      seller_amount = seller_gross, completed_at = now(), updated_at = now()
  where id = o.id returning * into o;
  perform public.notify_user(o.buyer_id, 'Dispute decided', coalesce(left(p_note, 140), 'CampusOS reviewed the evidence and made a decision.'), '/market-orders');
  perform public._market_notify_seller(o, 'Dispute decided', coalesce(left(p_note, 140), 'CampusOS reviewed the evidence and made a decision.'));
  return o;
end;
$$;

-- Timers: seller did not answer, handover never happened, or the buyer stayed silent after the seller's proof.
create or replace function public.market_sweep()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.market_orders;
  n integer := 0;
begin
  for o in select * from public.market_orders where status = 'awaiting_seller' and accept_by < now() for update skip locked loop
    perform public._market_refund_buyer(o, o.amount);
    update public.market_orders set status = 'expired', updated_at = now() where id = o.id;
    perform public._market_notify_seller(o, 'Order expired', 'You did not accept "' || o.title || '" in time, so the buyer was refunded.');
    n := n + 1;
  end loop;

  for o in select * from public.market_orders where status = 'accepted' and handover_by is not null and handover_by < now() for update skip locked loop
    perform public._market_refund_buyer(o, o.amount);
    update public.market_orders set status = 'expired', updated_at = now() where id = o.id;
    perform public._market_notify_seller(o, 'Order expired', 'The handover for "' || o.title || '" was not completed in time, so the buyer was refunded.');
    n := n + 1;
  end loop;

  for o in select * from public.market_orders where status = 'seller_confirmed' and release_at <= now() for update skip locked loop
    perform public._market_release(o);
    n := n + 1;
  end loop;
  return n;
end;
$$;

do $$
begin
  perform cron.unschedule('campusos-market-sweep');
exception when others then
  null;
end $$;
select cron.schedule('campusos-market-sweep', '*/5 * * * *', 'select public.market_sweep();');

do $$
declare f text;
begin
  foreach f in array array[
    'market_place_order(uuid)', 'market_handover_code(uuid)', 'market_accept(uuid)', 'market_decline(uuid)',
    'market_buyer_cancel(uuid, text)', 'market_withdraw_cancel(uuid)', 'market_cancel_respond(uuid, boolean)',
    'market_seller_confirm(uuid, text, text)', 'market_buyer_confirm(uuid, text)', 'market_open_dispute(uuid, text, text)',
    'market_staff_rule(uuid, text, numeric, text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.market_sweep() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Payment requests: rent, deposits, agent and agreement fees, service fees
-- ---------------------------------------------------------------------------
create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  student_id uuid not null references auth.users(id),
  tenancy_id uuid references public.tenancies(id) on delete set null,
  kind text not null check (kind in ('rent', 'deposit', 'agent_fee', 'agreement_fee', 'service_fee', 'other')),
  title text not null,
  amount numeric(14, 2) not null check (amount > 0),
  commission numeric(14, 2) not null default 0,
  due_on date,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled', 'refunded')),
  paid_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists payment_requests_student_idx on public.payment_requests (student_id, created_at desc);
create index if not exists payment_requests_business_idx on public.payment_requests (business_id, created_at desc);

alter table public.payment_requests enable row level security;
drop policy if exists "Parties read payment requests" on public.payment_requests;
create policy "Parties read payment requests" on public.payment_requests for select to authenticated
  using (student_id = auth.uid() or public.can_operate_business(business_id) or public.is_staff());
grant select on public.payment_requests to authenticated;

create or replace function public.create_payment_request(
  p_business uuid, p_email text, p_kind text, p_title text, p_amount numeric, p_due date default null, p_tenancy uuid default null
)
returns public.payment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  biz public.business_profiles;
  student uuid;
  t public.tenancies;
  r public.payment_requests;
begin
  select * into biz from public.business_profiles where id = p_business;
  if not found or not public.can_manage_business(p_business) then
    raise exception 'Not allowed';
  end if;
  if biz.business_type not in ('housing_provider', 'campus_service') then
    raise exception 'Payment requests are for housing providers and service providers';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > public.setting_num('wallet_cap', 200000) then
    raise exception 'Enter an amount up to ₦%', public.setting_num('wallet_cap', 200000);
  end if;
  if length(trim(coalesce(p_title, ''))) < 3 then
    raise exception 'Add a short description';
  end if;
  if p_tenancy is not null then
    select * into t from public.tenancies where id = p_tenancy and business_id = p_business;
    if not found then
      raise exception 'Tenancy not found';
    end if;
    student := t.student_id;
  else
    select id into student from auth.users where lower(email) = lower(trim(p_email));
    if student is null then
      raise exception 'No CampusOS account uses that email. Ask the student to sign up first.';
    end if;
  end if;
  if student = biz.owner_user_id then
    raise exception 'You cannot request a payment from yourself';
  end if;
  insert into public.payment_requests (business_id, student_id, tenancy_id, kind, title, amount, due_on, created_by)
  values (p_business, student, p_tenancy, p_kind, left(trim(p_title), 120), round(p_amount, 2), p_due, auth.uid())
  returning * into r;
  perform public.notify_user(student, 'Payment request from ' || biz.display_name, trim(p_title) || ' · ₦' || r.amount::text || '. Pay from your wallet.', '/payments');
  return r;
end;
$$;

create or replace function public.cancel_payment_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payment_requests set status = 'cancelled'
  where id = p_request and status = 'pending' and public.can_manage_business(business_id);
  if not found then
    raise exception 'Request not found or already paid';
  end if;
end;
$$;

create or replace function public.pay_payment_request(p_request uuid)
returns public.payment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.payment_requests;
  biz public.business_profiles;
  t public.tenancies;
  pct numeric;
  comm numeric;
  receipt text;
begin
  select * into r from public.payment_requests where id = p_request for update;
  if not found or r.student_id <> auth.uid() then
    raise exception 'Request not found';
  end if;
  if r.status <> 'pending' then
    raise exception 'This request is already %', r.status;
  end if;
  select * into biz from public.business_profiles where id = r.business_id;
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
  end if;

  perform public.notify_business_team(r.business_id, 'Payment received', '₦' || r.amount::text || ' for "' || r.title || '" was paid. ₦' || (r.amount - comm)::text || ' was added to your balance.', '/billing');
  return r;
end;
$$;

-- Owner refunds a paid request (for example a returned deposit) back to the student's wallet.
create or replace function public.refund_payment_request(p_request uuid)
returns public.payment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.payment_requests;
begin
  select * into r from public.payment_requests where id = p_request for update;
  if not found then
    raise exception 'Request not found';
  end if;
  if not exists (select 1 from public.business_profiles b where b.id = r.business_id and b.owner_user_id = auth.uid()) then
    raise exception 'Only the owner can refund';
  end if;
  if r.status <> 'paid' then
    raise exception 'Only paid requests can be refunded';
  end if;
  insert into public.business_entries (business_id, kind, amount, reference, note)
  values (r.business_id, 'refund', -r.amount, 'preq_refund_' || r.id, 'Refund: ' || r.title)
  on conflict (reference) do nothing;
  if r.commission > 0 then
    insert into public.business_entries (business_id, kind, amount, reference, note)
    values (r.business_id, 'commission', r.commission, 'preq_refund_comm_' || r.id, 'Commission returned')
    on conflict (reference) do nothing;
  end if;
  perform public.wallet_apply(r.student_id, r.amount, 'refund', 'payment_request', 'payment_request', r.id, 'preq_refund_' || r.id, 'Refund: ' || r.title);
  update public.payment_requests set status = 'refunded' where id = r.id returning * into r;
  perform public.notify_user(r.student_id, 'Refunded to your wallet', '₦' || r.amount::text || ' for "' || r.title || '" is back in your wallet.', '/wallet');
  return r;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'create_payment_request(uuid, text, text, text, numeric, date, uuid)', 'cancel_payment_request(uuid)',
    'pay_payment_request(uuid)', 'refund_payment_request(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Subscriptions
-- ---------------------------------------------------------------------------
create table if not exists public.student_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'premium',
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  auto_renew boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.student_subscriptions enable row level security;
drop policy if exists "Read own subscription" on public.student_subscriptions;
create policy "Read own subscription" on public.student_subscriptions for select to authenticated using (user_id = auth.uid() or public.is_staff());
grant select on public.student_subscriptions to authenticated;

create or replace function public.student_is_premium(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.student_subscriptions s where s.user_id = p_user and s.status = 'active' and s.ends_at > now());
$$;
grant execute on function public.student_is_premium(uuid) to authenticated;
revoke execute on function public.student_is_premium(uuid) from public, anon;

create or replace function public.subscribe_premium()
returns public.student_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  price numeric := public.setting_num('student_plan_price', 1000);
  s public.student_subscriptions;
begin
  if me is null then
    raise exception 'Sign in first';
  end if;
  select * into s from public.student_subscriptions where user_id = me for update;
  if found and s.status = 'active' and s.ends_at > now() then
    update public.student_subscriptions set auto_renew = true, updated_at = now() where user_id = me returning * into s;
    return s;
  end if;
  perform public.wallet_apply(me, -price, 'subscription', 'student_premium', 'subscription', null, 'sub_' || me || '_' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'), 'CampusOS Premium (1 month)');
  insert into public.student_subscriptions (user_id, status, started_at, ends_at, auto_renew)
  values (me, 'active', now(), now() + interval '30 days', true)
  on conflict (user_id) do update
    set status = 'active', started_at = now(), ends_at = now() + interval '30 days', auto_renew = true, updated_at = now()
  returning * into s;
  return s;
end;
$$;

create or replace function public.set_premium_auto_renew(p_on boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.student_subscriptions set auto_renew = p_on, updated_at = now() where user_id = auth.uid();
$$;

grant execute on function public.subscribe_premium() to authenticated;
grant execute on function public.set_premium_auto_renew(boolean) to authenticated;
revoke execute on function public.subscribe_premium() from public, anon;
revoke execute on function public.set_premium_auto_renew(boolean) from public, anon;

-- Business plan: paid from the business balance or by card.
create or replace function public.business_plan_active(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.subscription_plans p where p.business_id = p_business and p.status = 'active' and (p.ends_at is null or p.ends_at > now()));
$$;
grant execute on function public.business_plan_active(uuid) to authenticated;
revoke execute on function public.business_plan_active(uuid) from public, anon;

create or replace function public.activate_business_plan(p_business uuid, p_reference text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  base timestamptz;
begin
  select max(ends_at) into base from public.subscription_plans where business_id = p_business and status = 'active' and ends_at > now();
  update public.subscription_plans set status = 'expired' where business_id = p_business and status = 'active';
  insert into public.subscription_plans (business_id, plan_code, status, starts_at, ends_at)
  values (p_business, 'business', 'active', now(), coalesce(base, now()) + interval '30 days');
  perform public.notify_business_team(p_business, 'CampusOS plan active', 'Your plan is active until ' || to_char(coalesce(base, now()) + interval '30 days', 'DD Mon YYYY') || '.', '/billing');
end;
$$;
revoke all on function public.activate_business_plan(uuid, text) from public, anon, authenticated;
grant execute on function public.activate_business_plan(uuid, text) to service_role;

create or replace function public.pay_business_plan_from_balance(p_business uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  price numeric := public.setting_num('business_plan_price', 3000);
  bal numeric;
  ref text := 'plan_' || p_business || '_' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
begin
  if not exists (select 1 from public.business_profiles b where b.id = p_business and b.owner_user_id = auth.uid()) then
    raise exception 'Only the owner can pay for the plan';
  end if;
  perform pg_advisory_xact_lock(hashtext('bizbal_' || p_business::text));
  bal := public._business_balance(p_business);
  if bal < price then
    raise exception 'Your balance (₦%) is below the plan price (₦%). Pay by card instead.', bal, price;
  end if;
  insert into public.business_entries (business_id, kind, amount, reference, note)
  values (p_business, 'subscription', -price, ref, 'CampusOS plan (1 month)');
  perform public.activate_business_plan(p_business, ref);
end;
$$;
grant execute on function public.pay_business_plan_from_balance(uuid) to authenticated;
revoke execute on function public.pay_business_plan_from_balance(uuid) from public, anon;

-- Daily: renew student premium from the wallet, expire what is not renewed, expire old business plans.
create or replace function public.renew_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.student_subscriptions;
  price numeric := public.setting_num('student_plan_price', 1000);
  n integer := 0;
begin
  for s in select * from public.student_subscriptions where status = 'active' and ends_at <= now() for update skip locked loop
    if s.auto_renew then
      begin
        perform public.wallet_apply(s.user_id, -price, 'subscription', 'student_premium', 'subscription', null, 'sub_' || s.user_id || '_' || to_char(s.ends_at, 'YYYYMMDDHH24MISS'), 'CampusOS Premium renewal');
        update public.student_subscriptions set ends_at = s.ends_at + interval '30 days', updated_at = now() where user_id = s.user_id;
        perform public.notify_user(s.user_id, 'Premium renewed', '₦' || price::text || ' was taken from your wallet.', '/wallet');
        n := n + 1;
        continue;
      exception when others then
        null;
      end;
    end if;
    update public.student_subscriptions set status = 'expired', updated_at = now() where user_id = s.user_id;
    perform public.notify_user(s.user_id, 'Premium ended', 'Add money to your wallet and subscribe again any time.', '/wallet');
  end loop;
  update public.subscription_plans set status = 'expired' where status = 'active' and ends_at is not null and ends_at <= now();
  return n;
end;
$$;
revoke execute on function public.renew_subscriptions() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('campusos-renew-subscriptions');
exception when others then
  null;
end $$;
select cron.schedule('campusos-renew-subscriptions', '30 5 * * *', 'select public.renew_subscriptions();');

-- Card payment of a business plan is settled by settle_payment (below).
create or replace function public.settle_payment(p_reference text, p_paid_kobo bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.payment_ledger;
begin
  select * into r from public.payment_ledger where reference = p_reference for update;
  if not found then
    return 'unknown';
  end if;
  if r.status in ('success', 'refunded') then
    return r.status;
  end if;
  if round(r.amount * 100) <> p_paid_kobo then
    update public.payment_ledger set status = 'amount_mismatch' where id = r.id;
    return 'amount_mismatch';
  end if;

  update public.payment_ledger
  set status = 'success', meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('settled_at', now())
  where id = r.id;

  if r.purpose = 'wallet_topup' then
    perform public.wallet_apply(
      r.user_id, (r.meta ->> 'credit')::numeric, 'topup', 'wallet_topup', 'payment', r.id,
      'topup_' || r.reference, 'Card top-up'
    );
    perform public.notify_user(r.user_id, 'Wallet topped up', '₦' || (r.meta ->> 'credit') || ' was added to your wallet.', '/wallet');
  elsif r.food_order_id is not null then
    update public.food_orders set payment_status = 'paid', paid_at = now()
    where id = r.food_order_id and payment_status <> 'paid';
  elsif r.purpose = 'boost' and r.meta ->> 'boost_id' is not null then
    perform public.activate_boost((r.meta ->> 'boost_id')::uuid, r.reference);
  elsif r.purpose = 'subscription' and r.meta ->> 'business_id' is not null then
    perform public.activate_business_plan((r.meta ->> 'business_id')::uuid, r.reference);
  end if;
  return 'success';
end;
$$;

-- ---------------------------------------------------------------------------
-- Students pay for food only from the wallet
-- ---------------------------------------------------------------------------
create or replace function public.place_food_order(
  p_business uuid,
  p_items jsonb,
  p_notes text default null,
  p_fulfilment text default 'pickup',
  p_address text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_promo_code text default null,
  p_payment_method text default 'wallet'
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
  if p_payment_method is distinct from 'wallet' then
    raise exception 'Orders are paid from your CampusOS wallet. Update the app and add money to your wallet.';
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

  if p_payment_method = 'wallet' and not public.setting_bool('wallet_enabled', true) then
    raise exception 'The wallet is not available right now';
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
    payment_method, payment_status, commission
  )
  values (
    p_business, biz.campus_id, me, 'placed', sub, 0, sub - disc + fee, nullif(trim(p_notes), ''),
    p_fulfilment, fee, case when p_fulfilment = 'delivery' then trim(p_address) end,
    case when p_fulfilment = 'delivery' then p_lat end, case when p_fulfilment = 'delivery' then p_lng end,
    disc, case when disc > 0 then upper(trim(p_promo_code)) end,
    p_payment_method, case when p_payment_method = 'card' then 'pending' else 'unpaid' end,
    round((sub - disc) * public.setting_num('food_commission_pct', 3) / 100, 2)
  )
  returning * into ord;

  if p_payment_method = 'wallet' then
    perform public.wallet_apply(me, -ord.total, 'spend', 'food_order', 'food_order', ord.id, 'ord_spend_' || ord.id, 'Order at ' || biz.display_name);
    update public.food_orders set payment_status = 'paid', paid_at = now() where id = ord.id returning * into ord;
  end if;

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

create or replace function public.food_order_money_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_status <> 'paid' then
    return new;
  end if;

  if new.status in ('declined', 'cancelled', 'expired') and old.status not in ('declined', 'cancelled', 'expired') then
    if new.payment_method = 'wallet' then
      perform public.wallet_apply(new.student_id, new.total, 'refund', 'food_order', 'food_order', new.id, 'ord_refund_' || new.id, 'Order ' || new.status);
      update public.food_orders set payment_status = 'refunded' where id = new.id;
      perform public.notify_user(new.student_id, 'Refunded to your wallet', '₦' || new.total::text || ' is back in your wallet.', '/wallet');
    elsif new.payment_method = 'card' then
      insert into public.refunds (order_id, business_id, student_id, amount, reason, status, decided_at)
      values (new.id, new.business_id, new.student_id, new.total, 'Order ' || new.status, 'approved', now())
      on conflict do nothing;
      update public.food_orders set payment_status = 'refund_requested' where id = new.id;
    end if;
  elsif new.status in ('collected', 'completed') and old.status not in ('collected', 'completed') and new.payment_method = 'wallet' then
    insert into public.business_entries (business_id, kind, amount, order_id, reference, note)
    values
      (new.business_id, 'sale', new.total, new.id, 'ord_sale_' || new.id, 'Order sale'),
      (new.business_id, 'commission', -new.commission, new.id, 'ord_comm_' || new.id, 'CampusOS commission')
    on conflict (reference) do nothing;
  end if;
  return new;
end;
$$;

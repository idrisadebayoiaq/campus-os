-- Wallet screens: the card shown in the app, one list of all money activity,
-- and moving marketplace earnings to the wallet.

-- ---------------------------------------------------------------------------
-- The card shown on the wallet (display details only, no card token)
-- ---------------------------------------------------------------------------
create table if not exists public.wallet_cards (
  user_id uuid primary key references auth.users (id) on delete cascade,
  brand text,
  last4 text,
  exp_month text,
  exp_year text,
  updated_at timestamptz not null default now()
);
alter table public.wallet_cards enable row level security;
revoke all on public.wallet_cards from anon, authenticated;
grant select on public.wallet_cards to authenticated;
drop policy if exists "wallet card own read" on public.wallet_cards;
create policy "wallet card own read" on public.wallet_cards for select to authenticated using (user_id = auth.uid());

create or replace function public._remember_wallet_card(p_user uuid, p_auth jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_auth is null or coalesce(p_auth ->> 'last4', '') = '' then
    return;
  end if;
  insert into public.wallet_cards as c (user_id, brand, last4, exp_month, exp_year)
  values (p_user, p_auth ->> 'brand', p_auth ->> 'last4', p_auth ->> 'exp_month', p_auth ->> 'exp_year')
  on conflict (user_id) do update
    set brand = excluded.brand, last4 = excluded.last4, exp_month = excluded.exp_month, exp_year = excluded.exp_year, updated_at = now();
end;
$$;
revoke all on function public._remember_wallet_card(uuid, jsonb) from public, anon, authenticated;

-- Card used most recently to add money; falls back to the card saved for Premium.
create or replace function public.my_wallet_card()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  c record;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select brand, last4, exp_month, exp_year into c from public.wallet_cards where user_id = me;
  if c.last4 is null then
    select brand, last4, exp_month, exp_year into c from public.plan_cards where user_id = me and business_id is null;
  end if;
  if c.last4 is null then
    return null;
  end if;
  return jsonb_build_object('brand', c.brand, 'last4', c.last4, 'exp', nullif(coalesce(c.exp_month, '') || '/' || coalesce(c.exp_year, ''), '/'));
end;
$$;
revoke all on function public.my_wallet_card() from public, anon;
grant execute on function public.my_wallet_card() to authenticated;

-- settle_payment: same as before, and a top-up also remembers the card for display.
create or replace function public.settle_payment(p_reference text, p_paid_kobo bigint, p_auth jsonb default null)
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
    perform public._remember_wallet_card(r.user_id, p_auth);
    perform public.notify_user(r.user_id, 'Wallet topped up', '₦' || (r.meta ->> 'credit') || ' was added to your wallet.', '/wallet');
  elsif r.food_order_id is not null then
    update public.food_orders set payment_status = 'paid', paid_at = now()
    where id = r.food_order_id and payment_status <> 'paid';
  elsif r.purpose = 'boost' and r.meta ->> 'boost_id' is not null then
    perform public.activate_boost((r.meta ->> 'boost_id')::uuid, r.reference);
  elsif r.purpose = 'subscription' and r.meta ->> 'business_id' is not null then
    perform public.activate_business_plan((r.meta ->> 'business_id')::uuid, r.reference);
    perform public._save_plan_card(r.user_id, (r.meta ->> 'business_id')::uuid, p_auth);
  elsif r.purpose = 'subscription' and r.meta ->> 'student' = 'true' then
    perform public.activate_student_premium(r.user_id, r.reference);
    perform public._save_plan_card(r.user_id, null, p_auth);
  end if;
  return 'success';
end;
$$;
revoke all on function public.settle_payment(text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.settle_payment(text, bigint, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Moving earnings to the wallet
-- ---------------------------------------------------------------------------
do $$
declare
  c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.user_entries'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%payout_reversal%'
  loop
    execute format('alter table public.user_entries drop constraint %I', c);
  end loop;
  for c in select conname from pg_constraint where conrelid = 'public.wallet_entries'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%escrow_hold%'
  loop
    execute format('alter table public.wallet_entries drop constraint %I', c);
  end loop;
end $$;
alter table public.user_entries add constraint user_entries_kind_check
  check (kind in ('sale', 'commission', 'refund', 'payout', 'payout_reversal', 'adjust', 'to_wallet'));
alter table public.wallet_entries add constraint wallet_entries_kind_check
  check (kind in ('topup', 'spend', 'refund', 'adjust', 'reversal', 'subscription', 'escrow_hold', 'escrow_release', 'transfer_in'));

create or replace function public.move_earnings_to_wallet(p_amount numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  bal numeric;
  amt numeric;
  cap numeric := public.setting_num('wallet_cap', 200000);
  minimum numeric := public.setting_num('earnings_to_wallet_min', 100);
  w public.wallets;
  ref text := 'etw_' || replace(gen_random_uuid()::text, '-', '');
begin
  if me is null then raise exception 'Sign in first'; end if;
  perform pg_advisory_xact_lock(hashtext('user_payout_' || me::text));
  select coalesce(sum(amount), 0) into bal from public.user_entries where user_id = me;
  amt := round(coalesce(p_amount, bal), 2);
  if amt < minimum then
    raise exception 'The smallest amount you can move is ₦%', minimum;
  end if;
  if amt > bal then
    raise exception 'You only have ₦% available', bal;
  end if;
  insert into public.wallets (user_id) values (me) on conflict (user_id) do nothing;
  select * into w from public.wallets where user_id = me for update;
  if w.status <> 'active' then
    raise exception 'Your wallet is on hold. Contact support.';
  end if;
  if w.balance + amt > cap then
    raise exception 'Your wallet can hold up to ₦%. Move a smaller amount.', cap;
  end if;
  insert into public.user_entries (user_id, kind, amount, ref_type, reference, note)
  values (me, 'to_wallet', -amt, 'wallet', ref, 'Moved to wallet');
  perform public.wallet_apply(me, amt, 'transfer_in', 'earnings', 'user_entry', null, ref || '_in', 'Earnings moved to wallet');
  return jsonb_build_object('moved', amt, 'wallet_balance', (select balance from public.wallets where user_id = me));
end;
$$;
revoke all on function public.move_earnings_to_wallet(numeric) from public, anon;
grant execute on function public.move_earnings_to_wallet(numeric) to authenticated;

-- Everything the seller card needs in one call.
create or replace function public.my_seller_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  avail numeric;
  hold numeric;
  sold integer;
  is_seller boolean;
  acc record;
  wallet_bal numeric;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select coalesce(sum(amount), 0) into avail from public.user_entries where user_id = me;
  select coalesce(sum(round(amount * (1 - commission_pct / 100), 2)), 0) into hold
    from public.market_orders
   where seller_user_id = me and seller_business_id is null
     and status in ('awaiting_seller', 'accepted', 'seller_confirmed', 'disputed');
  select count(*) into sold from public.market_orders
   where seller_user_id = me and seller_business_id is null and status in ('completed', 'resolved');
  is_seller := sold > 0 or hold > 0 or avail <> 0
    or exists (select 1 from public.marketplace_listings where seller_user_id = me and business_id is null)
    or exists (select 1 from public.user_entries where user_id = me);
  select account_name, bank_name, account_number into acc from public.user_payout_accounts where user_id = me and is_verified;
  select coalesce(balance, 0) into wallet_bal from public.wallets where user_id = me;
  return jsonb_build_object(
    'is_seller', is_seller,
    'available', avail,
    'on_hold', hold,
    'sold', sold,
    'minimum', public.setting_num('payout_min', 5000),
    'move_minimum', public.setting_num('earnings_to_wallet_min', 100),
    'withdrawal_open', exists (select 1 from public.payouts where user_id = me and status in ('requested', 'processing')),
    'bank', case when acc.account_number is null then null
                 else jsonb_build_object('name', acc.account_name, 'bank', acc.bank_name, 'last4', right(acc.account_number, 4)) end,
    'wallet_balance', coalesce(wallet_bal, 0),
    'wallet_cap', public.setting_num('wallet_cap', 200000)
  );
end;
$$;
revoke all on function public.my_seller_summary() from public, anon;
grant execute on function public.my_seller_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- One list of all money activity: wallet and marketplace earnings.
-- type: funding | purchase | refund | sale | withdrawal | other
-- The wallet side of "earnings moved to wallet" is hidden because the earnings side already shows it.
-- ---------------------------------------------------------------------------
create or replace function public.my_transactions(
  p_type text default 'all',
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  tx_id text,
  tx_at timestamptz,
  tx_type text,
  title text,
  subtitle text,
  amount numeric,
  status text,
  source text
)
language sql
stable
security definer
set search_path = public
as $$
  with ledger as (
    select
      'w_' || e.id::text as tx_id,
      e.created_at as tx_at,
      case e.kind
        when 'topup' then 'funding'
        when 'spend' then 'purchase'
        when 'escrow_hold' then 'purchase'
        when 'subscription' then 'purchase'
        when 'refund' then 'refund'
        else 'other'
      end as tx_type,
      coalesce(e.note, case e.kind when 'topup' then 'Card top-up' when 'spend' then 'Payment' when 'subscription' then 'CampusOS Premium' when 'escrow_hold' then 'Held for purchase' when 'refund' then 'Refund' else 'Adjustment' end) as title,
      case e.kind
        when 'topup' then 'Added to wallet'
        when 'spend' then 'Paid from wallet'
        when 'subscription' then 'Subscription'
        when 'escrow_hold' then 'Held until handover'
        when 'refund' then 'Back to wallet'
        else 'Wallet'
      end as subtitle,
      e.amount as amount,
      null::text as status,
      'wallet'::text as source
    from public.wallet_entries e
    where e.user_id = auth.uid() and e.kind <> 'transfer_in'
    union all
    select
      'u_' || u.id::text,
      u.created_at,
      case u.kind
        when 'sale' then 'sale'
        when 'commission' then 'sale'
        when 'refund' then 'refund'
        when 'payout' then 'withdrawal'
        when 'payout_reversal' then 'withdrawal'
        when 'to_wallet' then 'withdrawal'
        else 'other'
      end,
      coalesce(u.note, case u.kind when 'sale' then 'Sale' when 'commission' then 'CampusOS fee' when 'payout' then 'Withdrawal' else 'Earnings' end),
      case u.kind
        when 'sale' then 'Marketplace sale'
        when 'commission' then 'Marketplace fee'
        when 'refund' then 'Sale refunded'
        when 'payout' then 'To your bank'
        when 'payout_reversal' then 'Returned to earnings'
        when 'to_wallet' then 'To your wallet'
        else 'Earnings'
      end,
      u.amount,
      case when u.kind = 'payout' then case p.status when 'paid' then 'paid' when 'failed' then 'failed' else 'pending' end end,
      'earnings'
    from public.user_entries u
    left join public.payouts p on u.kind = 'payout' and p.id = u.ref_id
    where u.user_id = auth.uid()
  )
  select l.tx_id, l.tx_at, l.tx_type, l.title, l.subtitle, l.amount, l.status, l.source
  from ledger l
  where (p_type is null or p_type = 'all' or l.tx_type = p_type)
    and (p_from is null or l.tx_at >= p_from)
    and (p_to is null or l.tx_at < p_to)
  order by l.tx_at desc, l.tx_id
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function public.my_transactions(text, timestamptz, timestamptz, integer, integer) from public, anon;
grant execute on function public.my_transactions(text, timestamptz, timestamptz, integer, integer) to authenticated;

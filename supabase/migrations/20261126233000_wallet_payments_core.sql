-- Payments core: settings, student wallet, business balances, payouts, payment settlement.
-- All money moves through SECURITY DEFINER functions; clients never write balances.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Settings (editable by admins, readable by signed-in users)
-- ---------------------------------------------------------------------------

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;
drop policy if exists "Read settings" on public.platform_settings;
create policy "Read settings" on public.platform_settings for select to authenticated using (true);
drop policy if exists "Admins write settings" on public.platform_settings;
create policy "Admins write settings" on public.platform_settings for all to authenticated
  using (public.has_role('admin'::public.app_role)) with check (public.has_role('admin'::public.app_role));
grant select, insert, update on public.platform_settings to authenticated;

insert into public.platform_settings (key, value, description) values
  ('wallet_enabled', 'true', 'Turn the student wallet on or off'),
  ('food_commission_pct', '3', 'Percent of the food total (excluding delivery) kept by CampusOS'),
  ('rent_commission_pct', '5', 'Percent kept on rent, deposits and agent fees'),
  ('marketplace_commission_pct', '2', 'Percent of the sale price kept from marketplace sellers'),
  ('topup_min', '500', 'Smallest wallet top-up (naira)'),
  ('topup_max', '100000', 'Largest single wallet top-up (naira)'),
  ('wallet_cap', '200000', 'Largest balance a wallet can hold (naira)'),
  ('payout_min', '5000', 'Smallest business withdrawal (naira)'),
  ('business_plan_price', '3000', 'Business subscription per month (naira)'),
  ('student_plan_price', '1000', 'Student premium per month (naira)'),
  ('paystack_fee_percent', '1.5', 'Paystack card fee percent, used to quote top-up fees'),
  ('paystack_fee_flat', '100', 'Paystack flat card fee added from the threshold (naira)'),
  ('paystack_fee_threshold', '2500', 'Charge amount from which the flat fee applies (naira)'),
  ('paystack_fee_cap', '2000', 'Paystack maximum fee per card charge (naira)')
on conflict (key) do nothing;

create or replace function public.setting_num(p_key text, p_default numeric)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = p_key), p_default);
$$;

create or replace function public.setting_bool(p_key text, p_default boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = p_key), p_default);
$$;

grant execute on function public.setting_num(text, numeric) to authenticated, service_role;
grant execute on function public.setting_bool(text, boolean) to authenticated, service_role;
revoke execute on function public.setting_num(text, numeric) from public, anon;
revoke execute on function public.setting_bool(text, boolean) from public, anon;

-- ---------------------------------------------------------------------------
-- Student wallet
-- ---------------------------------------------------------------------------

create table if not exists public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance numeric(14, 2) not null default 0 check (balance >= 0),
  status text not null default 'active' check (status in ('active', 'frozen')),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('topup', 'spend', 'refund', 'adjust', 'reversal', 'subscription', 'escrow_hold', 'escrow_release')),
  amount numeric(14, 2) not null check (amount <> 0),
  balance_after numeric(14, 2) not null,
  purpose text,
  ref_type text,
  ref_id uuid,
  reference text unique,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists wallet_entries_user_idx on public.wallet_entries (user_id, created_at desc);

alter table public.wallets enable row level security;
alter table public.wallet_entries enable row level security;
drop policy if exists "Read own wallet" on public.wallets;
create policy "Read own wallet" on public.wallets for select to authenticated using (user_id = auth.uid() or public.is_staff());
drop policy if exists "Read own wallet entries" on public.wallet_entries;
create policy "Read own wallet entries" on public.wallet_entries for select to authenticated using (user_id = auth.uid() or public.is_staff());
grant select on public.wallets, public.wallet_entries to authenticated;

-- The only way balances change. Idempotent per reference, never negative, frozen wallets cannot spend.
create or replace function public.wallet_apply(
  p_user uuid,
  p_amount numeric,
  p_kind text,
  p_purpose text,
  p_ref_type text default null,
  p_ref_id uuid default null,
  p_reference text default null,
  p_note text default null
)
returns public.wallet_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.wallets;
  e public.wallet_entries;
  nb numeric;
begin
  insert into public.wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into w from public.wallets where user_id = p_user for update;

  if p_reference is not null then
    select * into e from public.wallet_entries where reference = p_reference;
    if found then
      return e;
    end if;
  end if;

  if p_amount < 0 and w.status <> 'active' then
    raise exception 'Your wallet is frozen. Contact support.';
  end if;
  nb := w.balance + p_amount;
  if nb < 0 then
    raise exception 'Not enough wallet balance';
  end if;

  update public.wallets set balance = nb, updated_at = now() where user_id = p_user;
  insert into public.wallet_entries (user_id, kind, amount, balance_after, purpose, ref_type, ref_id, reference, note)
  values (p_user, p_kind, p_amount, nb, p_purpose, p_ref_type, p_ref_id, p_reference, p_note)
  returning * into e;
  return e;
end;
$$;

revoke all on function public.wallet_apply(uuid, numeric, text, text, text, uuid, text, text) from public, anon, authenticated;

-- What the student is charged on the card so that Paystack's fee is covered exactly.
create or replace function public.paystack_charge_for(p_credit numeric)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  pct numeric := public.setting_num('paystack_fee_percent', 1.5) / 100;
  flat numeric := public.setting_num('paystack_fee_flat', 100);
  thr numeric := public.setting_num('paystack_fee_threshold', 2500);
  cap numeric := public.setting_num('paystack_fee_cap', 2000);
  t numeric;
  c numeric;
begin
  t := p_credit / (1 - pct);
  c := ceil(t);
  if c >= thr then
    t := (p_credit + flat) / (1 - pct);
    if t * pct + flat > cap then
      t := p_credit + cap;
    end if;
    c := ceil(t);
  end if;
  return c;
end;
$$;

revoke execute on function public.paystack_charge_for(numeric) from public, anon, authenticated;

create or replace function public.topup_quote(p_amount numeric)
returns table (credit numeric, fee numeric, total numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount';
  end if;
  t := public.paystack_charge_for(p_amount);
  return query select p_amount, t - p_amount, t;
end;
$$;

grant execute on function public.topup_quote(numeric) to authenticated;
revoke execute on function public.topup_quote(numeric) from public, anon;

-- ---------------------------------------------------------------------------
-- Business balance (earnings paid through the wallet) and payouts
-- ---------------------------------------------------------------------------

create table if not exists public.business_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  kind text not null check (kind in ('sale', 'commission', 'refund', 'card_clawback', 'payout', 'payout_reversal', 'adjust', 'escrow_release')),
  amount numeric(14, 2) not null check (amount <> 0),
  order_id uuid,
  reference text unique,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists business_entries_idx on public.business_entries (business_id, created_at desc);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  amount numeric(14, 2) not null check (amount > 0),
  status text not null default 'requested' check (status in ('requested', 'processing', 'paid', 'failed')),
  reference text not null unique,
  transfer_code text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payouts_business_idx on public.payouts (business_id, created_at desc);

alter table public.business_payment_methods add column if not exists paystack_recipient_code text;

alter table public.business_entries enable row level security;
alter table public.payouts enable row level security;
drop policy if exists "Managers read entries" on public.business_entries;
create policy "Managers read entries" on public.business_entries for select to authenticated
  using (public.can_manage_business(business_id) or public.is_staff());
drop policy if exists "Managers read payouts" on public.payouts;
create policy "Managers read payouts" on public.payouts for select to authenticated
  using (public.can_manage_business(business_id) or public.is_staff());
grant select on public.business_entries, public.payouts to authenticated;

create or replace function public._business_balance(p_business uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0) from public.business_entries where business_id = p_business;
$$;

revoke execute on function public._business_balance(uuid) from public, anon, authenticated;

create or replace function public.business_balance(p_business uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.can_manage_business(p_business) or public.is_staff()) then
    raise exception 'Not allowed';
  end if;
  return public._business_balance(p_business);
end;
$$;

grant execute on function public.business_balance(uuid) to authenticated;
revoke execute on function public.business_balance(uuid) from public, anon;

-- Starts a withdrawal of the whole balance. Called only by the payments edge function.
create or replace function public.payout_begin(p_business uuid, p_user uuid)
returns public.payouts
language plpgsql
security definer
set search_path = public
as $$
declare
  biz public.business_profiles;
  bal numeric;
  minimum numeric := public.setting_num('payout_min', 5000);
  p public.payouts;
  ref text := 'pay_' || replace(gen_random_uuid()::text, '-', '');
begin
  select * into biz from public.business_profiles where id = p_business for update;
  if not found or biz.owner_user_id is distinct from p_user then
    raise exception 'Only the owner can withdraw';
  end if;
  if not exists (
    select 1 from public.business_payment_methods m
    where m.business_id = p_business and m.is_verified
  ) then
    raise exception 'Add and verify your bank account first';
  end if;
  if exists (select 1 from public.payouts where business_id = p_business and status in ('requested', 'processing')) then
    raise exception 'A withdrawal is already on its way';
  end if;
  bal := public._business_balance(p_business);
  if bal < minimum then
    raise exception 'You can withdraw once your balance reaches ₦%', minimum;
  end if;
  insert into public.payouts (business_id, requested_by, amount, reference)
  values (p_business, p_user, bal, ref)
  returning * into p;
  insert into public.business_entries (business_id, kind, amount, reference, note)
  values (p_business, 'payout', -bal, 'payout_' || p.id, 'Withdrawal');
  return p;
end;
$$;

-- Records how a withdrawal ended. Idempotent: a failed payout gives the money back once.
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
    perform public.notify_business_team(p.business_id, 'Withdrawal sent', '₦' || p.amount::text || ' is on its way to your bank.', '/billing');
    return 'paid';
  else
    update public.payouts set status = 'failed', failure_reason = left(coalesce(p_reason, 'Transfer failed'), 300), updated_at = now() where id = p.id;
    insert into public.business_entries (business_id, kind, amount, reference, note)
    values (p.business_id, 'payout_reversal', p.amount, 'payout_rev_' || p.id, 'Withdrawal failed, money returned')
    on conflict (reference) do nothing;
    perform public.notify_business_team(p.business_id, 'Withdrawal failed', coalesce(left(p_reason, 140), 'The transfer did not go through.') || ' Your balance was restored.', '/billing');
    return 'failed';
  end if;
end;
$$;

revoke all on function public.payout_begin(uuid, uuid) from public, anon, authenticated;
revoke all on function public.payout_finish(text, text, text, text) from public, anon, authenticated;
grant execute on function public.payout_begin(uuid, uuid) to service_role;
grant execute on function public.payout_finish(text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Settling a Paystack payment (called by verify, webhook and the sweeper)
-- ---------------------------------------------------------------------------

alter table public.payment_ledger drop constraint if exists payment_ledger_purpose_check;
alter table public.payment_ledger add constraint payment_ledger_purpose_check
  check (purpose in ('order', 'boost', 'subscription', 'refund', 'wallet_topup', 'payment_request', 'marketplace'));

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
  end if;
  return 'success';
end;
$$;

create or replace function public.fail_payment(p_reference text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.payment_ledger set status = 'failed' where reference = p_reference and status = 'pending';
$$;

revoke all on function public.settle_payment(text, bigint) from public, anon, authenticated;
revoke all on function public.fail_payment(text) from public, anon, authenticated;
grant execute on function public.settle_payment(text, bigint) to service_role;
grant execute on function public.fail_payment(text) to service_role;

-- ---------------------------------------------------------------------------
-- Sweeper: asks Paystack about unsettled payments so no webhook is required
-- ---------------------------------------------------------------------------

create table if not exists public.internal_secrets (
  key text primary key,
  value text not null
);
alter table public.internal_secrets enable row level security;
revoke all on public.internal_secrets from public, anon, authenticated;

insert into public.internal_secrets (key, value)
values ('sweep_token', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

do $$
begin
  perform cron.unschedule('campusos-paystack-sweep');
exception when others then
  null;
end $$;

select cron.schedule(
  'campusos-paystack-sweep',
  '*/2 * * * *',
  $cron$
  select net.http_post(
    url := 'https://dwdqeapwesrjsvenbwvk.supabase.co/functions/v1/paystack-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sweep-token', (select value from public.internal_secrets where key = 'sweep_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $cron$
);

grant select on public.internal_secrets to service_role;

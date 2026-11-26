-- Premium plans: card checkout with a saved card for renewals, the Premium badge,
-- and what the plans actually unlock.

insert into public.platform_settings (key, value, description) values
  ('marketplace_commission_premium_pct', '1', 'Percent kept from marketplace sales by Premium student sellers'),
  ('plan_grace_days', '3', 'Days a business keeps plan features after a renewal fails'),
  ('tutor_premium_multiplier', '3', 'How many times more AI tutor questions Premium students get')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Saved cards (for automatic renewal). The card token never leaves the server.
-- ---------------------------------------------------------------------------
create table if not exists public.plan_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid references public.business_profiles (id) on delete cascade,
  authorization_code text not null,
  customer_email text not null,
  brand text,
  last4 text,
  exp_month text,
  exp_year text,
  auto_renew boolean not null default true,
  updated_at timestamptz not null default now()
);
create unique index if not exists plan_cards_scope_idx
  on public.plan_cards (user_id, coalesce(business_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.plan_cards enable row level security;
revoke all on public.plan_cards from anon, authenticated;
-- Only the harmless columns are readable by the owner.
grant select (id, user_id, business_id, brand, last4, exp_month, exp_year, auto_renew, updated_at) on public.plan_cards to authenticated;
drop policy if exists "plan cards own read" on public.plan_cards;
create policy "plan cards own read" on public.plan_cards for select to authenticated using (user_id = auth.uid());

alter table public.student_subscriptions add column if not exists pay_method text not null default 'wallet' check (pay_method in ('wallet', 'card'));

-- ---------------------------------------------------------------------------
-- Who is Premium (for badges and ranking). Works for students and businesses.
-- ---------------------------------------------------------------------------
create or replace function public.premium_ids(p_ids uuid[])
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct x), '{}'::uuid[]) from (
    select s.user_id as x from public.student_subscriptions s
     where s.user_id = any (p_ids) and s.status = 'active' and s.ends_at > now()
    union
    select p.business_id from public.subscription_plans p
     where p.business_id = any (p_ids) and p.status = 'active' and (p.ends_at is null or p.ends_at > now())
  ) t;
$$;

-- All premium businesses (small set), used to rank and badge lists.
create or replace function public.premium_business_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct p.business_id), '{}'::uuid[]) from public.subscription_plans p
   where p.status = 'active' and (p.ends_at is null or p.ends_at > now());
$$;

revoke all on function public.premium_ids(uuid[]) from public, anon;
revoke all on function public.premium_business_ids() from public, anon;
grant execute on function public.premium_ids(uuid[]) to authenticated, service_role;
grant execute on function public.premium_business_ids() to authenticated, service_role;

-- A business keeps plan features for a few days after a failed renewal.
create or replace function public.business_plan_grace_ok(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscription_plans p
     where p.business_id = p_business
       and p.status in ('active', 'expired')
       and p.ends_at is not null
       and p.ends_at > now() - make_interval(days => public.setting_num('plan_grace_days', 3)::int)
  );
$$;
revoke all on function public.business_plan_grace_ok(uuid) from public, anon;
grant execute on function public.business_plan_grace_ok(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- State for the plan screens
-- ---------------------------------------------------------------------------
create or replace function public.my_premium_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  s public.student_subscriptions;
  c record;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select * into s from public.student_subscriptions where user_id = me;
  select brand, last4, exp_month, exp_year into c from public.plan_cards where user_id = me and business_id is null;
  return jsonb_build_object(
    'active', coalesce(s.status = 'active' and s.ends_at > now(), false),
    'ends_at', s.ends_at,
    'auto_renew', coalesce(s.auto_renew, true),
    'pay_method', s.pay_method,
    'card', case when c.last4 is null then null else jsonb_build_object('brand', c.brand, 'last4', c.last4, 'exp', c.exp_month || '/' || c.exp_year) end,
    'price', public.setting_num('student_plan_price', 1000)
  );
end;
$$;

create or replace function public.business_plan_state(p_business uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.subscription_plans;
  c record;
begin
  if not (public.can_manage_business(p_business) or public.is_staff()) then raise exception 'Not allowed'; end if;
  select * into p from public.subscription_plans
   where business_id = p_business and status = 'active' and (ends_at is null or ends_at > now())
   order by ends_at desc nulls first limit 1;
  select brand, last4, exp_month, exp_year, auto_renew into c from public.plan_cards where business_id = p_business;
  return jsonb_build_object(
    'active', p.id is not null,
    'ends_at', p.ends_at,
    'in_grace', p.id is null and public.business_plan_grace_ok(p_business),
    'auto_renew', coalesce(c.auto_renew, false),
    'card', case when c.last4 is null then null else jsonb_build_object('brand', c.brand, 'last4', c.last4, 'exp', c.exp_month || '/' || c.exp_year) end,
    'price', public.setting_num('business_plan_price', 3000)
  );
end;
$$;

create or replace function public.set_plan_auto_renew(p_business uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.business_profiles b where b.id = p_business and b.owner_user_id = auth.uid()) then
    raise exception 'Only the owner can change renewal';
  end if;
  update public.plan_cards set auto_renew = p_on, updated_at = now() where business_id = p_business;
end;
$$;

-- Students: one switch for card and wallet.
create or replace function public.set_premium_auto_renew(p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.student_subscriptions set auto_renew = p_on, updated_at = now() where user_id = auth.uid();
  update public.plan_cards set auto_renew = p_on, updated_at = now() where user_id = auth.uid() and business_id is null;
end;
$$;

revoke all on function public.my_premium_state() from public, anon;
revoke all on function public.business_plan_state(uuid) from public, anon;
revoke all on function public.set_plan_auto_renew(uuid, boolean) from public, anon;
revoke all on function public.set_premium_auto_renew(boolean) from public, anon;
grant execute on function public.my_premium_state() to authenticated;
grant execute on function public.business_plan_state(uuid) to authenticated;
grant execute on function public.set_plan_auto_renew(uuid, boolean) to authenticated;
grant execute on function public.set_premium_auto_renew(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Activation (service role). Card plans also save the card for renewals.
-- ---------------------------------------------------------------------------
create or replace function public._save_plan_card(p_user uuid, p_business uuid, p_auth jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  code text := p_auth ->> 'authorization_code';
begin
  if p_auth is null or code is null or coalesce((p_auth ->> 'reusable')::boolean, false) is not true then
    return;
  end if;
  update public.plan_cards
     set authorization_code = code, customer_email = coalesce(p_auth ->> 'email', customer_email),
         brand = p_auth ->> 'brand', last4 = p_auth ->> 'last4', exp_month = p_auth ->> 'exp_month', exp_year = p_auth ->> 'exp_year',
         updated_at = now()
   where user_id = p_user and business_id is not distinct from p_business;
  if not found then
    insert into public.plan_cards (user_id, business_id, authorization_code, customer_email, brand, last4, exp_month, exp_year)
    values (p_user, p_business, code, coalesce(p_auth ->> 'email', ''), p_auth ->> 'brand', p_auth ->> 'last4', p_auth ->> 'exp_month', p_auth ->> 'exp_year');
  end if;
end;
$$;

create or replace function public.activate_student_premium(p_user uuid, p_reference text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.student_subscriptions;
begin
  insert into public.student_subscriptions as t (user_id, status, started_at, ends_at, auto_renew, pay_method)
  values (p_user, 'active', now(), now() + interval '30 days', true, 'card')
  on conflict (user_id) do update
    set status = 'active',
        started_at = case when t.status = 'active' and t.ends_at > now() then t.started_at else now() end,
        ends_at = greatest(t.ends_at, now()) + interval '30 days',
        pay_method = 'card',
        updated_at = now()
  returning * into s;
  perform public.notify_user(p_user, 'Premium is active', 'Thank you! Premium is active until ' || to_char(s.ends_at, 'DD Mon YYYY') || '.', '/premium');
end;
$$;

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
  perform public.notify_business_team(p_business, 'CampusOS plan is active', 'Your plan is active until ' || to_char(coalesce(base, now()) + interval '30 days', 'DD Mon YYYY') || '.', '/plan');
end;
$$;

revoke all on function public._save_plan_card(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.activate_student_premium(uuid, text) from public, anon, authenticated;
revoke all on function public.activate_business_plan(uuid, text) from public, anon, authenticated;
grant execute on function public.activate_student_premium(uuid, text) to service_role;
grant execute on function public.activate_business_plan(uuid, text) to service_role;

-- settle_payment now also receives the card details Paystack returned.
drop function if exists public.settle_payment(text, bigint);
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

-- Paying for Premium from the wallet remembers how it was paid.
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
  insert into public.student_subscriptions (user_id, status, started_at, ends_at, auto_renew, pay_method)
  values (me, 'active', now(), now() + interval '30 days', true, 'wallet')
  on conflict (user_id) do update
    set status = 'active', started_at = now(), ends_at = now() + interval '30 days', auto_renew = true, pay_method = 'wallet', updated_at = now()
  returning * into s;
  return s;
end;
$$;

-- ---------------------------------------------------------------------------
-- Renewals. Card renewals are charged by the paystack-sweep function; this keeps
-- wallet renewals and expires card plans that could not be renewed.
-- ---------------------------------------------------------------------------
create or replace function public.plans_due_for_renewal()
returns table (kind text, user_id uuid, business_id uuid, amount numeric, authorization_code text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select 'student'::text, s.user_id, null::uuid, public.setting_num('student_plan_price', 1000), c.authorization_code, c.customer_email
    from public.student_subscriptions s
    join public.plan_cards c on c.user_id = s.user_id and c.business_id is null
   where s.status = 'active' and s.pay_method = 'card' and s.auto_renew and c.auto_renew
     and s.ends_at <= now() + interval '2 hours' and s.ends_at > now() - interval '3 days'
     and not exists (
       select 1 from public.payment_ledger l
        where l.user_id = s.user_id and l.purpose = 'subscription' and l.meta ->> 'student' = 'true'
          and l.meta ->> 'renewal' = 'true' and l.created_at > now() - interval '12 hours')
  union all
  select 'business'::text, c.user_id, c.business_id, public.setting_num('business_plan_price', 3000), c.authorization_code, c.customer_email
    from public.plan_cards c
    join lateral (select max(p.ends_at) as ends from public.subscription_plans p where p.business_id = c.business_id) lp on true
   where c.business_id is not null and c.auto_renew and lp.ends is not null
     and lp.ends <= now() + interval '2 hours' and lp.ends > now() - interval '3 days'
     and not exists (
       select 1 from public.payment_ledger l
        where l.business_id = c.business_id and l.purpose = 'subscription'
          and l.meta ->> 'renewal' = 'true' and l.created_at > now() - interval '12 hours');
$$;
revoke all on function public.plans_due_for_renewal() from public, anon, authenticated;
grant execute on function public.plans_due_for_renewal() to service_role;

create or replace function public.plan_renewal_failed(p_user uuid, p_business uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_business is not null then
    perform public.notify_business_team(p_business, 'Plan renewal failed', 'We could not charge your card. Pay again to keep your plan features.', '/plan');
  else
    perform public.notify_user(p_user, 'Premium renewal failed', 'We could not charge your card. Pay again to keep Premium.', '/premium');
  end if;
end;
$$;
revoke all on function public.plan_renewal_failed(uuid, uuid) from public, anon, authenticated;
grant execute on function public.plan_renewal_failed(uuid, uuid) to service_role;

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
  for s in
    select * from public.student_subscriptions
     where status = 'active'
       and ((pay_method = 'wallet' and ends_at <= now()) or (pay_method = 'card' and ends_at <= now() - interval '3 days'))
     for update skip locked
  loop
    if s.auto_renew and s.pay_method = 'wallet' then
      begin
        perform public.wallet_apply(s.user_id, -price, 'subscription', 'student_premium', 'subscription', null, 'sub_' || s.user_id || '_' || to_char(s.ends_at, 'YYYYMMDDHH24MISS'), 'CampusOS Premium renewal');
        update public.student_subscriptions set ends_at = s.ends_at + interval '30 days', updated_at = now() where user_id = s.user_id;
        perform public.notify_user(s.user_id, 'Premium renewed', '₦' || price::text || ' was taken from your wallet.', '/premium');
        n := n + 1;
        continue;
      exception when others then
        null;
      end;
    end if;
    update public.student_subscriptions set status = 'expired', updated_at = now() where user_id = s.user_id;
    perform public.notify_user(s.user_id, 'Premium ended', 'Subscribe again any time to get Premium back.', '/premium');
  end loop;
  update public.subscription_plans set status = 'expired' where status = 'active' and ends_at is not null and ends_at <= now() - interval '3 days';
  return n;
end;
$$;
revoke execute on function public.renew_subscriptions() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- What the plans unlock
-- ---------------------------------------------------------------------------

-- 1. Businesses need the plan to send payment requests (existing requests stay payable).
create or replace function public._require_plan_for_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.business_plan_grace_ok(new.business_id) and not public.is_staff() then
    raise exception 'Subscribe to the CampusOS plan to send payment requests.';
  end if;
  return new;
end;
$$;
drop trigger if exists require_plan_for_requests on public.payment_requests;
create trigger require_plan_for_requests before insert on public.payment_requests
  for each row execute function public._require_plan_for_requests();

-- 2. Team members are part of the plan (sign-up invite acceptance has no signed-in user and is not blocked).
create or replace function public._require_plan_for_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.business_plan_grace_ok(new.business_id) and not public.is_staff() then
    raise exception 'Team members are part of the CampusOS plan. Subscribe to add your team.';
  end if;
  return new;
end;
$$;
drop trigger if exists require_plan_for_team on public.business_members;
create trigger require_plan_for_team before insert on public.business_members
  for each row execute function public._require_plan_for_team();
drop trigger if exists require_plan_for_team on public.business_member_invites;
create trigger require_plan_for_team before insert on public.business_member_invites
  for each row execute function public._require_plan_for_team();

-- 3. Premium students sell with a lower marketplace commission.
create or replace function public._premium_market_commission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lower_pct numeric := public.setting_num('marketplace_commission_premium_pct', 1);
begin
  if new.seller_user_id is not null and new.seller_business_id is null and lower_pct < new.commission_pct
     and public.student_is_premium(new.seller_user_id) then
    new.commission_pct := lower_pct;
  end if;
  return new;
end;
$$;
drop trigger if exists premium_market_commission on public.market_orders;
create trigger premium_market_commission before insert on public.market_orders
  for each row execute function public._premium_market_commission();

-- 4. Premium students and plan businesses get priority support.
create or replace function public._premium_support_priority()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.priority = 'normal' and (
       public.student_is_premium(new.requester_id)
       or exists (
         select 1 from public.business_profiles b
          where b.owner_user_id = new.requester_id and public.business_plan_active(b.id))
     ) then
    new.priority := 'high';
  end if;
  return new;
end;
$$;
drop trigger if exists premium_support_priority on public.support_tickets;
create trigger premium_support_priority before insert on public.support_tickets
  for each row execute function public._premium_support_priority();

revoke all on function public._require_plan_for_requests() from public, anon, authenticated;
revoke all on function public._require_plan_for_team() from public, anon, authenticated;
revoke all on function public._premium_market_commission() from public, anon, authenticated;
revoke all on function public._premium_support_priority() from public, anon, authenticated;

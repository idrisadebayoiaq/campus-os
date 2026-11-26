-- Study lock (focus mode) and account management.

-- ---------------------------------------------------------------------------
-- 1. Study lock: the student picks a time, starts it, and CampusOS stays locked
--    until the server-side end time. The server is the clock.
-- ---------------------------------------------------------------------------
create table if not exists public.study_locks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text,
  minutes integer not null check (minutes between 15 and 480),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  logged boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists study_locks_user_idx on public.study_locks (user_id, ends_at desc);

alter table public.study_locks enable row level security;
revoke all on public.study_locks from anon, authenticated;
grant select on public.study_locks to authenticated;
drop policy if exists "study locks own read" on public.study_locks;
create policy "study locks own read" on public.study_locks for select to authenticated using (user_id = auth.uid());

create or replace function public.start_study_lock(p_minutes integer, p_label text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.study_locks;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  if p_minutes is null or p_minutes < 15 or p_minutes > 480 then
    raise exception 'Choose between 15 minutes and 8 hours.';
  end if;
  perform pg_advisory_xact_lock(hashtext('study_lock_' || v_uid::text));
  if exists (select 1 from public.study_locks where user_id = v_uid and ends_at > now()) then
    raise exception 'You already have a study lock running.';
  end if;
  insert into public.study_locks (user_id, label, minutes, ends_at)
  values (v_uid, nullif(left(btrim(coalesce(p_label, '')), 60), ''), p_minutes, now() + make_interval(mins => p_minutes))
  returning * into v_row;
  return jsonb_build_object(
    'id', v_row.id, 'label', v_row.label, 'minutes', v_row.minutes,
    'started_at', v_row.started_at, 'ends_at', v_row.ends_at, 'server_now', now()
  );
end;
$$;

-- State for the app: the running lock (if any) and, once, the summary of a lock
-- that just finished (which also logs the minutes in the study log).
create or replace function public.my_study_lock()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_active public.study_locks;
  v_done public.study_locks;
  v_notes integer := 0;
  v_msgs integer := 0;
  v_finished jsonb := null;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;

  select * into v_active from public.study_locks where user_id = v_uid and ends_at > now() order by ends_at desc limit 1;

  if v_active.id is null then
    select * into v_done from public.study_locks where user_id = v_uid and ends_at <= now() and not logged order by ends_at desc limit 1;
    if v_done.id is not null then
      update public.study_locks set logged = true where user_id = v_uid and ends_at <= now() and not logged;
      insert into public.study_sessions (user_id, minutes, kind, note)
      values (v_uid, v_done.minutes, 'focus', 'Study lock' || coalesce(': ' || v_done.label, ''));
      select count(*) into v_notes from public.notifications where user_id = v_uid and created_at >= v_done.started_at;
      select count(*) into v_msgs
        from public.messages m
        join public.conversation_participants cp on cp.conversation_id = m.conversation_id and cp.user_id = v_uid
       where m.created_at >= v_done.started_at and m.sender_id <> v_uid and m.deleted_at is null;
      v_finished := jsonb_build_object('label', v_done.label, 'minutes', v_done.minutes, 'notifications', v_notes, 'messages', v_msgs);
    end if;
  end if;

  return jsonb_build_object(
    'server_now', now(),
    'active', case when v_active.id is null then null else jsonb_build_object(
      'id', v_active.id, 'label', v_active.label, 'minutes', v_active.minutes,
      'started_at', v_active.started_at, 'ends_at', v_active.ends_at) end,
    'finished', v_finished
  );
end;
$$;

revoke all on function public.start_study_lock(integer, text) from public, anon;
revoke all on function public.my_study_lock() from public, anon;
grant execute on function public.start_study_lock(integer, text) to authenticated;
grant execute on function public.my_study_lock() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Account closing. Deactivates the sign-in and removes personal details but
--    keeps anonymised money records. Blocked while money or orders are open.
-- ---------------------------------------------------------------------------
create or replace function public._account_blockers(p_user uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v text[] := '{}';
  v_bal numeric;
  v_biz record;
begin
  if exists (select 1 from public.user_roles where user_id = p_user and role in ('admin', 'moderator', 'support')) then
    return array['Staff accounts are managed by an admin.'];
  end if;

  select coalesce(balance, 0) into v_bal from public.wallets where user_id = p_user;
  if coalesce(v_bal, 0) > 0 then
    v := array_append(v, 'Your wallet still has money. Spend it, or contact support to arrange a refund.'::text);
  end if;

  select coalesce(sum(amount), 0) into v_bal from public.user_entries where user_id = p_user;
  if v_bal > 0 then
    v := array_append(v, 'You have earnings waiting. Withdraw them first.'::text);
  end if;

  if exists (select 1 from public.payouts where user_id = p_user and status in ('requested', 'processing')) then
    v := array_append(v, 'A withdrawal is still being processed.'::text);
  end if;

  if exists (select 1 from public.food_orders where student_id = p_user and status in ('placed', 'accepted', 'preparing', 'ready')) then
    v := array_append(v, 'You have a food order in progress.'::text);
  end if;

  if exists (
    select 1 from public.market_orders
     where (buyer_id = p_user or seller_user_id = p_user)
       and status in ('awaiting_seller', 'accepted', 'seller_confirmed', 'disputed')
  ) then
    v := array_append(v, 'You have a marketplace order in progress.'::text);
  end if;

  for v_biz in select id, display_name from public.business_profiles where owner_user_id = p_user loop
    if public._business_balance(v_biz.id) > 0 then
      v := array_append(v, v_biz.display_name || ' still has a balance. Withdraw it first.');
    end if;
    if exists (select 1 from public.food_orders where business_id = v_biz.id and status in ('placed', 'accepted', 'preparing', 'ready'))
       or exists (select 1 from public.market_orders where seller_business_id = v_biz.id and status in ('awaiting_seller', 'accepted', 'seller_confirmed', 'disputed')) then
      v := array_append(v, v_biz.display_name || ' has orders in progress.');
    end if;
  end loop;

  return v;
end;
$$;

create or replace function public.my_account_blockers()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case when auth.uid() is null then array['Sign in first'] else public._account_blockers(auth.uid()) end;
$$;

create or replace function public.delete_my_account(p_confirm text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_blockers text[];
  t text;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  if p_confirm is distinct from 'DELETE' then raise exception 'Type DELETE to confirm.'; end if;
  v_blockers := public._account_blockers(v_uid);
  if array_length(v_blockers, 1) > 0 then raise exception '%', v_blockers[1]; end if;

  -- personal details
  update public.profiles
     set full_name = 'Deleted user', first_name = null, last_name = null, preferred_name = null,
         phone = null, avatar_url = null, date_of_birth = null,
         location_label = null, location_lat = null, location_lng = null, updated_at = now()
   where id = v_uid;

  foreach t in array array['student_profiles', 'device_push_tokens', 'user_call_settings', 'notifications', 'study_sessions', 'study_locks', 'user_payout_accounts', 'business_members'] loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I where user_id = $1', t) using v_uid;
    end if;
  end loop;

  -- businesses and listings they own go offline
  update public.business_profiles
     set is_active = false, accepting_orders = false, phone = null, email = null, whatsapp = null, updated_at = now()
   where owner_user_id = v_uid;
  update public.marketplace_listings set status = 'removed', updated_at = now() where seller_user_id = v_uid and status = 'active';

  -- sign-in: ban, free the email, drop sessions
  update auth.users
     set email = 'deleted+' || v_uid::text || '@deleted.campusos.invalid',
         phone = null,
         raw_user_meta_data = '{}'::jsonb,
         encrypted_password = '',
         banned_until = 'infinity',
         updated_at = now()
   where id = v_uid;
  delete from auth.identities where user_id = v_uid;
  delete from auth.sessions where user_id = v_uid;
end;
$$;

revoke all on function public._account_blockers(uuid) from public, anon, authenticated;
revoke all on function public.my_account_blockers() from public, anon;
revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.my_account_blockers() to authenticated;
grant execute on function public.delete_my_account(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Push notifications are held back while a study lock is running.
--    Used by the push-notify and call-signal edge functions (service role only).
-- ---------------------------------------------------------------------------
create or replace function public.push_tokens_for(p_users uuid[])
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(t.token), '{}'::text[])
    from public.device_push_tokens t
   where t.user_id = any (p_users)
     and not exists (select 1 from public.study_locks l where l.user_id = t.user_id and l.ends_at > now());
$$;

revoke all on function public.push_tokens_for(uuid[]) from public, anon, authenticated;
grant execute on function public.push_tokens_for(uuid[]) to service_role;

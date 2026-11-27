-- Payment password (6-digit PIN) for the wallet screen and money movements.
-- The PIN is stored only as a salted bcrypt hash and checked on the server,
-- with a lockout after repeated wrong tries. Fingerprint is a per-device choice kept in the app.

create table if not exists public.payment_security (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payment_security enable row level security;
revoke all on public.payment_security from anon, authenticated;

-- One checked attempt: wrong tries are counted and 5 in a row lock the PIN for 15 minutes.
create or replace function public._pin_attempt(p_uid uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r public.payment_security;
  n integer;
begin
  select * into r from public.payment_security where user_id = p_uid for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_pin');
  end if;
  if r.locked_until is not null and r.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', r.locked_until);
  end if;
  if r.pin_hash = crypt(coalesce(p_pin, ''), r.pin_hash) then
    update public.payment_security set failed_attempts = 0, locked_until = null where user_id = p_uid;
    return jsonb_build_object('ok', true);
  end if;
  n := r.failed_attempts + 1;
  if n >= 5 then
    update public.payment_security
       set failed_attempts = 0, locked_until = now() + interval '15 minutes'
     where user_id = p_uid;
    return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', now() + interval '15 minutes');
  end if;
  update public.payment_security set failed_attempts = n where user_id = p_uid;
  return jsonb_build_object('ok', false, 'reason', 'wrong', 'remaining', 5 - n);
end;
$$;
revoke all on function public._pin_attempt(uuid, text) from public, anon, authenticated;

create or replace function public.payment_pin_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.payment_security;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into r from public.payment_security where user_id = auth.uid();
  return jsonb_build_object(
    'has_pin', found,
    'locked_until', case when found and r.locked_until > now() then r.locked_until else null end
  );
end;
$$;

create or replace function public.verify_payment_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  return public._pin_attempt(auth.uid(), p_pin);
end;
$$;

create or replace function public._pin_is_acceptable(p_pin text)
returns boolean
language sql
immutable
as $$
  select p_pin ~ '^[0-9]{6}$'
     and p_pin !~ '^(.)\1{5}$'
     and p_pin not in ('123456', '654321', '012345', '123123', '121212');
$$;

create or replace function public.set_payment_pin(p_pin text, p_current text default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := auth.uid();
  had boolean;
  res jsonb;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  if not public._pin_is_acceptable(p_pin) then
    raise exception 'Use 6 digits that are not all the same or an easy run like 123456';
  end if;
  select exists (select 1 from public.payment_security where user_id = uid) into had;
  if had then
    res := public._pin_attempt(uid, p_current);
    if coalesce((res ->> 'ok')::boolean, false) is not true then
      if res ->> 'reason' = 'locked' then
        raise exception 'Too many wrong tries. Try again in 15 minutes.';
      end if;
      raise exception 'Your current payment password is not right';
    end if;
    update public.payment_security
       set pin_hash = crypt(p_pin, gen_salt('bf')), failed_attempts = 0, locked_until = null, updated_at = now()
     where user_id = uid;
  else
    insert into public.payment_security (user_id, pin_hash) values (uid, crypt(p_pin, gen_salt('bf')));
  end if;
  perform public.notify_user(
    uid,
    case when had then 'Payment password changed' else 'Payment password set' end,
    case when had then 'If this was not you, change it now and contact support.' else 'You will now use it to open your wallet and confirm payments.' end,
    '/payment-security'
  );
end;
$$;

-- Forgot the payment password: allowed only right after the account password was just entered.
create or replace function public.reset_payment_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := auth.uid();
  fresh boolean;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  if not public._pin_is_acceptable(p_pin) then
    raise exception 'Use 6 digits that are not all the same or an easy run like 123456';
  end if;
  select exists (
    select 1
      from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
     where a ->> 'method' in ('password', 'otp', 'magiclink')
       and (a ->> 'timestamp')::bigint > extract(epoch from now())::bigint - 300
  ) into fresh;
  if not fresh then
    raise exception 'Confirm your account password first, then try again';
  end if;
  insert into public.payment_security (user_id, pin_hash)
  values (uid, crypt(p_pin, gen_salt('bf')))
  on conflict (user_id) do update
     set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
  perform public.notify_user(uid, 'Payment password reset', 'If this was not you, change it now and contact support.', '/payment-security');
end;
$$;

grant execute on function public.payment_pin_status() to authenticated;
grant execute on function public.verify_payment_pin(text) to authenticated;
grant execute on function public.set_payment_pin(text, text) to authenticated;
grant execute on function public.reset_payment_pin(text) to authenticated;
revoke execute on function public.payment_pin_status() from anon, public;
revoke execute on function public.verify_payment_pin(text) from anon, public;
revoke execute on function public.set_payment_pin(text, text) from anon, public;
revoke execute on function public.reset_payment_pin(text) from anon, public;

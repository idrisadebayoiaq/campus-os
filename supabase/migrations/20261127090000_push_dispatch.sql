-- Phone push for in-app notifications and new chat messages.
-- The app saves its FCM token with register_push_token(); inserts on notifications
-- and messages call the push-dispatch edge function through pg_net.

create or replace function public.register_push_token(p_token text, p_platform text default 'android', p_device text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or coalesce(trim(p_token), '') = '' then
    return;
  end if;
  -- A phone belongs to whoever signed in last.
  delete from public.device_push_tokens where token = p_token and user_id <> auth.uid();
  insert into public.device_push_tokens (user_id, token, platform, device_name, last_seen_at)
  values (auth.uid(), p_token, coalesce(p_platform, 'android'), p_device, now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        device_name = coalesce(excluded.device_name, device_push_tokens.device_name),
        last_seen_at = now();
end;
$$;

create or replace function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.device_push_tokens where token = p_token and user_id = auth.uid();
$$;

grant execute on function public.register_push_token(text, text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

insert into public.internal_secrets (key, value)
values ('push_token', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

create or replace function public.dispatch_push(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://dwdqeapwesrjsvenbwvk.supabase.co/functions/v1/push-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-token', (select value from public.internal_secrets where key = 'push_token')
    ),
    body := jsonb_build_object('kind', p_kind, 'id', p_id),
    timeout_milliseconds := 10000
  );
exception when others then
  -- Push is best effort; never block the insert.
  null;
end;
$$;

revoke all on function public.dispatch_push(text, uuid) from public, anon, authenticated;

create or replace function public.notifications_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.device_push_tokens where user_id = new.user_id) then
    perform public.dispatch_push('notification', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push
  after insert on public.notifications
  for each row execute function public.notifications_push();

create or replace function public.messages_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
begin
  if new.sender_id is null or new.message_type = 'system' then
    return new;
  end if;
  select kind into v_kind from public.conversations where id = new.conversation_id;
  -- Support replies already create a notification row (and so a push).
  if v_kind is null or v_kind in ('ai', 'support') then
    return new;
  end if;
  if exists (
    select 1
      from public.conversation_participants p
      join public.device_push_tokens t on t.user_id = p.user_id
     where p.conversation_id = new.conversation_id
       and p.user_id <> new.sender_id
       and not coalesce(p.muted, false)
  ) then
    perform public.dispatch_push('message', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists messages_push on public.messages;
create trigger messages_push
  after insert on public.messages
  for each row execute function public.messages_push();

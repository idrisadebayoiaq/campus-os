-- Push respects the student's switches: "Push notifications" off stops every push,
-- and the order switches stop order pushes (the in-app notification is still saved).

create or replace function public.push_tokens_for(p_users uuid[])
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(t.token), '{}'::text[])
    from public.device_push_tokens t
   where t.user_id = any (p_users)
     and not exists (select 1 from public.study_locks l where l.user_id = t.user_id and l.ends_at > now())
     and not exists (select 1 from public.notification_preferences np where np.user_id = t.user_id and np.channel_push = false);
$$;

create or replace function public.notifications_push()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  pref text := case
    when new.link like '/orders%' then 'food_order_updates'
    when new.link like '/market-orders%' then 'marketplace_updates'
    else 'channel_push' end;
begin
  if exists (select 1 from public.device_push_tokens where user_id = new.user_id)
     and public.wants_alert(new.user_id, pref) then
    perform public.dispatch_push('notification', new.id);
  end if;
  return new;
end;
$$;

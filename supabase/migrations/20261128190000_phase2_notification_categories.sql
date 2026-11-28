-- Phase 2: notification categories for the redesigned centre, plus realtime deletes for reactions.

-- Removing a reaction needs the old row so the app knows which one went away.
alter table public.message_reactions replica identity full;
alter table public.message_attachments replica identity full;

create or replace function public.notification_category_for(p_link text, p_title text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_link is null then 'general'
    when p_link ~ '^/(billing|wallet|payment-security|orders|market-orders|listings/orders|listings/market-orders)' then 'money'
    when p_link ~ '^/(study/(class|classes|exams|assignments|planner|timetable)|school|roles)' then 'school'
    when p_link ~ '^/study/groups' then 'rooms'
    when p_title like 'Campus announcement:%' then 'school'
    else 'general'
  end
$$;

create or replace function public.notifications_set_category()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.category is null then
    new.category := public.notification_category_for(new.link, new.title);
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_set_category on public.notifications;
create trigger notifications_set_category
  before insert on public.notifications
  for each row execute function public.notifications_set_category();

-- Existing rows get a category too.
update public.notifications
   set category = public.notification_category_for(link, title)
 where category is null;

-- Lock down who can call the helpers directly.
revoke execute on function public.notifications_set_category() from public, anon, authenticated;
revoke execute on function public.notification_category_for(text, text) from public, anon;
grant execute on function public.notification_category_for(text, text) to authenticated, service_role;

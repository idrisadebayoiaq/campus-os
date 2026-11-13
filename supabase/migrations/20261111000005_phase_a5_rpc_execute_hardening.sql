-- CampusOS: lock down sensitive SECURITY DEFINER RPCs
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to postgres, service_role;

revoke execute on function public.review_business_application(uuid, public.application_status, text) from public, anon;
grant execute on function public.review_business_application(uuid, public.application_status, text) to authenticated, service_role;

create or replace function public.property_needs_reconfirm(checked_at timestamptz)
returns boolean
language sql
immutable
set search_path = public
as $$
  select checked_at is null or checked_at < now() - interval '14 days';
$$;

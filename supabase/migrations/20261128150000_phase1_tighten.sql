-- Phase 1 follow-up: class staff policies are for signed-in users only, and the
-- class helper functions are no longer callable without an account.

alter function public.level_digits(text) set search_path = public;

alter policy class_staff_read on public.class_staff to authenticated;
alter policy class_staff_write on public.class_staff to authenticated;

revoke execute on function public.level_digits(text) from public, anon;
revoke execute on function public.is_class_rep(uuid) from public, anon;
revoke execute on function public.can_manage_class(uuid) from public, anon;
grant execute on function public.level_digits(text) to authenticated, service_role;
grant execute on function public.is_class_rep(uuid) to authenticated, service_role;
grant execute on function public.can_manage_class(uuid) to authenticated, service_role;

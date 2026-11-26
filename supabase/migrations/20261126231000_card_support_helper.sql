-- Lets the student app know whether a kitchen can take card payments, without exposing bank details.
create or replace function public.business_accepts_cards(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.business_payment_methods m
    where m.business_id = p_business and m.provider = 'paystack'
      and m.is_verified and m.paystack_subaccount_code is not null
  );
$$;

revoke all on function public.business_accepts_cards(uuid) from public, anon;
grant execute on function public.business_accepts_cards(uuid) to authenticated;

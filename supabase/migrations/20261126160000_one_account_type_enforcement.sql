-- One account = one kind of account, enforced in the database as well as the UI.

-- Business applications: no mixing business types, and not for lecturers.
create or replace function public.enforce_single_account_type_business()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.is_dashboard_session() then
    return new;
  end if;

  if exists (
    select 1 from public.business_profiles bp
    where bp.owner_user_id = new.user_id and bp.business_type <> new.business_type
  ) or exists (
    select 1 from public.business_applications ba
    where ba.user_id = new.user_id
      and ba.business_type <> new.business_type
      and ba.status in ('draft','submitted','under_review','needs_changes','approved')
  ) then
    raise exception 'This account is already a different business type. Use another email for a second account type.';
  end if;

  if exists (
    select 1 from public.user_roles r
    where r.user_id = new.user_id and r.role in ('lecturer','school_admin')
  ) or exists (
    select 1 from public.lecturer_applications la
    where la.user_id = new.user_id and la.status <> 'rejected'
  ) then
    raise exception 'Lecturer and school accounts cannot also be businesses. Use another email.';
  end if;

  return new;
end;
$$;

drop trigger if exists business_applications_single_type on public.business_applications;
create trigger business_applications_single_type
  before insert on public.business_applications
  for each row execute function public.enforce_single_account_type_business();

-- Lecturer applications: not for business owners.
create or replace function public.enforce_single_account_type_lecturer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.is_dashboard_session() then
    return new;
  end if;
  if exists (select 1 from public.business_profiles bp where bp.owner_user_id = new.user_id)
     or exists (
       select 1 from public.business_applications ba
       where ba.user_id = new.user_id and ba.status <> 'rejected'
     ) then
    raise exception 'Business accounts cannot also be lecturers. Use another email.';
  end if;
  return new;
end;
$$;

drop trigger if exists lecturer_applications_single_type on public.lecturer_applications;
create trigger lecturer_applications_single_type
  before insert on public.lecturer_applications
  for each row execute function public.enforce_single_account_type_lecturer();

-- Listings must belong to the matching kind of business.
create or replace function public.enforce_listing_business_type()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  btype text;
  expected text[];
begin
  if public.is_dashboard_session() or public.is_staff() then
    return new;
  end if;
  if new.business_id is null then
    return new;
  end if;

  select bp.business_type::text into btype from public.business_profiles bp where bp.id = new.business_id;
  expected := case tg_table_name
    when 'properties' then array['housing_provider']
    when 'menu_items' then array['food_vendor']
    when 'marketplace_listings' then array['campus_service','marketplace_seller']
    else array[]::text[]
  end;

  if btype is null or not (btype = any (expected)) then
    raise exception 'This business type cannot create % entries.', tg_table_name;
  end if;
  return new;
end;
$$;

drop trigger if exists properties_business_type on public.properties;
create trigger properties_business_type
  before insert on public.properties
  for each row execute function public.enforce_listing_business_type();

drop trigger if exists menu_items_business_type on public.menu_items;
create trigger menu_items_business_type
  before insert on public.menu_items
  for each row execute function public.enforce_listing_business_type();

drop trigger if exists marketplace_listings_business_type on public.marketplace_listings;
create trigger marketplace_listings_business_type
  before insert on public.marketplace_listings
  for each row execute function public.enforce_listing_business_type();

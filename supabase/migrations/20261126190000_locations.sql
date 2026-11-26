-- Map-based locations for students, businesses, applications and campuses.

-- 1. Student's chosen home location (set during app signup / onboarding)
alter table public.profiles
  add column if not exists location_label text,
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision,
  add column if not exists location_updated_at timestamptz;

-- 2. Campus coordinates so schools can be ranked by distance
alter table public.campuses
  add column if not exists lat double precision,
  add column if not exists lng double precision;

-- 3. Business application + profile addresses picked on the map
alter table public.business_applications
  add column if not exists lat double precision,
  add column if not exists lng double precision;

alter table public.business_profiles
  add column if not exists address_text text,
  add column if not exists lat double precision,
  add column if not exists lng double precision;

-- Carry the application's address onto the business profile when it is approved.
create or replace function public.business_profile_copy_address()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.application_id is not null and new.address_text is null then
    select a.address_text, a.lat, a.lng
      into new.address_text, new.lat, new.lng
      from public.business_applications a
     where a.id = new.application_id;
  end if;
  return new;
end;
$$;

revoke all on function public.business_profile_copy_address() from public, anon, authenticated;

drop trigger if exists business_profile_copy_address on public.business_profiles;
create trigger business_profile_copy_address
  before insert on public.business_profiles
  for each row execute function public.business_profile_copy_address();

update public.business_profiles bp
   set address_text = a.address_text,
       lat = coalesce(bp.lat, a.lat),
       lng = coalesce(bp.lng, a.lng)
  from public.business_applications a
 where a.id = bp.application_id
   and bp.address_text is null
   and a.address_text is not null;

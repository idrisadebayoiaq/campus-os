ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS discovery_tags text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.business_profiles.discovery_tags IS
  'Discovery chips: food, barber, tailor, laundry, print, other';

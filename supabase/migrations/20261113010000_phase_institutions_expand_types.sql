-- Expand institution types for Nigerian schools, colleges, polys, and universities.

alter table public.institutions
  drop constraint if exists institutions_institution_type_check;

alter table public.institutions
  add constraint institutions_institution_type_check
  check (institution_type in (
    'university',
    'polytechnic',
    'college_of_education',
    'college',
    'monotechnic',
    'secondary_school',
    'other'
  ));

create unique index if not exists institutions_name_unique_ci
  on public.institutions (lower(name));

create index if not exists institutions_type_active_idx
  on public.institutions (institution_type, is_active);

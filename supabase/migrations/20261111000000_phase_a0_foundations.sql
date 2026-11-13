-- CampusOS Phase A0: profiles, roles, institutions
-- Applied via Supabase MCP; kept here as source of truth for the repo.

create type public.app_role as enum (
  'student',
  'provider',
  'vendor',
  'moderator',
  'admin'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text,
  institution_type text not null default 'university'
    check (institution_type in (
      'university',
      'polytechnic',
      'college_of_education',
      'college',
      'monotechnic',
      'secondary_school',
      'other'
    )),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.campuses (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  name text not null,
  city text,
  state text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (institution_id, name)
);

create table public.campus_areas (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (campus_id, name)
);

create table public.campus_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  institution_id uuid not null references public.institutions (id) on delete restrict,
  campus_id uuid not null references public.campuses (id) on delete restrict,
  department text,
  program text,
  year_of_study text,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, campus_id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );

  insert into public.user_roles (user_id, role)
  values (new.id, 'student')
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.has_role(check_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = check_role
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('admin') or public.has_role('moderator');
$$;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.institutions enable row level security;
alter table public.campuses enable row level security;
alter table public.campus_areas enable row level security;
alter table public.campus_memberships enable row level security;

create policy "Profiles are viewable by owner and staff"
  on public.profiles for select
  using (auth.uid() = id or public.is_staff());

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users can read own roles"
  on public.user_roles for select
  using (auth.uid() = user_id or public.is_staff());

create policy "Only staff can manage roles"
  on public.user_roles for all
  using (public.is_staff())
  with check (public.is_staff());

create policy "Anyone can read active institutions"
  on public.institutions for select
  using (is_active = true or public.is_staff());

create policy "Staff can manage institutions"
  on public.institutions for all
  using (public.is_staff())
  with check (public.is_staff());

create policy "Anyone can read active campuses"
  on public.campuses for select
  using (is_active = true or public.is_staff());

create policy "Staff can manage campuses"
  on public.campuses for all
  using (public.is_staff())
  with check (public.is_staff());

create policy "Anyone can read campus areas"
  on public.campus_areas for select
  using (
    exists (
      select 1 from public.campuses c
      where c.id = campus_id and (c.is_active = true or public.is_staff())
    )
  );

create policy "Staff can manage campus areas"
  on public.campus_areas for all
  using (public.is_staff())
  with check (public.is_staff());

create policy "Users manage own campus memberships"
  on public.campus_memberships for select
  using (auth.uid() = user_id or public.is_staff());

create policy "Users insert own campus memberships"
  on public.campus_memberships for insert
  with check (auth.uid() = user_id);

create policy "Users update own campus memberships"
  on public.campus_memberships for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own campus memberships"
  on public.campus_memberships for delete
  using (auth.uid() = user_id);

insert into public.institutions (id, name, short_name, institution_type)
values (
  '11111111-1111-1111-1111-111111111111',
  'Pilot University of Nigeria',
  'PUN',
  'university'
);

insert into public.campuses (id, institution_id, name, city, state)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Main Campus',
  'Osogbo',
  'Osun'
);

insert into public.campus_areas (campus_id, name) values
  ('22222222-2222-2222-2222-222222222222', 'Gate Area'),
  ('22222222-2222-2222-2222-222222222222', 'Behind Campus'),
  ('22222222-2222-2222-2222-222222222222', 'Staff Quarters Road');

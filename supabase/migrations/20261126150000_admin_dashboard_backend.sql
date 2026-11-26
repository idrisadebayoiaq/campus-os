-- Admin allowlist: confirmed accounts with these emails automatically get the admin role.
create table if not exists public.admin_allowlist (
  email text primary key,
  created_at timestamptz not null default now()
);
alter table public.admin_allowlist enable row level security;
-- No policies and no grants: only the dashboard / service role can edit it.
revoke all on public.admin_allowlist from anon, authenticated;

insert into public.admin_allowlist (email) values
  ('quoreebadebayo@gmail.com'),
  ('idridwewell@gmail.com')
on conflict do nothing;

create or replace function public.grant_admin_from_allowlist()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.email_confirmed_at is not null
     and exists (select 1 from public.admin_allowlist a where lower(a.email) = lower(new.email)) then
    insert into public.user_roles (user_id, role)
    values (new.id, 'admin')
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists zz_grant_admin_allowlist_insert on auth.users;
create trigger zz_grant_admin_allowlist_insert
  after insert on auth.users
  for each row execute function public.grant_admin_from_allowlist();

drop trigger if exists zz_grant_admin_allowlist_update on auth.users;
create trigger zz_grant_admin_allowlist_update
  after update of email, email_confirmed_at on auth.users
  for each row execute function public.grant_admin_from_allowlist();

-- Backfill for accounts that already exist.
insert into public.user_roles (user_id, role)
select u.id, 'admin'
from auth.users u
join public.admin_allowlist a on lower(a.email) = lower(u.email)
where u.email_confirmed_at is not null
on conflict (user_id, role) do nothing;

-- Dashboard numbers for the admin overview.
create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not (public.is_staff() or public.is_dashboard_session()) then
    raise exception 'not authorized';
  end if;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'businesses', (select count(*) from public.business_profiles),
    'pending_business', (select count(*) from public.business_applications where status in ('submitted','under_review')),
    'pending_lecturers', (select count(*) from public.lecturer_applications where status in ('submitted','under_review','pending')),
    'pending_verifications', (select count(*) from public.student_verifications where status = 'pending'),
    'open_reports', (select count(*) from public.reports where status in ('open','pending','new')),
    'schools', (select count(*) from public.institutions),
    'published_properties', (select count(*) from public.properties where is_published),
    'active_listings', (select count(*) from public.marketplace_listings),
    'orders', (select count(*) from public.food_orders)
  );
end;
$$;

create or replace function public.admin_list_users(search text default null)
returns table (
  id uuid,
  email text,
  full_name text,
  created_at timestamptz,
  roles text[]
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not (public.is_staff() or public.is_dashboard_session()) then
    raise exception 'not authorized';
  end if;
  return query
  select u.id,
         u.email::text,
         p.full_name,
         u.created_at,
         coalesce(array(select r.role::text from public.user_roles r where r.user_id = u.id order by r.role::text), '{}')
  from auth.users u
  left join public.profiles p on p.id = u.id
  where search is null
     or search = ''
     or u.email ilike '%' || search || '%'
     or p.full_name ilike '%' || search || '%'
  order by u.created_at desc
  limit 100;
end;
$$;

create or replace function public.admin_set_user_role(
  target uuid,
  new_role public.app_role,
  grant_role boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not (public.has_role('admin') or public.is_dashboard_session()) then
    raise exception 'only admins can change roles';
  end if;
  if new_role = 'student' and not grant_role then
    raise exception 'cannot remove the student role';
  end if;
  if grant_role then
    insert into public.user_roles (user_id, role) values (target, new_role)
    on conflict (user_id, role) do nothing;
  else
    if new_role = 'admin' and target = auth.uid() then
      raise exception 'you cannot remove your own admin role';
    end if;
    delete from public.user_roles where user_id = target and role = new_role;
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, meta)
  values (auth.uid(), case when grant_role then 'role_granted' else 'role_revoked' end,
          'user', target, jsonb_build_object('role', new_role));
end;
$$;

revoke execute on function public.admin_dashboard_stats() from anon;
revoke execute on function public.admin_list_users(text) from anon;
revoke execute on function public.admin_set_user_role(uuid, public.app_role, boolean) from anon;

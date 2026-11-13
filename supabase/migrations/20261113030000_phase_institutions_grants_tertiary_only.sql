-- Fix client read access for school picker + tertiary-only CampusOS catalog.

grant select on public.institutions to anon, authenticated;
grant select on public.campuses to anon, authenticated;
grant select on public.campus_areas to anon, authenticated;

-- CampusOS targets tertiary students; hide secondary schools from pickers.
update public.institutions
set is_active = false
where institution_type = 'secondary_school';

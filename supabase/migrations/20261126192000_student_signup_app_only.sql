-- Students sign up only through the mobile app (signup_intent = 'student').
-- Portal signups (business / lecturer / school) no longer receive the student role,
-- and the location chosen during app signup is stored on the profile.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  intent text := coalesce(nullif(meta->>'signup_intent', ''), 'student');
  loc_lat double precision;
  loc_lng double precision;
begin
  begin
    loc_lat := nullif(meta->>'location_lat', '')::double precision;
    loc_lng := nullif(meta->>'location_lng', '')::double precision;
  exception when others then
    loc_lat := null;
    loc_lng := null;
  end;

  insert into public.profiles (
    id, full_name, first_name, last_name, preferred_name,
    location_label, location_lat, location_lng, location_updated_at
  )
  values (
    new.id,
    coalesce(
      meta->>'full_name',
      trim(concat(coalesce(meta->>'first_name', ''), ' ', coalesce(meta->>'last_name', ''))),
      split_part(new.email, '@', 1)
    ),
    nullif(meta->>'first_name', ''),
    nullif(meta->>'last_name', ''),
    nullif(meta->>'preferred_name', ''),
    nullif(meta->>'location_label', ''),
    loc_lat,
    loc_lng,
    case when loc_lat is not null then now() end
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    first_name = coalesce(excluded.first_name, public.profiles.first_name),
    last_name = coalesce(excluded.last_name, public.profiles.last_name),
    preferred_name = coalesce(excluded.preferred_name, public.profiles.preferred_name),
    location_label = coalesce(excluded.location_label, public.profiles.location_label),
    location_lat = coalesce(excluded.location_lat, public.profiles.location_lat),
    location_lng = coalesce(excluded.location_lng, public.profiles.location_lng),
    location_updated_at = coalesce(excluded.location_updated_at, public.profiles.location_updated_at);

  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  if intent = 'student' then
    insert into public.user_roles (user_id, role)
    values (new.id, 'student')
    on conflict (user_id, role) do nothing;

    insert into public.student_profiles (user_id)
    values (new.id)
    on conflict (user_id) do nothing;

    insert into public.student_preferences (user_id)
    values (new.id)
    on conflict (user_id) do nothing;

    insert into public.onboarding_progress (user_id, current_step, setup_tasks)
    values (
      new.id,
      'status',
      array['add_courses','add_timetable','set_housing_budget','set_study_goal']
    )
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

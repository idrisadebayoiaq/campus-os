-- Let reviews run from the Supabase SQL editor and the service role, where there
-- is no end-user JWT. Signed-in anon/authenticated callers still need staff
-- (or the existing school-admin check for lecturer applications).

create or replace function public.is_dashboard_session()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role(), '') not in ('anon', 'authenticated');
$$;

create or replace function public.review_business_application(
  app_id uuid,
  new_status application_status,
  reason text default null
)
returns business_applications
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  app public.business_applications;
  slug_base text;
  final_slug text;
  role_to_add public.app_role;
begin
  if not (public.is_staff() or public.is_dashboard_session()) then
    raise exception 'not authorized';
  end if;

  if new_status not in ('approved','rejected','needs_changes','under_review') then
    raise exception 'invalid status';
  end if;

  update public.business_applications
  set
    status = new_status,
    decision_reason = reason,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  where id = app_id
  returning * into app;

  if app.id is null then
    raise exception 'application not found';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, meta)
  values (
    auth.uid(),
    'application_' || new_status::text,
    'business_application',
    app.id,
    jsonb_build_object('reason', reason, 'business_type', app.business_type)
  );

  if new_status = 'approved' then
    role_to_add := case
      when app.business_type = 'housing_provider' then 'provider'::public.app_role
      else 'vendor'::public.app_role
    end;

    insert into public.user_roles (user_id, role)
    values (app.user_id, role_to_add)
    on conflict (user_id, role) do nothing;

    slug_base := lower(regexp_replace(coalesce(app.business_name, 'business'), '[^a-zA-Z0-9]+', '-', 'g'));
    slug_base := trim(both '-' from slug_base);
    if slug_base = '' then slug_base := 'business'; end if;
    final_slug := slug_base || '-' || substr(app.id::text, 1, 8);

    insert into public.business_profiles (
      owner_user_id,
      application_id,
      business_type,
      slug,
      display_name,
      bio,
      phone,
      email,
      campus_id,
      service_zones,
      setup_complete,
      verification_label
    ) values (
      app.user_id,
      app.id,
      app.business_type,
      final_slug,
      app.business_name,
      app.description,
      app.phone,
      app.email,
      app.campus_id,
      app.service_zones,
      false,
      'identity_checked'
    )
    on conflict (application_id) do update
      set display_name = excluded.display_name,
          bio = excluded.bio,
          phone = excluded.phone,
          email = excluded.email,
          campus_id = excluded.campus_id,
          service_zones = excluded.service_zones,
          updated_at = now();
  end if;

  return app;
end;
$$;

create or replace function public.review_lecturer_application(
  app_id uuid,
  new_status text,
  reason text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  app public.lecturer_applications%rowtype;
begin
  select * into app from public.lecturer_applications where id = app_id;
  if not found then raise exception 'Application not found'; end if;
  if not (
    public.is_school_admin_for(app.institution_id)
    or public.is_staff()
    or public.is_dashboard_session()
  ) then
    raise exception 'Not allowed to review this application';
  end if;
  if new_status not in ('approved','rejected','needs_changes','under_review') then
    raise exception 'Invalid status';
  end if;
  if new_status in ('rejected','needs_changes') and nullif(trim(coalesce(reason,'')), '') is null then
    raise exception 'Reason required';
  end if;

  update public.lecturer_applications set
    status = new_status,
    review_note = reason,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  where id = app_id;

  if new_status = 'approved' then
    insert into public.user_roles (user_id, role)
    values (app.user_id, 'lecturer'::public.app_role)
    on conflict (user_id, role) do nothing;

    insert into public.lecturer_profiles (
      user_id, institution_id, department_id, campus_id, school_email, status, staff_title
    ) values (
      app.user_id, app.institution_id, app.department_id, app.campus_id, app.school_email, 'approved', app.staff_title
    )
    on conflict (user_id) do update set
      institution_id = excluded.institution_id,
      department_id = excluded.department_id,
      campus_id = excluded.campus_id,
      school_email = excluded.school_email,
      status = 'approved',
      staff_title = excluded.staff_title,
      updated_at = now();
  elsif new_status = 'rejected' then
    update public.lecturer_profiles set status = 'rejected', updated_at = now()
    where user_id = app.user_id;
  end if;
end;
$$;

create or replace function public.review_student_id_verification(
  p_verification_id uuid,
  p_approve boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_user uuid;
begin
  if not (
    public.is_staff()
    or public.is_dashboard_session()
    or exists (
      select 1 from public.school_authority_profiles sap where sap.user_id = auth.uid()
    )
  ) then
    raise exception 'Not allowed to review verifications';
  end if;

  select user_id into v_user
  from public.student_verifications
  where id = p_verification_id
  for update;
  if v_user is null then raise exception 'Verification not found'; end if;

  if p_approve then
    update public.student_verifications
    set status = 'approved', review_note = p_note, reviewed_by = auth.uid(),
        reviewed_at = now(), verified_by = auth.uid()
    where id = p_verification_id;
    update public.student_enrollments
    set verification_status = 'verified', verified_by = auth.uid(), verified_at = now()
    where user_id = v_user and is_primary = true;
    update public.student_profiles
    set verification_level = 'verified', updated_at = now()
    where user_id = v_user;
  else
    update public.student_verifications
    set status = 'rejected', review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_verification_id;
  end if;
end;
$$;

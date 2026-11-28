-- Portal lists that need names from profiles (which only owners and staff can read).

-- The lecturer's roster with names, how each student joined, and class rep status.
create or replace function public.class_roster(p_class uuid)
returns table (
  enrollment_id uuid,
  user_id uuid,
  name text,
  email text,
  matric_number text,
  source text,
  rep_role text,
  rep_status text
)
language plpgsql stable security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  cls public.class_offerings%rowtype;
begin
  select * into cls from public.class_offerings where id = p_class;
  if not found then raise exception 'Class not found'; end if;
  if not (public.can_manage_class(p_class) or public.is_staff() or public.is_school_admin_for(cls.institution_id)) then
    raise exception 'Not allowed';
  end if;
  return query
  select e.id,
         e.student_user_id,
         coalesce(nullif(trim(p.preferred_name), ''), nullif(trim(p.full_name), ''),
                  nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Student')::text,
         u.email::text,
         sp.matric_number,
         coalesce(e.source, 'manual')::text,
         s.role,
         s.status
    from public.class_enrollments e
    join public.profiles p on p.id = e.student_user_id
    left join auth.users u on u.id = e.student_user_id
    left join public.student_profiles sp on sp.user_id = e.student_user_id
    left join lateral (
      select cs.role, cs.status from public.class_staff cs
       where cs.class_id = p_class and cs.user_id = e.student_user_id
         and cs.role in ('class_rep', 'assistant_rep') and cs.status in ('invited', 'active')
       order by cs.created_at desc limit 1
    ) s on true
   where e.class_id = p_class and e.status = 'active'
   order by 3;
end;
$$;

-- Student offices and class reps at a school, for the authority's Leaders page.
create or replace function public.school_leaders(p_institution uuid)
returns table (
  kind text,
  id uuid,
  user_id uuid,
  name text,
  title text,
  scope_label text,
  status text,
  term_ends_on date,
  class_id uuid,
  created_at timestamptz
)
language plpgsql stable security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_school_admin_for(p_institution) then
    raise exception 'Only the school authority can see this list';
  end if;
  return query
  select 'office'::text, o.id, o.user_id,
         coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.preferred_name), ''), 'Student')::text,
         o.title, coalesce(o.scope_label, 'Whole school'), o.status, o.term_ends_on, null::uuid, o.created_at
    from public.student_offices o
    join public.profiles p on p.id = o.user_id
   where o.institution_id = p_institution and o.status in ('invited', 'active')
  union all
  select 'class_rep'::text, s.id, s.user_id,
         coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.preferred_name), ''), 'Student')::text,
         case s.role when 'assistant_rep' then 'Assistant class rep' else 'Class rep' end,
         c.course_code || coalesce(' · ' || c.level || 'L', ''), s.status, s.term_ends_on, c.id, s.created_at
    from public.class_staff s
    join public.class_offerings c on c.id = s.class_id
    join public.profiles p on p.id = s.user_id
   where c.institution_id = p_institution and s.role in ('class_rep', 'assistant_rep') and s.status in ('invited', 'active')
   order by 1 desc, 10 desc;
end;
$$;

revoke execute on function public.class_roster(uuid) from public, anon;
revoke execute on function public.school_leaders(uuid) from public, anon;
grant execute on function public.class_roster(uuid) to authenticated, service_role;
grant execute on function public.school_leaders(uuid) to authenticated, service_role;

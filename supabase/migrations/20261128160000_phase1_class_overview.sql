-- One call for the student app's class page: details, lecturer, reps, my role,
-- a pending rep invite and recent announcements. Members of the class only.

create or replace function public.class_overview(p_class uuid)
returns json
language plpgsql stable security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  cls public.class_offerings%rowtype;
  my_role text;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select * into cls from public.class_offerings where id = p_class;
  if not found then raise exception 'Class not found'; end if;
  if not (public.is_enrolled_in_class(p_class) or public.can_manage_class(p_class)
          or public.is_class_rep(p_class) or public.is_staff()
          or exists (select 1 from public.class_staff s where s.class_id = p_class and s.user_id = me and s.status = 'invited')) then
    raise exception 'You are not in this class';
  end if;
  my_role := case when public.can_manage_class(p_class) then 'lecturer'
                  when public.is_class_rep(p_class) then 'rep'
                  else 'student' end;

  return json_build_object(
    'id', cls.id,
    'course_code', cls.course_code,
    'course_title', cls.course_title,
    'level', cls.level,
    'semester', cls.semester,
    'academic_session', cls.academic_session,
    'department', (select d.name from public.departments d where d.id = cls.department_id),
    'lecturer', (select coalesce(nullif(trim(p.preferred_name), ''), nullif(trim(p.full_name), ''), 'Lecturer')
                   from public.profiles p where p.id = cls.lecturer_user_id),
    'enrolled', (select count(*) from public.class_enrollments e where e.class_id = p_class and e.status = 'active'),
    'my_role', my_role,
    'reps', coalesce((
      select json_agg(json_build_object(
               'user_id', s.user_id,
               'role', s.role,
               'name', coalesce(nullif(trim(p.preferred_name), ''), nullif(trim(p.full_name), ''), 'Student'),
               'avatar_url', p.avatar_url)
             order by s.role desc, s.created_at)
        from public.class_staff s join public.profiles p on p.id = s.user_id
       where s.class_id = p_class and s.role in ('class_rep', 'assistant_rep') and s.status = 'active'
    ), '[]'::json),
    'my_invite', (
      select json_build_object('id', s.id, 'role', s.role)
        from public.class_staff s
       where s.class_id = p_class and s.user_id = me and s.status = 'invited'
         and s.role in ('class_rep', 'assistant_rep')
       limit 1
    ),
    'announcements', coalesce((
      select json_agg(x order by x.created_at desc)
        from (
          select a.id, a.title, a.body, a.created_at, a.author_role,
                 coalesce(nullif(trim(p.preferred_name), ''), nullif(trim(p.full_name), ''), 'Lecturer') as author
            from public.class_announcements a
            left join public.profiles p on p.id = a.author_user_id
           where a.class_id = p_class
           order by a.created_at desc
           limit 30
        ) x
    ), '[]'::json)
  );
end;
$$;

revoke execute on function public.class_overview(uuid) from public, anon;
grant execute on function public.class_overview(uuid) to authenticated, service_role;

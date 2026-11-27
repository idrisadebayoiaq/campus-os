-- Exam candidates can browse housing and the marketplace around the school they want to attend,
-- but never order food. The chosen campus is stored on their student profile.

alter table public.student_profiles
  add column if not exists target_campus_id uuid references public.campuses (id) on delete set null;

drop function if exists public.save_exam_goals(text[], text[], date, text, text);

create or replace function public.save_exam_goals(
  p_exams text[],
  p_subjects text[] default '{}',
  p_date date default null,
  p_school text default null,
  p_course text default null,
  p_campus uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first'; end if;
  if coalesce(array_length(p_exams, 1), 0) = 0 then raise exception 'Pick at least one exam.'; end if;
  if p_campus is not null and not exists (select 1 from public.campuses where id = p_campus and is_active) then
    raise exception 'That campus was not found.';
  end if;
  insert into public.student_profiles (user_id) values (me) on conflict (user_id) do nothing;
  update public.student_profiles
     set exam_targets = p_exams,
         exam_subjects = coalesce(p_subjects, '{}'),
         exam_date = p_date,
         target_school = nullif(trim(coalesce(p_school, '')), ''),
         target_course = nullif(trim(coalesce(p_course, '')), ''),
         target_campus_id = p_campus,
         updated_at = now()
   where user_id = me;
end;
$$;

revoke all on function public.save_exam_goals(text[], text[], date, text, text, uuid) from public, anon;
grant execute on function public.save_exam_goals(text[], text[], date, text, text, uuid) to authenticated;

-- Food is for students who are on a campus. Block it for exam candidates on the server too.
create or replace function public.block_food_for_exam_prep()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.student_kind(new.student_id) = 'exam_prep' then
    raise exception 'Food ordering is for students on campus. Switch to a school account once you are admitted.';
  end if;
  return new;
end;
$$;

drop trigger if exists block_food_for_exam_prep on public.food_orders;
create trigger block_food_for_exam_prep
  before insert on public.food_orders
  for each row execute function public.block_food_for_exam_prep();

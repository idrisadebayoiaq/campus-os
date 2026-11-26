-- Two kinds of student accounts: in school ("enrolled") and exam candidates ("exam_prep").
-- Premium price depends on the kind: in school 2,000/month, exam prep 4,000/month.
-- In-school students get the AI tutor free with a limit; exam candidates need Premium for the AI tutor
-- and past questions. Everything else is free for both.

alter table public.student_profiles
  add column if not exists kind text not null default 'enrolled',
  add column if not exists exam_targets text[] not null default '{}',
  add column if not exists exam_subjects text[] not null default '{}',
  add column if not exists exam_date date,
  add column if not exists target_school text,
  add column if not exists target_course text;

alter table public.student_profiles drop constraint if exists student_profiles_kind_check;
alter table public.student_profiles
  add constraint student_profiles_kind_check check (kind in ('enrolled', 'exam_prep'));

-- The kind can only change through the functions below (so it can't be flipped to dodge a price).
create or replace function public.guard_student_kind()
returns trigger
language plpgsql
as $$
begin
  if new.kind is distinct from old.kind and coalesce(current_setting('app.kind_change', true), '') <> '1' then
    raise exception 'Use "I have been admitted" to switch your account type.';
  end if;
  return new;
end;
$$;

drop trigger if exists student_kind_guard on public.student_profiles;
create trigger student_kind_guard before update on public.student_profiles
  for each row execute function public.guard_student_kind();

insert into public.platform_settings (key, value, description) values
  ('exam_plan_price', '4000', 'Premium per month for exam-prep students (naira)'),
  ('tutor_free_per_hour', '10', 'AI tutor questions per hour for free in-school students'),
  ('tutor_free_per_day', '30', 'AI tutor questions per day for free in-school students'),
  ('tutor_exam_per_hour', '60', 'AI tutor questions per hour for exam-prep Premium'),
  ('tutor_exam_per_day', '200', 'AI tutor questions per day for exam-prep Premium')
on conflict (key) do nothing;
update public.platform_settings set value = '2000', description = 'Premium per month for in-school students (naira)' where key = 'student_plan_price';

create or replace function public.student_kind(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select kind from public.student_profiles where user_id = p_user), 'enrolled');
$$;

create or replace function public.student_price(p_user uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case when public.student_kind(p_user) = 'exam_prep'
    then public.setting_num('exam_plan_price', 4000)
    else public.setting_num('student_plan_price', 2000) end;
$$;

revoke all on function public.student_kind(uuid), public.student_price(uuid) from public, anon;
grant execute on function public.student_kind(uuid), public.student_price(uuid) to authenticated, service_role;

-- Exam goals -----------------------------------------------------------------------------------

create or replace function public.save_exam_goals(
  p_exams text[],
  p_subjects text[] default '{}',
  p_date date default null,
  p_school text default null,
  p_course text default null
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
  insert into public.student_profiles (user_id) values (me) on conflict (user_id) do nothing;
  update public.student_profiles
     set exam_targets = p_exams,
         exam_subjects = coalesce(p_subjects, '{}'),
         exam_date = p_date,
         target_school = nullif(trim(coalesce(p_school, '')), ''),
         target_course = nullif(trim(coalesce(p_course, '')), ''),
         updated_at = now()
   where user_id = me;
end;
$$;

create or replace function public.switch_to_enrolled()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first'; end if;
  perform set_config('app.kind_change', '1', true);
  update public.student_profiles set kind = 'enrolled', updated_at = now() where user_id = me;
end;
$$;

revoke all on function public.save_exam_goals(text[], text[], date, text, text), public.switch_to_enrolled() from public, anon;
grant execute on function public.save_exam_goals(text[], text[], date, text, text), public.switch_to_enrolled() to authenticated;

-- Sign-up: remember the kind chosen in the app ---------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  intent text := coalesce(nullif(meta->>'signup_intent', ''), 'student');
  kind_v text := case when meta->>'student_kind' = 'exam_prep' then 'exam_prep' else 'enrolled' end;
  exams_v text[] := coalesce(string_to_array(nullif(meta->>'exam_targets', ''), ','), '{}');
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

  if exists (
    select 1 from public.support_invites i
    where i.email = lower(new.email) and i.accepted_at is null
  ) then
    insert into public.user_roles (user_id, role)
    values (new.id, 'support')
    on conflict (user_id, role) do nothing;
    update public.support_invites
    set accepted_at = now(), user_id = new.id
    where email = lower(new.email);
    return new;
  end if;

  if intent = 'student' then
    insert into public.user_roles (user_id, role)
    values (new.id, 'student')
    on conflict (user_id, role) do nothing;

    insert into public.student_profiles (user_id, kind, exam_targets)
    values (new.id, kind_v, case when kind_v = 'exam_prep' then exams_v else '{}' end)
    on conflict (user_id) do nothing;

    insert into public.student_preferences (user_id)
    values (new.id)
    on conflict (user_id) do nothing;

    insert into public.onboarding_progress (user_id, current_step, setup_tasks)
    values (
      new.id,
      'status',
      case when kind_v = 'exam_prep'
        then array['set_exam_goal','pick_subjects','start_study_plan']
        else array['add_courses','add_timetable','set_housing_budget','set_study_goal'] end
    )
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

-- Prices follow the kind ---------------------------------------------------------------------------

create or replace function public.my_premium_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  s public.student_subscriptions;
  c record;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select * into s from public.student_subscriptions where user_id = me;
  select brand, last4, exp_month, exp_year into c from public.plan_cards where user_id = me and business_id is null;
  return jsonb_build_object(
    'active', coalesce(s.status = 'active' and s.ends_at > now(), false),
    'ends_at', s.ends_at,
    'auto_renew', coalesce(s.auto_renew, true),
    'pay_method', s.pay_method,
    'card', case when c.last4 is null then null else jsonb_build_object('brand', c.brand, 'last4', c.last4, 'exp', c.exp_month || '/' || c.exp_year) end,
    'price', public.student_price(me),
    'kind', public.student_kind(me)
  );
end;
$$;

create or replace function public.subscribe_premium()
returns public.student_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  price numeric := public.student_price(me);
  s public.student_subscriptions;
begin
  if me is null then
    raise exception 'Sign in first';
  end if;
  select * into s from public.student_subscriptions where user_id = me for update;
  if found and s.status = 'active' and s.ends_at > now() then
    update public.student_subscriptions set auto_renew = true, updated_at = now() where user_id = me returning * into s;
    return s;
  end if;
  perform public.wallet_apply(me, -price, 'subscription', 'student_premium', 'subscription', null, 'sub_' || me || '_' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'), 'CampusOS Premium (1 month)');
  insert into public.student_subscriptions (user_id, status, started_at, ends_at, auto_renew, pay_method)
  values (me, 'active', now(), now() + interval '30 days', true, 'wallet')
  on conflict (user_id) do update
    set status = 'active', started_at = now(), ends_at = now() + interval '30 days', auto_renew = true, pay_method = 'wallet', updated_at = now()
  returning * into s;
  return s;
end;
$$;

create or replace function public.renew_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.student_subscriptions;
  price numeric;
  n integer := 0;
begin
  for s in
    select * from public.student_subscriptions
     where status = 'active'
       and ((pay_method = 'wallet' and ends_at <= now()) or (pay_method = 'card' and ends_at <= now() - interval '3 days'))
     for update skip locked
  loop
    price := public.student_price(s.user_id);
    if s.auto_renew and s.pay_method = 'wallet' then
      begin
        perform public.wallet_apply(s.user_id, -price, 'subscription', 'student_premium', 'subscription', null, 'sub_' || s.user_id || '_' || to_char(s.ends_at, 'YYYYMMDDHH24MISS'), 'CampusOS Premium renewal');
        update public.student_subscriptions set ends_at = s.ends_at + interval '30 days', updated_at = now() where user_id = s.user_id;
        perform public.notify_user(s.user_id, 'Premium renewed', '₦' || price::text || ' was taken from your wallet.', '/premium');
        n := n + 1;
        continue;
      exception when others then
        null;
      end;
    end if;
    update public.student_subscriptions set status = 'expired', updated_at = now() where user_id = s.user_id;
    perform public.notify_user(s.user_id, 'Premium ended', 'Subscribe again any time to get Premium back.', '/premium');
  end loop;
  update public.subscription_plans set status = 'expired' where status = 'active' and ends_at is not null and ends_at <= now() - interval '3 days';
  return n;
end;
$$;

create or replace function public.plans_due_for_renewal()
returns table(kind text, user_id uuid, business_id uuid, amount numeric, authorization_code text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select 'student'::text, s.user_id, null::uuid, public.student_price(s.user_id), c.authorization_code, c.customer_email
    from public.student_subscriptions s
    join public.plan_cards c on c.user_id = s.user_id and c.business_id is null
   where s.status = 'active' and s.pay_method = 'card' and s.auto_renew and c.auto_renew
     and s.ends_at <= now() + interval '2 hours' and s.ends_at > now() - interval '3 days'
     and not exists (
       select 1 from public.payment_ledger l
        where l.user_id = s.user_id and l.purpose = 'subscription' and l.meta ->> 'student' = 'true'
          and l.meta ->> 'renewal' = 'true' and l.created_at > now() - interval '12 hours')
  union all
  select 'business'::text, c.user_id, c.business_id, public.setting_num('business_plan_price', 3000), c.authorization_code, c.customer_email
    from public.plan_cards c
    join lateral (select max(p.ends_at) as ends from public.subscription_plans p where p.business_id = c.business_id) lp on true
   where c.business_id is not null and c.auto_renew and lp.ends is not null
     and lp.ends <= now() + interval '2 hours' and lp.ends > now() - interval '3 days'
     and not exists (
       select 1 from public.payment_ledger l
        where l.business_id = c.business_id and l.purpose = 'subscription'
          and l.meta ->> 'renewal' = 'true' and l.created_at > now() - interval '12 hours');
$$;

-- Help articles that mention the old price ---------------------------------------------------------

update public.support_articles
   set body = 'Premium costs ₦2,000 a month for students in school and ₦4,000 a month for exam candidates (JAMB, WAEC, NECO and similar). You get a green Premium badge, higher AI tutor limits, a lower marketplace selling fee (1% instead of 2%) and priority support. Exam candidates also unlock the AI tutor and past questions, which are part of their plan. Open Profile › Premium and pay by card or from your wallet. Paying by card saves the card so Premium renews by itself; you can switch renewal off on the same screen at any time and keep Premium until the end of the paid month.'
 where title = 'CampusOS Premium for students';

update public.support_articles
   set body = 'The AI tutor answers study questions in a chat. Students in school can use it free, with an hourly and a daily limit; Premium raises both limits three times. Exam candidates (JAMB, WAEC, NECO and similar) need Premium to use the AI tutor. If you reach the limit it tells you when you can ask again. If a message fails to send, check your connection, then try again. You can change the tutor name and avatar in Settings › AI tutor.'
 where title = 'AI tutor limits and tips';

insert into public.support_articles (title, audience, category, keywords, body)
select 'Preparing for JAMB, WAEC or NECO on CampusOS', 'student', 'account',
       'exam prep jamb waec neco post utme candidate preparing not in school switch admitted premium 4000 past questions',
       'When you sign up in the app you choose "Already in school" or "Preparing for an exam". Exam candidates get an exam countdown, a study plan, flashcards, notes, study groups, the focus timer, study lock, the wallet and the marketplace for free. The AI tutor and past questions are part of Premium for exam candidates (₦4,000 a month). When you are admitted, open Profile › Exam goals and tap "I have been admitted" to switch to a school account; you then pick your school and campus and keep your history.'
where not exists (select 1 from public.support_articles where title = 'Preparing for JAMB, WAEC or NECO on CampusOS');

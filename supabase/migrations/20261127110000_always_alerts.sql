-- Always-on alerts. Wallet, orders, purchases, housing, school and account updates always push.
-- Only chat and the optional study/campus reminders follow the student's switches.

-- 1. Switches --------------------------------------------------------------

-- A student's switch for an optional category. Missing row = on.
create or replace function public.wants_alert(p_user uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select coalesce((to_jsonb(np) ->> p_key)::boolean, true)
       from public.notification_preferences np where np.user_id = p_user),
    true);
$$;

-- Study lock still pauses pushes (product rule). The chat switch no longer hides money alerts.
create or replace function public.push_tokens_for(p_users uuid[])
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(t.token), '{}'::text[])
    from public.device_push_tokens t
   where t.user_id = any (p_users)
     and not exists (select 1 from public.study_locks l where l.user_id = t.user_id and l.ends_at > now());
$$;

-- Which switch (if any) controls a notification. Null = always sent.
create or replace function public.alert_switch_for(p_link text, p_title text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    when p_title like 'Assignment graded%' then null
    when p_title = 'New room that fits you' then 'housing_alerts'
    when p_link like '/study/groups%' then 'study_group_messages'
    when p_link like '/study/exams%' then 'examination_alerts'
    when p_link like '/study/assignments%' or p_link like '/study/planner%' then 'academic_reminders'
    when p_link like '/study/timetable%' or p_link like '/study/classes%' then 'lecture_alerts'
    when p_link = '/notifications' and p_title like 'Campus announcement:%' then 'campus_announcements'
    else null
  end;
$$;
revoke execute on function public.alert_switch_for(text, text) from public, anon, authenticated;

create or replace function public.notifications_push()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  sw text := public.alert_switch_for(new.link, new.title);
begin
  if exists (select 1 from public.device_push_tokens where user_id = new.user_id)
     and (sw is null or public.wants_alert(new.user_id, sw)) then
    perform public.dispatch_push('notification', new.id);
  end if;
  return new;
end;
$$;

-- Chat pushes follow the "Chat messages" switch.
create or replace function public.messages_push()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_kind text;
begin
  if new.sender_id is null or new.message_type = 'system' then
    return new;
  end if;
  select kind into v_kind from public.conversations where id = new.conversation_id;
  -- Support replies already create a notification row (and so a push).
  if v_kind is null or v_kind in ('ai', 'support') then
    return new;
  end if;
  if exists (
    select 1
      from public.conversation_participants p
      join public.device_push_tokens t on t.user_id = p.user_id
     where p.conversation_id = new.conversation_id
       and p.user_id <> new.sender_id
       and not coalesce(p.muted, false)
       and public.wants_alert(p.user_id, 'channel_push')
  ) then
    perform public.dispatch_push('message', new.id);
  end if;
  return new;
end;
$$;

-- 2. Wallet ----------------------------------------------------------------

-- Every money-out: purchases, held money, payments, transfers.
create or replace function public.notify_wallet_debit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  amt text := '₦' || to_char(abs(new.amount), 'FM999,999,999,990.00');
  bal text := '₦' || to_char(coalesce(new.balance_after, 0), 'FM999,999,999,990.00');
begin
  perform public.notify_user(
    new.user_id,
    case when new.kind = 'escrow_hold' then 'Held for a purchase · ' || amt else 'Wallet debit · ' || amt end,
    coalesce(nullif(trim(new.note), ''), nullif(trim(new.purpose), ''), 'Payment') || ' · Balance ' || bal,
    '/wallet');
  return new;
end;
$$;

drop trigger if exists wallet_entries_debit_notify on public.wallet_entries;
create trigger wallet_entries_debit_notify
  after insert on public.wallet_entries
  for each row when (new.amount < 0)
  execute function public.notify_wallet_debit();

-- Funding failed: say why. The payment provider's reason is passed in when we have it.
drop function if exists public.fail_payment(text);
create or replace function public.fail_payment(p_reference text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r public.payment_ledger;
  why text := case
    when nullif(trim(coalesce(p_reason, '')), '') is null then 'The card payment did not go through.'
    else 'Reason: ' || trim(p_reason) || '.' end;
begin
  update public.payment_ledger
     set status = 'failed',
         meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('failure', why)
   where reference = p_reference and status = 'pending'
  returning * into r;
  if not found then
    return;
  end if;
  if r.purpose = 'wallet_topup' then
    perform public.notify_user(r.user_id, 'Wallet funding failed',
      '₦' || coalesce(r.meta ->> 'credit', r.amount::text) || ' was not added. ' || why || ' Try again.', '/wallet');
  elsif r.food_order_id is not null then
    perform public.notify_user(r.user_id, 'Order payment failed',
      'Payment did not go through. ' || why || ' Tap Pay now in My orders to try again.', '/orders');
  end if;
end;
$$;
revoke all on function public.fail_payment(text, text) from public, anon, authenticated;
grant execute on function public.fail_payment(text, text) to service_role;

-- Card payment for a food order went through.
create or replace function public.notify_order_payment_received()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.notify_user(new.user_id,
    'Payment received · ₦' || to_char(new.amount, 'FM999,999,999,990.00'),
    'Your order is with the kitchen.', '/orders');
  return new;
end;
$$;

drop trigger if exists payment_ledger_order_paid_notify on public.payment_ledger;
create trigger payment_ledger_order_paid_notify
  after update of status on public.payment_ledger
  for each row when (new.status = 'success' and old.status is distinct from 'success' and new.food_order_id is not null)
  execute function public.notify_order_payment_received();

-- 3. Withdrawals -----------------------------------------------------------

create or replace function public.payout_begin(p_business uuid, p_user uuid)
returns payouts
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  biz public.business_profiles;
  bal numeric;
  minimum numeric := public.setting_num('payout_min', 5000);
  p public.payouts;
  ref text := 'pay_' || replace(gen_random_uuid()::text, '-', '');
begin
  select * into biz from public.business_profiles where id = p_business for update;
  if not found or biz.owner_user_id is distinct from p_user then
    raise exception 'Only the owner can withdraw';
  end if;
  if not exists (
    select 1 from public.business_payment_methods m
    where m.business_id = p_business and m.is_verified
  ) then
    raise exception 'Add and verify your bank account first';
  end if;
  if exists (select 1 from public.payouts where business_id = p_business and status in ('requested', 'processing')) then
    raise exception 'A withdrawal is already on its way';
  end if;
  bal := public._business_balance(p_business);
  if bal < minimum then
    raise exception 'You can withdraw once your balance reaches ₦%', minimum;
  end if;
  insert into public.payouts (business_id, requested_by, amount, reference)
  values (p_business, p_user, bal, ref)
  returning * into p;
  insert into public.business_entries (business_id, kind, amount, reference, note)
  values (p_business, 'payout', -bal, 'payout_' || p.id, 'Withdrawal');
  perform public.notify_business_team(p_business,
    'Withdrawal requested · ₦' || to_char(bal, 'FM999,999,999,990.00'),
    'We will tell you when it is sent or if it fails.', '/billing');
  return p;
end;
$$;

create or replace function public.user_payout_begin(p_user uuid)
returns payouts
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  bal numeric;
  minimum numeric := public.setting_num('payout_min', 5000);
  p public.payouts;
  ref text := 'pay_' || replace(gen_random_uuid()::text, '-', '');
begin
  perform pg_advisory_xact_lock(hashtext('user_payout_' || p_user::text));
  if not exists (select 1 from public.user_payout_accounts a where a.user_id = p_user and a.is_verified) then
    raise exception 'Add and confirm your bank account first';
  end if;
  if exists (select 1 from public.payouts where user_id = p_user and status in ('requested', 'processing')) then
    raise exception 'A withdrawal is already on its way';
  end if;
  select coalesce(sum(amount), 0) into bal from public.user_entries where user_id = p_user;
  if bal < minimum then
    raise exception 'You can withdraw once your earnings reach ₦%', minimum;
  end if;
  insert into public.payouts (user_id, requested_by, amount, reference) values (p_user, p_user, bal, ref) returning * into p;
  insert into public.user_entries (user_id, kind, amount, ref_type, ref_id, reference, note)
  values (p_user, 'payout', -bal, 'payout', p.id, 'upayout_' || p.id, 'Withdrawal');
  perform public.notify_user(p_user,
    'Withdrawal requested · ₦' || to_char(bal, 'FM999,999,999,990.00'),
    'We will tell you when it is sent or if it fails.', '/earnings');
  return p;
end;
$$;

create or replace function public.payout_finish(p_reference text, p_status text, p_code text default null, p_reason text default null)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  p public.payouts;
  amt text;
begin
  select * into p from public.payouts where reference = p_reference for update;
  if not found then
    return 'unknown';
  end if;
  if p.status in ('paid', 'failed') then
    return p.status;
  end if;
  amt := '₦' || to_char(p.amount, 'FM999,999,999,990.00');

  if p_status = 'processing' then
    update public.payouts set status = 'processing', transfer_code = coalesce(p_code, transfer_code), updated_at = now() where id = p.id;
    if p.status = 'requested' then
      if p.business_id is not null then
        perform public.notify_business_team(p.business_id, 'Withdrawal on its way · ' || amt, 'Being sent to your bank account.', '/billing');
      else
        perform public.notify_user(p.user_id, 'Withdrawal on its way · ' || amt, 'Being sent to your bank account.', '/earnings');
      end if;
    end if;
    return 'processing';
  elsif p_status = 'paid' then
    update public.payouts set status = 'paid', transfer_code = coalesce(p_code, transfer_code), updated_at = now() where id = p.id;
    if p.business_id is not null then
      perform public.notify_business_team(p.business_id, 'Withdrawal sent · ' || amt, 'It has been sent to your bank account.', '/billing');
    else
      perform public.notify_user(p.user_id, 'Withdrawal sent · ' || amt, 'It has been sent to your bank account.', '/earnings');
    end if;
    return 'paid';
  else
    update public.payouts set status = 'failed', failure_reason = left(coalesce(p_reason, 'Transfer failed'), 300), updated_at = now() where id = p.id;
    if p.business_id is not null then
      insert into public.business_entries (business_id, kind, amount, reference, note)
      values (p.business_id, 'payout_reversal', p.amount, 'payout_rev_' || p.id, 'Withdrawal failed, money returned')
      on conflict (reference) do nothing;
      perform public.notify_business_team(p.business_id, 'Withdrawal failed · ' || amt,
        coalesce(left(p_reason, 140), 'The transfer did not go through.') || ' Your balance was restored.', '/billing');
    else
      insert into public.user_entries (user_id, kind, amount, ref_type, ref_id, reference, note)
      values (p.user_id, 'payout_reversal', p.amount, 'payout', p.id, 'upayout_rev_' || p.id, 'Withdrawal failed, money returned')
      on conflict (reference) do nothing;
      perform public.notify_user(p.user_id, 'Withdrawal failed · ' || amt,
        coalesce(left(p_reason, 140), 'The transfer did not go through.') || ' Your earnings were restored.', '/earnings');
    end if;
    return 'failed';
  end if;
end;
$$;

-- 4. Restaurants -----------------------------------------------------------

-- Order status texts (delivery wording differs from pickup).
create or replace function public.notify_food_order_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  biz_name text;
  body text;
  delivery boolean := new.fulfilment = 'delivery';
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  select display_name into biz_name from public.business_profiles where id = new.business_id;
  body := coalesce(biz_name, 'Your order');

  if new.status = 'accepted' and new.prep_minutes is not null then
    body := body || ' · ready in about ' || new.prep_minutes::text || ' min';
  elsif new.status = 'declined' and new.decline_reason is not null then
    body := body || ' · ' || new.decline_reason;
  end if;

  perform public.notify_user(
    new.student_id,
    case new.status::text
      when 'accepted' then 'Order accepted'
      when 'preparing' then 'Order being prepared'
      when 'ready' then case when delivery then 'Order on its way' else 'Order ready for pickup' end
      when 'collected' then case when delivery then 'Order delivered' else 'Order collected' end
      when 'completed' then case when delivery then 'Order delivered' else 'Order completed' end
      when 'declined' then 'Order declined'
      when 'cancelled' then 'Order cancelled'
      when 'expired' then 'Order expired'
      else 'Order update'
    end,
    body,
    '/orders'
  );
  return new;
end;
$$;

-- Money from a paid order lands in the kitchen's balance.
create or replace function public.notify_order_paid()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.notify_business_team(new.business_id,
    'Order paid · ₦' || to_char(new.amount, 'FM999,999,999,990.00'),
    'Added to your balance.', '/billing');
  return new;
end;
$$;

drop trigger if exists business_entries_order_paid_notify on public.business_entries;
create trigger business_entries_order_paid_notify
  after insert on public.business_entries
  for each row when (new.kind = 'sale' and new.order_id is not null)
  execute function public.notify_order_paid();

-- 5. School, lecturers, admin ---------------------------------------------

-- Applicant hears the decision (lecturer).
create or replace function public.notify_lecturer_app_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status is not distinct from old.status or new.status not in ('approved', 'rejected', 'needs_changes', 'under_review') then
    return new;
  end if;
  perform public.notify_user(new.user_id,
    case new.status
      when 'approved' then 'Lecturer application approved'
      when 'rejected' then 'Lecturer application not approved'
      when 'needs_changes' then 'Lecturer application needs changes'
      else 'Lecturer application under review'
    end,
    coalesce(nullif(trim(new.review_note), ''),
      case when new.status = 'approved' then 'You can now publish assignments and live classes.' else 'Open Lecturer tools for details.' end),
    '/lecturer');
  return new;
end;
$$;

drop trigger if exists lecturer_applications_status_notify on public.lecturer_applications;
create trigger lecturer_applications_status_notify
  after update of status on public.lecturer_applications
  for each row execute function public.notify_lecturer_app_status();

-- School authorities hear about new lecturer applications.
create or replace function public.notify_lecturer_app_submitted()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.notifications (user_id, title, body, link)
  select sap.user_id, 'New lecturer application', coalesce(new.full_name, 'A lecturer') || ' applied to teach.', '/notifications'
    from public.school_authority_profiles sap
   where sap.institution_id = new.institution_id;
  return new;
end;
$$;

drop trigger if exists lecturer_applications_submitted_notify on public.lecturer_applications;
create trigger lecturer_applications_submitted_notify
  after insert on public.lecturer_applications
  for each row execute function public.notify_lecturer_app_submitted();

-- School authorities hear about student ID submissions for their school.
create or replace function public.notify_student_id_submitted()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.notifications (user_id, title, body, link)
  select sap.user_id, 'Student ID to review', 'A student sent an ID for verification.', '/notifications'
    from public.campus_memberships cm
    join public.school_authority_profiles sap on sap.institution_id = cm.institution_id
   where cm.user_id = new.user_id and cm.is_primary;
  return new;
end;
$$;

drop trigger if exists student_verifications_submitted_notify on public.student_verifications;
create trigger student_verifications_submitted_notify
  after insert on public.student_verifications
  for each row execute function public.notify_student_id_submitted();

-- Someone was made a school authority.
create or replace function public.notify_school_authority_added()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.notify_user(new.user_id, 'You are a school authority',
    'Sign in to the school portal to review students and lecturers.', '/notifications');
  return new;
end;
$$;

drop trigger if exists school_authority_profiles_added_notify on public.school_authority_profiles;
create trigger school_authority_profiles_added_notify
  after insert on public.school_authority_profiles
  for each row execute function public.notify_school_authority_added();

-- Campus announcement reaches every member of the school.
create or replace function public.notify_school_announcement()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.notifications (user_id, title, body, link)
  select distinct cm.user_id, 'Campus announcement: ' || new.title, left(coalesce(new.body, ''), 300), '/notifications'
    from public.campus_memberships cm
   where cm.institution_id = new.institution_id
     and cm.user_id is distinct from new.author_user_id;
  return new;
end;
$$;

drop trigger if exists school_announcements_notify on public.school_announcements;
create trigger school_announcements_notify
  after insert on public.school_announcements
  for each row execute function public.notify_school_announcement();

-- Student handed in work: the lecturer hears.
create or replace function public.notify_assignment_submitted()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  a record;
begin
  select ca.title, co.lecturer_user_id, co.course_code into a
    from public.class_assignments ca
    join public.class_offerings co on co.id = ca.class_id
   where ca.id = new.assignment_id;
  if a.lecturer_user_id is not null and a.lecturer_user_id <> new.student_user_id then
    perform public.notify_user(a.lecturer_user_id,
      'New submission · ' || coalesce(a.course_code || ' · ', '') || coalesce(a.title, 'Assignment'),
      'A student handed in work.', '/lecturer');
  end if;
  return new;
end;
$$;

drop trigger if exists class_assignment_submissions_notify on public.class_assignment_submissions;
create trigger class_assignment_submissions_notify
  after insert on public.class_assignment_submissions
  for each row execute function public.notify_assignment_submitted();

-- Work graded: the student hears the score.
create or replace function public.notify_assignment_graded()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  a record;
begin
  if new.graded_at is null or (old.graded_at is not distinct from new.graded_at and old.score is not distinct from new.score) then
    return new;
  end if;
  select ca.title, ca.max_score into a from public.class_assignments ca where ca.id = new.assignment_id;
  perform public.notify_user(new.student_user_id,
    'Assignment graded · ' || coalesce(a.title, 'Assignment'),
    'Score: ' || coalesce(new.score::text, '–') || coalesce(' / ' || a.max_score::text, ''),
    '/study/assignments');
  return new;
end;
$$;

drop trigger if exists class_assignment_submissions_graded_notify on public.class_assignment_submissions;
create trigger class_assignment_submissions_graded_notify
  after update of score, graded_at on public.class_assignment_submissions
  for each row execute function public.notify_assignment_graded();

-- Business applicant hears the decision.
create or replace function public.notify_business_app_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status::text is not distinct from old.status::text
     or new.status::text not in ('approved', 'rejected', 'needs_changes', 'under_review') then
    return new;
  end if;
  perform public.notify_user(new.user_id,
    case new.status::text
      when 'approved' then 'Business approved'
      when 'rejected' then 'Business application not approved'
      when 'needs_changes' then 'Business application needs changes'
      else 'Business application under review'
    end,
    coalesce(nullif(trim(new.decision_reason), ''),
      case when new.status::text = 'approved' then coalesce(new.business_name, 'Your business') || ' is live on CampusOS.' else 'Open your application for details.' end),
    '/notifications');
  return new;
end;
$$;

drop trigger if exists business_applications_status_notify on public.business_applications;
create trigger business_applications_status_notify
  after update of status on public.business_applications
  for each row execute function public.notify_business_app_status();

-- 6. Reminder helpers keep working with the new switch rules --------------

revoke execute on function public.wants_alert(uuid, text) from public, anon, authenticated;

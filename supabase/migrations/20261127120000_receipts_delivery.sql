-- Receipts and delivery confirmation for food orders.
-- * every order gets a receipt number
-- * a private 4-digit code the student shows the delivery person (or the counter)
-- * restaurants finish an order only with that code; students can also confirm in the app
-- * orders nobody confirms complete on their own after 6 hours (unless the student reported a problem)

-- 1. Columns ---------------------------------------------------------------

alter table public.food_orders
  add column if not exists receipt_no text,
  add column if not exists delivered_at timestamptz,
  add column if not exists delivered_by text,
  add column if not exists issue_reported_at timestamptz;

alter table public.food_orders drop constraint if exists food_orders_delivered_by_check;
alter table public.food_orders add constraint food_orders_delivered_by_check
  check (delivered_by is null or delivered_by in ('restaurant', 'student', 'auto'));

update public.food_orders
   set receipt_no = 'CO-' || upper(substr(replace(id::text, '-', ''), 1, 8))
 where receipt_no is null;

update public.food_orders
   set delivered_at = coalesce(delivered_at, updated_at)
 where status in ('collected', 'completed') and delivered_at is null;

create unique index if not exists food_orders_receipt_no_key on public.food_orders (receipt_no);

create or replace function public.food_orders_set_receipt()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.receipt_no is null then
    new.receipt_no := 'CO-' || upper(substr(replace(new.id::text, '-', ''), 1, 8));
  end if;
  return new;
end;
$$;

drop trigger if exists food_orders_receipt on public.food_orders;
create trigger food_orders_receipt
  before insert on public.food_orders
  for each row execute function public.food_orders_set_receipt();

-- 2. Private delivery codes -------------------------------------------------
-- Kept apart from food_orders so the kitchen can never read it.

create table if not exists public.food_order_codes (
  order_id uuid primary key references public.food_orders (id) on delete cascade,
  code text not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.food_order_codes enable row level security;

drop policy if exists "Student reads own order code" on public.food_order_codes;
create policy "Student reads own order code" on public.food_order_codes
  for select to authenticated
  using (exists (select 1 from public.food_orders o where o.id = order_id and o.student_id = auth.uid()));

revoke all on public.food_order_codes from anon;
revoke insert, update, delete, truncate on public.food_order_codes from authenticated;

create or replace function public.food_orders_make_code()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.food_order_codes (order_id, code)
  values (new.id, lpad((floor(random() * 10000))::int::text, 4, '0'))
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists food_orders_code on public.food_orders;
create trigger food_orders_code
  after insert on public.food_orders
  for each row execute function public.food_orders_make_code();

insert into public.food_order_codes (order_id, code)
select o.id, lpad((floor(random() * 10000))::int::text, 4, '0')
  from public.food_orders o
 where not exists (select 1 from public.food_order_codes c where c.order_id = o.id);

-- 3. Only the confirm functions can finish an order --------------------------

create or replace function public.guard_food_order_update()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  is_vendor boolean;
begin
  -- Server-side code (service role, SECURITY DEFINER functions) and platform staff may change anything.
  if auth.uid() is null or current_user not in ('authenticated', 'anon') or public.is_staff() then
    return new;
  end if;

  is_vendor := public.can_operate_business(old.business_id);

  if new.business_id is distinct from old.business_id
     or new.student_id is distinct from old.student_id
     or new.subtotal is distinct from old.subtotal
     or new.packaging_fee is distinct from old.packaging_fee
     or new.total is distinct from old.total
     or new.notes is distinct from old.notes
     or new.delivery_fee is distinct from old.delivery_fee
     or new.discount is distinct from old.discount
     or new.fulfilment is distinct from old.fulfilment
     or new.payment_method is distinct from old.payment_method
     or new.payment_status is distinct from old.payment_status
     or new.paid_at is distinct from old.paid_at
     or new.receipt_no is distinct from old.receipt_no
     or new.delivered_at is distinct from old.delivered_at
     or new.delivered_by is distinct from old.delivered_by
     or new.issue_reported_at is distinct from old.issue_reported_at then
    raise exception 'Order details cannot be changed';
  end if;

  if is_vendor then
    if new.status is distinct from old.status then
      -- Finishing an order (delivered / handed over) goes through confirm_food_delivery with the student's code.
      if not (
        (old.status = 'placed' and new.status in ('accepted', 'declined'))
        or (old.status = 'accepted' and new.status in ('preparing', 'ready', 'declined'))
        or (old.status = 'preparing' and new.status in ('ready', 'declined'))
      ) then
        raise exception 'An order cannot move from % to %', old.status, new.status;
      end if;
      if new.status = 'accepted' then
        new.accepted_at := now();
      elsif new.status = 'ready' then
        new.ready_at := now();
      elsif new.status = 'declined' and coalesce(trim(new.decline_reason), '') = '' then
        new.decline_reason := 'The kitchen could not take this order.';
      end if;
    end if;
    return new;
  end if;

  if auth.uid() = old.student_id then
    if new.status is distinct from old.status
       and not (old.status = 'placed' and new.status = 'cancelled') then
      raise exception 'You can only cancel an order before the kitchen accepts it';
    end if;
    if new.prep_minutes is distinct from old.prep_minutes
       or new.decline_reason is distinct from old.decline_reason
       or new.accepted_at is distinct from old.accepted_at
       or new.ready_at is distinct from old.ready_at then
      raise exception 'Order details cannot be changed';
    end if;
    return new;
  end if;

  raise exception 'Not allowed';
end;
$$;

-- 4. Confirming delivery ------------------------------------------------------

-- Kitchen or rider enters the code the student shows.
create or replace function public.confirm_food_delivery(p_order uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  o public.food_orders;
  c public.food_order_codes;
begin
  select * into o from public.food_orders where id = p_order for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if not public.can_operate_business(o.business_id) then
    raise exception 'Not allowed';
  end if;
  if o.status in ('collected', 'completed') then
    return jsonb_build_object('ok', true, 'message', 'Already confirmed');
  end if;
  if o.status <> 'ready' then
    return jsonb_build_object('ok', false, 'message', 'Mark the order ready first');
  end if;
  select * into c from public.food_order_codes where order_id = p_order for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'No code for this order. Ask the student to confirm in their app.');
  end if;
  if c.attempts >= 5 then
    return jsonb_build_object('ok', false, 'locked', true, 'message', 'Too many wrong codes. Ask the student to confirm in their app.');
  end if;
  if trim(coalesce(p_code, '')) <> c.code then
    update public.food_order_codes set attempts = attempts + 1 where order_id = p_order;
    return jsonb_build_object('ok', false, 'message', 'That code is not right');
  end if;
  update public.food_orders
     set status = 'completed', delivered_at = now(), delivered_by = 'restaurant'
   where id = p_order;
  return jsonb_build_object('ok', true);
end;
$$;

-- Student confirms in the app: "I received my order".
create or replace function public.confirm_food_received(p_order uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  o public.food_orders;
begin
  select * into o from public.food_orders where id = p_order and student_id = auth.uid() for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if o.status in ('collected', 'completed') then
    return;
  end if;
  if o.status <> 'ready' then
    raise exception 'Your order is not on its way yet';
  end if;
  update public.food_orders
     set status = 'completed', delivered_at = now(), delivered_by = 'student'
   where id = p_order;
end;
$$;

-- Student says it did not arrive: tells the kitchen and stops the automatic completion.
create or replace function public.report_food_issue(p_order uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  o public.food_orders;
begin
  select * into o from public.food_orders where id = p_order and student_id = auth.uid() for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if o.status <> 'ready' then
    raise exception 'You can report a problem while the order is on its way';
  end if;
  update public.food_orders set issue_reported_at = now() where id = p_order;
  perform public.notify_business_team(o.business_id, 'Delivery problem reported',
    coalesce(nullif(left(trim(coalesce(p_note, '')), 140), ''), 'The student says order ' || o.receipt_no || ' has not arrived.'),
    '/listings/orders');
  perform public.notify_user(o.student_id, 'Problem reported',
    'We told the kitchen about order ' || o.receipt_no || '. Contact support if it is not sorted out.', '/orders');
end;
$$;

revoke all on function public.confirm_food_delivery(uuid, text) from public, anon;
revoke all on function public.confirm_food_received(uuid) from public, anon;
revoke all on function public.report_food_issue(uuid, text) from public, anon;
grant execute on function public.confirm_food_delivery(uuid, text) to authenticated;
grant execute on function public.confirm_food_received(uuid) to authenticated;
grant execute on function public.report_food_issue(uuid, text) to authenticated;

-- 5. Nudge, then finish on its own --------------------------------------------

create or replace function public.food_delivery_sweep()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
begin
  for r in
    select id, student_id, fulfilment
      from public.food_orders
     where status = 'ready' and issue_reported_at is null
       and coalesce(ready_at, updated_at) < now() - interval '45 minutes'
  loop
    perform public.remind_once('food_arrived', r.id, r.student_id, null,
      case when r.fulfilment = 'delivery' then 'Did your order arrive?' else 'Did you collect your order?' end,
      'Tap to confirm, or report a problem.', '/orders');
  end loop;

  for r in
    select id, student_id
      from public.food_orders
     where status = 'ready' and issue_reported_at is null
       and coalesce(ready_at, updated_at) < now() - interval '5 hours'
  loop
    perform public.remind_once('food_arrived_final', r.id, r.student_id, null,
      'Order will close soon',
      'We will mark it delivered in about an hour. Report a problem now if it has not arrived.', '/orders');
  end loop;

  update public.food_orders
     set status = 'completed', delivered_at = now(), delivered_by = 'auto'
   where status = 'ready' and issue_reported_at is null
     and coalesce(ready_at, updated_at) < now() - interval '6 hours';
end;
$$;
revoke all on function public.food_delivery_sweep() from public, anon, authenticated;

select cron.schedule('campusos-food-delivery', '*/10 * * * *', $job$select public.food_delivery_sweep()$job$);

-- 6. Push texts ---------------------------------------------------------------

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
  elsif new.status = 'ready' then
    body := body || case when delivery then ' · show your delivery code when it arrives' else ' · show your code at the counter' end;
  elsif new.status = 'declined' and new.decline_reason is not null then
    body := body || ' · ' || new.decline_reason;
  elsif new.status in ('collected', 'completed') then
    body := body || ' · ' || case new.delivered_by
      when 'auto' then 'closed automatically. Open your receipt any time.'
      else 'receipt saved in History' end;
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

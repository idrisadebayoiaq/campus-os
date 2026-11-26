-- Wallet payments for food, order money events, refunds to the wallet.

alter table public.food_orders add column if not exists commission numeric not null default 0;
alter table public.food_orders drop constraint if exists food_orders_payment_method_check;
alter table public.food_orders add constraint food_orders_payment_method_check check (payment_method in ('cash', 'card', 'wallet'));

-- Vendors and students must never be able to change the commission on an order.
create or replace function public.food_orders_lock_commission()
returns trigger
language plpgsql
as $$
begin
  if new.commission is distinct from old.commission
     and auth.uid() is not null
     and current_user in ('authenticated', 'anon') then
    new.commission := old.commission;
  end if;
  return new;
end;
$$;

drop trigger if exists food_orders_lock_commission on public.food_orders;
create trigger food_orders_lock_commission before update on public.food_orders
  for each row execute function public.food_orders_lock_commission();
create or replace function public.place_food_order(
  p_business uuid,
  p_items jsonb,
  p_notes text default null,
  p_fulfilment text default 'pickup',
  p_address text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_promo_code text default null,
  p_payment_method text default 'cash'
)
returns public.food_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  biz public.business_profiles;
  ord public.food_orders;
  line jsonb;
  item public.menu_items;
  special public.promotions;
  promo public.promotions;
  grp public.menu_option_groups;
  opt public.menu_options;
  qty integer;
  unit_price numeric;
  opts jsonb;
  picked integer;
  sub numeric := 0;
  lines integer := 0;
  fee numeric := 0;
  disc numeric := 0;
  quote record;
  priced jsonb := '[]'::jsonb;
  opt_id text;
  has_card_account boolean;
begin
  if me is null then
    raise exception 'Sign in to place an order';
  end if;
  if p_fulfilment not in ('pickup', 'delivery') then
    raise exception 'Choose pickup or delivery';
  end if;
  if p_payment_method not in ('cash', 'card', 'wallet') then
    raise exception 'Choose how you will pay';
  end if;

  select * into biz from public.business_profiles
  where id = p_business and business_type = 'food_vendor' and is_active;
  if not found then
    raise exception 'This kitchen is not taking orders';
  end if;
  if biz.campus_id is null then
    raise exception 'This kitchen is not linked to a campus yet';
  end if;
  if not public.business_open_now(p_business) then
    raise exception 'This kitchen is closed right now';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty';
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception 'Too many different items in one order';
  end if;

  if (
    select count(*) from public.food_orders
    where student_id = me and business_id = p_business and status in ('placed', 'accepted', 'preparing')
  ) >= 3 then
    raise exception 'You already have 3 open orders with this kitchen';
  end if;

  if p_payment_method = 'wallet' and not public.setting_bool('wallet_enabled', true) then
    raise exception 'The wallet is not available right now';
  end if;

  if p_payment_method = 'card' then
    select exists (
      select 1 from public.business_payment_methods m
      where m.business_id = p_business and m.is_verified and m.paystack_subaccount_code is not null
    ) into has_card_account;
    if not has_card_account then
      raise exception 'This kitchen does not take card payments yet';
    end if;
  end if;

  -- Price every line from the menu (and any live special) before the order exists.
  for line in select * from jsonb_array_elements(p_items) loop
    qty := greatest(1, least(20, coalesce((line->>'quantity')::integer, 1)));
    select * into item from public.menu_items
    where id = (line->>'menu_item_id')::uuid
      and business_id = p_business
      and is_published
      and coalesce(in_stock, true);
    if not found then
      raise exception 'An item in your cart is no longer available';
    end if;

    unit_price := coalesce(item.price, 0);
    select * into special from public.promotions
    where business_id = p_business and kind = 'special' and menu_item_id = item.id
      and is_active and starts_at <= now() and ends_at > now()
    order by special_price asc limit 1;
    if found then
      unit_price := least(unit_price, special.special_price);
    end if;

    opts := '[]'::jsonb;
    for grp in select * from public.menu_option_groups where menu_item_id = item.id order by sort_order loop
      picked := 0;
      for opt_id in select jsonb_array_elements_text(coalesce(line->'option_ids', '[]'::jsonb)) loop
        select * into opt from public.menu_options where id = opt_id::uuid and group_id = grp.id;
        if found then
          if not opt.in_stock then
            raise exception '% is sold out', opt.name;
          end if;
          picked := picked + 1;
          unit_price := unit_price + opt.price_delta;
          opts := opts || jsonb_build_array(jsonb_build_object('group', grp.name, 'name', opt.name, 'price', opt.price_delta));
        end if;
      end loop;
      if grp.required and picked = 0 then
        raise exception 'Choose a % option for %', lower(grp.name), item.name;
      end if;
      if not grp.multi and picked > 1 then
        raise exception 'Pick only one % option for %', lower(grp.name), item.name;
      end if;
    end loop;

    sub := sub + unit_price * qty;
    lines := lines + 1;
    priced := priced || jsonb_build_array(jsonb_build_object(
      'menu_item_id', item.id, 'name', item.name, 'unit_price', unit_price, 'quantity', qty, 'options', opts
    ));
  end loop;

  if p_fulfilment = 'delivery' then
    if coalesce(trim(p_address), '') = '' then
      raise exception 'Add a delivery address';
    end if;
    select * into quote from public.delivery_quote(p_business, p_lat, p_lng);
    if not quote.deliverable then
      raise exception '%', quote.reason;
    end if;
    if sub < quote.min_order then
      raise exception 'Minimum order for delivery is ₦%', quote.min_order;
    end if;
    fee := quote.fee;
  end if;

  if coalesce(trim(p_promo_code), '') <> '' then
    select * into promo from public.promotions
    where business_id = p_business and kind = 'discount_code' and lower(code) = lower(trim(p_promo_code))
      and is_active and starts_at <= now() and ends_at > now()
      and (max_uses is null or used_count < max_uses)
    for update;
    if not found then
      raise exception 'That code is not valid';
    end if;
    disc := least(sub, coalesce(round(sub * promo.percent_off / 100.0), 0) + coalesce(promo.amount_off, 0));
    update public.promotions set used_count = used_count + 1 where id = promo.id;
  end if;

  insert into public.food_orders (
    business_id, campus_id, student_id, status, subtotal, packaging_fee, total, notes,
    fulfilment, delivery_fee, delivery_address, delivery_lat, delivery_lng, discount, promo_code,
    payment_method, payment_status, commission
  )
  values (
    p_business, biz.campus_id, me, 'placed', sub, 0, sub - disc + fee, nullif(trim(p_notes), ''),
    p_fulfilment, fee, case when p_fulfilment = 'delivery' then trim(p_address) end,
    case when p_fulfilment = 'delivery' then p_lat end, case when p_fulfilment = 'delivery' then p_lng end,
    disc, case when disc > 0 then upper(trim(p_promo_code)) end,
    p_payment_method, case when p_payment_method = 'card' then 'pending' else 'unpaid' end,
    round((sub - disc) * public.setting_num('food_commission_pct', 3) / 100, 2)
  )
  returning * into ord;

  if p_payment_method = 'wallet' then
    perform public.wallet_apply(me, -ord.total, 'spend', 'food_order', 'food_order', ord.id, 'ord_spend_' || ord.id, 'Order at ' || biz.display_name);
    update public.food_orders set payment_status = 'paid', paid_at = now() where id = ord.id returning * into ord;
  end if;

  insert into public.food_order_items (order_id, menu_item_id, name, unit_price, quantity, options)
  select ord.id, (x->>'menu_item_id')::uuid, x->>'name', (x->>'unit_price')::numeric, (x->>'quantity')::integer, x->'options'
  from jsonb_array_elements(priced) x;

  perform public.notify_business_team(
    p_business,
    case when p_fulfilment = 'delivery' then 'New delivery order' else 'New order' end,
    lines::text || ' item' || case when lines = 1 then '' else 's' end || ' · ₦' || ord.total::text,
    '/listings/orders'
  );
  return ord;
end;
$$;

grant execute on function public.place_food_order(uuid, jsonb, text, text, text, double precision, double precision, text, text) to authenticated;
revoke execute on function public.place_food_order(uuid, jsonb, text, text, text, double precision, double precision, text, text) from public, anon;

-- Money events when an order ends: refund wallet payments, queue card refunds, credit kitchens.
create or replace function public.food_order_money_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_status <> 'paid' then
    return new;
  end if;

  if new.status in ('declined', 'cancelled') and old.status not in ('declined', 'cancelled') then
    if new.payment_method = 'wallet' then
      perform public.wallet_apply(new.student_id, new.total, 'refund', 'food_order', 'food_order', new.id, 'ord_refund_' || new.id, 'Order ' || new.status);
      update public.food_orders set payment_status = 'refunded' where id = new.id;
      perform public.notify_user(new.student_id, 'Refunded to your wallet', '₦' || new.total::text || ' is back in your wallet.', '/wallet');
    elsif new.payment_method = 'card' then
      insert into public.refunds (order_id, business_id, student_id, amount, reason, status, decided_at)
      values (new.id, new.business_id, new.student_id, new.total, 'Order ' || new.status, 'approved', now())
      on conflict do nothing;
      update public.food_orders set payment_status = 'refund_requested' where id = new.id;
    end if;
  elsif new.status in ('collected', 'completed') and old.status not in ('collected', 'completed') and new.payment_method = 'wallet' then
    insert into public.business_entries (business_id, kind, amount, order_id, reference, note)
    values
      (new.business_id, 'sale', new.total, new.id, 'ord_sale_' || new.id, 'Order sale'),
      (new.business_id, 'commission', -new.commission, new.id, 'ord_comm_' || new.id, 'CampusOS commission')
    on conflict (reference) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists food_order_money_events on public.food_orders;
create trigger food_order_money_events after update of status on public.food_orders
  for each row when (old.status is distinct from new.status)
  execute function public.food_order_money_events();

revoke execute on function public.food_order_money_events() from public, anon, authenticated;

-- Refund decisions: wallet orders are refunded instantly; card refunds are issued by the payments function.
create or replace function public.decide_refund(p_refund uuid, p_approve boolean)
returns public.refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.refunds;
  o public.food_orders;
  share numeric;
begin
  select * into r from public.refunds where id = p_refund and status = 'requested';
  if not found then
    raise exception 'Refund request not found';
  end if;
  if not exists (select 1 from public.business_profiles b where b.id = r.business_id and b.owner_user_id = auth.uid())
     and not public.is_staff() then
    raise exception 'Only the owner can decide refunds';
  end if;
  select * into o from public.food_orders where id = r.order_id;

  update public.refunds
  set status = case when p_approve then 'approved' else 'rejected' end,
      decided_by = auth.uid(), decided_at = now()
  where id = r.id
  returning * into r;

  if not p_approve then
    update public.food_orders set payment_status = 'paid' where id = r.order_id;
    if o.payment_method = 'wallet' and o.status in ('collected', 'completed') then
      insert into public.business_entries (business_id, kind, amount, order_id, reference, note)
      values
        (o.business_id, 'sale', o.total, o.id, 'ord_sale_' || o.id, 'Order sale'),
        (o.business_id, 'commission', -o.commission, o.id, 'ord_comm_' || o.id, 'CampusOS commission')
      on conflict (reference) do nothing;
    end if;
  elsif o.payment_method = 'wallet' then
    perform public.wallet_apply(r.student_id, r.amount, 'refund', 'food_order', 'food_order', o.id, 'refund_' || r.id, 'Refund approved');
    if exists (select 1 from public.business_entries where reference = 'ord_sale_' || o.id) then
      share := case when o.total > 0 then o.commission * r.amount / o.total else 0 end;
      insert into public.business_entries (business_id, kind, amount, order_id, reference, note)
      values (o.business_id, 'refund', -r.amount, o.id, 'refund_' || r.id, 'Refund to student');
      if share > 0 then
        insert into public.business_entries (business_id, kind, amount, order_id, reference, note)
        values (o.business_id, 'commission', round(share, 2), o.id, 'refund_comm_' || r.id, 'Commission returned');
      end if;
    end if;
    update public.refunds set status = 'processed' where id = r.id returning * into r;
    update public.food_orders set payment_status = 'refunded' where id = o.id;
  end if;

  perform public.notify_user(
    r.student_id,
    case when p_approve then 'Refund approved' else 'Refund declined' end,
    case
      when not p_approve then 'The kitchen declined your refund request.'
      when o.payment_method = 'wallet' then '₦' || r.amount::text || ' is back in your wallet.'
      else 'Your refund of ₦' || r.amount::text || ' is being processed.'
    end,
    case when p_approve and o.payment_method = 'wallet' then '/wallet' else '/orders' end
  );
  return r;
end;
$$;

-- Takes the kitchen's share back when a card order is refunded (called by the payments function).
create or replace function public.record_card_refund(p_refund uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.refunds;
  o public.food_orders;
  share numeric;
begin
  select * into r from public.refunds where id = p_refund;
  if not found then
    return;
  end if;
  select * into o from public.food_orders where id = r.order_id;
  share := case when o.total > 0 then o.commission * r.amount / o.total else 0 end;
  insert into public.business_entries (business_id, kind, amount, order_id, reference, note)
  values (r.business_id, 'card_clawback', -round(r.amount - share, 2), o.id, 'cardrefund_' || r.id, 'Card refund to student')
  on conflict (reference) do nothing;
end;
$$;

revoke all on function public.record_card_refund(uuid) from public, anon, authenticated;
grant execute on function public.record_card_refund(uuid) to service_role;
-- Hardening for the commission lock trigger function.
alter function public.food_orders_lock_commission() set search_path = public;
revoke execute on function public.food_orders_lock_commission() from public, anon, authenticated;


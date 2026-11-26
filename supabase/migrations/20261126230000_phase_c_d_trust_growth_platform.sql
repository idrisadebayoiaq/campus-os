-- CampusOS phases C and D: reviews, reply-time, boosts, insights, today overview,
-- pickup points, tenancy, reports and disputes, verification levels, school endorsements.

-- ---------------------------------------------------------------------------
-- Entity -> business mapping (analytics, reports, boosts)
-- ---------------------------------------------------------------------------

create or replace function public.business_of_entity(p_type text, p_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case p_type
    when 'business' then (select id from public.business_profiles where id = p_id)
    when 'property_unit' then public.business_of_unit(p_id)
    when 'unit' then public.business_of_unit(p_id)
    when 'marketplace_listing' then (select business_id from public.marketplace_listings where id = p_id)
    when 'listing' then (select business_id from public.marketplace_listings where id = p_id)
    when 'menu_item' then (select business_id from public.menu_items where id = p_id)
    when 'food_order' then (select business_id from public.food_orders where id = p_id)
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- Ratings and reviews (verified: only after a real order, viewing or resolved enquiry)
-- ---------------------------------------------------------------------------

create table if not exists public.business_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  food_order_id uuid references public.food_orders(id) on delete set null,
  inspection_request_id uuid references public.inspection_requests(id) on delete set null,
  enquiry_id uuid references public.listing_enquiries(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 800),
  business_reply text check (business_reply is null or char_length(business_reply) <= 800),
  replied_at timestamptz,
  replied_by uuid references auth.users(id) on delete set null,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (student_id, food_order_id),
  unique (student_id, inspection_request_id),
  unique (student_id, enquiry_id),
  check (num_nonnulls(food_order_id, inspection_request_id, enquiry_id) = 1)
);

create index if not exists business_reviews_business_idx on public.business_reviews (business_id, created_at desc);

alter table public.business_reviews enable row level security;

drop policy if exists "Read visible reviews" on public.business_reviews;
create policy "Read visible reviews" on public.business_reviews for select
  using (
    not is_hidden
    or student_id = auth.uid()
    or public.can_operate_business(business_id)
    or public.is_staff()
  );

drop policy if exists "Staff moderate reviews" on public.business_reviews;
create policy "Staff moderate reviews" on public.business_reviews for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

grant select on public.business_reviews to anon, authenticated;
grant update (is_hidden) on public.business_reviews to authenticated;

create or replace function public.submit_review(
  p_business uuid,
  p_rating integer,
  p_comment text default null,
  p_order uuid default null,
  p_inspection uuid default null,
  p_enquiry uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
begin
  if uid is null then raise exception 'Sign in to leave a review'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'Choose a rating from 1 to 5'; end if;
  if num_nonnulls(p_order, p_inspection, p_enquiry) <> 1 then
    raise exception 'A review must be linked to an order, viewing or enquiry';
  end if;

  if p_order is not null then
    if not exists (
      select 1 from public.food_orders o
      where o.id = p_order and o.student_id = uid and o.business_id = p_business
        and o.status in ('completed', 'collected')
    ) then raise exception 'You can review a kitchen after you have received an order'; end if;
  elsif p_inspection is not null then
    if not exists (
      select 1 from public.inspection_requests r
      where r.id = p_inspection and r.student_id = uid
        and public.business_of_unit(r.unit_id) = p_business
        and (r.status = 'completed' or (r.status = 'accepted' and r.preferred_at is not null and r.preferred_at < now()))
    ) then raise exception 'You can review after you have viewed the room'; end if;
  else
    if not exists (
      select 1 from public.listing_enquiries e
      where e.id = p_enquiry and e.student_id = uid and e.business_id = p_business and e.status = 'resolved'
    ) then raise exception 'You can review once your enquiry has been answered and resolved'; end if;
  end if;

  begin
    insert into public.business_reviews (business_id, student_id, food_order_id, inspection_request_id, enquiry_id, rating, comment)
    values (p_business, uid, p_order, p_inspection, p_enquiry, p_rating, nullif(trim(p_comment), ''))
    returning id into new_id;
  exception when unique_violation then
    raise exception 'You have already reviewed this';
  end;

  perform public.notify_business_team(
    p_business,
    'New ' || p_rating || '-star review',
    coalesce(nullif(trim(p_comment), ''), 'A student rated you ' || p_rating || ' out of 5'),
    '/reviews'
  );
  return new_id;
end;
$$;

create or replace function public.reply_to_review(p_review uuid, p_reply text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  biz uuid;
  who uuid;
begin
  select business_id, student_id into biz, who from public.business_reviews where id = p_review;
  if biz is null or not public.can_operate_business(biz) then raise exception 'Not allowed'; end if;
  update public.business_reviews
    set business_reply = nullif(trim(p_reply), ''), replied_at = case when nullif(trim(p_reply), '') is null then null else now() end, replied_by = auth.uid()
    where id = p_review;
  if nullif(trim(p_reply), '') is not null then
    perform public.notify_user(who, 'A business replied to your review', left(trim(p_reply), 120), null);
  end if;
end;
$$;

create or replace function public.business_rating_stats(p_ids uuid[])
returns table (business_id uuid, avg_rating numeric, review_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select r.business_id, round(avg(r.rating)::numeric, 1), count(*)::integer
  from public.business_reviews r
  where r.business_id = any(p_ids) and not r.is_hidden
  group by r.business_id;
$$;

-- Reviews a student may still write: completed orders, viewed rooms and resolved enquiries.
create or replace function public.my_reviewable()
returns table (kind text, ref_id uuid, business_id uuid, business_name text, label text, happened_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select 'order', o.id, o.business_id, b.display_name, 'Order of ' || to_char(o.created_at, 'DD Mon'), o.created_at
  from public.food_orders o join public.business_profiles b on b.id = o.business_id
  where o.student_id = auth.uid() and o.status in ('completed', 'collected')
    and not exists (select 1 from public.business_reviews r where r.food_order_id = o.id and r.student_id = o.student_id)
  union all
  select 'inspection', i.id, b.id, b.display_name, 'Viewing of ' || u.title, coalesce(i.preferred_at, i.created_at)
  from public.inspection_requests i
  join public.property_units u on u.id = i.unit_id
  join public.properties p on p.id = u.property_id
  join public.business_profiles b on b.id = p.business_id
  where i.student_id = auth.uid()
    and (i.status = 'completed' or (i.status = 'accepted' and i.preferred_at < now()))
    and not exists (select 1 from public.business_reviews r where r.inspection_request_id = i.id and r.student_id = i.student_id)
  union all
  select 'enquiry', e.id, e.business_id, b.display_name, coalesce(e.subject, 'Enquiry'), e.created_at
  from public.listing_enquiries e join public.business_profiles b on b.id = e.business_id
  where e.student_id = auth.uid() and e.status = 'resolved'
    and not exists (select 1 from public.business_reviews r where r.enquiry_id = e.id and r.student_id = e.student_id)
  order by 6 desc;
$$;

-- ---------------------------------------------------------------------------
-- Reply-time badge: median minutes to first answer over the last 60 days
-- ---------------------------------------------------------------------------

create or replace function public.business_reply_stats(p_ids uuid[])
returns table (business_id uuid, median_minutes numeric, sample integer)
language sql
stable
security definer
set search_path = public
as $$
  with conv as (
    select c.id, c.business_id, c.created_by
    from public.conversations c
    where c.business_id = any(p_ids) and c.created_at > now() - interval '60 days'
      and c.created_by is not null and c.kind in ('listing', 'order')
  ),
  timings as (
    select conv.business_id,
           first_q.t as t0,
           (
             select min(m.created_at) from public.messages m
             where m.conversation_id = conv.id and m.sender_id is not null and m.sender_id <> conv.created_by
               and m.message_type <> 'system' and m.created_at > first_q.t and m.deleted_at is null
           ) as t1
    from conv
    cross join lateral (
      select min(m.created_at) as t
      from public.messages m
      where m.conversation_id = conv.id and m.sender_id = conv.created_by and m.deleted_at is null
    ) first_q
    where first_q.t is not null
  )
  select t.business_id,
         round((percentile_cont(0.5) within group (order by extract(epoch from (t.t1 - t.t0)) / 60))::numeric, 0),
         count(*)::integer
  from timings t
  where t.t1 is not null
  group by t.business_id;
$$;

-- ---------------------------------------------------------------------------
-- Featured listings (boosts)
-- ---------------------------------------------------------------------------

create table if not exists public.boost_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  days integer not null check (days > 0),
  price numeric not null check (price >= 0),
  sort_order integer not null default 0,
  is_active boolean not null default true
);

insert into public.boost_plans (name, days, price, sort_order)
select * from (values ('3 days', 3, 1500::numeric, 1), ('7 days', 7, 3000::numeric, 2), ('14 days', 14, 5000::numeric, 3)) v(name, days, price, sort_order)
where not exists (select 1 from public.boost_plans);

alter table public.boost_plans enable row level security;
drop policy if exists "Read boost plans" on public.boost_plans;
create policy "Read boost plans" on public.boost_plans for select using (true);
drop policy if exists "Staff manage boost plans" on public.boost_plans;
create policy "Staff manage boost plans" on public.boost_plans for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
grant select on public.boost_plans to anon, authenticated;
grant insert, update, delete on public.boost_plans to authenticated;

create table if not exists public.listing_boosts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  entity_type text not null check (entity_type in ('business', 'property_unit', 'marketplace_listing')),
  entity_id uuid not null,
  plan_id uuid references public.boost_plans(id) on delete set null,
  days integer not null check (days > 0),
  amount numeric not null default 0,
  status text not null default 'pending' check (status in ('pending', 'active', 'expired', 'cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  payment_reference text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists listing_boosts_live_idx on public.listing_boosts (status, ends_at);
create index if not exists listing_boosts_entity_idx on public.listing_boosts (entity_type, entity_id);

alter table public.listing_boosts enable row level security;
drop policy if exists "Read boosts" on public.listing_boosts;
create policy "Read boosts" on public.listing_boosts for select
  using ((status = 'active' and ends_at > now()) or public.can_operate_business(business_id) or public.is_staff());
grant select on public.listing_boosts to anon, authenticated;

create or replace function public.request_boost(p_business uuid, p_entity_type text, p_entity_id uuid, p_plan uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  plan public.boost_plans;
  new_id uuid;
begin
  if not public.can_manage_business(p_business) then raise exception 'Not allowed'; end if;
  select * into plan from public.boost_plans where id = p_plan and is_active;
  if plan.id is null then raise exception 'Choose a boost plan'; end if;
  if public.business_of_entity(p_entity_type, p_entity_id) is distinct from p_business then
    raise exception 'That listing does not belong to this business';
  end if;
  if p_entity_type not in ('business', 'property_unit', 'marketplace_listing') then raise exception 'That cannot be featured'; end if;
  if exists (
    select 1 from public.listing_boosts b
    where b.entity_type = p_entity_type and b.entity_id = p_entity_id and b.status = 'active' and b.ends_at > now()
  ) then raise exception 'This is already featured'; end if;

  insert into public.listing_boosts (business_id, entity_type, entity_id, plan_id, days, amount, created_by)
  values (p_business, p_entity_type, p_entity_id, plan.id, plan.days, plan.price, auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;

-- Payment webhook (service role) and platform staff turn a pending boost on.
create or replace function public.activate_boost(p_boost uuid, p_reference text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.listing_boosts;
begin
  select * into b from public.listing_boosts where id = p_boost for update;
  if b.id is null or b.status <> 'pending' then return; end if;
  update public.listing_boosts
    set status = 'active', starts_at = now(), ends_at = now() + make_interval(days => b.days),
        payment_reference = coalesce(p_reference, payment_reference)
    where id = p_boost;
  perform public.notify_business_team(b.business_id, 'Your listing is now featured', 'It will be pinned for ' || b.days || ' days.', '/boosts');
end;
$$;

create or replace function public.staff_activate_boost(p_boost uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  perform public.activate_boost(p_boost, 'staff');
end;
$$;

create or replace function public.cancel_boost(p_boost uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  biz uuid;
begin
  select business_id into biz from public.listing_boosts where id = p_boost and status = 'pending';
  if biz is null then raise exception 'Only unpaid boosts can be cancelled'; end if;
  if not (public.can_manage_business(biz) or public.is_staff()) then raise exception 'Not allowed'; end if;
  update public.listing_boosts set status = 'cancelled' where id = p_boost;
end;
$$;

create or replace function public.expire_boosts()
returns void
language sql
security definer
set search_path = public
as $$
  update public.listing_boosts set status = 'expired' where status = 'active' and ends_at <= now();
$$;

-- ---------------------------------------------------------------------------
-- Analytics events -> business, insights and today overview
-- ---------------------------------------------------------------------------

alter table public.analytics_events add column if not exists business_id uuid references public.business_profiles(id) on delete set null;
create index if not exists analytics_events_business_idx on public.analytics_events (business_id, event_name, created_at desc);

create or replace function public.analytics_set_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.business_id is null and new.entity_type is not null and new.entity_id is not null then
    new.business_id := public.business_of_entity(new.entity_type, new.entity_id);
  end if;
  return new;
end;
$$;

drop trigger if exists analytics_events_set_business on public.analytics_events;
create trigger analytics_events_set_business
  before insert on public.analytics_events
  for each row execute function public.analytics_set_business();

create or replace function public.business_insights(p_business uuid, p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 180)));
  result jsonb;
begin
  if not public.can_manage_business(p_business) then raise exception 'Not allowed'; end if;

  select jsonb_build_object(
    'days', greatest(1, least(p_days, 180)),
    'views', (select count(*) from public.analytics_events e where e.business_id = p_business and e.event_name = 'view' and e.created_at >= since),
    'saves', (select count(*) from public.saved_units s join public.property_units u on u.id = s.unit_id
              where public.business_of_unit(u.id) = p_business and s.created_at >= since),
    'chats', (select count(*) from public.conversations c where c.business_id = p_business and c.created_at >= since),
    'enquiries', (select count(*) from public.listing_enquiries q where q.business_id = p_business and q.created_at >= since),
    'viewings', (select count(*) from public.inspection_requests r where public.business_of_unit(r.unit_id) = p_business and r.created_at >= since),
    'orders', (select count(*) from public.food_orders o where o.business_id = p_business and o.created_at >= since
               and o.status not in ('declined', 'cancelled', 'payment_failed', 'expired')),
    'revenue', coalesce((select sum(o.total) from public.food_orders o where o.business_id = p_business and o.created_at >= since
               and o.status in ('completed', 'collected')), 0),
    'rating', (select jsonb_build_object('avg', round(avg(rating)::numeric, 1), 'count', count(*)) from public.business_reviews where business_id = p_business and not is_hidden),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date,
        'views', (select count(*) from public.analytics_events e where e.business_id = p_business and e.event_name = 'view' and (e.created_at at time zone 'Africa/Lagos')::date = d::date),
        'orders', (select count(*) from public.food_orders o where o.business_id = p_business and (o.created_at at time zone 'Africa/Lagos')::date = d::date
                   and o.status not in ('declined', 'cancelled', 'payment_failed', 'expired'))
      ) order by d)
      from generate_series((since at time zone 'Africa/Lagos')::date, (now() at time zone 'Africa/Lagos')::date, interval '1 day') d
    ), '[]'::jsonb),
    'top_items', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object('name', i.name, 'quantity', sum(i.quantity), 'revenue', sum(i.quantity * i.unit_price)) x
        from public.food_order_items i join public.food_orders o on o.id = i.order_id
        where o.business_id = p_business and o.created_at >= since and o.status not in ('declined', 'cancelled', 'payment_failed', 'expired')
        group by i.name order by sum(i.quantity) desc limit 5
      ) t
    ), '[]'::jsonb),
    'peak_hours', coalesce((
      select jsonb_agg(jsonb_build_object('hour', h, 'orders', c) order by h)
      from (
        select extract(hour from (o.created_at at time zone 'Africa/Lagos'))::int h, count(*) c
        from public.food_orders o
        where o.business_id = p_business and o.created_at >= since and o.status not in ('declined', 'cancelled', 'payment_failed', 'expired')
        group by 1
      ) t
    ), '[]'::jsonb),
    'top_listings', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object('entity_type', e.entity_type, 'entity_id', e.entity_id, 'views', count(*),
          'title', coalesce(
            (select u.title from public.property_units u where u.id = e.entity_id and e.entity_type = 'property_unit'),
            (select l.title from public.marketplace_listings l where l.id = e.entity_id and e.entity_type = 'marketplace_listing'),
            (select b.display_name from public.business_profiles b where b.id = e.entity_id and e.entity_type = 'business'),
            'Listing')) x
        from public.analytics_events e
        where e.business_id = p_business and e.event_name = 'view' and e.created_at >= since and e.entity_id is not null
        group by e.entity_type, e.entity_id order by count(*) desc limit 5
      ) t
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.business_today(p_business uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  day_start timestamptz := date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos';
begin
  if not public.can_operate_business(p_business) then raise exception 'Not allowed'; end if;
  return jsonb_build_object(
    'orders_today', (select count(*) from public.food_orders o where o.business_id = p_business and o.created_at >= day_start
                     and o.status not in ('declined', 'cancelled', 'payment_failed', 'expired')),
    'revenue_today', coalesce((select sum(o.total) from public.food_orders o where o.business_id = p_business and o.created_at >= day_start
                     and o.status in ('completed', 'collected')), 0),
    'new_orders', (select count(*) from public.food_orders o where o.business_id = p_business and o.status = 'placed'),
    'in_kitchen', (select count(*) from public.food_orders o where o.business_id = p_business and o.status in ('accepted', 'preparing')),
    'open_enquiries', (select count(*) from public.listing_enquiries q where q.business_id = p_business and q.status = 'open'),
    'viewings_pending', (select count(*) from public.inspection_requests r where public.business_of_unit(r.unit_id) = p_business and r.status = 'requested'),
    'viewings_today', (select count(*) from public.inspection_requests r where public.business_of_unit(r.unit_id) = p_business and r.status = 'accepted'
                       and r.preferred_at >= day_start and r.preferred_at < day_start + interval '1 day'),
    'rent_due_soon', (select count(*) from public.tenancies t where t.business_id = p_business and t.status = 'active' and t.next_due_on <= current_date + 7),
    'open_reports', (select count(*) from public.reports r where r.business_id = p_business and r.status in ('open', 'reviewing') and r.business_response is null),
    'rating', (select jsonb_build_object('avg', round(avg(rating)::numeric, 1), 'count', count(*)) from public.business_reviews where business_id = p_business and not is_hidden)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Campus pickup points
-- ---------------------------------------------------------------------------

create table if not exists public.pickup_points (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  lat double precision,
  lng double precision,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (campus_id, name)
);

alter table public.pickup_points enable row level security;
drop policy if exists "Read pickup points" on public.pickup_points;
create policy "Read pickup points" on public.pickup_points for select using (is_active or public.is_staff());
drop policy if exists "Staff and schools manage pickup points" on public.pickup_points;
create policy "Staff and schools manage pickup points" on public.pickup_points for all to authenticated
  using (
    public.is_staff() or exists (
      select 1 from public.campuses c where c.id = campus_id and public.is_school_admin_for(c.institution_id)
    )
  )
  with check (
    public.is_staff() or exists (
      select 1 from public.campuses c where c.id = campus_id and public.is_school_admin_for(c.institution_id)
    )
  );
grant select on public.pickup_points to anon, authenticated;
grant insert, update, delete on public.pickup_points to authenticated;

insert into public.pickup_points (campus_id, name)
select c.id, n.name
from public.campuses c
cross join (values ('Main gate'), ('Library entrance'), ('Student union building'), ('Cafeteria')) n(name)
on conflict do nothing;

alter table public.marketplace_listings
  add column if not exists pickup_point_id uuid references public.pickup_points(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Tenancy and move-in
-- ---------------------------------------------------------------------------

create table if not exists public.tenancies (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.property_units(id) on delete cascade,
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  start_date date not null default current_date,
  end_date date,
  rent_amount numeric not null check (rent_amount >= 0),
  rent_period text not null default 'year',
  next_due_on date,
  status text not null default 'active' check (status in ('upcoming', 'active', 'ended', 'cancelled')),
  checklist jsonb not null default '[]'::jsonb,
  notes text,
  reminded_for date,
  created_at timestamptz not null default now()
);

create unique index if not exists tenancies_one_active_per_unit on public.tenancies (unit_id) where status in ('upcoming', 'active');
create index if not exists tenancies_student_idx on public.tenancies (student_id);
create index if not exists tenancies_business_idx on public.tenancies (business_id, status);

create table if not exists public.rent_receipts (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies(id) on delete cascade,
  amount numeric not null check (amount > 0),
  paid_on date not null default current_date,
  method text,
  note text,
  receipt_no text not null default ('R-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8))),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists rent_receipts_tenancy_idx on public.rent_receipts (tenancy_id, paid_on desc);

alter table public.tenancies enable row level security;
alter table public.rent_receipts enable row level security;

drop policy if exists "Parties read tenancies" on public.tenancies;
create policy "Parties read tenancies" on public.tenancies for select to authenticated
  using (student_id = auth.uid() or public.can_operate_business(business_id));

drop policy if exists "Parties read receipts" on public.rent_receipts;
create policy "Parties read receipts" on public.rent_receipts for select to authenticated
  using (exists (
    select 1 from public.tenancies t
    where t.id = tenancy_id and (t.student_id = auth.uid() or public.can_operate_business(t.business_id))
  ));

grant select on public.tenancies, public.rent_receipts to authenticated;

create or replace function public.add_months_for(p_from date, p_period text)
returns date
language sql
immutable
as $$
  select (p_from + case
    when lower(p_period) like '%month%' then interval '1 month'
    when lower(p_period) like '%quarter%' then interval '3 months'
    when lower(p_period) like '%term%' or lower(p_period) like '%semester%' then interval '4 months'
    else interval '1 year' end)::date;
$$;

create or replace function public.create_tenancy(
  p_unit uuid,
  p_email text,
  p_start date,
  p_end date,
  p_rent numeric,
  p_period text default 'year',
  p_next_due date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  biz uuid := public.business_of_unit(p_unit);
  student uuid;
  new_id uuid;
  unit_title text;
begin
  if biz is null or not public.can_manage_business(biz) then raise exception 'Not allowed'; end if;
  select id into student from auth.users where lower(email) = lower(trim(p_email));
  if student is null then raise exception 'No CampusOS account uses that email. Ask the student to sign up first.'; end if;
  if student = (select owner_user_id from public.business_profiles where id = biz) then raise exception 'You cannot rent to yourself'; end if;

  begin
    insert into public.tenancies (unit_id, business_id, student_id, start_date, end_date, rent_amount, rent_period, next_due_on, status, checklist)
    values (
      p_unit, biz, student, coalesce(p_start, current_date), p_end, p_rent, coalesce(p_period, 'year'),
      coalesce(p_next_due, public.add_months_for(coalesce(p_start, current_date), coalesce(p_period, 'year'))),
      case when coalesce(p_start, current_date) > current_date then 'upcoming' else 'active' end,
      jsonb_build_array(
        jsonb_build_object('label', 'Inspect the room and note any damage', 'done', false),
        jsonb_build_object('label', 'Photograph the room condition', 'done', false),
        jsonb_build_object('label', 'Record the meter readings', 'done', false),
        jsonb_build_object('label', 'Collect your keys', 'done', false),
        jsonb_build_object('label', 'Sign the tenancy agreement', 'done', false)
      )
    ) returning id into new_id;
  exception when unique_violation then
    raise exception 'This room already has a tenant. End that tenancy first.';
  end;

  update public.property_units set status = 'occupied' where id = p_unit;
  select title into unit_title from public.property_units where id = p_unit;
  perform public.notify_user(student, 'Your room is ready on CampusOS', 'Your move-in checklist and rent receipts for ' || coalesce(unit_title, 'your room') || ' are in My room.', '/my-room');
  return new_id;
end;
$$;

create or replace function public.end_tenancy(p_tenancy uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tenancies;
begin
  select * into t from public.tenancies where id = p_tenancy;
  if t.id is null or not public.can_manage_business(t.business_id) then raise exception 'Not allowed'; end if;
  update public.tenancies set status = 'ended', end_date = coalesce(end_date, current_date) where id = p_tenancy;
  update public.property_units set status = 'available' where id = t.unit_id and status = 'occupied';
  perform public.notify_user(t.student_id, 'Your tenancy has ended', 'Thanks for staying. You can leave a review for your provider.', '/my-room');
end;
$$;

create or replace function public.record_rent_payment(p_tenancy uuid, p_amount numeric, p_method text default null, p_note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tenancies;
  receipt text;
begin
  select * into t from public.tenancies where id = p_tenancy;
  if t.id is null or not public.can_manage_business(t.business_id) then raise exception 'Not allowed'; end if;
  if t.status not in ('active', 'upcoming') then raise exception 'This tenancy is not active'; end if;
  insert into public.rent_receipts (tenancy_id, amount, method, note, created_by)
  values (p_tenancy, p_amount, nullif(trim(p_method), ''), nullif(trim(p_note), ''), auth.uid())
  returning receipt_no into receipt;
  update public.tenancies
    set next_due_on = public.add_months_for(coalesce(next_due_on, current_date), rent_period), status = 'active', reminded_for = null
    where id = p_tenancy;
  perform public.notify_user(t.student_id, 'Rent payment recorded', 'Receipt ' || receipt || ' for N' || p_amount::bigint || '.', '/my-room');
  return receipt;
end;
$$;

create or replace function public.set_tenancy_checklist(p_tenancy uuid, p_checklist jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tenancies;
begin
  select * into t from public.tenancies where id = p_tenancy;
  if t.id is null or not (t.student_id = auth.uid() or public.can_operate_business(t.business_id)) then raise exception 'Not allowed'; end if;
  if jsonb_typeof(p_checklist) <> 'array' or jsonb_array_length(p_checklist) > 20 then raise exception 'Invalid checklist'; end if;
  update public.tenancies set checklist = p_checklist where id = p_tenancy;
end;
$$;

create or replace function public.send_rent_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  sent integer := 0;
  days_left integer;
begin
  for t in
    select x.*, u.title as unit_title
    from public.tenancies x join public.property_units u on u.id = x.unit_id
    where x.status = 'active' and x.next_due_on is not null
      and x.next_due_on <= current_date + 7
      and (x.reminded_for is distinct from x.next_due_on or x.next_due_on <= current_date)
  loop
    days_left := t.next_due_on - current_date;
    if t.reminded_for = t.next_due_on and days_left > 0 then continue; end if;
    perform public.notify_user(
      t.student_id,
      case when days_left < 0 then 'Your rent is overdue' when days_left = 0 then 'Rent is due today' else 'Rent due in ' || days_left || ' day(s)' end,
      'Rent of N' || t.rent_amount::bigint || ' for ' || coalesce(t.unit_title, 'your room') || ' is due on ' || to_char(t.next_due_on, 'DD Mon YYYY') || '.',
      '/my-room'
    );
    if days_left <= 0 then
      perform public.notify_business_team(t.business_id, 'Rent due', coalesce(t.unit_title, 'A room') || ' rent is due ' || to_char(t.next_due_on, 'DD Mon') || '.', '/tenancies');
    end if;
    update public.tenancies set reminded_for = t.next_due_on where id = t.id;
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports and disputes
-- ---------------------------------------------------------------------------

alter table public.reports
  add column if not exists business_id uuid references public.business_profiles(id) on delete set null,
  add column if not exists evidence_urls text[] not null default '{}',
  add column if not exists business_response text,
  add column if not exists business_responded_at timestamptz,
  add column if not exists resolution text,
  add column if not exists resolved_by uuid references auth.users(id) on delete set null,
  add column if not exists resolved_at timestamptz;

create index if not exists reports_business_idx on public.reports (business_id, status);

create or replace function public.report_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.business_id := coalesce(new.business_id, public.business_of_entity(new.entity_type, new.entity_id));
  if coalesce(array_length(new.evidence_urls, 1), 0) > 4 then
    raise exception 'Attach at most 4 photos';
  end if;
  return new;
end;
$$;

drop trigger if exists reports_before_insert on public.reports;
create trigger reports_before_insert
  before insert on public.reports
  for each row execute function public.report_before_insert();

create or replace function public.report_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.business_id is not null then
    perform public.notify_business_team(new.business_id, 'A student reported one of your listings', left(new.reason, 120) || ' You can respond in Reports.', '/reviews?tab=reports');
  end if;
  return new;
end;
$$;

drop trigger if exists reports_after_insert on public.reports;
create trigger reports_after_insert
  after insert on public.reports
  for each row execute function public.report_after_insert();

-- Businesses never see who reported them.
create or replace function public.business_reports(p_business uuid)
returns table (id uuid, entity_type text, entity_id uuid, reason text, details text, evidence_urls text[], status text,
               business_response text, business_responded_at timestamptz, resolution text, resolved_at timestamptz, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.entity_type, r.entity_id, r.reason, r.details, r.evidence_urls, r.status,
         r.business_response, r.business_responded_at, r.resolution, r.resolved_at, r.created_at
  from public.reports r
  where r.business_id = p_business and public.can_operate_business(p_business)
  order by r.created_at desc;
$$;

create or replace function public.respond_to_report(p_report uuid, p_response text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  biz uuid;
begin
  select business_id into biz from public.reports where id = p_report;
  if biz is null or not public.can_manage_business(biz) then raise exception 'Not allowed'; end if;
  if char_length(trim(coalesce(p_response, ''))) < 3 then raise exception 'Write a response'; end if;
  update public.reports
    set business_response = left(trim(p_response), 1500), business_responded_at = now(),
        status = case when status = 'open' then 'reviewing' else status end
    where id = p_report;
end;
$$;

create or replace function public.resolve_report(p_report uuid, p_status text, p_resolution text, p_action text default 'none')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reports;
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  if p_status not in ('reviewing', 'resolved', 'dismissed') then raise exception 'Invalid status'; end if;
  select * into r from public.reports where id = p_report;
  if r.id is null then raise exception 'Report not found'; end if;

  if p_action = 'hide_listing' then
    if r.entity_type = 'property_unit' then
      update public.property_units set is_published = false where id = r.entity_id;
    elsif r.entity_type = 'marketplace_listing' then
      update public.marketplace_listings set status = 'removed' where id = r.entity_id;
    elsif r.entity_type = 'business' then
      update public.business_profiles set is_active = false where id = r.entity_id;
    end if;
  elsif p_action = 'pause_business' and r.business_id is not null then
    update public.business_profiles set is_active = false where id = r.business_id;
  end if;

  update public.reports
    set status = p_status, resolution = nullif(trim(p_resolution), ''), resolved_by = auth.uid(),
        resolved_at = case when p_status in ('resolved', 'dismissed') then now() else null end
    where id = p_report;

  if p_status in ('resolved', 'dismissed') then
    perform public.notify_user(r.reporter_id, 'Your report was reviewed', coalesce(nullif(trim(p_resolution), ''), 'Thanks for helping keep CampusOS safe.'), null);
    if r.business_id is not null then
      perform public.notify_business_team(r.business_id, 'A report about you was ' || p_status, coalesce(nullif(trim(p_resolution), ''), 'CampusOS reviewed it.'), '/reviews?tab=reports');
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Verification levels
-- ---------------------------------------------------------------------------

alter table public.business_profiles
  add column if not exists verification_level text not null default 'basic' check (verification_level in ('basic', 'identity', 'cac')),
  add column if not exists cac_verified_at timestamptz;

-- Every existing business was approved by staff after an owner ID check.
update public.business_profiles set verification_level = 'identity' where verification_level = 'basic';

create table if not exists public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  level text not null default 'cac' check (level = 'cac'),
  cac_number text not null check (char_length(cac_number) between 4 and 30),
  document_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists verification_one_pending on public.verification_requests (business_id) where status = 'pending';

alter table public.verification_requests enable row level security;
drop policy if exists "Owner and staff read verification requests" on public.verification_requests;
create policy "Owner and staff read verification requests" on public.verification_requests for select to authenticated
  using (
    public.is_staff() or exists (select 1 from public.business_profiles b where b.id = business_id and b.owner_user_id = auth.uid())
  );
drop policy if exists "Owner requests verification" on public.verification_requests;
create policy "Owner requests verification" on public.verification_requests for insert to authenticated
  with check (
    created_by = auth.uid() and status = 'pending'
    and exists (select 1 from public.business_profiles b where b.id = business_id and b.owner_user_id = auth.uid())
    and (document_path like auth.uid()::text || '/%')
  );
grant select, insert on public.verification_requests to authenticated;

create or replace function public.decide_verification(p_request uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.verification_requests;
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  select * into v from public.verification_requests where id = p_request and status = 'pending' for update;
  if v.id is null then raise exception 'Request not found'; end if;
  update public.verification_requests
    set status = case when p_approve then 'approved' else 'rejected' end, note = nullif(trim(p_note), ''), decided_by = auth.uid(), decided_at = now()
    where id = p_request;
  if p_approve then
    update public.business_profiles
      set verification_level = 'cac', cac_verified_at = now(), verification_label = 'CAC verified'
      where id = v.business_id;
  end if;
  perform public.notify_business_team(
    v.business_id,
    case when p_approve then 'Your business is now CAC verified' else 'Verification was not approved' end,
    coalesce(nullif(trim(p_note), ''), case when p_approve then 'A CAC verified badge now shows on your listings.' else 'Check the note and send your documents again.' end),
    '/billing'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- School-approved partners
-- ---------------------------------------------------------------------------

create table if not exists public.school_endorsements (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  endorsed_by uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  unique (institution_id, business_id)
);

alter table public.school_endorsements enable row level security;
drop policy if exists "Read endorsements" on public.school_endorsements;
create policy "Read endorsements" on public.school_endorsements for select using (true);
drop policy if exists "Schools endorse businesses on their campus" on public.school_endorsements;
create policy "Schools endorse businesses on their campus" on public.school_endorsements for insert to authenticated
  with check (
    public.is_school_admin_for(institution_id)
    and endorsed_by = auth.uid()
    and exists (
      select 1 from public.business_profiles b join public.campuses c on c.id = b.campus_id
      where b.id = business_id and c.institution_id = school_endorsements.institution_id
    )
  );
drop policy if exists "Schools remove endorsements" on public.school_endorsements;
create policy "Schools remove endorsements" on public.school_endorsements for delete to authenticated
  using (public.is_school_admin_for(institution_id));
grant select on public.school_endorsements to anon, authenticated;
grant insert, delete on public.school_endorsements to authenticated;

create or replace function public.endorsement_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  school text;
begin
  select coalesce(short_name, name) into school from public.institutions where id = new.institution_id;
  perform public.notify_business_team(new.business_id, 'Endorsed by ' || coalesce(school, 'a school'), 'Students at that school now see a School-approved badge on your listings.', '/billing');
  return new;
end;
$$;

drop trigger if exists school_endorsements_notify on public.school_endorsements;
create trigger school_endorsements_notify
  after insert on public.school_endorsements
  for each row execute function public.endorsement_notify();

-- Businesses endorsed by the caller's own school(s).
create or replace function public.endorsed_business_ids(p_ids uuid[] default null)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct e.business_id
  from public.school_endorsements e
  join public.campus_memberships m on m.institution_id = e.institution_id
  where m.user_id = auth.uid() and (p_ids is null or e.business_id = any(p_ids));
$$;

-- ---------------------------------------------------------------------------
-- Realtime, cron, grants
-- ---------------------------------------------------------------------------

do $$
begin
  begin alter publication supabase_realtime add table public.listing_enquiries; exception when others then null; end;
  begin alter publication supabase_realtime add table public.business_reviews; exception when others then null; end;
  begin alter publication supabase_realtime add table public.notifications; exception when others then null; end;
end $$;

select cron.unschedule(jobid) from cron.job where jobname in ('campusos-rent-reminders', 'campusos-expire-boosts');
select cron.schedule('campusos-rent-reminders', '0 7 * * *', 'select public.send_rent_reminders()');
select cron.schedule('campusos-expire-boosts', '5 * * * *', 'select public.expire_boosts()');

revoke all on function
  public.business_of_entity(text, uuid),
  public.submit_review(uuid, integer, text, uuid, uuid, uuid),
  public.reply_to_review(uuid, text),
  public.my_reviewable(),
  public.request_boost(uuid, text, uuid, uuid),
  public.activate_boost(uuid, text),
  public.staff_activate_boost(uuid),
  public.cancel_boost(uuid),
  public.expire_boosts(),
  public.analytics_set_business(),
  public.business_insights(uuid, integer),
  public.business_today(uuid),
  public.add_months_for(date, text),
  public.create_tenancy(uuid, text, date, date, numeric, text, date),
  public.end_tenancy(uuid),
  public.record_rent_payment(uuid, numeric, text, text),
  public.set_tenancy_checklist(uuid, jsonb),
  public.send_rent_reminders(),
  public.report_before_insert(),
  public.report_after_insert(),
  public.business_reports(uuid),
  public.respond_to_report(uuid, text),
  public.resolve_report(uuid, text, text, text),
  public.decide_verification(uuid, boolean, text),
  public.endorsement_notify(),
  public.endorsed_business_ids(uuid[]),
  public.business_rating_stats(uuid[]),
  public.business_reply_stats(uuid[])
  from public, anon, authenticated;

grant execute on function
  public.submit_review(uuid, integer, text, uuid, uuid, uuid),
  public.reply_to_review(uuid, text),
  public.my_reviewable(),
  public.request_boost(uuid, text, uuid, uuid),
  public.staff_activate_boost(uuid),
  public.cancel_boost(uuid),
  public.business_insights(uuid, integer),
  public.business_today(uuid),
  public.create_tenancy(uuid, text, date, date, numeric, text, date),
  public.end_tenancy(uuid),
  public.record_rent_payment(uuid, numeric, text, text),
  public.set_tenancy_checklist(uuid, jsonb),
  public.business_reports(uuid),
  public.respond_to_report(uuid, text),
  public.resolve_report(uuid, text, text, text),
  public.decide_verification(uuid, boolean, text),
  public.endorsed_business_ids(uuid[])
  to authenticated;

grant execute on function
  public.business_rating_stats(uuid[]),
  public.business_reply_stats(uuid[])
  to anon, authenticated;

grant execute on function public.activate_boost(uuid, text) to service_role;

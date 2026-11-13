-- CampusOS Phase A8 stubs + marketplace enquiry linkage + analytics + stale helper
-- Applied remotely as phase_a8_monetization_and_market_enquiries.

alter table public.listing_enquiries
  alter column unit_id drop not null;

alter table public.listing_enquiries
  add column if not exists marketplace_listing_id uuid references public.marketplace_listings (id) on delete set null;

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  campus_id uuid references public.campuses (id) on delete set null,
  event_name text not null,
  entity_type text,
  entity_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_name_idx on public.analytics_events (event_name, created_at desc);
create index if not exists analytics_events_campus_idx on public.analytics_events (campus_id, created_at desc);

alter table public.analytics_events enable row level security;

drop policy if exists "Users insert own analytics" on public.analytics_events;
create policy "Users insert own analytics"
  on public.analytics_events for insert
  with check (auth.uid() = user_id or user_id is null);

drop policy if exists "Staff read analytics" on public.analytics_events;
create policy "Staff read analytics"
  on public.analytics_events for select
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role in ('admin', 'moderator')
    )
  );

create or replace function public.property_needs_reconfirm(checked_at timestamptz)
returns boolean
language sql
immutable
as $$
  select checked_at is null or checked_at < now() - interval '14 days';
$$;

comment on table public.subscription_plans is 'CampusOS housing provider subscriptions; Paystack-backed. Premium placement must never alter verification_label.';
comment on table public.payment_ledger is 'Idempotent Paystack webhook ledger for CampusOS business payments.';

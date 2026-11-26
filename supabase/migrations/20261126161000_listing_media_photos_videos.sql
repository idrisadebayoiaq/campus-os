-- Multi photo + video media for housing, menu items and marketplace listings.

-- 1) Public bucket with image + video support (50 MB per file).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-media',
  'listing-media',
  true,
  52428800,
  array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Listing media public read" on storage.objects;
create policy "Listing media public read" on storage.objects
  for select using (bucket_id = 'listing-media');

drop policy if exists "Listing media owner insert" on storage.objects;
create policy "Listing media owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'listing-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Listing media owner update" on storage.objects;
create policy "Listing media owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'listing-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Listing media owner delete" on storage.objects;
create policy "Listing media owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'listing-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- 2) listing_media: kind, storage path, caption, cover flag, and more targets.
alter table public.listing_media
  add column if not exists kind text not null default 'image',
  add column if not exists storage_path text,
  add column if not exists caption text,
  add column if not exists is_cover boolean not null default false,
  add column if not exists menu_item_id uuid references public.menu_items(id) on delete cascade,
  add column if not exists market_listing_id uuid references public.marketplace_listings(id) on delete cascade;

alter table public.listing_media drop constraint if exists listing_media_kind_check;
alter table public.listing_media
  add constraint listing_media_kind_check check (kind in ('image','video'));

create index if not exists listing_media_property_idx on public.listing_media (property_id, sort_order);
create index if not exists listing_media_unit_idx on public.listing_media (unit_id, sort_order);
create index if not exists listing_media_menu_idx on public.listing_media (menu_item_id, sort_order);
create index if not exists listing_media_market_idx on public.listing_media (market_listing_id, sort_order);

drop policy if exists "Owners manage listing media" on public.listing_media;
create policy "Owners manage listing media" on public.listing_media
  for all
  using (
    public.is_staff()
    or exists (
      select 1 from public.properties p
      join public.business_profiles b on b.id = p.business_id
      where p.id = listing_media.property_id and b.owner_user_id = auth.uid()
    )
    or exists (
      select 1 from public.menu_items m
      join public.business_profiles b on b.id = m.business_id
      where m.id = listing_media.menu_item_id and b.owner_user_id = auth.uid()
    )
    or exists (
      select 1 from public.marketplace_listings l
      left join public.business_profiles b on b.id = l.business_id
      where l.id = listing_media.market_listing_id
        and (l.seller_user_id = auth.uid() or b.owner_user_id = auth.uid())
    )
  )
  with check (
    public.is_staff()
    or exists (
      select 1 from public.properties p
      join public.business_profiles b on b.id = p.business_id
      where p.id = listing_media.property_id and b.owner_user_id = auth.uid()
    )
    or exists (
      select 1 from public.menu_items m
      join public.business_profiles b on b.id = m.business_id
      where m.id = listing_media.menu_item_id and b.owner_user_id = auth.uid()
    )
    or exists (
      select 1 from public.marketplace_listings l
      left join public.business_profiles b on b.id = l.business_id
      where l.id = listing_media.market_listing_id
        and (l.seller_user_id = auth.uid() or b.owner_user_id = auth.uid())
    )
  );

grant select on public.listing_media to anon;
grant select, insert, update, delete on public.listing_media to authenticated;

-- 3) Publishing a property needs at least 3 photos (staff / dashboard exempt).
create or replace function public.require_photos_to_publish()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  photo_count int;
begin
  if new.is_published is true and coalesce(old.is_published, false) is not true then
    if public.is_staff() or public.is_dashboard_session() then
      return new;
    end if;
    select count(*) into photo_count
    from public.listing_media
    where property_id = new.id and kind = 'image';
    if photo_count < 3 then
      raise exception 'Add at least 3 photos before publishing this property.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists properties_require_photos on public.properties;
create trigger properties_require_photos
  before update of is_published on public.properties
  for each row execute function public.require_photos_to_publish();

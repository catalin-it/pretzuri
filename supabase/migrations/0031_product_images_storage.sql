-- 0031: product image cache (ROADMAP Phase 2).
-- 1. Public Storage bucket `product-images` (WebP thumbnails written by the feed worker with the service_role key).
-- 2. storage.objects: public read for that bucket only; no insert/update/delete policy = no client writes
--    (service_role bypasses RLS, which is how the worker uploads).
-- 3. offers: per-offer failure tracking so a broken image URL is not retried forever.
-- 4. Image job thresholds in `settings` (read by the worker, never hard-coded).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists product_images_public_read on storage.objects;
create policy product_images_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'product-images');

alter table public.offers
  add column image_fail_count smallint not null default 0,
  add column image_last_error text,
  add column image_checked_at timestamptz;

-- A new image URL from the feed starts with a clean slate.
create or replace function public.offers_reset_image_failures()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.image_url is distinct from old.image_url then
    new.image_fail_count := 0;
    new.image_last_error := null;
    new.image_checked_at := null;
  end if;
  return new;
end;
$$;
create trigger offers_reset_image_failures before update on public.offers
  for each row execute function public.offers_reset_image_failures();

-- Candidate lookup of the image job: active offers with an image that has not failed too often.
create index offers_image_candidates_idx on public.offers (product_id)
  where is_active and image_url is not null;

insert into public.settings (key, value, description) values
  ('image_max_bytes', '5242880', 'Max size of a downloaded shop image (bytes)'),
  ('image_max_px', '600', 'Thumbnails are scaled to fit in this many pixels (width and height)'),
  ('image_quality', '78', 'WebP quality of cached thumbnails (1-100)'),
  ('image_max_failures', '3', 'An offer image is not retried after this many failed downloads'),
  ('image_batch', '200', 'Max products processed per image job run'),
  ('image_host_concurrency', '2', 'Max parallel image downloads per shop host'),
  ('image_host_delay_ms', '300', 'Minimum delay between two image downloads from the same shop host (ms)')
on conflict (key) do nothing;

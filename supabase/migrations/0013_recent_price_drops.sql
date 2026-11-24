-- 0013: recent_price_drops(p_limit) for the home page (replaces the app-side filtering in getRecentPriceDrops).
-- Active offers with a shop "old price" (old_price > price is a table check), updated in the last 30 days,
-- one per product (its most recently updated reduced offer), newest first. Security invoker: RLS applies
-- (only active offers, products and merchants are visible to anon).

create index if not exists offers_reduced_recent_idx on public.offers (updated_at desc)
  where is_active and old_price is not null;

create or replace function public.recent_price_drops(p_limit int default 8)
returns table (
  offer_id bigint,
  price numeric,
  old_price numeric,
  lowest_30d numeric,
  first_seen_at timestamptz,
  merchant_name text,
  product_slug text,
  product_title text,
  product_image_path text
)
language sql
stable
set search_path = public
as $$
  with recent as (
    select distinct on (o.product_id)
      o.id, o.price, o.old_price, o.first_seen_at, o.merchant_id, o.product_id, o.updated_at
    from public.offers o
    where o.is_active and o.old_price is not null and o.updated_at > now() - interval '30 days'
    order by o.product_id, o.updated_at desc, o.id
  )
  select r.id, r.price, r.old_price, public.offer_lowest_30d(r.id), r.first_seen_at,
         m.name, p.slug, p.title, p.image_path
  from recent r
  join public.products p on p.id = r.product_id and p.status = 'active'
  join public.merchants m on m.id = r.merchant_id
  order by r.updated_at desc, r.id
  limit least(greatest(coalesce(p_limit, 8), 1), 50)
$$;
comment on function public.recent_price_drops(int) is
  'Home page: latest reduced offers (shop old price > price), one per product, with the Omnibus 30-day lowest price.';
grant execute on function public.recent_price_drops(int) to anon, authenticated;

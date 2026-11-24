-- 0010: fix search_products spec filter: a product WITHOUT the filtered spec key no longer passes
-- (the old predicate compared with NULL and let it through). Same signature; only the spec predicate changed.
create or replace function public.search_products(
  p_query text default null,
  p_category_path text default null,
  p_brand_ids bigint[] default null,
  p_merchant_ids bigint[] default null,
  p_price_min numeric default null,
  p_price_max numeric default null,
  p_specs jsonb default null,
  p_sort text default 'relevance',
  p_limit int default 24,
  p_offset int default 0
)
returns table (
  id bigint,
  slug text,
  title text,
  brand_name text,
  category_path text,
  image_path text,
  min_price numeric,
  max_price numeric,
  offer_count int,
  rank real,
  total_count bigint
)
language sql
stable
set search_path = public, extensions
as $$
  with q as (
    select nullif(btrim(p_query), '') as raw,
           case when nullif(btrim(p_query), '') is null then null
                else websearch_to_tsquery('public.simple_unaccent', p_query) end as tsq,
           public.norm_text(coalesce(p_query, '')) as norm
  ),
  base as (
    select p.*,
      case when q.raw is null then 0::real
           else (ts_rank(p.search_tsv, q.tsq) + similarity(p.title_norm, q.norm))::real end as rnk
    from public.products p, q
    where p.status = 'active'
      and p.offer_count > 0
      and (p_category_path is null or p.category_id in (select public.category_subtree(p_category_path)))
      and (p_brand_ids is null or p.brand_id = any (p_brand_ids))
      and (p_price_min is null or p.min_price >= p_price_min)
      and (p_price_max is null or p.min_price <= p_price_max)
      and (p_merchant_ids is null or exists (
            select 1 from public.offers o
            where o.product_id = p.id and o.is_active and o.merchant_id = any (p_merchant_ids)))
      and (q.raw is null or p.search_tsv @@ q.tsq or p.title_norm % q.norm)
      and (p_specs is null or not exists (
            select 1 from jsonb_each(p_specs) f
            where not coalesce(jsonb_typeof(f.value) = 'array' and f.value @> (p.specs -> f.key), false)))
  )
  select b.id, b.slug, b.title, br.name, c.path, b.image_path, b.min_price, b.max_price, b.offer_count, b.rnk,
         count(*) over ()
  from base b
  left join public.brands br on br.id = b.brand_id
  left join public.categories c on c.id = b.category_id
  order by
    case when p_sort = 'price_asc' then b.min_price end asc nulls last,
    case when p_sort = 'price_desc' then b.min_price end desc nulls last,
    case when p_sort = 'offers' then b.offer_count end desc,
    case when p_sort = 'newest' then b.created_at end desc,
    case when p_sort = 'relevance' then b.rnk end desc,
    b.offer_count desc,
    b.id
  limit least(greatest(coalesce(p_limit, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

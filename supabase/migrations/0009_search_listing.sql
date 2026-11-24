-- 0009: search and category listing RPCs (FTS + trigram), filters, sorting and facets.
-- SECURITY INVOKER: RLS applies (only active products/offers of active merchants are visible).

-- Category ids of a category path and all its descendants (null path = all categories).
create or replace function public.category_subtree(p_path text)
returns setof bigint
language sql
stable
set search_path = public
as $$
  select id from public.categories
  where p_path is null or path = p_path or path like p_path || '/%'
$$;

-- Products matching the filters. `p_query` uses websearch syntax plus fuzzy title matching (typos, model codes).
-- p_specs: {"Memorie RAM": ["8 GB", "16 GB"], ...} (OR within a key, AND across keys).
-- p_sort: relevance | price_asc | price_desc | offers | newest.
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
            where jsonb_typeof(f.value) = 'array'
              and not (p.specs -> f.key) <@ f.value
              and not exists (select 1 from jsonb_array_elements(f.value) v where p.specs -> f.key = v)))
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

-- Facets for a listing/search: brands, merchants, price range and spec values of the category's spec_filters.
-- Counts ignore the brand/merchant/spec selections themselves (simple, stable facet lists).
create or replace function public.search_facets(
  p_query text default null,
  p_category_path text default null
)
returns jsonb
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
    select p.id, p.brand_id, p.min_price, p.specs
    from public.products p, q
    where p.status = 'active' and p.offer_count > 0
      and (p_category_path is null or p.category_id in (select public.category_subtree(p_category_path)))
      and (q.raw is null or p.search_tsv @@ q.tsq or p.title_norm % q.norm)
  ),
  spec_keys as (
    select f ->> 'key' as key
    from public.categories c, jsonb_array_elements(c.spec_filters) f
    where p_category_path is not null and c.path = p_category_path
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'price', (select jsonb_build_object('min', min(min_price), 'max', max(min_price)) from base),
    'brands', coalesce((
      select jsonb_agg(jsonb_build_object('id', br.id, 'name', br.name, 'count', x.n) order by x.n desc, br.name)
      from (select brand_id, count(*) as n from base where brand_id is not null group by brand_id) x
      join public.brands br on br.id = x.brand_id), '[]'),
    'merchants', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'count', x.n) order by x.n desc, m.name)
      from (select o.merchant_id, count(distinct o.product_id) as n
            from public.offers o join base on base.id = o.product_id
            where o.is_active group by o.merchant_id) x
      join public.merchants m on m.id = x.merchant_id and m.is_active), '[]'),
    'specs', coalesce((
      select jsonb_object_agg(k.key, k.vals)
      from (
        select sk.key, jsonb_agg(jsonb_build_object('value', v.val, 'count', v.n) order by v.n desc) as vals
        from spec_keys sk
        join lateral (
          select base.specs -> sk.key as val, count(*) as n
          from base where base.specs ? sk.key
          group by 1 order by 2 desc limit 30
        ) v on true
        group by sk.key
      ) k), '{}')
  )
$$;

-- Lightweight category tree for navigation (ro + en names, product counts of the subtree).
create or replace function public.category_tree()
returns table (id bigint, parent_id bigint, slug text, path text, depth smallint, name_ro text, name_en text,
               sort_order int, product_count bigint)
language sql
stable
set search_path = public
as $$
  select c.id, c.parent_id, c.slug, c.path, c.depth, c.name_ro, c.name_en, c.sort_order,
         (select count(*) from public.products p
          join public.categories cc on cc.id = p.category_id
          where p.status = 'active' and p.offer_count > 0
            and (cc.path = c.path or cc.path like c.path || '/%'))
  from public.categories c
  where c.is_active
  order by c.depth, c.sort_order
$$;

grant execute on function public.category_subtree(text), public.search_products(text, text, bigint[], bigint[], numeric, numeric, jsonb, text, int, int),
  public.search_facets(text, text), public.category_tree() to anon, authenticated;

-- Speeds up the merchant filter and per-merchant facet counts.
create index if not exists offers_merchant_product_idx on public.offers (merchant_id, product_id) where is_active;

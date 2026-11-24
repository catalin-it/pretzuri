-- 0002: catalog: categories (our tree), brands, canonical products, merchants.

-- Category tree. `path` is the slug path from the root (e.g. 'it-electronice/telefoane'), maintained by trigger.
create table public.categories (
  id bigint generated always as identity primary key,
  parent_id bigint references public.categories (id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  path text not null default '',
  depth smallint not null default 0,
  name_ro text not null,
  name_en text not null,
  sort_order int not null default 0,
  -- Filterable spec keys for listings in this category, e.g. [{"key":"RAM","type":"enum"}].
  spec_filters jsonb not null default '[]',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parent_id, slug)
);
create unique index categories_path_key on public.categories (path);
create index categories_parent_idx on public.categories (parent_id, sort_order);

create or replace function public.categories_set_path()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_path text;
  parent_depth smallint;
begin
  if new.parent_id is null then
    new.path := new.slug;
    new.depth := 0;
  else
    select path, depth into parent_path, parent_depth from public.categories where id = new.parent_id;
    if parent_path is null then raise exception 'parent category % not found', new.parent_id; end if;
    new.path := parent_path || '/' || new.slug;
    new.depth := parent_depth + 1;
  end if;
  return new;
end $$;
create trigger categories_set_path before insert or update of slug, parent_id on public.categories
  for each row execute function public.categories_set_path();
create trigger categories_touch before update on public.categories
  for each row execute function public.touch_updated_at();

-- Brands with aliases ("HP" / "Hewlett-Packard"); `name_norm` is the matching key.
create table public.brands (
  id bigint generated always as identity primary key,
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_norm text generated always as (public.norm_text(name)) stored,
  created_at timestamptz not null default now()
);
create unique index brands_name_norm_key on public.brands (name_norm);

create table public.brand_aliases (
  alias_norm text primary key,
  brand_id bigint not null references public.brands (id) on delete cascade
);
create index brand_aliases_brand_idx on public.brand_aliases (brand_id);

-- Canonical products. Many offers point to one product.
create table public.products (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(title) between 2 and 300),
  title_norm text generated always as (public.norm_text(title)) stored,
  brand_id bigint references public.brands (id) on delete set null,
  category_id bigint references public.categories (id) on delete set null,
  mpn_norm text,
  gtins text[] not null default '{}',
  description text,
  specs jsonb not null default '{}',
  image_path text,
  status text not null default 'active' check (status in ('active', 'hidden', 'merged')),
  merged_into bigint references public.products (id) on delete set null,
  -- Denormalized from active offers (refresh_product_stats): fast listings and sorting.
  min_price numeric(12, 2),
  max_price numeric(12, 2),
  offer_count int not null default 0,
  search_tsv tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_brand_idx on public.products (brand_id);
create index products_category_idx on public.products (category_id, min_price) where status = 'active';
create index products_mpn_idx on public.products (brand_id, mpn_norm) where mpn_norm is not null;
create index products_gtins_idx on public.products using gin (gtins);
create index products_title_trgm_idx on public.products using gin (title_norm extensions.gin_trgm_ops);
create index products_search_idx on public.products using gin (search_tsv);
create index products_merged_idx on public.products (merged_into) where merged_into is not null;

-- search_tsv: title (A) + brand (B) + category name (C). Maintained here so brand/category names are included.
create or replace function public.products_set_search()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  b text;
  c text;
begin
  select name into b from public.brands where id = new.brand_id;
  select name_ro || ' ' || name_en into c from public.categories where id = new.category_id;
  new.search_tsv :=
    setweight(to_tsvector('public.simple_unaccent', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('public.simple_unaccent', coalesce(b, '') || ' ' || coalesce(new.mpn_norm, '') || ' ' ||
      array_to_string(new.gtins, ' ')), 'B') ||
    setweight(to_tsvector('public.simple_unaccent', coalesce(c, '')), 'C');
  return new;
end $$;
create trigger products_set_search before insert or update of title, brand_id, category_id, mpn_norm, gtins
  on public.products for each row execute function public.products_set_search();
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

create table public.product_images (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products (id) on delete cascade,
  storage_path text not null,
  source_url text,
  width int,
  height int,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (product_id, storage_path)
);
create index product_images_product_idx on public.product_images (product_id, sort_order);

-- Old slugs of merged products: answered with a 301 to the surviving product.
create table public.product_redirects (
  old_slug text primary key,
  product_id bigint not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index product_redirects_product_idx on public.product_redirects (product_id);

-- Pairs an admin declared different: never suggested again by matching. Stored with product_a < product_b.
create table public.product_distinct (
  product_a bigint not null references public.products (id) on delete cascade,
  product_b bigint not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_a, product_b),
  check (product_a < product_b)
);
create index product_distinct_b_idx on public.product_distinct (product_b);

-- Shops. Shown only when they have an active feed (affiliate or direct).
create table public.merchants (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  website text not null check (website ~ '^https?://'),
  logo_path text,
  description text,
  -- Informative shipping policy text from the merchant profile (never used to guess an offer's shipping cost).
  shipping_info text,
  has_affiliate boolean not null default false,
  affiliate_network text check (affiliate_network in ('2performant', 'profitshare')),
  rating_avg numeric(3, 2),
  rating_count int not null default 0,
  cpc_enabled boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not has_affiliate or affiliate_network is not null)
);
create trigger merchants_touch before update on public.merchants
  for each row execute function public.touch_updated_at();

-- RLS: public catalog, admin writes. The worker role is granted separately (0006).
alter table public.categories enable row level security;
alter table public.brands enable row level security;
alter table public.brand_aliases enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_redirects enable row level security;
alter table public.product_distinct enable row level security;
alter table public.merchants enable row level security;

create policy categories_public_select on public.categories for select using (is_active or public.is_admin());
create policy categories_admin_write on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy brands_public_select on public.brands for select using (true);
create policy brands_admin_write on public.brands for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy brand_aliases_admin_all on public.brand_aliases for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.brand_aliases from anon;

create policy products_public_select on public.products for select using (status = 'active' or public.is_admin());
create policy products_admin_write on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy product_images_public_select on public.product_images for select using (true);
create policy product_images_admin_write on public.product_images for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy product_redirects_public_select on public.product_redirects for select using (true);
create policy product_redirects_admin_write on public.product_redirects for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy product_distinct_admin_all on public.product_distinct for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.product_distinct from anon;

create policy merchants_public_select on public.merchants for select using (is_active or public.is_admin());
create policy merchants_admin_write on public.merchants for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Anonymous visitors only read the catalog.
revoke insert, update, delete on public.categories, public.brands, public.products, public.product_images,
  public.product_redirects, public.merchants from anon;

-- 0003: feed sources, category mapping, offers, price history, import runs, matching queue.

create table public.feed_sources (
  id bigint generated always as identity primary key,
  merchant_id bigint not null references public.merchants (id) on delete cascade,
  name text not null,
  type text not null check (type in ('2performant', 'profitshare', 'direct_xml', 'direct_csv')),
  -- May contain access tokens: admin + worker only (RLS + no anon grant).
  url text not null check (url ~ '^https?://'),
  -- Parser options, e.g. {"delimiter":";","encoding":"utf-8","item_tag":"product"} or a field map override.
  options jsonb not null default '{}',
  schedule_minutes int not null default 360 check (schedule_minutes between 15 and 10080),
  is_active boolean not null default true,
  etag text,
  last_modified text,
  last_run_at timestamptz,
  next_run_at timestamptz not null default now(),
  last_row_count int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index feed_sources_merchant_idx on public.feed_sources (merchant_id);
create index feed_sources_due_idx on public.feed_sources (next_run_at) where is_active;
create trigger feed_sources_touch before update on public.feed_sources
  for each row execute function public.touch_updated_at();

-- Shop category path -> our category. category_id null = not mapped yet (shown in admin, counted per run).
create table public.category_mappings (
  id bigint generated always as identity primary key,
  merchant_id bigint not null references public.merchants (id) on delete cascade,
  source_path text not null,
  category_id bigint references public.categories (id) on delete set null,
  offer_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, source_path)
);
create index category_mappings_unmapped_idx on public.category_mappings (merchant_id) where category_id is null;
create index category_mappings_category_idx on public.category_mappings (category_id);
create trigger category_mappings_touch before update on public.category_mappings
  for each row execute function public.touch_updated_at();

create table public.offers (
  id bigint generated always as identity primary key,
  merchant_id bigint not null references public.merchants (id) on delete cascade,
  feed_source_id bigint references public.feed_sources (id) on delete set null,
  product_id bigint not null references public.products (id) on delete cascade,
  external_id text not null,
  title text not null,
  url text not null check (url ~ '^https?://'),
  -- Network tracking URL, kept exactly as the network gives it. Null for direct (non-affiliate) feeds.
  affiliate_url text check (affiliate_url ~ '^https?://'),
  price numeric(12, 2) not null check (price > 0),
  old_price numeric(12, 2) check (old_price is null or old_price > price),
  currency char(3) not null default 'RON',
  availability text not null default 'unknown'
    check (availability in ('in_stock', 'limited', 'out_of_stock', 'preorder', 'unknown')),
  -- Null = unknown (UI: "cost livrare nespecificat"); 0 = free.
  shipping_cost numeric(10, 2) check (shipping_cost is null or shipping_cost >= 0),
  shipping_days text,
  -- Ranking key (DECISIONS "Ranking"): price + shipping, or price alone when shipping is unknown.
  total_price numeric(12, 2) generated always as (price + coalesce(shipping_cost, 0)) stored,
  image_url text,
  gtin text,
  mpn text,
  brand_raw text,
  category_raw text,
  match_method text check (match_method in ('gtin', 'mpn', 'title', 'new', 'manual')),
  match_score real,
  is_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expired_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (merchant_id, external_id)
);
create index offers_product_rank_idx on public.offers (product_id, total_price) where is_active;
create index offers_feed_seen_idx on public.offers (feed_source_id, last_seen_at) where is_active;
create index offers_stale_idx on public.offers (last_seen_at) where is_active;
create trigger offers_touch before update on public.offers
  for each row execute function public.touch_updated_at();

-- One row per offer whenever price, shipping or availability changes (written by the worker).
create table public.price_history (
  id bigint generated always as identity primary key,
  offer_id bigint not null references public.offers (id) on delete cascade,
  product_id bigint not null references public.products (id) on delete cascade,
  price numeric(12, 2) not null,
  shipping_cost numeric(10, 2),
  availability text not null,
  recorded_at timestamptz not null default now()
);
create index price_history_offer_idx on public.price_history (offer_id, recorded_at desc);
create index price_history_product_idx on public.price_history (product_id, recorded_at);

-- Import requests: written by pg_cron (due feeds) or an admin ("run now"); moved into pg-boss by the worker.
create table public.import_requests (
  id bigint generated always as identity primary key,
  feed_source_id bigint not null references public.feed_sources (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'queued', 'done', 'cancelled')),
  requested_at timestamptz not null default now(),
  picked_at timestamptz
);
create unique index import_requests_one_pending on public.import_requests (feed_source_id) where status in ('pending', 'queued');
create index import_requests_pending_idx on public.import_requests (requested_at) where status = 'pending';

create table public.feed_runs (
  id bigint generated always as identity primary key,
  feed_source_id bigint not null references public.feed_sources (id) on delete cascade,
  status text not null default 'running'
    check (status in ('running', 'ok', 'partial', 'not_modified', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  rows_read int not null default 0,
  rows_valid int not null default 0,
  rows_invalid int not null default 0,
  products_new int not null default 0,
  offers_new int not null default 0,
  offers_updated int not null default 0,
  offers_unchanged int not null default 0,
  offers_expired int not null default 0,
  price_changes int not null default 0,
  categories_unmapped int not null default 0,
  matches_queued int not null default 0,
  peak_rss_mb int,
  message text
);
create index feed_runs_source_idx on public.feed_runs (feed_source_id, started_at desc);

create table public.feed_run_errors (
  id bigint generated always as identity primary key,
  run_id bigint not null references public.feed_runs (id) on delete cascade,
  row_number int,
  external_id text,
  field text,
  reason text not null,
  created_at timestamptz not null default now()
);
create index feed_run_errors_run_idx on public.feed_run_errors (run_id);

-- Uncertain matches: the offer got a new visible product (DECISIONS "Product matching"); admin may merge it.
create table public.match_queue (
  id bigint generated always as identity primary key,
  offer_id bigint not null references public.offers (id) on delete cascade,
  product_id bigint not null references public.products (id) on delete cascade,
  reason text not null check (reason in ('title_review', 'gtin_conflict', 'mpn_conflict')),
  -- [{"product_id": 1, "score": 0.71}, ...] best first, max 5.
  candidates jsonb not null default '[]',
  status text not null default 'open' check (status in ('open', 'merged', 'rejected', 'split', 'obsolete')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index match_queue_open_idx on public.match_queue (created_at) where status = 'open';
create index match_queue_offer_idx on public.match_queue (offer_id);
create index match_queue_product_idx on public.match_queue (product_id);

-- RLS.
alter table public.feed_sources enable row level security;
alter table public.category_mappings enable row level security;
alter table public.offers enable row level security;
alter table public.price_history enable row level security;
alter table public.import_requests enable row level security;
alter table public.feed_runs enable row level security;
alter table public.feed_run_errors enable row level security;
alter table public.match_queue enable row level security;

-- Public: active offers of active merchants, and their price history (no personal data).
create policy offers_public_select on public.offers for select using (
  (is_active and exists (select 1 from public.merchants m where m.id = merchant_id and m.is_active))
  or public.is_admin()
);
create policy offers_admin_write on public.offers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy price_history_public_select on public.price_history for select using (true);

-- Admin only.
create policy feed_sources_admin_all on public.feed_sources for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy category_mappings_admin_all on public.category_mappings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy import_requests_admin_all on public.import_requests for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy feed_runs_admin_select on public.feed_runs for select to authenticated using (public.is_admin());
create policy feed_run_errors_admin_select on public.feed_run_errors for select to authenticated using (public.is_admin());
create policy match_queue_admin_all on public.match_queue for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.feed_sources, public.category_mappings, public.import_requests, public.feed_runs,
  public.feed_run_errors, public.match_queue from anon;
revoke insert, update, delete on public.offers, public.price_history from anon;
revoke insert, update, delete on public.price_history, public.feed_runs, public.feed_run_errors from authenticated;

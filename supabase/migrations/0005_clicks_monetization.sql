-- 0005: outbound click counting (no personal data) and monetization tables (all disabled for now).

-- One row per /go redirect. Deliberately no IP, user id, cookie or full user agent (AGENTS rule 8).
create table public.clicks (
  id bigint generated always as identity primary key,
  offer_id bigint not null references public.offers (id) on delete cascade,
  merchant_id bigint not null references public.merchants (id) on delete cascade,
  product_id bigint not null,
  source text not null default 'product' check (source in ('product', 'listing', 'search', 'compare', 'alert', 'other')),
  is_bot boolean not null default false,
  clicked_at timestamptz not null default now()
);
create index clicks_clicked_idx on public.clicks (clicked_at);

-- Daily aggregates (kept); raw clicks are deleted after 30 days (0006).
create table public.click_daily (
  day date not null,
  offer_id bigint not null references public.offers (id) on delete cascade,
  merchant_id bigint not null references public.merchants (id) on delete cascade,
  source text not null,
  clicks int not null default 0,
  bot_clicks int not null default 0,
  primary key (day, offer_id, source)
);
create index click_daily_merchant_idx on public.click_daily (merchant_id, day);

-- Cost per click per merchant (optionally per category). Disabled: no billing yet.
create table public.cpc_rates (
  id bigint generated always as identity primary key,
  merchant_id bigint not null references public.merchants (id) on delete cascade,
  category_id bigint references public.categories (id) on delete cascade,
  cpc numeric(8, 4) not null check (cpc >= 0),
  currency char(3) not null default 'RON',
  is_active boolean not null default false,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_at timestamptz not null default now()
);
create index cpc_rates_merchant_idx on public.cpc_rates (merchant_id, category_id);

-- Promoted positions, always shown separately and labelled "Promovat" (DECISIONS "Ranking"). Disabled.
create table public.promotions (
  id bigint generated always as identity primary key,
  merchant_id bigint not null references public.merchants (id) on delete cascade,
  product_id bigint references public.products (id) on delete cascade,
  category_id bigint references public.categories (id) on delete cascade,
  label text not null default 'Promovat',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (product_id is not null or category_id is not null)
);
create index promotions_product_idx on public.promotions (product_id) where is_active;
create index promotions_category_idx on public.promotions (category_id) where is_active;
create index promotions_merchant_idx on public.promotions (merchant_id);

-- Affiliate commissions reported by the networks (imported later; manual for now).
create table public.affiliate_commissions (
  id bigint generated always as identity primary key,
  network text not null check (network in ('2performant', 'profitshare')),
  merchant_id bigint references public.merchants (id) on delete set null,
  external_ref text not null,
  amount numeric(12, 2) not null,
  currency char(3) not null default 'RON',
  status text not null check (status in ('pending', 'approved', 'rejected', 'paid')),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (network, external_ref)
);
create index affiliate_commissions_merchant_idx on public.affiliate_commissions (merchant_id);

alter table public.clicks enable row level security;
alter table public.click_daily enable row level security;
alter table public.cpc_rates enable row level security;
alter table public.promotions enable row level security;
alter table public.affiliate_commissions enable row level security;

-- Clicks are written only through register_click() (0006). Statistics: admin only for now
-- (merchant portal later).
create policy clicks_admin_select on public.clicks for select to authenticated using (public.is_admin());
create policy click_daily_admin_select on public.click_daily for select to authenticated using (public.is_admin());
create policy cpc_rates_admin_all on public.cpc_rates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy affiliate_commissions_admin_all on public.affiliate_commissions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- Active promotions are public (they must be visible and labelled).
create policy promotions_public_select on public.promotions for select
  using ((is_active and now() between starts_at and ends_at) or public.is_admin());
create policy promotions_admin_write on public.promotions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.clicks, public.click_daily, public.cpc_rates, public.affiliate_commissions from anon;
revoke insert, update, delete on public.clicks, public.click_daily from authenticated;
revoke insert, update, delete on public.promotions from anon;

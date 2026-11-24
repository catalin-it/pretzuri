-- 0006: public read functions (offers ranking, Omnibus 30-day lowest price), click registration,
-- product stats, the feed_worker role, and pg_cron jobs (expiry, scheduling, retention).

-- Lowest price of one offer over the last 30 days (Omnibus reference), from our own price history.
-- Includes the current price. Null if we have no history for the offer.
create or replace function public.offer_lowest_30d(p_offer_id bigint)
returns numeric
language sql
stable
set search_path = public
as $$
  select least(
    (select min(ph.price) from public.price_history ph
      where ph.offer_id = p_offer_id and ph.recorded_at >= now() - interval '30 days'),
    (select o.price from public.offers o where o.id = p_offer_id)
  )
$$;

-- Lowest price of a product across all shops over the last 30 days.
create or replace function public.product_lowest_30d(p_product_id bigint)
returns numeric
language sql
stable
set search_path = public
as $$
  select min(ph.price) from public.price_history ph
  where ph.product_id = p_product_id and ph.recorded_at >= now() - interval '30 days'
$$;

-- Offers of a product in the published ranking order (DECISIONS "Ranking"):
-- total price ascending (price + shipping, or price when shipping is unknown); ties: in stock first, then the
-- merchant rating, then the merchant name. Since our own history may be shorter than 30 days, `history_days`
-- tells the UI whether the 30-day reference is complete.
create or replace function public.product_offers(p_product_id bigint)
returns table (
  offer_id bigint,
  merchant_id bigint,
  merchant_slug text,
  merchant_name text,
  merchant_rating numeric,
  merchant_rating_count int,
  has_affiliate boolean,
  title text,
  price numeric,
  old_price numeric,
  currency char(3),
  shipping_cost numeric,
  shipping_days text,
  total_price numeric,
  availability text,
  lowest_30d numeric,
  history_days int,
  last_seen_at timestamptz
)
language sql
stable
set search_path = public
as $$
  select o.id, m.id, m.slug, m.name, m.rating_avg, m.rating_count, (o.affiliate_url is not null),
         o.title, o.price, o.old_price, o.currency, o.shipping_cost, o.shipping_days, o.total_price,
         o.availability, public.offer_lowest_30d(o.id),
         least(30, extract(day from now() - o.first_seen_at)::int),
         o.last_seen_at
  from public.offers o
  join public.merchants m on m.id = o.merchant_id and m.is_active
  where o.product_id = p_product_id and o.is_active
  order by o.total_price asc,
           case o.availability when 'in_stock' then 0 when 'limited' then 1 when 'preorder' then 2
                               when 'unknown' then 3 else 4 end,
           m.rating_avg desc nulls last,
           m.name asc
$$;
grant execute on function public.offer_lowest_30d(bigint), public.product_lowest_30d(bigint),
  public.product_offers(bigint) to anon, authenticated;

-- Records a click and returns the destination (affiliate URL when present, else the shop URL).
-- Called by the /go route; stores no personal data. Null when the offer is unknown or inactive.
create or replace function public.register_click(p_offer_id bigint, p_source text default 'product', p_is_bot boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
begin
  select ofr.id, ofr.merchant_id, ofr.product_id, coalesce(ofr.affiliate_url, ofr.url) as dest
    into o
  from public.offers ofr
  join public.merchants m on m.id = ofr.merchant_id and m.is_active
  where ofr.id = p_offer_id and ofr.is_active;
  if not found then return null; end if;
  insert into public.clicks (offer_id, merchant_id, product_id, source, is_bot)
  values (o.id, o.merchant_id, o.product_id,
          case when p_source in ('product', 'listing', 'search', 'compare', 'alert') then p_source else 'other' end,
          coalesce(p_is_bot, false));
  return o.dest;
end $$;
revoke execute on function public.register_click(bigint, text, boolean) from public;
grant execute on function public.register_click(bigint, text, boolean) to anon, authenticated;

-- Recomputes min/max price and offer count of products (after imports and expiry).
create or replace function public.refresh_product_stats(p_product_ids bigint[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.products p set
    min_price = s.min_price,
    max_price = s.max_price,
    offer_count = s.n
  from (
    select pid,
           (select min(o.total_price) from public.offers o where o.product_id = pid and o.is_active) as min_price,
           (select max(o.total_price) from public.offers o where o.product_id = pid and o.is_active) as max_price,
           (select count(*)::int from public.offers o where o.product_id = pid and o.is_active) as n
    from unnest(p_product_ids) as pid
  ) s
  where p.id = s.pid
    and (p.min_price is distinct from s.min_price or p.max_price is distinct from s.max_price or p.offer_count <> s.n)
$$;
revoke execute on function public.refresh_product_stats(bigint[]) from public, anon, authenticated;

-- Safety net: deactivate offers not seen for `offer_stale_hours` (the worker expires them per run already).
create or replace function public.expire_stale_offers()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  hours int := coalesce((select (value #>> '{}')::int from public.settings where key = 'offer_stale_hours'), 72);
  ids bigint[];
  n int;
begin
  with expired as (
    update public.offers set is_active = false, expired_at = now()
    where is_active and last_seen_at < now() - make_interval(hours => hours)
    returning product_id
  )
  select array_agg(distinct product_id), count(*) into ids, n from expired;
  if ids is not null then perform public.refresh_product_stats(ids); end if;
  return coalesce(n, 0);
end $$;
revoke execute on function public.expire_stale_offers() from public, anon, authenticated;

-- Queues every active feed whose next_run_at has passed (one pending request per feed at most).
create or replace function public.enqueue_due_feeds()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  insert into public.import_requests (feed_source_id)
  select fs.id from public.feed_sources fs
  join public.merchants m on m.id = fs.merchant_id and m.is_active
  where fs.is_active and fs.next_run_at <= now()
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.enqueue_due_feeds() from public, anon, authenticated;

-- Aggregates yesterday's (and older unaggregated) raw clicks into click_daily, then deletes raw clicks > 30 days.
create or replace function public.rollup_clicks()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.click_daily (day, offer_id, merchant_id, source, clicks, bot_clicks)
  select (clicked_at at time zone 'Europe/Bucharest')::date, offer_id, merchant_id, source,
         count(*) filter (where not is_bot), count(*) filter (where is_bot)
  from public.clicks
  where clicked_at < date_trunc('day', now() at time zone 'Europe/Bucharest') at time zone 'Europe/Bucharest'
    and clicked_at >= date_trunc('day', now() at time zone 'Europe/Bucharest') at time zone 'Europe/Bucharest' - interval '1 day'
  group by 1, 2, 3, 4
  on conflict (day, offer_id, source) do update
    set clicks = excluded.clicks, bot_clicks = excluded.bot_clicks;
  delete from public.clicks where clicked_at < now() - interval '30 days';
end $$;
revoke execute on function public.rollup_clicks() from public, anon, authenticated;

create or replace function public.purge_view_history()
returns void
language sql
security definer
set search_path = public
as $$ delete from public.view_history where viewed_at < now() - interval '90 days' $$;
revoke execute on function public.purge_view_history() from public, anon, authenticated;

-- Feed worker role: LOGIN and password are set by infra/nas/deploy-worker.sh (password only on the NAS).
-- BYPASSRLS because it writes catalog rows for all merchants; table grants below keep it away from user data.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'feed_worker') then
    create role feed_worker nologin bypassrls;
  end if;
end $$;
grant usage on schema public to feed_worker;
grant select on public.settings, public.merchants, public.categories, public.product_distinct, public.product_redirects
  to feed_worker;
grant select, insert, update on public.brands, public.brand_aliases, public.products, public.product_images,
  public.offers, public.category_mappings, public.feed_runs, public.match_queue to feed_worker;
grant select, update on public.feed_sources, public.import_requests to feed_worker;
grant insert on public.price_history, public.feed_run_errors to feed_worker;
grant select on public.price_history to feed_worker;
grant usage, select on all sequences in schema public to feed_worker;
grant execute on function public.refresh_product_stats(bigint[]), public.norm_text(text), public.f_unaccent(text)
  to feed_worker;
grant usage on schema extensions to feed_worker;
-- pg-boss keeps its queue tables in its own schema; the worker creates them there.
create schema if not exists pgboss;
grant usage, create on schema pgboss to feed_worker;

-- pg_cron jobs (UTC). Re-created idempotently.
do $$
declare
  j text;
begin
  foreach j in array array['pretzuri_enqueue_feeds', 'pretzuri_expire_offers', 'pretzuri_rollup_clicks', 'pretzuri_purge_views'] loop
    if exists (select 1 from cron.job where jobname = j) then perform cron.unschedule(j); end if;
  end loop;
end $$;
select cron.schedule('pretzuri_enqueue_feeds', '*/5 * * * *', $$select public.enqueue_due_feeds()$$);
select cron.schedule('pretzuri_expire_offers', '17 * * * *', $$select public.expire_stale_offers()$$);
select cron.schedule('pretzuri_rollup_clicks', '10 1 * * *', $$select public.rollup_clicks()$$);
select cron.schedule('pretzuri_purge_views', '20 1 * * *', $$select public.purge_view_history()$$);

-- 0030: fixes from the code review of 0000-0010.
-- 1. Omnibus: offer_lowest_30d excluded neither the current price period nor counted the price in effect at the
--    start of the window. The reference is now the lowest price the offer had during the 30 days BEFORE its current
--    price started (including the price in effect 30 days ago). Null when we know no earlier price.
-- 2. product_lowest_30d also counts the prices in effect at the window start (history is written on change only).
-- 3. anon/authenticated lose TRUNCATE (bypasses RLS), REFERENCES and TRIGGER on public tables, now and by default.
-- 4. Public price history only for active products.

create or replace function public.offer_lowest_30d(p_offer_id bigint)
returns numeric
language sql
stable
set search_path = public
as $$
  with o as (
    select price from public.offers where id = p_offer_id
  ),
  last_diff as (
    -- Last time the offer had a different price than now.
    select max(ph.recorded_at) as at
    from public.price_history ph, o
    where ph.offer_id = p_offer_id and ph.price <> o.price
  ),
  period as (
    -- Start of the current price period (first row with the current price after the last different one).
    select min(ph.recorded_at) as start
    from public.price_history ph, o, last_diff
    where ph.offer_id = p_offer_id and ph.price = o.price
      and (last_diff.at is null or ph.recorded_at > last_diff.at)
  ),
  window_start_row as (
    -- Price in effect when the 30-day window before the current period began.
    select ph.price
    from public.price_history ph, period
    where ph.offer_id = p_offer_id and ph.recorded_at <= period.start - interval '30 days'
    order by ph.recorded_at desc
    limit 1
  )
  select min(x.price) from (
    select ph.price
    from public.price_history ph, period
    where ph.offer_id = p_offer_id
      and ph.recorded_at < period.start
      and ph.recorded_at > period.start - interval '30 days'
    union all
    select price from window_start_row
  ) x
$$;

create or replace function public.product_lowest_30d(p_product_id bigint)
returns numeric
language sql
stable
set search_path = public
as $$
  select min(x.price) from (
    select ph.price from public.price_history ph
    where ph.product_id = p_product_id and ph.recorded_at >= now() - interval '30 days'
    union all
    select w.price from (
      select distinct on (ph.offer_id) ph.price from public.price_history ph
      where ph.product_id = p_product_id and ph.recorded_at < now() - interval '30 days'
      order by ph.offer_id, ph.recorded_at desc
    ) w
  ) x
$$;

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;

drop policy if exists price_history_public_select on public.price_history;
create policy price_history_public_select on public.price_history for select using (
  exists (select 1 from public.products p where p.id = product_id and p.status = 'active') or public.is_admin()
);

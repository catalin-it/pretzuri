-- Omnibus reference test (DEV, rolled back). Run: bash infra/nas/psql.sh dev -tA < supabase/tests/0030_omnibus.test.sql
begin;
insert into public.merchants (slug, name, website) values ('omni-shop', 'Omni', 'https://o.example');
insert into public.products (slug, title) values ('omni-p', 'Omni produs');
insert into public.offers (merchant_id, product_id, external_id, title, url, price)
  select m.id, p.id, 'o1', 't', 'https://o.example/p', 80 from public.merchants m, public.products p where m.slug='omni-shop' and p.slug='omni-p';
-- history: 120 (40 days ago), 100 (20 days ago), 80 (now = reduction)
insert into public.price_history (offer_id, product_id, price, availability, recorded_at)
  select o.id, o.product_id, v.price, 'in_stock', now() - v.ago from public.offers o,
  (values (120, interval '40 days'), (100, interval '20 days'), (80, interval '1 hour')) v(price, ago) where o.external_id='o1';
select 'reference excludes current price: ' || case when public.offer_lowest_30d(id) = 100 then 'ok' else 'FAIL ' || public.offer_lowest_30d(id) end from public.offers where external_id='o1';
select 'product 30d incl. window start: ' || case when public.product_lowest_30d(product_id) = 80 then 'ok' else 'FAIL' end from public.offers where external_id='o1';
rollback;

-- RLS smoke test (DEV only, everything rolled back). Run: bash infra/nas/psql.sh dev -tA < supabase/tests/0007_rls_smoke.test.sql
-- Every line printed must end with "ok".
begin;
-- Fixture: two users, a merchant with a feed, a product, an offer, a pending review of user A.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');
insert into public.merchants (slug, name, website) values ('rls-shop', 'RLS Shop', 'https://rls.example');
insert into public.feed_sources (merchant_id, name, type, url)
  select id, 'f', 'direct_xml', 'https://rls.example/feed.xml?token=secret' from public.merchants where slug = 'rls-shop';
insert into public.products (slug, title) values ('rls-produs', 'Produs RLS 128GB');
insert into public.offers (merchant_id, product_id, external_id, title, url, price, shipping_cost)
  select m.id, p.id, 'x1', 'Produs RLS', 'https://rls.example/p', 100, null
  from public.merchants m, public.products p where m.slug = 'rls-shop' and p.slug = 'rls-produs';
insert into public.reviews (merchant_id, user_id, rating, body)
  select id, '00000000-0000-0000-0000-00000000000a', 5, 'Livrare rapida, produs conform descrierii.' from public.merchants where slug = 'rls-shop';
insert into public.favorites (user_id, product_id)
  select '00000000-0000-0000-0000-00000000000a', id from public.products where slug = 'rls-produs';

-- anon
set local role anon;
select 'anon sees active offer: ' || case when count(*) = 1 then 'ok' else 'FAIL' end from public.offers where external_id = 'x1';
select 'anon sees no pending review: ' || case when count(*) = 0 then 'ok' else 'FAIL' end from public.reviews;
select 'anon ranking works, total = price when shipping unknown: ' ||
  case when (select total_price from public.product_offers((select id from public.products where slug = 'rls-produs'))) = 100 then 'ok' else 'FAIL' end;
select 'anon register_click returns url: ' ||
  case when public.register_click((select id from public.offers where external_id = 'x1'), 'product', false) = 'https://rls.example/p' then 'ok' else 'FAIL' end;
reset role;

-- user B
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select 'B sees no feed sources: ' || case when count(*) = 0 then 'ok' else 'FAIL' end from public.feed_sources;
select 'B sees no favorites of A: ' || case when count(*) = 0 then 'ok' else 'FAIL' end from public.favorites;
select 'B sees no pending review of A: ' || case when count(*) = 0 then 'ok' else 'FAIL' end from public.reviews;
select 'B sees no clicks: ' || case when count(*) = 0 then 'ok' else 'FAIL' end from public.clicks;
select 'B is not admin: ' || case when not public.is_admin() then 'ok' else 'FAIL' end;
reset role;

-- user A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select 'A sees own pending review: ' || case when count(*) = 1 then 'ok' else 'FAIL' end from public.reviews;
select 'A sees own favorite: ' || case when count(*) = 1 then 'ok' else 'FAIL' end from public.favorites;
select 'A has a profile: ' || case when count(*) = 1 then 'ok' else 'FAIL' end from public.profiles;
reset role;
rollback;

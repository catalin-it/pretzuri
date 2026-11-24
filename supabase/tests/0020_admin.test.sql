-- Admin RPC test (DEV only, everything rolled back). Run: bash infra/nas/psql.sh dev -tA < supabase/tests/0020_admin.test.sql
-- Every line printed must end with "ok".
begin;
-- Fixture: an admin, a normal user, a merchant with two offers on two products (B is a duplicate of A), a queue item,
-- user data on both products, an unmapped category path, a pending review and a report.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin-test@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', 'user-test@test.local', 'authenticated', 'authenticated');
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000a1', 'admin');
insert into public.merchants (slug, name, website) values ('adm-shop', 'Adm Shop', 'https://adm.example');
insert into public.products (slug, title, gtins) values
  ('adm-telefon-a', 'Telefon Adm A 128GB', '{5940000000017}'),
  ('adm-telefon-b', 'Telefon Adm A 128 GB negru', '{5940000000024}');
insert into public.offers (merchant_id, product_id, external_id, title, url, price, gtin, category_raw)
  select m.id, p.id, x.ext, p.title, 'https://adm.example/' || x.ext, x.price, x.gtin, 'Telefoane > Smartphone'
  from public.merchants m
  join (values ('adm-telefon-a', 'a1', 1000, '5940000000017'), ('adm-telefon-b', 'b1', 990, '5940000000024'),
               ('adm-telefon-b', 'b2', 995, '5940000000031')) x(slug, ext, price, gtin) on true
  join public.products p on p.slug = x.slug
  where m.slug = 'adm-shop';
insert into public.price_history (offer_id, product_id, price, availability)
  select o.id, o.product_id, o.price, 'in_stock' from public.offers o where o.external_id in ('a1', 'b1', 'b2');
insert into public.match_queue (offer_id, product_id, reason, candidates)
  select o.id, o.product_id, 'title_review',
         jsonb_build_array(jsonb_build_object('product_id', (select id from public.products where slug = 'adm-telefon-a'), 'score', 0.7))
  from public.offers o where o.external_id = 'b1';
-- User B1 favorited both products (collision on merge) and has an alert on the duplicate only.
insert into public.favorites (user_id, product_id)
  select '00000000-0000-0000-0000-0000000000b1', id from public.products where slug in ('adm-telefon-a', 'adm-telefon-b');
insert into public.price_alerts (user_id, product_id, target_price)
  select '00000000-0000-0000-0000-0000000000b1', id, 900 from public.products where slug = 'adm-telefon-b';
insert into public.view_history (user_id, product_id)
  select '00000000-0000-0000-0000-0000000000b1', id from public.products where slug in ('adm-telefon-a', 'adm-telefon-b');
insert into public.category_mappings (merchant_id, source_path, offer_count)
  select id, 'Telefoane > Smartphone', 3 from public.merchants where slug = 'adm-shop';
insert into public.reviews (merchant_id, user_id, rating, body)
  select id, '00000000-0000-0000-0000-0000000000b1', 2, 'Livrare intarziata, dar produsul a fost conform.' from public.merchants where slug = 'adm-shop';
insert into public.review_reports (review_id, reporter_id, reason)
  select id, '00000000-0000-0000-0000-0000000000a1', 'spam' from public.reviews where user_id = '00000000-0000-0000-0000-0000000000b1';

-- Runs a statement and reports whether it was refused with insufficient_privilege (42501).
create function pg_temp.denied(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'FAIL (allowed)';
exception when insufficient_privilege then return 'ok';
  when others then return 'FAIL (' || sqlstate || ' ' || sqlerrm || ')';
end $$;

-- anon and a normal user cannot call any admin RPC.
set local role anon;
select 'anon admin_dashboard denied: ' || pg_temp.denied('select public.admin_dashboard()');
select 'anon admin_list_users denied: ' || pg_temp.denied('select * from public.admin_list_users()');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated","aal":"aal1"}', true);
select 'user admin_dashboard denied: ' || pg_temp.denied('select public.admin_dashboard()');
select 'user admin_list_users denied: ' || pg_temp.denied('select * from public.admin_list_users()');
select 'user admin_set_role denied: ' || pg_temp.denied($q$select public.admin_set_role('00000000-0000-0000-0000-0000000000b1', true)$q$);
select 'user admin_map_categories denied: ' || pg_temp.denied('select public.admin_map_categories(array[1::bigint], 1)');
select 'user admin_run_feed denied: ' || pg_temp.denied('select public.admin_run_feed(1)');
select 'user admin_merge_products denied: ' || pg_temp.denied('select public.admin_merge_products(1, 2)');
select 'user admin_reject_match denied: ' || pg_temp.denied('select public.admin_reject_match(1)');
select 'user admin_split_product denied: ' || pg_temp.denied('select public.admin_split_product(1, array[1::bigint])');
select 'user admin_moderate_review denied: ' || pg_temp.denied($q$select public.admin_moderate_review(1, 'approve')$q$);
select 'user admin_decide_report denied: ' || pg_temp.denied($q$select public.admin_decide_report(1, 'dismissed', 'motiv suficient de lung')$q$);
select 'user admin_update_settings denied: ' || pg_temp.denied($q$select public.admin_update_settings('{"match_auto":0.9}')$q$);
select 'user cannot call admin_log: ' || case when not has_function_privilege('authenticated',
  'public.admin_log(uuid, text, text, text, text, jsonb)', 'execute') then 'ok' else 'FAIL' end;
reset role;

-- Admin.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1"}', true);
select 'admin dashboard counts open queue: ' || case when (public.admin_dashboard() ->> 'match_open')::int >= 1 then 'ok' else 'FAIL' end;
select 'admin lists users with e-mail: ' || case when count(*) = 1 then 'ok' else 'FAIL' end
  from public.admin_list_users('user-test@test');
select 'admin cannot revoke own role: ' || case when pg_temp.denied($q$select public.admin_set_role('00000000-0000-0000-0000-0000000000a1', false)$q$) like 'FAIL (P0001%' then 'ok' else 'FAIL' end;
select 'admin settings refuse review >= auto: ' ||
  case when pg_temp.denied($q$select public.admin_update_settings('{"match_review":0.9}')$q$) like 'FAIL (22023%' then 'ok' else 'FAIL' end;
select 'admin settings accept valid values: ' ||
  case when public.admin_update_settings('{"match_auto":0.9,"match_review":0.6}') = 2 then 'ok' else 'FAIL' end;
select 'admin reject needs a reason: ' ||
  case when pg_temp.denied(format($q$select public.admin_moderate_review(%s, 'reject', 'scurt')$q$,
    (select id from public.reviews where user_id = '00000000-0000-0000-0000-0000000000b1'))) like 'FAIL (22023%' then 'ok' else 'FAIL' end;

-- Category mapping assigns the category to products without one.
select 'admin map category updates products: ' || case when public.admin_map_categories(
    array(select cm.id from public.category_mappings cm join public.merchants m on m.id = cm.merchant_id where m.slug = 'adm-shop'),
    (select id from public.categories order by id limit 1)) = 2 then 'ok' else 'FAIL' end;

-- Merge B into A via the queue item.
select public.admin_merge_products(
  (select id from public.products where slug = 'adm-telefon-b'),
  (select id from public.products where slug = 'adm-telefon-a'),
  (select q.id from public.match_queue q join public.offers o on o.id = q.offer_id where o.external_id = 'b1')) is not null;
select 'merge moved all offers: ' || case when (select count(*) from public.offers o join public.products p on p.id = o.product_id
  where o.external_id in ('a1', 'b1', 'b2') and p.slug = 'adm-telefon-a') = 3 then 'ok' else 'FAIL' end;
select 'merge moved price history: ' || case when (select count(*) from public.price_history h join public.offers o on o.id = h.offer_id
  where o.external_id in ('a1', 'b1', 'b2') and h.product_id = o.product_id) = 3 then 'ok' else 'FAIL' end;
select 'merge refreshed stats: ' || case when (select offer_count = 3 and min_price = 990 from public.products where slug = 'adm-telefon-a') then 'ok' else 'FAIL' end;
select 'merge marked source merged: ' || case when (select status = 'merged' and offer_count = 0 and merged_into = (select id from public.products where slug = 'adm-telefon-a')
  from public.products where slug = 'adm-telefon-b') then 'ok' else 'FAIL' end;
select 'merge redirected old slug: ' || case when (select p.slug from public.product_redirects r join public.products p on p.id = r.product_id
  where r.old_slug = 'adm-telefon-b') = 'adm-telefon-a' then 'ok' else 'FAIL' end;
select 'merge merged gtins: ' || case when (select gtins @> '{5940000000017,5940000000024}' from public.products where slug = 'adm-telefon-a') then 'ok' else 'FAIL' end;
select 'merge closed queue item: ' || case when (select status from public.match_queue q join public.offers o on o.id = q.offer_id
  where o.external_id = 'b1') = 'merged' then 'ok' else 'FAIL' end;
select 'merge logged: ' || case when exists (select 1 from public.moderation_log where action = 'product_merge'
  and actor_id = '00000000-0000-0000-0000-0000000000a1') then 'ok' else 'FAIL' end;
reset role;
-- User data checked as superuser (owner-only RLS).
select 'merge kept one favorite per user: ' || case when (select count(*) from public.favorites
  where user_id = '00000000-0000-0000-0000-0000000000b1') = 1 then 'ok' else 'FAIL' end;
select 'merge moved the alert: ' || case when (select p.slug from public.price_alerts a join public.products p on p.id = a.product_id
  where a.user_id = '00000000-0000-0000-0000-0000000000b1') = 'adm-telefon-a' then 'ok' else 'FAIL' end;
select 'merge kept one view row: ' || case when (select count(*) from public.view_history
  where user_id = '00000000-0000-0000-0000-0000000000b1') = 1 then 'ok' else 'FAIL' end;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1"}', true);
select 'merging a merged product is refused: ' || case when pg_temp.denied(format('select public.admin_merge_products(%s, %s)',
  (select id from public.products where slug = 'adm-telefon-b'), (select id from public.products where slug = 'adm-telefon-a'))) like 'FAIL (P0001%' then 'ok' else 'FAIL' end;

-- Split b2 back out into a new product.
select 'split creates a new product: ' || case when (public.admin_split_product(
  (select id from public.products where slug = 'adm-telefon-a'),
  array(select id from public.offers where external_id = 'b2'), 'Telefon Adm A 128GB albastru') ->> 'slug') = 'telefon-adm-a-128gb-albastru' then 'ok' else 'FAIL' end;
select 'split moved the offer and its history: ' || case when (select p.slug from public.offers o join public.products p on p.id = o.product_id
  where o.external_id = 'b2') = 'telefon-adm-a-128gb-albastru'
  and (select h.product_id = o.product_id from public.price_history h join public.offers o on o.id = h.offer_id where o.external_id = 'b2') then 'ok' else 'FAIL' end;
select 'split moved the gtin: ' || case when (select gtins = '{5940000000031}' from public.products where slug = 'telefon-adm-a-128gb-albastru')
  and (select not ('5940000000031' = any (gtins)) from public.products where slug = 'adm-telefon-a') then 'ok' else 'FAIL' end;
select 'split marked the pair distinct: ' || case when (select count(*) from public.product_distinct d
  join public.products a on a.id = d.product_a join public.products b on b.id = d.product_b
  where 'adm-telefon-a' in (a.slug, b.slug) and 'telefon-adm-a-128gb-albastru' in (a.slug, b.slug)) = 1 then 'ok' else 'FAIL' end;
select 'split refuses moving every offer: ' || case when pg_temp.denied(format('select public.admin_split_product(%s, array[%s]::bigint[])',
  (select id from public.products where slug = 'telefon-adm-a-128gb-albastru'), (select id from public.offers where external_id = 'b2'))) like 'FAIL (P0001%' then 'ok' else 'FAIL' end;

-- Reviews and reports.
select public.admin_decide_report((select id from public.review_reports r where r.reporter_id = '00000000-0000-0000-0000-0000000000a1'),
  'actioned', 'Recenzia contine continut publicitar (spam).', true) is not null;
select 'report removed the review with reasons: ' || case when (select status = 'removed' and moderation_reason like 'Recenzia%'
  from public.reviews where user_id = '00000000-0000-0000-0000-0000000000b1') then 'ok' else 'FAIL' end;
reset role;

-- TOTP step-up: an admin with a verified factor needs aal2.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
  values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000a1', 'test', 'totp', 'verified', now(), now(), 'x');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1"}', true);
select 'admin with TOTP and aal1 denied: ' || pg_temp.denied('select public.admin_dashboard()');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
select 'admin with TOTP and aal2 allowed: ' || case when public.admin_dashboard() ? 'products' then 'ok' else 'FAIL' end;
reset role;
rollback;

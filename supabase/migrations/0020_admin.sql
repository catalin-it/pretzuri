-- 0020: admin back office (Phase 5): guard with TOTP step-up, dashboard counts, user list/roles, category mapping,
-- product merge/reject/split for the matching queue, review moderation (DSA statement of reasons), settings.
-- Every RPC is SECURITY DEFINER, checks admin_guard() first, runs in the caller's transaction (one RPC call = one
-- transaction via PostgREST) and writes moderation_log.

-- Admin check for RPCs. An admin who has a verified TOTP factor must call with an aal2 session (step-up);
-- without any verified factor aal1 is accepted here (the web UI still requires enrolling TOTP, see DECISIONS "Admin").
create or replace function public.admin_guard()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2'
     and exists (select 1 from auth.mfa_factors f where f.user_id = uid and f.status = 'verified') then
    raise exception 'admin requires aal2' using errcode = '42501';
  end if;
  return uid;
end $$;
revoke execute on function public.admin_guard() from public, anon;
grant execute on function public.admin_guard() to authenticated;
comment on function public.admin_guard() is 'Raises 42501 unless the caller is admin (with aal2 when a TOTP factor is verified); returns auth.uid().';

-- Internal: log helper (not callable by clients).
create or replace function public.admin_log(p_actor uuid, p_action text, p_type text, p_target text, p_reason text, p_details jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.moderation_log (actor_id, action, target_type, target_id, reason, details)
  values (p_actor, p_action, p_type, p_target, p_reason, p_details)
$$;
revoke execute on function public.admin_log(uuid, text, text, text, text, jsonb) from public, anon, authenticated;

-- Dashboard counters in one round trip.
create or replace function public.admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'products', (select count(*) from public.products where status = 'active'),
    'offers_active', (select count(*) from public.offers where is_active),
    'merchants', (select count(*) from public.merchants),
    'merchants_active', (select count(*) from public.merchants where is_active),
    'feed_sources', (select count(*) from public.feed_sources),
    'match_open', (select count(*) from public.match_queue where status = 'open'),
    'categories_unmapped', (select count(*) from public.category_mappings where category_id is null),
    'reviews_pending', (select count(*) from public.reviews where status = 'pending'),
    'reports_open', (select count(*) from public.review_reports where status = 'open'),
    'imports_pending', (select count(*) from public.import_requests where status in ('pending', 'queued'))
  );
end $$;
revoke execute on function public.admin_dashboard() from public, anon;
grant execute on function public.admin_dashboard() to authenticated;

-- Users with e-mail (auth.users is not exposed through the API). No personal data beyond e-mail and dates.
create or replace function public.admin_list_users(p_search text default null, p_limit int default 50, p_offset int default 0)
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  is_admin boolean,
  has_mfa boolean,
  favorites_count int,
  alerts_count int,
  reviews_count int,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.admin_guard();
  return query
  select u.id, u.email::text, u.created_at, u.last_sign_in_at,
         exists (select 1 from public.user_roles r where r.user_id = u.id and r.role = 'admin'),
         exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'),
         (select count(*)::int from public.favorites f where f.user_id = u.id),
         (select count(*)::int from public.price_alerts a where a.user_id = u.id),
         (select count(*)::int from public.reviews rv where rv.user_id = u.id),
         count(*) over ()
  from auth.users u
  where p_search is null or p_search = '' or u.email ilike '%' || replace(replace(p_search, '%', '\%'), '_', '\_') || '%'
  order by u.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end $$;
revoke execute on function public.admin_list_users(text, int, int) from public, anon;
grant execute on function public.admin_list_users(text, int, int) to authenticated;

-- Grant or revoke the admin role. Never on yourself (no self-lockout, no self-escalation path).
create or replace function public.admin_set_role(p_user_id uuid, p_grant boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.admin_guard();
begin
  if p_user_id is null or p_user_id = me then
    raise exception 'cannot change own role' using errcode = 'P0001';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if p_grant then
    insert into public.user_roles (user_id, role) values (p_user_id, 'admin') on conflict do nothing;
  else
    delete from public.user_roles where user_id = p_user_id and role = 'admin';
  end if;
  perform public.admin_log(me, case when p_grant then 'role_grant' else 'role_revoke' end, 'user', p_user_id::text,
    null, jsonb_build_object('role', 'admin'));
end $$;
revoke execute on function public.admin_set_role(uuid, boolean) from public, anon;
grant execute on function public.admin_set_role(uuid, boolean) to authenticated;

-- Map shop category paths onto our tree (null = unmap). Products of offers with that merchant + category_raw and no
-- category yet get the category (never overwritten). Returns the number of products updated.
create or replace function public.admin_map_categories(p_mapping_ids bigint[], p_category_id bigint)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.admin_guard();
  n int := 0;
begin
  if p_mapping_ids is null or cardinality(p_mapping_ids) = 0 then return 0; end if;
  if cardinality(p_mapping_ids) > 500 then raise exception 'too many mappings' using errcode = 'P0001'; end if;
  if p_category_id is not null and not exists (select 1 from public.categories where id = p_category_id) then
    raise exception 'category not found' using errcode = 'P0002';
  end if;

  update public.category_mappings set category_id = p_category_id where id = any (p_mapping_ids);

  if p_category_id is not null then
    with upd as (
      update public.products p set category_id = p_category_id
      where p.category_id is null and p.status <> 'merged'
        and exists (
          select 1 from public.offers o
          join public.category_mappings cm on cm.merchant_id = o.merchant_id and cm.source_path = o.category_raw
          where o.product_id = p.id and cm.id = any (p_mapping_ids)
        )
      returning 1
    )
    select count(*) into n from upd;
  end if;

  perform public.admin_log(me, case when p_category_id is null then 'category_unmap' else 'category_map' end,
    'category_mapping', array_to_string(p_mapping_ids, ','), null,
    jsonb_build_object('category_id', p_category_id, 'products_updated', n));
  return n;
end $$;
revoke execute on function public.admin_map_categories(bigint[], bigint) from public, anon;
grant execute on function public.admin_map_categories(bigint[], bigint) to authenticated;

-- "Run now": queue an import request for a feed (one pending request per feed at most).
create or replace function public.admin_run_feed(p_feed_source_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.admin_guard();
  n int;
begin
  if not exists (select 1 from public.feed_sources where id = p_feed_source_id) then
    raise exception 'feed source not found' using errcode = 'P0002';
  end if;
  insert into public.import_requests (feed_source_id, requested_by) values (p_feed_source_id, me) on conflict do nothing;
  get diagnostics n = row_count;
  perform public.admin_log(me, 'feed_run_now', 'feed_source', p_feed_source_id::text, null,
    jsonb_build_object('queued', n = 1));
  return n = 1;
end $$;
revoke execute on function public.admin_run_feed(bigint) from public, anon;
grant execute on function public.admin_run_feed(bigint) to authenticated;

-- Merge product p_source into p_target (the survivor, normally the older candidate). Moves offers, price history,
-- favorites, alerts, view history, images and promotions (respecting unique keys: the survivor's row wins), merges
-- GTINs, redirects the old slug, marks the source 'merged', refreshes stats and closes related queue items.
create or replace function public.admin_merge_products(p_source bigint, p_target bigint, p_queue_id bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.admin_guard();
  src public.products%rowtype;
  tgt public.products%rowtype;
  n_offers int;
  n_queue int;
begin
  if p_source is null or p_target is null or p_source = p_target then
    raise exception 'source and target must differ' using errcode = 'P0001';
  end if;
  -- Lock in id order (no deadlock between two admins merging the same pair both ways).
  perform 1 from public.products where id in (p_source, p_target) order by id for update;
  select * into src from public.products where id = p_source;
  select * into tgt from public.products where id = p_target;
  if src.id is null or tgt.id is null then raise exception 'product not found' using errcode = 'P0002'; end if;
  if src.status = 'merged' or tgt.status = 'merged' then
    raise exception 'product already merged' using errcode = 'P0001';
  end if;

  with moved as (
    update public.offers set product_id = p_target, match_method = 'manual', match_score = null
    where product_id = p_source returning 1
  ) select count(*) into n_offers from moved;
  update public.price_history set product_id = p_target where product_id = p_source;

  -- User data: move rows that do not collide with the survivor's unique keys, drop the rest.
  update public.favorites f set product_id = p_target
  where f.product_id = p_source
    and not exists (select 1 from public.favorites x where x.user_id = f.user_id and x.product_id = p_target);
  delete from public.favorites where product_id = p_source;

  update public.price_alerts a set product_id = p_target
  where a.product_id = p_source
    and not exists (select 1 from public.price_alerts x where x.user_id = a.user_id and x.product_id = p_target);
  delete from public.price_alerts where product_id = p_source;
  -- Pending notifications (0012) follow their product; dynamic so this file does not depend on the table existing.
  if to_regclass('public.alert_outbox') is not null then
    execute 'update public.alert_outbox set product_id = $1 where product_id = $2' using p_target, p_source;
  end if;

  update public.view_history t set viewed_at = greatest(t.viewed_at, s.viewed_at)
  from public.view_history s
  where s.product_id = p_source and t.product_id = p_target and t.user_id = s.user_id;
  update public.view_history v set product_id = p_target
  where v.product_id = p_source
    and not exists (select 1 from public.view_history x where x.user_id = v.user_id and x.product_id = p_target);
  delete from public.view_history where product_id = p_source;

  update public.product_images i set product_id = p_target
  where i.product_id = p_source
    and not exists (select 1 from public.product_images x where x.product_id = p_target and x.storage_path = i.storage_path);
  update public.promotions set product_id = p_target where product_id = p_source;

  -- "Different" pairs of the source now apply to the survivor.
  insert into public.product_distinct (product_a, product_b)
  select least(p_target, other), greatest(p_target, other)
  from (
    select case when d.product_a = p_source then d.product_b else d.product_a end as other
    from public.product_distinct d where p_source in (d.product_a, d.product_b)
  ) s
  where other <> p_target
  on conflict do nothing;
  delete from public.product_distinct where p_source in (product_a, product_b);

  -- Survivor keeps its data; fills gaps from the source; GTINs are the union.
  update public.products set
    gtins = (select coalesce(array_agg(distinct g order by g), '{}') from unnest(tgt.gtins || src.gtins) g),
    mpn_norm = coalesce(tgt.mpn_norm, src.mpn_norm),
    brand_id = coalesce(tgt.brand_id, src.brand_id),
    category_id = coalesce(tgt.category_id, src.category_id),
    description = coalesce(tgt.description, src.description),
    image_path = coalesce(tgt.image_path, src.image_path),
    specs = src.specs || tgt.specs
  where id = p_target;

  -- Old slug (and older slugs that pointed to the source) answer with a 301 to the survivor.
  update public.product_redirects set product_id = p_target where product_id = p_source;
  insert into public.product_redirects (old_slug, product_id) values (src.slug, p_target)
  on conflict (old_slug) do update set product_id = excluded.product_id;
  update public.products set merged_into = p_target where merged_into = p_source;
  update public.products set status = 'merged', merged_into = p_target where id = p_source;

  perform public.refresh_product_stats(array[p_source, p_target]);

  -- Queue: items about the source (or the target suggesting the source) are decided; the source as a candidate of
  -- other items is replaced by the survivor.
  with closed as (
    update public.match_queue set status = 'merged', decided_by = me, decided_at = now()
    where status = 'open'
      and (product_id = p_source or id = p_queue_id
           or (product_id = p_target and candidates @> jsonb_build_array(jsonb_build_object('product_id', p_source))))
    returning 1
  ) select count(*) into n_queue from closed;
  update public.match_queue q set candidates = (
    select coalesce(jsonb_agg(case when (c ->> 'product_id')::bigint = p_source
                                   then jsonb_set(c, '{product_id}', to_jsonb(p_target)) else c end), '[]'::jsonb)
    from jsonb_array_elements(q.candidates) c
  )
  where q.status = 'open' and q.candidates @> jsonb_build_array(jsonb_build_object('product_id', p_source));

  perform public.admin_log(me, 'product_merge', 'product', p_source::text, null,
    jsonb_build_object('into', p_target, 'old_slug', src.slug, 'offers_moved', n_offers, 'queue_id', p_queue_id,
                       'queue_closed', n_queue));
  return jsonb_build_object('offers_moved', n_offers, 'queue_closed', n_queue, 'target_slug', tgt.slug);
end $$;
revoke execute on function public.admin_merge_products(bigint, bigint, bigint) from public, anon;
grant execute on function public.admin_merge_products(bigint, bigint, bigint) to authenticated;

-- Reject a queue item: the product and the given candidates (all when null) are different and never suggested again.
create or replace function public.admin_reject_match(p_queue_id bigint, p_candidate_ids bigint[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.admin_guard();
  q public.match_queue%rowtype;
  n int;
begin
  select * into q from public.match_queue where id = p_queue_id for update;
  if q.id is null then raise exception 'queue item not found' using errcode = 'P0002'; end if;
  if q.status <> 'open' then raise exception 'queue item already decided' using errcode = 'P0001'; end if;

  with ins as (
    insert into public.product_distinct (product_a, product_b)
    select least(q.product_id, c.pid), greatest(q.product_id, c.pid)
    from (select distinct (e ->> 'product_id')::bigint as pid from jsonb_array_elements(q.candidates) e) c
    where c.pid <> q.product_id
      and (p_candidate_ids is null or c.pid = any (p_candidate_ids))
      and exists (select 1 from public.products p where p.id = c.pid)
    on conflict do nothing
    returning 1
  ) select count(*) into n from ins;

  update public.match_queue set status = 'rejected', decided_by = me, decided_at = now() where id = p_queue_id;
  perform public.admin_log(me, 'match_reject', 'match_queue', p_queue_id::text, null,
    jsonb_build_object('product_id', q.product_id, 'candidates', p_candidate_ids, 'pairs_added', n));
  return n;
end $$;
revoke execute on function public.admin_reject_match(bigint, bigint[]) from public, anon;
grant execute on function public.admin_reject_match(bigint, bigint[]) to authenticated;

-- URL slug from a title (same rules as the worker's slugify: unaccent, a-z0-9 and dashes, max 80).
create or replace function public.slugify(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(nullif(
    regexp_replace(left(btrim(regexp_replace(lower(public.f_unaccent(coalesce(p, ''))), '[^a-z0-9]+', '-', 'g'), '-'), 80),
      '-+$', ''), ''), 'produs')
$$;

-- Split: move the selected offers (and their price history) of a product to a new product. The new product takes
-- the brand/category of the old one and the GTINs of the moved offers; the pair is marked distinct.
create or replace function public.admin_split_product(p_product_id bigint, p_offer_ids bigint[], p_title text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.admin_guard();
  src public.products%rowtype;
  total int;
  moving int;
  new_title text;
  new_slug text;
  new_id bigint;
  moved_gtins text[];
  i int := 0;
begin
  select * into src from public.products where id = p_product_id for update;
  if src.id is null then raise exception 'product not found' using errcode = 'P0002'; end if;
  if src.status = 'merged' then raise exception 'product already merged' using errcode = 'P0001'; end if;
  select count(*) into total from public.offers where product_id = p_product_id;
  select count(*) into moving from public.offers where product_id = p_product_id and id = any (coalesce(p_offer_ids, '{}'));
  if moving = 0 or moving <> cardinality(array(select distinct unnest(p_offer_ids))) then
    raise exception 'offers do not belong to the product' using errcode = 'P0001';
  end if;
  if moving >= total then raise exception 'cannot move every offer' using errcode = 'P0001'; end if;

  new_title := nullif(btrim(coalesce(p_title, '')), '');
  if new_title is null then
    select o.title into new_title from public.offers o where o.id = any (p_offer_ids) order by o.id limit 1;
  end if;
  if length(new_title) not between 2 and 300 then raise exception 'invalid title' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct o.gtin order by o.gtin), '{}') into moved_gtins
  from public.offers o where o.id = any (p_offer_ids) and o.gtin is not null;

  loop
    new_slug := public.slugify(new_title) || case when i = 0 then '' else '-' || substr(md5(random()::text), 1, 6) end;
    insert into public.products (slug, title, brand_id, category_id, gtins, specs)
    values (new_slug, new_title, src.brand_id, src.category_id, moved_gtins, '{}')
    on conflict (slug) do nothing
    returning id into new_id;
    exit when new_id is not null;
    i := i + 1;
    if i > 10 then raise exception 'could not allocate a slug' using errcode = 'P0001'; end if;
  end loop;

  update public.offers set product_id = new_id, match_method = 'manual', match_score = null
  where id = any (p_offer_ids) and product_id = p_product_id;
  update public.price_history set product_id = new_id where offer_id = any (p_offer_ids) and product_id = p_product_id;

  -- GTINs that now only belong to moved offers leave the old product.
  update public.products set gtins = coalesce(array(
    select g from unnest(src.gtins) g
    where not (g = any (moved_gtins))
       or exists (select 1 from public.offers o where o.product_id = p_product_id and o.gtin = g)
  ), '{}')
  where id = p_product_id;

  insert into public.product_distinct (product_a, product_b)
  values (least(p_product_id, new_id), greatest(p_product_id, new_id)) on conflict do nothing;
  update public.match_queue set status = 'split', decided_by = me, decided_at = now()
  where status = 'open' and offer_id = any (p_offer_ids);

  perform public.refresh_product_stats(array[p_product_id, new_id]);
  perform public.admin_log(me, 'product_split', 'product', p_product_id::text, null,
    jsonb_build_object('new_product_id', new_id, 'offer_ids', p_offer_ids));
  return jsonb_build_object('new_product_id', new_id, 'slug', new_slug);
end $$;
revoke execute on function public.admin_split_product(bigint, bigint[], text) from public, anon;
grant execute on function public.admin_split_product(bigint, bigint[], text) to authenticated;

-- Review moderation (pre-moderated, DECISIONS "Reviews"). Reject/remove need a statement of reasons (DSA art. 17),
-- stored on the review (shown to the author) and in the log.
create or replace function public.admin_moderate_review(p_review_id bigint, p_action text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.admin_guard();
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
  new_status text;
begin
  new_status := case p_action when 'approve' then 'approved' when 'reject' then 'rejected' when 'remove' then 'removed' end;
  if new_status is null then raise exception 'invalid action' using errcode = '22023'; end if;
  if new_status <> 'approved' and (reason is null or length(reason) < 10 or length(reason) > 2000) then
    raise exception 'statement of reasons required (10-2000 chars)' using errcode = '22023';
  end if;
  update public.reviews set status = new_status,
    moderation_reason = case when new_status = 'approved' then null else reason end,
    moderated_by = me, moderated_at = now()
  where id = p_review_id;
  if not found then raise exception 'review not found' using errcode = 'P0002'; end if;
  perform public.admin_log(me, 'review_' || p_action, 'review', p_review_id::text, reason, null);
end $$;
revoke execute on function public.admin_moderate_review(bigint, text, text) from public, anon;
grant execute on function public.admin_moderate_review(bigint, text, text) to authenticated;

-- Decide a DSA notice about a review; optionally remove the review with the same statement of reasons.
create or replace function public.admin_decide_report(p_report_id bigint, p_decision text, p_reason text, p_remove_review boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.admin_guard();
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
  rid bigint;
begin
  if p_decision not in ('actioned', 'dismissed') then raise exception 'invalid decision' using errcode = '22023'; end if;
  if reason is null or length(reason) < 10 or length(reason) > 2000 then
    raise exception 'decision reason required (10-2000 chars)' using errcode = '22023';
  end if;
  if p_remove_review and p_decision <> 'actioned' then
    raise exception 'removing a review means the notice is actioned' using errcode = '22023';
  end if;
  update public.review_reports set status = p_decision, decision_reason = reason, decided_by = me, decided_at = now()
  where id = p_report_id and status = 'open'
  returning review_id into rid;
  if rid is null then raise exception 'open report not found' using errcode = 'P0002'; end if;
  if p_remove_review then
    update public.reviews set status = 'removed', moderation_reason = reason, moderated_by = me, moderated_at = now()
    where id = rid;
    -- Other open notices about the same review are settled by the removal.
    update public.review_reports set status = 'actioned', decision_reason = reason, decided_by = me, decided_at = now()
    where review_id = rid and status = 'open';
  end if;
  perform public.admin_log(me, 'report_' || p_decision, 'review_report', p_report_id::text, reason,
    jsonb_build_object('review_id', rid, 'review_removed', p_remove_review));
end $$;
revoke execute on function public.admin_decide_report(bigint, text, text, boolean) from public, anon;
grant execute on function public.admin_decide_report(bigint, text, text, boolean) to authenticated;

-- Settings: several keys at once (thresholds depend on each other), validated on the final state of the known keys
-- (the UI validates the same rules with zod). Unknown keys are refused.
create or replace function public.admin_setting_valid(p_key text, p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  num numeric;
begin
  if jsonb_typeof(p_value) = 'number' then num := (p_value #>> '{}')::numeric; end if;
  return coalesce(case p_key
    when 'match_auto' then num between 0.5 and 1
    when 'match_review' then num between 0.3 and 1
    when 'mpn_min_length' then num between 1 and 20 and num = trunc(num)
    when 'feed_max_bytes' then num between 1048576 and 10737418240 and num = trunc(num)
    when 'feed_min_ratio' then num between 0 and 1
    when 'feed_max_errors_logged' then num between 0 and 100000 and num = trunc(num)
    when 'offer_stale_hours' then num between 1 and 720 and num = trunc(num)
    when 'mpn_stoplist' then jsonb_typeof(p_value) = 'array' and jsonb_array_length(p_value) <= 500
      and not exists (select 1 from jsonb_array_elements(p_value) e
                      where jsonb_typeof(e) <> 'string' or length(e #>> '{}') not between 1 and 40)
    when 'allowed_currencies' then jsonb_typeof(p_value) = 'array' and jsonb_array_length(p_value) between 1 and 20
      and not exists (select 1 from jsonb_array_elements(p_value) e
                      where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^[A-Z]{3}$')
  end, false);
end $$;

create or replace function public.admin_update_settings(p_values jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.admin_guard();
  k text;
  v jsonb;
  old jsonb;
  changes jsonb := '{}';
begin
  if jsonb_typeof(p_values) <> 'object' then raise exception 'object expected' using errcode = '22023'; end if;
  for k, v in select * from jsonb_each(p_values) loop
    select value into old from public.settings where key = k for update;
    if old is null then raise exception 'unknown setting %', k using errcode = 'P0002'; end if;
    if not public.admin_setting_valid(k, v) then raise exception 'invalid value for %', k using errcode = '22023'; end if;
    if old is distinct from v then
      update public.settings set value = v, updated_at = now() where key = k;
      changes := changes || jsonb_build_object(k, jsonb_build_object('old', old, 'new', v));
    end if;
  end loop;
  if (select (value #>> '{}')::numeric from public.settings where key = 'match_review')
     >= (select (value #>> '{}')::numeric from public.settings where key = 'match_auto') then
    raise exception 'match_review must be lower than match_auto' using errcode = '22023';
  end if;
  if changes <> '{}' then
    perform public.admin_log(me, 'settings_update', 'setting', (select string_agg(x, ',') from jsonb_object_keys(changes) x),
      null, changes);
  end if;
  return (select count(*)::int from jsonb_object_keys(changes));
end $$;
revoke execute on function public.admin_update_settings(jsonb) from public, anon;
grant execute on function public.admin_update_settings(jsonb) to authenticated;

-- Admin lists filter by these.
create index if not exists match_queue_open_product_idx on public.match_queue (product_id) where status = 'open';
create index if not exists category_mappings_merchant_count_idx on public.category_mappings (merchant_id, offer_count desc);
create index if not exists review_reports_review_idx on public.review_reports (review_id);
create index if not exists offers_merchant_category_raw_idx on public.offers (merchant_id, category_raw) where category_raw is not null;

-- 0011: account self-service (Phase 4): account deletion (GDPR), push subscription registration, alert state reset.
-- Data export is assembled by the web app from the user's own rows (RLS), see src/lib/account/export.ts.

-- Deletes the caller's auth user. Every user table cascades from auth.users (profiles, favorites, price_alerts,
-- push_subscriptions, view_history, reviews, alert_outbox); review_reports.reporter_id and moderation columns are
-- set null (DSA records stay, without the person).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;
end $$;
comment on function public.delete_my_account() is
  'GDPR erasure: deletes the calling user (auth.users row) and, by cascade, all of their data.';
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Stores a Web Push subscription for the caller. An endpoint belongs to one browser profile: when another account
-- signed in on the same browser registered it before, the row moves to the caller (the old account stops getting
-- pushes on this device, which is what the person on the device expects).
create or replace function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(length(p_p256dh), 0) not between 16 and 200 or coalesce(length(p_auth), 0) not between 8 and 100 then
    raise exception 'invalid push subscription' using errcode = '22023';
  end if;
  -- Abuse guard: at most 10 devices per account (oldest dropped).
  delete from public.push_subscriptions
  where id in (
    select id from public.push_subscriptions
    where user_id = uid and endpoint <> p_endpoint
    order by created_at desc offset 9
  );
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end $$;
revoke execute on function public.register_push_subscription(text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text) to authenticated;

-- A new target price, or re-activating an alert, starts a fresh notification cycle.
create or replace function public.price_alerts_reset_state()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.target_price is distinct from old.target_price or (new.is_active and not old.is_active) then
    new.last_notified_at := null;
    new.last_notified_price := null;
  elsif not public.is_admin() and current_user in ('authenticated', 'anon') then
    -- Clients cannot fake the notification state (it is written by evaluate_price_alerts only).
    new.last_notified_at := old.last_notified_at;
    new.last_notified_price := old.last_notified_price;
  end if;
  return new;
end $$;
create trigger price_alerts_reset_state before update on public.price_alerts
  for each row execute function public.price_alerts_reset_state();

-- Inserts from clients never carry a notification state.
create or replace function public.price_alerts_clean_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.last_notified_at := null;
    new.last_notified_price := null;
  end if;
  return new;
end $$;
create trigger price_alerts_clean_insert before insert on public.price_alerts
  for each row execute function public.price_alerts_clean_insert();

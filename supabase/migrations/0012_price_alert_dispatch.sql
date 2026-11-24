-- 0012: price alert evaluation and delivery (Phase 4).
--   1. alert_outbox: one row per notification to send (push and/or email). No client access (RLS on, no policies).
--   2. evaluate_price_alerts(): enqueues alerts whose product's lowest available TOTAL price (price + shipping, active
--      offers not out of stock) is <= the target. Re-notifies only when that price drops below the last notified
--      price, or after 7 days (DECISIONS "Price alerts"). The notification state is written at enqueue time, so the
--      evaluation is idempotent.
--   3. claim_alert_outbox() / complete_alert_outbox(): used by the edge function alerts-dispatch (service_role only).
--   4. kick_alerts_dispatch(): pg_net POST to the edge function with header x-alerts-secret = Vault secret
--      'alerts_dispatch_secret' (copied from the NAS supabase/.env ALERTS_DISPATCH_SECRET by remote-apply.sh).
--   5. pg_cron 'pretzuri_price_alerts' every 15 min: evaluate + kick; outbox retention 30 days.

create table public.alert_outbox (
  id bigint generated always as identity primary key,
  alert_id bigint not null references public.price_alerts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id bigint not null references public.products (id) on delete cascade,
  offer_id bigint references public.offers (id) on delete set null,
  price numeric(12, 2) not null,
  target_price numeric(12, 2) not null,
  send_push boolean not null,
  send_email boolean not null,
  push_done boolean not null default false,
  email_done boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts int not null default 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  check (send_push or send_email)
);
comment on table public.alert_outbox is
  'Price alert notifications to deliver (alerts-dispatch edge function). Server-only: no client policies.';
create index alert_outbox_due_idx on public.alert_outbox (created_at) where status in ('pending', 'sending');
create index alert_outbox_alert_idx on public.alert_outbox (alert_id);
create index alert_outbox_user_idx on public.alert_outbox (user_id);
create index alert_outbox_product_idx on public.alert_outbox (product_id);
create index alert_outbox_offer_idx on public.alert_outbox (offer_id);
create index alert_outbox_created_idx on public.alert_outbox (created_at);

alter table public.alert_outbox enable row level security;
revoke all on public.alert_outbox from anon, authenticated;

-- Evaluation (cron). Returns the number of enqueued notifications.
create or replace function public.evaluate_price_alerts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  with best as (
    select distinct on (a.id)
      a.id as alert_id, a.user_id, a.product_id, a.target_price,
      a.notify_push, (a.notify_email and coalesce(pr.email_alerts, true)) as send_email,
      o.id as offer_id, o.total_price as price
    from public.price_alerts a
    join public.products p on p.id = a.product_id and p.status = 'active'
    join public.offers o on o.product_id = a.product_id and o.is_active and o.availability <> 'out_of_stock'
    left join public.profiles pr on pr.id = a.user_id
    where a.is_active
    order by a.id, o.total_price, o.id
  ),
  due as (
    select b.* from best b
    join public.price_alerts a on a.id = b.alert_id
    where b.price <= b.target_price
      and (b.notify_push or b.send_email)
      and (
        a.last_notified_at is null
        or b.price < a.last_notified_price
        or a.last_notified_at < now() - interval '7 days'
      )
      and not exists (
        select 1 from public.alert_outbox x where x.alert_id = b.alert_id and x.status in ('pending', 'sending')
      )
  ),
  ins as (
    insert into public.alert_outbox (alert_id, user_id, product_id, offer_id, price, target_price, send_push, send_email)
    select alert_id, user_id, product_id, offer_id, price, target_price, notify_push, send_email from due
    returning alert_id, price
  ),
  upd as (
    update public.price_alerts a set last_notified_at = now(), last_notified_price = ins.price
    from ins where a.id = ins.alert_id
    returning 1
  )
  select count(*) into n from upd;
  return n;
end $$;
revoke execute on function public.evaluate_price_alerts() from public, anon, authenticated;

-- Claim a batch for delivery (lease 5 min, max 5 attempts). Returns everything the sender needs, already joined.
create or replace function public.claim_alert_outbox(p_limit int default 50)
returns table (
  outbox_id bigint,
  alert_id bigint,
  locale text,
  email text,
  send_push boolean,
  send_email boolean,
  product_slug text,
  product_title text,
  merchant_name text,
  price numeric,
  target_price numeric,
  subscriptions jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Rows that ran out of attempts are given up.
  update public.alert_outbox set status = 'failed'
  where status in ('pending', 'sending') and attempts >= 5
    and (status = 'pending' or claimed_at < now() - interval '5 minutes');

  return query
  with picked as (
    select x.id from public.alert_outbox x
    where (x.status = 'pending' or (x.status = 'sending' and x.claimed_at < now() - interval '5 minutes'))
      and x.attempts < 5
    order by x.created_at
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    for update skip locked
  ),
  claimed as (
    update public.alert_outbox x set status = 'sending', claimed_at = now(), attempts = x.attempts + 1
    from picked where x.id = picked.id
    returning x.*
  )
  select c.id, c.alert_id, coalesce(pr.locale, 'ro'), u.email::text,
         c.send_push and not c.push_done, c.send_email and not c.email_done and u.email is not null,
         p.slug, p.title, m.name, c.price, c.target_price,
         case when c.send_push and not c.push_done then coalesce((
           select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
           from public.push_subscriptions s where s.user_id = c.user_id
         ), '[]'::jsonb) else '[]'::jsonb end
  from claimed c
  join auth.users u on u.id = c.user_id
  join public.products p on p.id = c.product_id
  left join public.profiles pr on pr.id = c.user_id
  left join public.offers o on o.id = c.offer_id
  left join public.merchants m on m.id = o.merchant_id;
end $$;
revoke execute on function public.claim_alert_outbox(int) from public, anon, authenticated;
grant execute on function public.claim_alert_outbox(int) to service_role;

-- Report the result of one outbox row. Channels that succeeded are not retried.
create or replace function public.complete_alert_outbox(
  p_outbox_id bigint,
  p_push_ok boolean,
  p_email_ok boolean,
  p_error text default null,
  p_dead_subscription_ids bigint[] default '{}',
  p_used_subscription_ids bigint[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(array_length(p_dead_subscription_ids, 1), 0) > 0 then
    delete from public.push_subscriptions s
    using public.alert_outbox x
    where x.id = p_outbox_id and s.user_id = x.user_id and s.id = any (p_dead_subscription_ids);
  end if;
  if coalesce(array_length(p_used_subscription_ids, 1), 0) > 0 then
    update public.push_subscriptions s set last_used_at = now()
    from public.alert_outbox x
    where x.id = p_outbox_id and s.user_id = x.user_id and s.id = any (p_used_subscription_ids);
  end if;
  update public.alert_outbox x set
    push_done = x.push_done or coalesce(p_push_ok, false),
    email_done = x.email_done or coalesce(p_email_ok, false),
    last_error = left(p_error, 300)
  where x.id = p_outbox_id and x.status = 'sending';
  update public.alert_outbox x set
    status = case
      when (not x.send_push or x.push_done) and (not x.send_email or x.email_done) then 'sent'
      when x.attempts >= 5 then 'failed'
      else 'pending' end,
    sent_at = case when (not x.send_push or x.push_done) and (not x.send_email or x.email_done) then now() end
  where x.id = p_outbox_id and x.status = 'sending';
end $$;
revoke execute on function public.complete_alert_outbox(bigint, boolean, boolean, text, bigint[], bigint[])
  from public, anon, authenticated;
grant execute on function public.complete_alert_outbox(bigint, boolean, boolean, text, bigint[], bigint[]) to service_role;

-- pg_net kick of the edge function. Returns the pg_net request id, or null when the secret is missing.
create or replace function public.kick_alerts_dispatch()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_url text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'alerts_dispatch_secret';
  if v_secret is null or v_secret = '' then
    raise warning 'alerts_dispatch_secret missing in Vault; alerts-dispatch not called';
    return null;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'alerts_dispatch_url';
  return net.http_post(
    url := coalesce(nullif(btrim(v_url), ''), 'http://functions:9000/alerts-dispatch'),
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-alerts-secret', v_secret),
    timeout_milliseconds := 30000
  );
end $$;
comment on function public.kick_alerts_dispatch() is
  'Internal. POSTs {} to the alerts-dispatch edge function (default http://functions:9000/alerts-dispatch, override '
  'with Vault secret alerts_dispatch_url) with header x-alerts-secret = Vault alerts_dispatch_secret.';
revoke execute on function public.kick_alerts_dispatch() from public, anon, authenticated;

-- Cron entry point: evaluate, then call the sender when something is due. Also outbox retention.
create or replace function public.run_price_alerts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  n := public.evaluate_price_alerts();
  if exists (
    select 1 from public.alert_outbox
    where (status = 'pending' or (status = 'sending' and claimed_at < now() - interval '5 minutes')) and attempts < 5
  ) then
    perform public.kick_alerts_dispatch();
  end if;
  delete from public.alert_outbox where status in ('sent', 'failed') and created_at < now() - interval '30 days';
  return n;
end $$;
revoke execute on function public.run_price_alerts() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'pretzuri_price_alerts') then
    perform cron.unschedule('pretzuri_price_alerts');
  end if;
end $$;
select cron.schedule('pretzuri_price_alerts', '*/15 * * * *', $$select public.run_price_alerts()$$);

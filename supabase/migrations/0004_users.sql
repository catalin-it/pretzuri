-- 0004: user data: profiles, favorites, price alerts, push subscriptions, view history, merchant reviews.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or length(display_name) between 1 and 40),
  locale text not null default 'ro' check (locale in ('ro', 'en')),
  email_alerts boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

-- A profile row for every new account (locale from the sign-up metadata when given).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, locale)
  values (new.id, case when new.raw_user_meta_data ->> 'locale' = 'en' then 'en' else 'ro' end)
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id bigint not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index favorites_product_idx on public.favorites (product_id);

create table public.price_alerts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id bigint not null references public.products (id) on delete cascade,
  target_price numeric(12, 2) not null check (target_price > 0),
  notify_push boolean not null default true,
  notify_email boolean not null default true,
  is_active boolean not null default true,
  last_notified_at timestamptz,
  last_notified_price numeric(12, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id),
  check (notify_push or notify_email)
);
create index price_alerts_product_idx on public.price_alerts (product_id) where is_active;
create trigger price_alerts_touch before update on public.price_alerts for each row execute function public.touch_updated_at();

-- At most 100 alerts per user (abuse guard).
create or replace function public.price_alerts_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.price_alerts where user_id = new.user_id) >= 100 then
    raise exception 'price alert limit reached' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger price_alerts_limit before insert on public.price_alerts for each row execute function public.price_alerts_limit();

create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Last view per product (one row per user+product), kept 90 days (pg_cron retention in 0006).
create table public.view_history (
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id bigint not null references public.products (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index view_history_user_idx on public.view_history (user_id, viewed_at desc);
create index view_history_viewed_idx on public.view_history (viewed_at);

-- Merchant reviews: logged-in users only, pre-moderated (DECISIONS "Reviews").
create table public.reviews (
  id bigint generated always as identity primary key,
  merchant_id bigint not null references public.merchants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  title text check (title is null or length(title) between 1 and 120),
  body text not null check (length(body) between 20 and 4000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'removed')),
  -- Statement of reasons (DSA) when rejected/removed, shown to the author.
  moderation_reason text,
  moderated_by uuid references auth.users (id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, user_id)
);
create index reviews_merchant_idx on public.reviews (merchant_id, created_at desc) where status = 'approved';
create index reviews_pending_idx on public.reviews (created_at) where status = 'pending';
create index reviews_user_idx on public.reviews (user_id);
create trigger reviews_touch before update on public.reviews for each row execute function public.touch_updated_at();

-- Authors can edit only their text/rating; any edit sends the review back to moderation.
create or replace function public.reviews_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then return new; end if;
  if new.user_id <> old.user_id or new.merchant_id <> old.merchant_id then
    raise exception 'cannot move a review' using errcode = 'P0001';
  end if;
  new.status := 'pending';
  new.moderation_reason := null;
  new.moderated_by := null;
  new.moderated_at := null;
  return new;
end $$;
create trigger reviews_guard before update on public.reviews for each row execute function public.reviews_guard();

-- Recompute a merchant's rating from approved reviews.
create or replace function public.refresh_merchant_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mid bigint := coalesce(new.merchant_id, old.merchant_id);
begin
  update public.merchants m set
    rating_avg = s.avg_rating,
    rating_count = s.n
  from (
    select round(avg(rating)::numeric, 2) as avg_rating, count(*)::int as n
    from public.reviews where merchant_id = mid and status = 'approved'
  ) s
  where m.id = mid;
  return null;
end $$;
create trigger reviews_rating after insert or delete or update of status, rating on public.reviews
  for each row execute function public.refresh_merchant_rating();

-- DSA notices about reviews (any logged-in user).
create table public.review_reports (
  id bigint generated always as identity primary key,
  review_id bigint not null references public.reviews (id) on delete cascade,
  reporter_id uuid references auth.users (id) on delete set null,
  reason text not null check (reason in ('illegal', 'fake', 'offensive', 'personal_data', 'spam', 'other')),
  details text check (details is null or length(details) <= 2000),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  decision_reason text,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (review_id, reporter_id)
);
create index review_reports_open_idx on public.review_reports (created_at) where status = 'open';

-- RLS.
alter table public.profiles enable row level security;
alter table public.favorites enable row level security;
alter table public.price_alerts enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.view_history enable row level security;
alter table public.reviews enable row level security;
alter table public.review_reports enable row level security;

create policy profiles_own_select on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_own_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy favorites_own_all on public.favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy price_alerts_own_all on public.price_alerts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subscriptions_own_all on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy view_history_own_all on public.view_history for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Approved reviews are public; authors see their own in any state; admin sees all.
create policy reviews_public_select on public.reviews for select
  using (status = 'approved' or user_id = auth.uid() or public.is_admin());
create policy reviews_own_insert on public.reviews for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and moderated_by is null);
create policy reviews_own_update on public.reviews for update to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy reviews_own_delete on public.reviews for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy review_reports_insert on public.review_reports for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'open' and decided_by is null);
create policy review_reports_select on public.review_reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
create policy review_reports_admin_update on public.review_reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.profiles, public.favorites, public.price_alerts, public.push_subscriptions,
  public.view_history, public.review_reports from anon;
revoke insert, update, delete on public.reviews from anon;
revoke insert, delete on public.profiles from authenticated;

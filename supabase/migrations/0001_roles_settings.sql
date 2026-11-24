-- 0001: admin roles, is_admin(), settings, moderation log.

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
comment on table public.user_roles is 'Staff roles. Granted manually via SQL (no self-service).';
alter table public.user_roles enable row level security;
create policy user_roles_select_own on public.user_roles for select to authenticated using (user_id = auth.uid());
revoke all on public.user_roles from anon;
revoke insert, update, delete on public.user_roles from authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Key/value settings (matching thresholds, feed limits). Read by the worker and SQL functions; admin-editable.
create table public.settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;
create policy settings_admin_all on public.settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.settings from anon;

insert into public.settings (key, value, description) values
  ('match_auto', '0.85', 'Title similarity at or above which an offer is matched automatically'),
  ('match_review', '0.55', 'Title similarity at or above which a new product is queued for manual review'),
  ('mpn_min_length', '4', 'Shorter manufacturer codes are ignored for matching'),
  ('mpn_stoplist', '["N/A","NA","NONE","-","0","DIVERSE"]', 'Manufacturer codes never used for matching'),
  ('feed_max_bytes', '2147483648', 'Max uncompressed feed size (bytes)'),
  ('feed_min_ratio', '0.5', 'A run that sees fewer rows than this ratio of the previous run does not expire offers'),
  ('feed_max_errors_logged', '1000', 'Max row errors stored per run'),
  ('allowed_currencies', '["RON"]', 'Currencies accepted from feeds (no conversion yet)'),
  ('offer_stale_hours', '72', 'Offers not seen for this long are deactivated even without a successful run');

-- Append-only log of admin actions (matching decisions, review moderation, feed changes).
create table public.moderation_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text not null,
  reason text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index moderation_log_target_idx on public.moderation_log (target_type, target_id);
create index moderation_log_created_idx on public.moderation_log (created_at desc);
alter table public.moderation_log enable row level security;
create policy moderation_log_admin_select on public.moderation_log for select to authenticated using (public.is_admin());
create policy moderation_log_admin_insert on public.moderation_log for insert to authenticated
  with check (public.is_admin() and actor_id = auth.uid());
revoke all on public.moderation_log from anon;
revoke update, delete on public.moderation_log from authenticated;

-- updated_at helper.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

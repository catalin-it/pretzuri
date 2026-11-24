---
name: rls-audit
description: Audit Row Level Security, grants and security-definer functions on the self-hosted Supabase DB of Pretzuri. Use after any migration, before releases, or when the user asks whether data is safe or leaking.
---
Run the queries with `bash infra/nas/psql.sh dev -tA < file.sql` (DEV only; never write to prod during an audit).

1. **Tables without RLS** (result must be empty):
   `select tablename from pg_tables where schemaname='public' and not rowsecurity;`
2. **Policies per table/action:** `select tablename, policyname, cmd, roles, qual, with_check from pg_policies where schemaname='public' order by 1,3;`
   Every table needs an explicit decision for select/insert/update/delete.
3. **Public catalog only shows active rows:** as `anon`, `products`, `offers`, `merchants`, `categories` return
   no inactive/expired rows; `feed_sources`, `feed_runs`, `match_queue`, `clicks`, `settings`, `cpc_rates`,
   `affiliate_commissions` return nothing.
4. **Private columns:** `anon`/`authenticated` cannot read feed credentials, raw feed URLs with tokens or
   moderation notes, e.g. `select has_column_privilege('anon','public.feed_sources','url','select');` must be false.
5. **Security definer functions:** each has `search_path` set and checks `auth.uid()` / `is_admin()`:
   `select p.proname, p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef;`
6. **`feed_worker` role:** only the grants it needs (`\dp` / `information_schema.role_table_grants`), no access to
   `auth.*` or user tables (favorites, alerts, push subscriptions, view history, reviews).
7. **Impersonation test** (users A and B, inside a transaction that is rolled back):
   ```sql
   begin;
   set local role authenticated;
   select set_config('request.jwt.claims', '{"sub":"<uuid-A>","role":"authenticated"}', true);
   -- A must NOT see B's favorites, price alerts, push subscriptions, view history or pending reviews
   select ...;
   rollback;
   ```
8. **Output:** a pass/fail table (check · result · fix). Fix through a new migration (skill `supabase-migration`) or report it.

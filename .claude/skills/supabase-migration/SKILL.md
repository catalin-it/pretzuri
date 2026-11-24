---
name: supabase-migration
description: Create and apply a SQL migration to the self-hosted Supabase on the NAS. Use whenever the database schema, policies, triggers, grants, SQL functions, search indexes or pg_cron jobs must change, even for small changes like adding a column.
---
There is no local Docker: `npx supabase start`, `db reset` and `--local` do NOT work here. DEV must be running
(`bash infra/nas/dev-up.sh`).

1. **Create** `supabase/migrations/<NNNN>_<short_snake_case>.sql`, where `NNNN` is the next number after the
   highest existing one. Start with a header comment `-- NNNN: <what and why>`. Never rename or edit an applied file.
2. **Write** clear SQL: explicit constraints, money as `numeric(12,2)` + `currency char(3)`, timestamps `timestamptz`,
   an index for every FK and filter/sort column, `comment on` for non-obvious objects.
3. **Every new table:** `alter table ... enable row level security;` plus explicit policies per action
   (no policy = deny). Catalog tables: public `select` only for active rows. User tables: owner-only.
   Admin: `public.is_admin()`. Worker writes: grants to role `feed_worker` only on the tables it needs.
4. **Functions that bypass RLS:** `security definer set search_path = public, extensions`, validate `auth.uid()` /
   `is_admin()` inside, `revoke execute ... from public, anon` where appropriate.
5. **Search:** FTS via generated `search_tsv` with the `simple_unaccent` config + `gin`; fuzzy via
   `gin (title_norm gin_trgm_ops)`. Check `explain analyze` on DEV with realistic data.
6. **pg_cron jobs:** `select cron.schedule('pretzuri_<name>', '<cron>', $$...$$);` idempotent (unschedule first if it
   exists). Keep job bodies as calls to SQL functions so they are testable.
7. **Check pending:** `bash infra/nas/db-migrate.sh dev --dry-run`.
8. **Apply to DEV:** `bash infra/nas/db-migrate.sh dev`. Each file runs in one transaction; on error nothing is
   applied. Fix the file (it is not applied yet) and rerun.
9. **Regenerate types:** `bash infra/nas/gen-types.sh dev` → `src/lib/database.types.ts` (+ worker copy).
10. **Audit:** run skill `rls-audit`. SQL tests go in `supabase/tests/NNNN_*.test.sql`.
11. **PROD** only with the user's explicit approval: `bash infra/nas/db-migrate.sh prod --dry-run`, then `--yes`.
12. Tick the task in `docs/ROADMAP.md` if it completes one; record new rules in `docs/DECISIONS.md`.

Ad-hoc SQL (read-only inspection): `echo "select ...;" | bash infra/nas/psql.sh dev -tA`.

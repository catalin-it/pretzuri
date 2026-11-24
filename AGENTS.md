# Pretzuri — project context (shared by Claude Code, Cursor, any agent)

**Pretzuri** is a price comparison PWA for Romania (like compari.ro / price.ro). We sell nothing: we show the offers
of many shops for the same product, with price history and price alerts, and send the user to the shop's site.
Solo founder + AI agents.
**Reply to the user in Romanian. Code, comments, commits and docs in English.**

## Stack
- Next.js (App Router) + TypeScript strict, Tailwind, next-intl (`ro` default, `en`), Zod, TanStack Query
- PWA: Serwist (service worker), web app manifest, Web Push (VAPID, self-hosted) for price alerts
- Supabase **self-hosted**: Auth (email code + optional password), Postgres (pg_cron, pg_trgm, full-text search),
  Storage (cached product images / thumbnails), Edge Functions
- Feed worker: separate Node.js container (`worker/`), streaming XML/CSV parsing, job queue in Postgres (pg-boss),
  scheduling via pg_cron
- Search: Postgres FTS + pg_trgm. Meilisearch (self-hosted) only if measurements show we need it.
- Vitest + Playwright. No paid external services (PROD: SMTP only; DEV: Mailpit).
- Hosting: Docker on the shared Synology NAS 192.168.0.111, DEV now, PROD only on explicit request. Public access via
  Cloudflare + DSM Reverse Proxy (`dev-pretzuri.it-ist.ro` / `api-dev-pretzuri.it-ist.ro`, PROD `pretzuri.it-ist.ro` /
  `api-pretzuri.it-ist.ro`). Domains live in env only. Later: own domain + VPS, so everything stays portable
  (docker compose + env, nothing Synology-specific in code). See `infra/nas/README.md`.

## Folder layout
- `src/app/[locale]/` routes · `src/components/` UI · `src/lib/` supabase clients, pricing/format utils
- `worker/` feed import worker (own package.json + Dockerfile): adapters, normalize, matching, queue
- `supabase/migrations/` SQL migrations (source of truth for the schema) · `supabase/functions/` Edge Functions
- `infra/supabase/` vendored self-hosted Supabase stack · `infra/nas/` deploy scripts + per-env settings
- `tests/unit/`, `tests/e2e/` · `docs/` roadmap, decisions, legal questions, feed format

## Commands
- `npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm test` · `npm run test:e2e`
- Worker: `npm --prefix worker test` · `npm --prefix worker run typecheck`
- No local Docker. Everything goes over SSH to the NAS:
  - `bash infra/nas/dev-up.sh` / `bash infra/nas/dev-down.sh`: start / stop the whole DEV (`pretzuri-dev*` projects
    only). DEV runs only while we work; PROD runs permanently. Run `dev-up.sh` before any DEV task that needs the NAS.
  - `bash infra/nas/deploy-supabase.sh dev [up]`: sync/configure/start the Supabase stack
  - `bash infra/nas/deploy-web.sh dev`: build + run the Next.js container (prod needs `--yes`)
  - `bash infra/nas/deploy-worker.sh dev`: build + run the feed worker (prod needs `--yes`)
  - `bash infra/nas/db-migrate.sh dev [--dry-run]`: apply pending migrations (prod needs `--yes`)
  - `bash infra/nas/gen-types.sh dev`: writes `src/lib/database.types.ts` (+ copy for the worker)
  - `echo "select 1;" | bash infra/nas/psql.sh dev -tA`: ad-hoc SQL (prod needs `--yes`)

## Non-negotiable rules
1. Every table has Row Level Security enabled, with explicit policies. No table ships without them.
2. Never expose the `service_role` key to the client. Never commit `.env*`.
3. Schema changes only via new migration files, never by editing applied ones.
4. Every user-facing string goes through next-intl (`ro` default + `en`, keys in sync). No hard-coded
   price/date/number formats: use the helpers in `src/lib/format/` (lei, `ro-RO` dates).
5. Legal data sources only: affiliate feeds (2Performant, Profitshare) and direct partner feeds. **No scraping**
   of other sites. If a feature seems to need it, ask the user first.
6. Compliance (Romania/EU): GDPR, Omnibus (30-day lowest price shown on reductions), P2B (public ranking criteria),
   clear marking of paid/affiliate placements ("Promovat", "Link afiliat", `rel="sponsored nofollow"`), DSA for
   reviews (notice & action, statement of reasons), and the affiliate networks' terms. Flag legal questions to the
   user (add them to `docs/LEGAL-QUESTIONS.md`); never assume.
7. Offer ranking is fixed by the founder (see DECISIONS "Ranking"). Never change ordering logic without updating
   the public "How we rank" page and DECISIONS.
8. Click tracking (`/go/<offer>`) stores no personal data beyond what is needed (no IP, no user id, no full UA).
9. The NAS is shared with unrelated apps (kissorslap-*, jellyfin, …). Only touch compose projects `pretzuri-dev`,
   `pretzuri-prod` and their `-web` / `-worker` projects under `/volume1/docker/pretzuri-*`. Never prune, never
   stop/rm containers without a project filter. The worker always runs with CPU/RAM limits. No unnecessary
   containers: HTTP→HTTPS redirect is done by Cloudflare ("Always Use HTTPS"), not by a container.
10. DEV first. PROD only when the user explicitly says so in the current task.
11. Before finishing a task: typecheck, lint, tests green; tick the `docs/ROADMAP.md` checkbox.
12. Check `docs/DECISIONS.md` before product/DB work (grep the relevant `##` section). Add new decisions there.
13. Reuse before building: permissive licenses only (MIT, BSD, Apache-2.0, ISC); record copied/bundled code in
    `THIRD_PARTY_NOTICES.md` and say what was found and why it was or wasn't used.

## Workflow
**Versioning:** semver in `package.json`. For every user-visible change, bump the version and add a changelog entry
(en + ro, newest first) in `src/lib/changelog/entries.ts`. The unit test enforces the format.

Do small changes (a few files) directly, without subagents. Delegate only bigger or parallel work to
`.claude/agents/`, with a short brief and the exact files to touch:
- `db-architect`: migrations (schema, RLS, RPCs, pg_cron jobs, search indexes)
- `backend-supabase`: auth, storage, edge functions, web push + email for price alerts
- `feed-engineer`: the import worker, adapters, normalization, product matching, job queue
- `frontend-dev`: UI, i18n, PWA UX, product/category/search pages, SEO (SSR, sitemap, JSON-LD)
- `nas-ops`: Docker/deploy/env/backups on the NAS, ONLY the `pretzuri-*` projects
- `qa-tester`: Vitest + Playwright against DEV (including sample feeds)
- `code-reviewer` (read-only): only for DB, auth, matching/import changes and before a PROD promotion
- `security-gdpr` (opus, read-only): only before a PROD promotion or when the user asks

Run independent agents in parallel (e.g. a migration and a UI page); give each a narrow scope.
Skills in `.claude/skills/`: supabase-migration, rls-audit, pwa-setup, e2e-test, feed-import, product-matching.

### Lean mode (all agents: speed and token cost matter)
- Read only what the task needs: grep first, then read with offset/limit. Never read whole large files
  (`src/lib/database.types.ts`, `messages/*.json`, old migrations, `docs/DECISIONS.md`, `package-lock.json`,
  feed fixtures).
- Edit `messages/*.json` with targeted edits or a small script; keep ro and en keys in sync.
- Run `npm run typecheck`, `npm run lint`, `npm test` once at the end, not after every edit.
- E2E: run only the specs related to the change, and only when asked or for auth/DB/import flows.
- No exploratory refactors, no re-verifying what the caller already checked, no full-repo audits unless asked.
- Reports are short (see each agent's limit): what changed, what to check, open risks.

Ask the user when product behavior is ambiguous; do not guess business rules.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

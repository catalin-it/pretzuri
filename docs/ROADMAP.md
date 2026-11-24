# Pretzuri — Roadmap (tick boxes as tasks finish)
Market: Romania · Model: free for users; affiliate/CPC later (disabled now) · DEV first, PROD on request

## Phase 0 — Setup
- [x] Project rules: `AGENTS.md`, `CLAUDE.md`, `.claude/agents`, `.claude/skills`, docs
- [x] Git repo `catalin-it/pretzuri` (private), deploy key via SSH alias `github-pretzuri`
- [x] App skeleton: Next.js 16 + TS strict + Tailwind + next-intl (`ro` default, `en`) + Serwist + Vitest + Playwright
- [x] `infra/supabase` vendored (self-hosted v0.8.4) + `PRETZURI.md` with local changes, pg_cron + pg_trgm
- [x] `infra/nas` scripts: deploy-supabase, deploy-web, deploy-worker, db-migrate, gen-types, psql, dev-up, dev-down, backup-prod
- [x] Supabase DEV on the NAS (`pretzuri-dev`, 127.0.0.1:8400) + Mailpit (8425)
- [x] Web DEV container (`pretzuri-dev-web`, 127.0.0.1:3400)
- [ ] Cloudflare DNS + "Always Use HTTPS", DSM Reverse Proxy rules, origin certificate (user, steps in `infra/nas/README.md`)
- [ ] Verified: `https://dev-pretzuri.it-ist.ro/ro` and `https://api-dev-pretzuri.it-ist.ro/auth/v1/health`

## Phase 1 — Database
- [x] Extensions (pg_trgm, pg_cron, unaccent) + FTS config `simple_unaccent`
- [x] Catalog: categories (seeded tree), brands (+aliases), products, product_images
- [x] Merchants, feed_sources, category_mappings, settings
- [x] Offers, price_history, 30-day lowest price functions (Omnibus)
- [x] Import tables: import_requests, feed_runs, feed_run_errors, match_queue
- [x] Users: profiles, user_roles/is_admin, favorites, price_alerts, push_subscriptions, view_history
- [x] Reviews (pre-moderation, reports, moderation log)
- [x] Clicks (+ daily aggregates), monetization tables (cpc_rates, promotions, affiliate_commissions) disabled
- [x] Role `feed_worker` with minimal grants; RLS audit green; SQL tests
- [x] pg_cron: expire offers, enqueue due feeds, retention (view_history, clicks), aggregates

## Phase 2 — Feed import
- [x] Worker package (`worker/`), Dockerfile, compose with limits, `deploy-worker.sh`
- [x] pg-boss queue + `import_requests` poller
- [x] Download (SSRF guard, size limit, gzip, ETag) + streaming XML/CSV parsers
- [x] Adapters: 2Performant, Profitshare, direct (`docs/FEED-FORMAT.md`)
- [x] Validation + normalization (price, currency, GTIN, MPN, brand, stock, shipping, categories)
- [x] Matching: GTIN → brand+MPN → title similarity; match_queue
- [x] Upsert offers + price history + expiry + run report
- [x] Image cache: download, thumbnail (sharp), Storage bucket `product-images` (migration 0031, `worker/src/images/`; offers keep the shop URL, `products.image_path` points to the cached WebP)
- [x] Sample feeds imported on DEV; second run proves expiry + price history

## Phase 3 — Public pages
- [x] Layout, header search, home (categories, price drops)
- [x] Search (FTS + trigram), category listing with filters (price, brand, merchant, specs) and sorting
- [x] Product page: offers by total price, stock, merchant, price history chart, 30-day lowest, specs, JSON-LD
- [x] `/go/<offerId>` redirect + click counting (no personal data), sponsored/affiliate marking
- [x] Compare 2–4 products
- [x] Merchant profile page + approved reviews
- [x] "Cum ordonăm" (P2B), legal pages (privacy, terms, cookies, affiliate disclosure) — privacy/terms are drafts
  pending legal review (operator identity placeholder, LEGAL-QUESTIONS 1); cookies are a section of the privacy page
- [x] SEO: sitemap, robots, canonical, hreflang — one sitemap for now (up to 20k products); split with
  `generateSitemaps` when the catalog grows
- [ ] PWA: manifest, service worker, offline page, install prompt

## Phase 4 — Accounts & alerts
- [x] Auth: email code + optional password (Mailpit on DEV)
- [x] Favorites, view history (90 days), account deletion + data export (GDPR)
- [x] Price alerts: target price, push (VAPID) + email, unsubscribe
- [x] Merchant reviews: submit, report (DSA)

## Phase 5 — Admin
- [ ] Feed sources (CRUD, run now, run reports)
- [ ] Category mapping
- [ ] Matching queue (merge / reject / split)
- [ ] Review moderation (statement of reasons)
- [ ] Users and roles

## Later
- [ ] Merchant portal (feed submission, click statistics)
- [ ] Monetization: CPC per merchant/category, promoted positions ("Promovat"), affiliate commissions
- [ ] Meilisearch if Postgres search is not enough
- [ ] PROD on the NAS, then own domain + VPS

## Open decisions
- PROD SMTP provider (free tier).
- Answers in `docs/LEGAL-QUESTIONS.md`.

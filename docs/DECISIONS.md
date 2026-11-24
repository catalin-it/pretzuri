# Product & technical decisions

These were decided by the founder. Agents must follow them and must not re-litigate them without the user.
Newest first within each section. Legal items should still be reviewed by a lawyer (see `LEGAL-QUESTIONS.md`).

## Positioning
- Price comparison for Romania. We sell nothing; we show shop offers for the same product with price history and
  alerts, and send the user to the shop. Default locale `ro`, also `en`. Prices in lei (RON).
- Data sources: affiliate feeds (2Performant and Profitshare, both from the start; founder has approved accounts)
  and direct XML/CSV feeds from partner shops (our documented format). **No scraping**, ever, without asking.

## Catalog & categories (2026-11-24)
- General catalog covering all domains. Our own category tree (2–3 levels, ~15 roots), seeded by migration and
  editable in admin. Detailed first: IT & electronics, home appliances, home/garden/DIY, health/beauty/perfume.
- Shop categories are mapped onto our tree through `category_mappings` (per merchant/source); unmapped categories
  are reported per import and handled in admin.

## Ranking (2026-11-24, P2B criterion, published on the "Cum ordonăm" page)
- Offers on a product page are ordered by **total price ascending** (price + shipping). Ties: in stock first, then
  merchant rating, then merchant name (as offered in the founder's choice; implemented in `product_offers()`).
- When a feed gives no shipping cost, the offer is ranked by its product price and shows the label
  "cost livrare nespecificat" (no guessed shipping).
- Promoted positions (when enabled) are shown separately and clearly marked "Promovat"; they never change the
  organic order. Monetization (CPC, promotions, affiliate commissions) exists in the schema but is **disabled**.

## Merchants (2026-11-24)
- Shops without an affiliate relationship appear only if they give us a direct feed; their offers use a plain
  link (no affiliate parameters). Affiliate offers are marked "Link afiliat" and use `rel="sponsored nofollow"`.

## Product matching (2026-11-24)
- Order: GTIN/EAN → brand + manufacturer code → title similarity (pg_trgm + Levenshtein) with thresholds stored
  in `settings` (auto 0.85, review 0.55 to start).
- An offer without a confident match becomes a **new canonical product, visible immediately**, and goes into the
  manual review queue; admin can merge it later. A false merge is worse than a duplicate.

## Reviews (2026-11-24)
- Merchant reviews: only logged-in users, **pre-moderated** (visible after admin approval), "Raportează" button
  (DSA notice), moderation log with statement of reasons.

## Hosting (2026-11-24)
- Docker on the shared Synology NAS 192.168.0.111; later own domain + VPS for PROD, so everything stays portable
  (docker compose + env). Compose projects `pretzuri-dev|prod` (+ `-web`, `-worker`) in `/volume1/docker/pretzuri-*`.
- **DEV runs only while we work** (`infra/nas/dev-up.sh` / `dev-down.sh`); **PROD runs permanently** (not deployed
  yet; only on explicit request). RAM on the NAS is tight (~2.5 GB free of 12 GB on 2026-11-24).
- **No unnecessary containers:** the web container publishes its port directly (no edge/redirect nginx).
  HTTP→HTTPS redirect is Cloudflare "Always Use HTTPS".
- Hosts (env only): PROD `pretzuri.it-ist.ro` + `api-pretzuri.it-ist.ro`; DEV `dev-pretzuri.it-ist.ro` +
  `api-dev-pretzuri.it-ist.ro`. Cloudflare DNS + DSM Reverse Proxy.
- Host ports (127.0.0.1 only, checked free on 2026-11-24; 8310 is taken by another app):
  DEV web 3400, API 8400, pooler 54342/54343 (optional), Mailpit UI 8425 (LAN);
  PROD web 3500, API 8500, pooler 54352/54353 (optional).
- Feed worker limits: 768 MB RAM, low `cpu_shares` (256), no published ports. The Synology kernel has no CFS quota
  support, so hard CPU caps (`cpus:`) are impossible there (2026-11-25); the worker processes one job at a time and
  builds run with `nice`. On a VPS later, add `cpus: 1.0`.
- Realtime is off (no chat/live features): saves RAM on the NAS. Re-enable with `COMPOSE_PROFILES=realtime`.
- DNS: the `it-ist.ro` zone is at ClouDNS, not Cloudflare (found 2026-11-25). Cloudflare proxy + "Always Use HTTPS"
  require moving the zone to Cloudflare (recommended, user action) — see `infra/nas/README.md`, "Public access".
  Rate limiting uses `CF-Connecting-IP`; DSM rules accept only Cloudflare IP ranges so the header cannot be forged.
- SMTP: Mailpit on DEV; an SMTP provider on PROD (to be chosen; free tier, no paid services).

## Queue & scheduling (2026-11-24)
- pg-boss (MIT) runs the import jobs. pg_cron does DB-side scheduling: it writes due feeds into
  `import_requests`, which the worker moves into pg-boss. pg_cron never writes into pg-boss internal tables
  (their schema is versioned by pg-boss).

## Feed import (2026-11-25)
- Network column maps are defaults with several accepted spellings per field (`worker/src/adapters/*.ts`,
  documented in `docs/FEED-FORMAT.md`), overridable per source via `feed_sources.options.field_map`. 2Performant
  fields partly confirmed from its public feed guide; the affiliate-export columns and the Profitshare tags are not
  verified (docs behind login) → check the first real feed of each network and adjust the map, not the code.
- Network affiliate links are stored unchanged in `offers.affiliate_url`; dropped for non-affiliate merchants.
- SSRF policy: feed URLs only `http(s)`; every hop (max 5 redirects) is resolved and refused if any address is
  private, loopback, link-local, CGNAT, multicast or reserved (IPv4 + IPv6, incl. mapped/NAT64); the check runs in
  the socket `lookup`, so DNS rebinding has no window. Idle timeout 60 s, size cap `settings.feed_max_bytes` on the
  decompressed stream, gzip by header / `.gz` / magic bytes. XML: saxes, DOCTYPE rejected (no XXE).
- Sample feeds: `https://fixtures.invalid/<name>` (or `fixture:<name>` in code/tests) reads `worker/fixtures/<name>`
  from the image, only with `WORKER_ALLOW_FIXTURES=1` (DEV env file). `.invalid` never resolves, so the URL passes the
  `feed_sources.url` check without a schema change and is inert anywhere fixtures are off.
- Existing offers keep their product on later runs (no re-matching each run); only new offers are matched.
  Title scores are computed in the worker (pg_trgm only retrieves candidates), with a numeric/variant guard:
  different capacity/model number/RAM or variant word (Pro, Ultra, EDP/EDT, ...) is never an automatic match.
- `price_history` gets a row for every new offer and when price, shipping or availability changes (also on
  reactivation). Expiry is skipped (run `partial`) when valid rows < `feed_min_ratio` × previous count; such a
  run does not lower the baseline.
- The `feed_worker` password stays on the NAS: the role gets a SCRAM verifier computed in the worker image
  (the DB logs DDL), the connection string lives in `worker/worker.secret.env` (mode 600).

## Product image cache
- Shop images are never hot-linked (CSP `img-src` allows only self + Supabase). A separate pg-boss queue
  `image-cache` (singleton, low priority) runs after each feed job, every 15 min and 20 s after start; it skips
  while a feed is importing. Products with `image_path` null and an active offer with `image_url` are processed
  in pages of `image_batch` (max 10 pages per run), 4 workers, per-host gate (`image_host_concurrency` 2,
  `image_host_delay_ms` 300). Download reuses the feed downloader (SSRF guard on every hop, redirects) with
  `image_max_bytes` 5 MB; the type is sniffed from the magic bytes (jpeg/png/webp/gif; SVG refused), decoded with
  sharp (40 MP input cap, 1 thread, cache off), EXIF-rotated, fitted into 600x600 without enlarging, WebP q78,
  metadata dropped. Object `p/<product_id>/<sha256-16>.webp` in the public bucket (2 MB, image/webp only), then
  `products.image_path` + a `product_images` row. All thresholds are in `settings` (`image_*`).
- Failures are recorded per offer (`offers.image_fail_count`, `image_last_error`, `image_checked_at`); after
  `image_max_failures` (3) the offer is skipped, another active offer of the product is tried instead. A trigger
  resets the counters when the feed changes `image_url`.
- Upload path: the Storage API (`http://storage:5000`, compose network, not through the public gateway) with the
  service_role key. Chosen over writing `storage.objects` + files directly (bypasses Storage's metadata and would
  need file-system access) and over a custom JWT role (Storage switches to the claimed DB role, which needs extra
  grants for the authenticator). The key is the only extra secret: `deploy-worker.sh` reads `SERVICE_ROLE_KEY` from
  `supabase/.env` on the NAS inside the remote script and appends `STORAGE_SERVICE_KEY` to `worker.secret.env`
  (mode 600); it is never printed, committed or logged (error bodies are scrubbed). Without it the job stays off.
  Residual risk: a compromised worker holds a key that can write all Storage buckets; revisit when more buckets or
  private files exist (then a dedicated Storage role or a small upload endpoint).
- RLS: `storage.objects` has one policy, public SELECT on bucket `product-images`; no insert/update/delete policy,
  so clients cannot write (anon POST returns 400).
- DEV: with `WORKER_ALLOW_FIXTURES=1`, `https://fixtures.invalid/img/<name>` maps to `worker/fixtures/images/<name>`
  and `*-test.example.ro` image URLs get one of the `sample-*` images by URL hash (no network). Inert elsewhere.
- libvips (LGPL-3.0) ships inside sharp's prebuilt binary package, dynamically linked and replaceable: recorded as
  a conscious exception to the "no LGPL" policy in THIRD_PARTY_NOTICES (we do not modify or statically link it).

## Versioning
- Semver in `package.json`, starting at 0.1.0. Changelog in code (`src/lib/changelog/entries.ts`, en + ro).

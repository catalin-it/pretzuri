---
name: feed-import
description: Work on the Pretzuri feed import pipeline - feed formats (2Performant, Profitshare, direct XML/CSV), download, streaming parsing, validation, normalization (price, currency, units, GTIN, brand, category mapping), offer upsert, price history, expiry and import reports, with tests on sample feeds. Use for any change in worker/src/{adapters,normalize,pipeline} or docs/FEED-FORMAT.md.
---
**Pipeline** (`worker/src/pipeline/`), one pg-boss job per feed run, streaming end to end:
1. **Download** (undici): only `http(s)` URLs from `feed_sources`, block private/LAN IPs (SSRF), timeouts,
   max size (`settings.feed_max_bytes`), gzip/zip handled as streams, `ETag` / `If-Modified-Since` (304 = no-op run).
2. **Parse**: XML with `saxes` (no DTD/entities → no XXE), CSV with `csv-parse` (delimiter/encoding from the source
   config, BOM-safe). Emit one raw record at a time; never build the whole document in memory.
3. **Adapter** (`worker/src/adapters/<type>.ts`) maps network fields to `RawOffer`. Keep the network's affiliate
   URL exactly as given.
4. **Validate** with Zod (`worker/src/schema/offer.ts`). Invalid rows go to `feed_run_errors` (row number, field,
   reason, max 1000 per run) and are skipped; never abort the run for single bad rows.
5. **Normalize** (`worker/src/normalize/`): price → `numeric` in RON (comma/dot, thousands separators, "lei");
   other currencies only if `settings.allowed_currencies` contains them (no conversion yet); `old_price` kept only
   if > price; GTIN digits only + checksum (invalid → null, logged); brand canonical via `brands` aliases; MPN
   upper-case without spaces/dashes; stock → `in_stock|limited|out_of_stock|preorder|unknown`; shipping cost
   null when absent (UI shows "cost livrare nespecificat"); category via `category_mappings` (unmapped → kept as
   raw path, counted in the report).
6. **Match** (skill `product-matching`).
7. **Upsert** in batches of 500 on `(merchant_id, external_id)`; write a `price_history` row only when the price
   or availability changed; set `last_seen_at = run start`.
8. **Expire**: offers of this source not seen in this run get `expires_at = now()` (only if the run finished OK and
   saw ≥ `settings.feed_min_ratio` of the previous row count, otherwise keep them and flag the run).
9. **Report** in `feed_runs`: rows read, valid, invalid, new products, new offers, updated, unchanged, expired,
   unmapped categories, queued matches, duration, peak memory.

**Feed formats:** network field maps in `worker/src/adapters/`; our direct format in `docs/FEED-FORMAT.md`
(id, title, gtin/ean, brand, mpn, category, price, old_price, currency, availability, shipping_cost,
shipping_days, url, image_url, description).

**Tests:** small fixtures in `worker/fixtures/` (`2performant-sample.csv`, `profitshare-sample.xml`,
`direct-sample.xml`, `direct-sample.csv`, plus `*-bad.*` with broken rows). Unit-test each adapter and normalizer;
an integration test runs a fixture twice (second run with one product removed and one price changed) and asserts
report counts, expiry and one new `price_history` row. Big-file test: generate 200k rows on the fly and assert
peak RSS stays under 300 MB.

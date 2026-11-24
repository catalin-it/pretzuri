---
name: product-matching
description: Match incoming feed offers to canonical products in Pretzuri - GTIN/EAN, then brand + manufacturer code (MPN), then title similarity (pg_trgm + Levenshtein) with thresholds, plus the manual review queue and admin merge/split. Use for any change in worker/src/matching/, match_queue or the admin matching screen.
---
A canonical `product` has many `offers`. **A false merge is worse than a duplicate**: when unsure, create a new
product and queue it for review (founder decision: unmatched offers become visible new products immediately).

Order (stop at the first hit), in `worker/src/matching/`:
1. **GTIN**: normalized GTIN-13 (pad GTIN-8/12/14 consistently) in `products.gtins` → match (`method='gtin'`,
   confidence 1.0). If one GTIN maps to several products, do not pick one: queue as conflict.
2. **Brand + MPN**: canonical brand id + normalized MPN equal → match (`method='mpn'`, 0.95). Ignore MPNs that
   are too short (< 4 chars) or generic (listed in `settings.mpn_stoplist`).
3. **Title similarity**, candidates limited to the same brand (if known) and the same top category:
   - normalize: lower case, `unaccent`, strip shop noise (promo words, colors list kept separately, "+ cadou"),
     unify units (`1 TB` = `1000 GB`, `ml`, `kg`), keep model numbers and capacities;
   - score = max(`similarity(title_norm)` from pg_trgm via `%` with an index, `1 - levenshtein/len`) with a penalty
     when numeric tokens (capacity, model number, size) differ;
   - `score >= settings.match_auto` (default 0.85) and numeric tokens equal → match (`method='title'`);
   - `settings.match_review` (0.55) ≤ score < auto → **new product** (visible) + `match_queue` row with up to
     5 candidates and their scores;
   - below → new product, no queue.
4. On match: add the GTIN/MPN to the product if missing (never overwrite existing ones); store
   `offers.match_method` and `match_score`.

**Admin queue** (`/admin/matching`): accept a candidate → merge (move offers + price history, keep the older
product id, redirect the old slug 301, merge GTINs), reject → mark `distinct_from` so the pair is never suggested
again, split → move selected offers to a new product. Every action is logged with admin id and time.

**Tests**: table-driven Vitest cases in `worker/src/matching/*.test.ts` with real-looking Romanian titles
(e.g. "Telefon mobil Samsung Galaxy S24, 256GB, 8GB RAM, Dual SIM, Onyx Black" vs "Samsung Galaxy S24 5G 256 GB
Negru" → match; "iPhone 15 128GB" vs "iPhone 15 Pro 128GB" → not auto; "SSD 1TB" vs "SSD 2TB" same model →
never auto). Track precision on a labelled sample in `worker/fixtures/matching-labelled.csv`; changing a
threshold needs the precision numbers in the PR and a DECISIONS entry.

import type { Queryable } from "../db/pool.js";
import type { Settings } from "../db/settings.js";
import { isUsableMpn } from "../normalize/codes.js";
import type { NormalizedOffer } from "../normalize/offer.js";
import { slugify, slugSuffix } from "../normalize/text.js";
import { decide, normalizeForMatch, scoreTitles } from "./title.js";

export type MatchMethod = "gtin" | "mpn" | "title" | "new";
export type QueueReason = "title_review" | "gtin_conflict" | "mpn_conflict";

export interface MatchInput {
  offer: NormalizedOffer;
  brandId: number | null;
  categoryId: number | null;
  /** Top-level slug of categoryId, limits title candidates to the same top category. */
  topSlug: string | null;
}

export interface MatchResult {
  productId: number;
  method: MatchMethod;
  score: number | null;
  createdProduct: boolean;
  queue?: { reason: QueueReason; candidates: Array<{ product_id: number; score: number }> };
}

const CANDIDATE_LIMIT = 10;

/**
 * Matching order (skill product-matching): GTIN -> brand + MPN -> title similarity. A false merge is worse
 * than a duplicate: conflicts and uncertain titles get a new visible product plus a match_queue entry.
 */
export class Matcher {
  constructor(private db: Queryable, private settings: Settings) {}

  async match(input: MatchInput): Promise<MatchResult> {
    const { offer, brandId } = input;
    const s = this.settings;

    // 1. GTIN
    if (offer.gtin) {
      const r = await this.db.query<{ id: number }>(
        "select id from public.products where gtins @> array[$1]::text[] and status <> 'merged' order by id limit 5",
        [offer.gtin],
      );
      if (r.rows.length === 1) {
        await this.enrich(r.rows[0]!.id, input, false);
        return { productId: r.rows[0]!.id, method: "gtin", score: 1, createdProduct: false };
      }
      if (r.rows.length > 1) {
        const pid = await this.createProduct(input, { withGtin: false });
        return {
          productId: pid,
          method: "new",
          score: null,
          createdProduct: true,
          queue: { reason: "gtin_conflict", candidates: r.rows.map((x) => ({ product_id: x.id, score: 1 })) },
        };
      }
    }

    // 2. Brand + MPN
    if (brandId !== null && isUsableMpn(offer.mpnNorm, s.mpnMinLength, s.mpnStoplist)) {
      const r = await this.db.query<{ id: number }>(
        "select id from public.products where brand_id = $1 and mpn_norm = $2 and status <> 'merged' order by id limit 5",
        [brandId, offer.mpnNorm],
      );
      if (r.rows.length === 1 && !(await this.contradicts(r.rows[0]!.id, offer, false))) {
        await this.enrich(r.rows[0]!.id, input, true);
        return { productId: r.rows[0]!.id, method: "mpn", score: 0.95, createdProduct: false };
      }
      if (r.rows.length >= 1) {
        const pid = await this.createProduct(input, { withGtin: true, withMpn: false });
        return {
          productId: pid,
          method: "new",
          score: null,
          createdProduct: true,
          queue: { reason: "mpn_conflict", candidates: r.rows.map((x) => ({ product_id: x.id, score: 0.95 })) },
        };
      }
    }

    // 3. Title similarity (candidates via the pg_trgm index, scored in JS).
    const scored = await this.titleCandidates(input);
    const best = scored[0];
    if (best) {
      let d = decide(best, s);
      // A title match never overrides hard identifiers: a different GTIN or MPN sends it to review instead.
      if (d === "auto" && (await this.contradicts(best.productId, offer, true))) d = "review";
      if (d === "auto") {
        await this.enrich(best.productId, input, true);
        return { productId: best.productId, method: "title", score: best.score, createdProduct: false };
      }
      if (d === "review") {
        const pid = await this.createProduct(input, { withGtin: true });
        return {
          productId: pid,
          method: "new",
          score: best.score,
          createdProduct: true,
          queue: {
            reason: "title_review",
            candidates: scored
              .filter((c) => c.score >= s.matchReview)
              .slice(0, 5)
              .map((c) => ({ product_id: c.productId, score: c.score })),
          },
        };
      }
    }
    const pid = await this.createProduct(input, { withGtin: true });
    return { productId: pid, method: "new", score: best?.score ?? null, createdProduct: true };
  }

  /** Candidates: same brand (or unbranded), same top category (or uncategorized), not declared distinct. */
  async titleCandidates(
    input: MatchInput,
    excludeDistinctFrom: number | null = null,
  ): Promise<Array<{ productId: number; score: number; guard: boolean }>> {
    const r = await this.db.query<{ id: number; title: string }>(
      `select p.id, p.title
       from public.products p
       left join public.categories c on c.id = p.category_id
       where p.title_norm % (select public.norm_text($1))
         and p.status <> 'merged'
         and ($2::bigint is null or p.brand_id = $2 or p.brand_id is null)
         and ($3::text is null or p.category_id is null or split_part(c.path, '/', 1) = $3)
         and ($4::bigint is null or not exists (
           select 1 from public.product_distinct d
           where d.product_a = least(p.id, $4::bigint) and d.product_b = greatest(p.id, $4::bigint)))
       order by similarity(p.title_norm, (select public.norm_text($1))) desc
       limit ${CANDIDATE_LIMIT}`,
      [input.offer.title, input.brandId, input.topSlug, excludeDistinctFrom],
    );
    const mine = normalizeForMatch(input.offer.title);
    return r.rows
      .map((row) => ({ productId: row.id, ...scoreTitles(mine, row.title) }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * True when the product's known identifiers contradict the offer: it already has GTINs and the offer's GTIN is not
   * one of them, or (when checkMpn) both have usable MPNs that differ.
   */
  private async contradicts(productId: number, offer: NormalizedOffer, checkMpn: boolean): Promise<boolean> {
    const r = await this.db.query<{ gtins: string[]; mpn_norm: string | null }>(
      "select gtins, mpn_norm from public.products where id = $1",
      [productId],
    );
    const p = r.rows[0];
    if (!p) return true;
    if (offer.gtin && p.gtins.length > 0 && !p.gtins.includes(offer.gtin)) return true;
    const usable = isUsableMpn(offer.mpnNorm, this.settings.mpnMinLength, this.settings.mpnStoplist);
    if (checkMpn && usable && p.mpn_norm && p.mpn_norm !== offer.mpnNorm) return true;
    return false;
  }

  /** Adds missing GTIN / MPN / brand / category to a matched product (never overwrites). */
  private async enrich(productId: number, input: MatchInput, addGtin: boolean): Promise<void> {
    const { offer } = input;
    const usableMpn = isUsableMpn(offer.mpnNorm, this.settings.mpnMinLength, this.settings.mpnStoplist);
    await this.db.query(
      `update public.products set
         gtins = case when $2::text is not null and not ($2 = any(gtins))
                        and not exists (select 1 from public.products o where o.id <> $1 and $2 = any(o.gtins))
                      then array_append(gtins, $2) else gtins end,
         mpn_norm = coalesce(mpn_norm, $3),
         brand_id = coalesce(brand_id, $4),
         category_id = coalesce(category_id, $5)
       where id = $1
         and (($2::text is not null and not ($2 = any(gtins))) or (mpn_norm is null and $3::text is not null)
              or (brand_id is null and $4::bigint is not null) or (category_id is null and $5::bigint is not null))`,
      [productId, addGtin ? offer.gtin : null, usableMpn ? offer.mpnNorm : null, input.brandId, input.categoryId],
    );
  }

  private async createProduct(input: MatchInput, opts: { withGtin: boolean; withMpn?: boolean }): Promise<number> {
    const { offer } = input;
    const usableMpn = (opts.withMpn ?? true) && isUsableMpn(offer.mpnNorm, this.settings.mpnMinLength, this.settings.mpnStoplist);
    const gtins = opts.withGtin && offer.gtin ? [offer.gtin] : [];
    const base = slugify(offer.title);
    for (let i = 0; i < 6; i++) {
      const slug = i === 0 ? base : `${base}-${slugSuffix(i < 3 ? 4 : 8)}`;
      const r = await this.db.query<{ id: number }>(
        `insert into public.products (slug, title, brand_id, category_id, mpn_norm, gtins, description, specs)
         values ($1, $2, $3, $4, $5, $6::text[], $7, coalesce($8::jsonb, '{}'::jsonb))
         on conflict (slug) do nothing returning id`,
        [
          slug,
          offer.title,
          input.brandId,
          input.categoryId,
          usableMpn ? offer.mpnNorm : null,
          gtins,
          offer.description,
          offer.specs ? JSON.stringify(offer.specs) : null,
        ],
      );
      if (r.rows[0]) return r.rows[0].id;
    }
    throw new Error(`could not allocate a unique slug for "${offer.title.slice(0, 60)}"`);
  }
}

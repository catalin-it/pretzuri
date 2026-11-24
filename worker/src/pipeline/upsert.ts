import type { Queryable } from "../db/pool.js";
import type { Matcher, MatchResult } from "../matching/matcher.js";
import type { NormalizedOffer } from "../normalize/offer.js";
import type { RunCounters } from "./report.js";

export const BATCH_SIZE = 500;

export interface PreparedRow {
  offer: NormalizedOffer;
  brandId: number | null;
  categoryId: number | null;
  topSlug: string | null;
}

interface ExistingOffer {
  id: number;
  external_id: string;
  product_id: number;
  price: string;
  old_price: string | null;
  shipping_cost: string | null;
  shipping_days: string | null;
  availability: string;
  is_active: boolean;
  title: string;
  url: string;
  affiliate_url: string | null;
  image_url: string | null;
  gtin: string | null;
  mpn: string | null;
  category_raw: string | null;
}

const numEq = (a: string | null, b: number | null) => (a === null ? b === null : b !== null && Number(a) === b);

/**
 * Writes one batch (<= 500 rows): existing offers keep their product; new offers are matched one by one
 * (so later rows see products created by earlier ones). Then one upsert on (merchant_id, external_id), price
 * history rows for new offers and for price/shipping/availability changes (and reactivations), match_queue
 * entries for uncertain matches. Adds touched product ids to `touched`.
 */
export async function writeBatch(
  db: Queryable,
  matcher: Matcher,
  ctx: { merchantId: number; feedSourceId: number; runStartedAt: Date },
  rows: PreparedRow[],
  counters: RunCounters,
  touched: Set<number>,
): Promise<void> {
  if (!rows.length) return;
  const ext = rows.map((r) => r.offer.externalId);
  const ex = await db.query<ExistingOffer>(
    `select id, external_id, product_id, price::text, old_price::text, shipping_cost::text, shipping_days, availability,
            is_active, title, url, affiliate_url, image_url, gtin, mpn, category_raw
     from public.offers where merchant_id = $1 and external_id = any($2::text[])`,
    [ctx.merchantId, ext],
  );
  const existing = new Map(ex.rows.map((r) => [r.external_id, r]));

  const matches = new Map<string, MatchResult>();
  const payload: Array<Record<string, unknown>> = [];
  const productCategory: Array<{ product_id: number; category_id: number }> = [];
  for (const r of rows) {
    const o = r.offer;
    const old = existing.get(o.externalId);
    let productId: number;
    let method: string | null = null;
    let score: number | null = null;
    if (old) {
      productId = old.product_id;
      if (r.categoryId !== null) productCategory.push({ product_id: productId, category_id: r.categoryId });
    } else {
      const m = await matcher.match({ offer: o, brandId: r.brandId, categoryId: r.categoryId, topSlug: r.topSlug });
      matches.set(o.externalId, m);
      productId = m.productId;
      method = m.method;
      score = m.score;
      if (m.createdProduct) counters.products_new++;
    }
    payload.push({
      product_id: productId,
      external_id: o.externalId,
      title: o.title,
      url: o.url,
      affiliate_url: o.affiliateUrl,
      price: o.price,
      old_price: o.oldPrice,
      currency: o.currency,
      availability: o.availability,
      shipping_cost: o.shippingCost,
      shipping_days: o.shippingDays,
      image_url: o.imageUrl,
      gtin: o.gtin,
      mpn: o.mpn,
      brand_raw: o.brandRaw,
      category_raw: o.categoryRaw,
      match_method: method,
      match_score: score,
    });
  }

  const up = await db.query<{ id: number; external_id: string; product_id: number }>(
    `insert into public.offers (merchant_id, feed_source_id, product_id, external_id, title, url, affiliate_url, price,
       old_price, currency, availability, shipping_cost, shipping_days, image_url, gtin, mpn, brand_raw, category_raw,
       match_method, match_score, is_active, first_seen_at, last_seen_at, expired_at)
     select $1, $2, r.product_id, r.external_id, r.title, r.url, r.affiliate_url, r.price, r.old_price, r.currency,
       r.availability, r.shipping_cost, r.shipping_days, r.image_url, r.gtin, r.mpn, r.brand_raw, r.category_raw,
       r.match_method, r.match_score, true, $3, $3, null
     from jsonb_to_recordset($4::jsonb) as r(product_id bigint, external_id text, title text, url text,
       affiliate_url text, price numeric, old_price numeric, currency text, availability text, shipping_cost numeric,
       shipping_days text, image_url text, gtin text, mpn text, brand_raw text, category_raw text, match_method text,
       match_score real)
     on conflict (merchant_id, external_id) do update set
       feed_source_id = excluded.feed_source_id, title = excluded.title, url = excluded.url,
       affiliate_url = excluded.affiliate_url, price = excluded.price, old_price = excluded.old_price,
       currency = excluded.currency, availability = excluded.availability, shipping_cost = excluded.shipping_cost,
       shipping_days = excluded.shipping_days, image_url = excluded.image_url, gtin = excluded.gtin,
       mpn = excluded.mpn, brand_raw = excluded.brand_raw, category_raw = excluded.category_raw,
       is_active = true, last_seen_at = excluded.last_seen_at, expired_at = null
     returning id, external_id, product_id`,
    [ctx.merchantId, ctx.feedSourceId, ctx.runStartedAt, JSON.stringify(payload)],
  );

  const byExt = new Map(rows.map((r) => [r.offer.externalId, r.offer]));
  const history: Array<Record<string, unknown>> = [];
  const queue: Array<Record<string, unknown>> = [];
  for (const u of up.rows) {
    const o = byExt.get(u.external_id)!;
    const old = existing.get(u.external_id);
    const point = { offer_id: u.id, product_id: u.product_id, price: o.price, shipping_cost: o.shippingCost, availability: o.availability };
    if (!old) {
      counters.offers_new++;
      history.push(point);
      touched.add(u.product_id);
      const m = matches.get(u.external_id);
      if (m?.queue) queue.push({ offer_id: u.id, product_id: u.product_id, reason: m.queue.reason, candidates: m.queue.candidates });
      continue;
    }
    const priceChanged = !numEq(old.price, o.price);
    const tracked = priceChanged || !numEq(old.shipping_cost, o.shippingCost) || old.availability !== o.availability || !old.is_active;
    const other =
      !numEq(old.old_price, o.oldPrice) || old.title !== o.title || old.url !== o.url || old.affiliate_url !== o.affiliateUrl ||
      old.image_url !== o.imageUrl || old.shipping_days !== o.shippingDays || old.gtin !== o.gtin || old.mpn !== o.mpn ||
      old.category_raw !== o.categoryRaw;
    if (tracked) {
      history.push(point);
      touched.add(u.product_id);
      if (priceChanged) counters.price_changes++;
    }
    if (tracked || other) counters.offers_updated++;
    else counters.offers_unchanged++;
  }

  if (history.length) {
    await db.query(
      `insert into public.price_history (offer_id, product_id, price, shipping_cost, availability, recorded_at)
       select r.offer_id, r.product_id, r.price, r.shipping_cost, r.availability, $2
       from jsonb_to_recordset($1::jsonb) as r(offer_id bigint, product_id bigint, price numeric, shipping_cost numeric, availability text)`,
      [JSON.stringify(history), ctx.runStartedAt],
    );
  }
  if (queue.length) {
    await db.query(
      `insert into public.match_queue (offer_id, product_id, reason, candidates)
       select r.offer_id, r.product_id, r.reason, r.candidates
       from jsonb_to_recordset($1::jsonb) as r(offer_id bigint, product_id bigint, reason text, candidates jsonb)`,
      [JSON.stringify(queue)],
    );
    counters.matches_queued += queue.length;
  }
  // Products created before their shop category was mapped get it on a later run (never overwritten).
  if (productCategory.length) {
    await db.query(
      `update public.products p set category_id = r.category_id
       from (select distinct on (product_id) product_id, category_id
             from jsonb_to_recordset($1::jsonb) as x(product_id bigint, category_id bigint)) r
       where p.id = r.product_id and p.category_id is null`,
      [JSON.stringify(productCategory)],
    );
  }
}

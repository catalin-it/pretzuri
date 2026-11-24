import type { RawOffer } from "../adapters/types.js";
import { httpUrl, rawOfferSchema } from "../schema/offer.js";
import { normalizeAvailability, type Availability } from "./availability.js";
import { normalizeCategoryPath } from "./category.js";
import { normalizeGtin, normalizeMpn } from "./codes.js";
import { parseCurrency, parsePrice, parseShipping } from "./price.js";
import { cleanTitle, collapseSpaces, plainText } from "./text.js";

/** A validated, normalized feed row (brand/category ids are resolved later against the DB). */
export interface NormalizedOffer {
  externalId: string;
  title: string;
  description: string | null;
  url: string;
  affiliateUrl: string | null;
  price: number;
  oldPrice: number | null;
  currency: string;
  availability: Availability;
  shippingCost: number | null;
  shippingDays: string | null;
  imageUrl: string | null;
  gtin: string | null;
  mpn: string | null;
  mpnNorm: string | null;
  brandRaw: string | null;
  categoryRaw: string | null;
  specs: Record<string, string> | null;
}

export interface RowIssue {
  field: string;
  reason: string;
}

export type NormalizeResult =
  | { ok: true; offer: NormalizedOffer; warnings: RowIssue[] }
  | { ok: false; skip?: boolean; errors: RowIssue[] };

const INACTIVE = /^(0|false|no|nu|inactive|inactiv)$/i;

function firstImage(raw: string | undefined): string | null {
  if (!raw) return null;
  for (const part of raw.split(/[\s,|;]+/)) {
    if (httpUrl.safeParse(part).success) return part.slice(0, 2000);
  }
  return null;
}

/**
 * Validates and normalizes one mapped row. Hard errors (missing id/title/price/url, bad price, currency not
 * allowed) reject the row; soft problems (invalid GTIN, bad old price) are warnings and the value is dropped.
 * `active=0` rows are skipped without an error (the offer then expires like a removed product).
 */
export function normalizeOffer(
  raw: RawOffer,
  opts: { affiliate: boolean; allowedCurrencies: string[] },
): NormalizeResult {
  if (raw.active !== undefined && INACTIVE.test(raw.active.trim())) {
    return { ok: false, skip: true, errors: [{ field: "active", reason: "inactive product" }] };
  }
  const parsed = rawOfferSchema.safeParse(raw);
  const errors: RowIssue[] = [];
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push({ field: String(issue.path[0] ?? "row"), reason: issue.message });
    }
  }
  const warnings: RowIssue[] = [];
  const price = parsePrice(raw.price);
  if (raw.price && price === null) errors.push({ field: "price", reason: `unparseable price "${raw.price.slice(0, 40)}"` });

  // Product URL is required; network feeds sometimes carry only the tracking link.
  const affiliateUrl = opts.affiliate && raw.affiliateUrl && httpUrl.safeParse(raw.affiliateUrl).success ? raw.affiliateUrl : null;
  const url = raw.url && httpUrl.safeParse(raw.url).success ? raw.url : affiliateUrl;
  if (!url && !errors.some((e) => e.field === "url")) errors.push({ field: "url", reason: "missing" });

  const currency = parseCurrency(raw.currency, raw.price);
  if (!opts.allowedCurrencies.includes(currency)) errors.push({ field: "currency", reason: `currency ${currency} not allowed` });

  if (errors.length || price === null || !url) return { ok: false, errors };

  let oldPrice = parsePrice(raw.oldPrice);
  if (oldPrice !== null && oldPrice <= price) {
    oldPrice = null;
  }
  const g = normalizeGtin(raw.gtin);
  if (g.invalid) warnings.push({ field: "gtin", reason: `invalid GTIN "${(raw.gtin ?? "").slice(0, 30)}" ignored` });
  const mpn = raw.mpn ? collapseSpaces(raw.mpn).slice(0, 100) : null;
  const brand = raw.brand ? collapseSpaces(raw.brand).slice(0, 100) : null;

  return {
    ok: true,
    warnings,
    offer: {
      externalId: raw.id!.trim(),
      title: cleanTitle(raw.title!),
      description: plainText(raw.description),
      url,
      affiliateUrl,
      price,
      oldPrice,
      currency,
      availability: normalizeAvailability(raw.availability),
      shippingCost: parseShipping(raw.shippingCost),
      shippingDays: raw.shippingDays ? collapseSpaces(raw.shippingDays).slice(0, 50) : null,
      imageUrl: firstImage(raw.imageUrl),
      gtin: g.gtin,
      mpn,
      mpnNorm: normalizeMpn(mpn ?? undefined),
      brandRaw: brand,
      categoryRaw: normalizeCategoryPath(raw.category ?? []),
      specs: raw.specs && Object.keys(raw.specs).length ? raw.specs : null,
    },
  };
}

// URL <-> listing filter state for search and category pages. Pure (unit-tested): filters and sort live in the URL
// so listings are shareable, crawlable and work without JavaScript.

export const SORTS = ["relevance", "price_asc", "price_desc", "offers", "newest"] as const;
export type Sort = (typeof SORTS)[number];

export const PAGE_SIZE = 24;
const MAX_PAGE = 200;
const MAX_IDS = 30;
const MAX_SPEC_VALUES = 20;
export const SPEC_PREFIX = "spec_";

export type RawParams = Record<string, string | string[] | undefined>;

export type ListingParams = {
  q: string;
  sort: Sort;
  priceMin: number | null;
  priceMax: number | null;
  brandIds: number[];
  merchantIds: number[];
  specs: Record<string, string[]>;
  page: number;
};

function all(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function first(v: string | string[] | undefined): string {
  return all(v)[0] ?? "";
}

function ids(v: string | string[] | undefined): number[] {
  const out = new Set<number>();
  for (const part of all(v).flatMap((s) => s.split(","))) {
    const t = part.trim();
    if (/^\d{1,12}$/.test(t)) out.add(Number(t));
  }
  return [...out].slice(0, MAX_IDS);
}

function price(v: string | string[] | undefined): number | null {
  const s = first(v).trim().replace(",", ".");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  return Number(s);
}

/** Parses Next.js `searchParams`. Invalid values are dropped, never thrown. */
export function parseListingParams(raw: RawParams, defaultSort: Sort = "relevance"): ListingParams {
  const q = first(raw.q).trim().slice(0, 120);
  const sortRaw = first(raw.sort);
  const sort = (SORTS as readonly string[]).includes(sortRaw) ? (sortRaw as Sort) : defaultSort;
  let priceMin = price(raw.pret_min);
  let priceMax = price(raw.pret_max);
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) [priceMin, priceMax] = [priceMax, priceMin];
  const pageRaw = first(raw.pagina);
  const page = /^\d{1,4}$/.test(pageRaw) ? Math.min(Math.max(1, Number(pageRaw)), MAX_PAGE) : 1;

  const specs: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key.startsWith(SPEC_PREFIX)) continue;
    const name = key.slice(SPEC_PREFIX.length).trim();
    if (!name || name.length > 60) continue;
    const values = [...new Set(all(value).map((s) => s.trim()).filter((s) => s && s.length <= 80))];
    if (values.length) specs[name] = values.slice(0, MAX_SPEC_VALUES);
  }

  return {
    q,
    sort,
    priceMin,
    priceMax,
    brandIds: ids(raw.brand),
    merchantIds: ids(raw.magazin),
    specs,
    page,
  };
}

/** Arguments for the `search_products` RPC. */
export function toSearchArgs(p: ListingParams, categoryPath: string | null) {
  return {
    p_query: p.q || undefined,
    p_category_path: categoryPath ?? undefined,
    p_brand_ids: p.brandIds.length ? p.brandIds : undefined,
    p_merchant_ids: p.merchantIds.length ? p.merchantIds : undefined,
    p_price_min: p.priceMin ?? undefined,
    p_price_max: p.priceMax ?? undefined,
    p_specs: Object.keys(p.specs).length ? p.specs : undefined,
    p_sort: p.sort,
    p_limit: PAGE_SIZE,
    p_offset: (p.page - 1) * PAGE_SIZE,
  };
}

/** Serializes listing state back to a query string (stable order, defaults omitted). */
export function toQueryString(p: ListingParams, defaultSort: Sort = "relevance"): string {
  const sp = new URLSearchParams();
  if (p.q) sp.set("q", p.q);
  if (p.sort !== defaultSort) sp.set("sort", p.sort);
  if (p.priceMin !== null) sp.set("pret_min", String(p.priceMin));
  if (p.priceMax !== null) sp.set("pret_max", String(p.priceMax));
  for (const id of p.brandIds) sp.append("brand", String(id));
  for (const id of p.merchantIds) sp.append("magazin", String(id));
  for (const key of Object.keys(p.specs).sort()) {
    for (const v of p.specs[key]) sp.append(SPEC_PREFIX + key, v);
  }
  if (p.page > 1) sp.set("pagina", String(p.page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** True when any filter (not query/sort/page) is active. */
export function hasFilters(p: ListingParams): boolean {
  return (
    p.priceMin !== null ||
    p.priceMax !== null ||
    p.brandIds.length > 0 ||
    p.merchantIds.length > 0 ||
    Object.keys(p.specs).length > 0
  );
}

export function totalPages(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

/** Page numbers to show: first, last, current +-1, with `null` for gaps. */
export function pageWindow(current: number, last: number): (number | null)[] {
  const set = new Set([1, last, current - 1, current, current + 1].filter((n) => n >= 1 && n <= last));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  for (const n of sorted) {
    const prev = out[out.length - 1];
    if (typeof prev === "number" && n - prev > 1) out.push(null);
    out.push(n);
  }
  return out;
}

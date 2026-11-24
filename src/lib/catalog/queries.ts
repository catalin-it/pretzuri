import { cache } from "react";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { getServerCatalogUrl, getSupabaseEnv } from "@/lib/supabase/env";
import { type ListingParams, toSearchArgs } from "@/lib/listing/params";

/**
 * Public catalog reads (same for every visitor): cookie-less anon client, RLS applies.
 * All functions are wrapped in React `cache()` so a page and its metadata share one query per request.
 */
const anon = cache(() =>
  createSupabaseClient<Database>(getServerCatalogUrl(), getSupabaseEnv().anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }),
);

export function catalogClient() {
  return anon();
}

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

export type CategoryNode = Database["public"]["Functions"]["category_tree"]["Returns"][number];

export const getCategoryTree = cache(async (): Promise<CategoryNode[]> => {
  return check(await anon().rpc("category_tree"), "category_tree") ?? [];
});

/** Root categories for the header (cheap: no counts). Never throws: the header must render even if the DB is down. */
export const getRootCategories = cache(async () => {
  try {
    const res = await anon()
      .from("categories")
      .select("id, slug, path, name_ro, name_en")
      .eq("depth", 0)
      .order("sort_order");
    return res.data ?? [];
  } catch {
    return [];
  }
});

export type ListingItem = Database["public"]["Functions"]["search_products"]["Returns"][number];

export type Facets = {
  total: number;
  price: { min: number | null; max: number | null };
  brands: { id: number; name: string; count: number }[];
  merchants: { id: number; name: string; count: number }[];
  specs: Record<string, { value: Json; count: number }[]>;
};

export const searchListing = cache(
  async (params: ListingParams, categoryPath: string | null): Promise<{ items: ListingItem[]; total: number; facets: Facets }> => {
    const [items, facets] = await Promise.all([
      anon().rpc("search_products", toSearchArgs(params, categoryPath) as never),
      anon().rpc("search_facets", { p_query: params.q || undefined, p_category_path: categoryPath ?? undefined }),
    ]);
    const rows = check(items, "search_products") ?? [];
    const f = (check(facets, "search_facets") ?? {}) as Partial<Facets>;
    return {
      items: rows,
      total: rows.length ? Number(rows[0].total_count) : 0,
      facets: {
        total: Number(f.total ?? 0),
        price: { min: f.price?.min ?? null, max: f.price?.max ?? null },
        brands: f.brands ?? [],
        merchants: f.merchants ?? [],
        specs: f.specs ?? {},
      },
    };
  },
);

const PRODUCT_COLUMNS =
  "id, slug, title, description, specs, image_path, min_price, max_price, offer_count, gtins, updated_at, brand:brands(id, name, slug), category:categories(id, path, name_ro, name_en)";

export const getProductBySlug = cache(async (slug: string) => {
  const res = await anon().from("products").select(PRODUCT_COLUMNS).eq("slug", slug).maybeSingle();
  return check(res, "product");
});

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>;

/** Slug of the product an old slug now points to (merged/renamed products), or null. */
export const getRedirectTarget = cache(async (oldSlug: string): Promise<string | null> => {
  const res = await anon()
    .from("product_redirects")
    .select("product:products(slug)")
    .eq("old_slug", oldSlug)
    .maybeSingle();
  const row = check(res, "product_redirects") as { product: { slug: string } | null } | null;
  return row?.product?.slug ?? null;
});

export type OfferRow = Database["public"]["Functions"]["product_offers"]["Returns"][number];

/** Offers in the official ranking order (never re-sorted in the UI). */
export const getProductOffers = cache(async (productId: number): Promise<OfferRow[]> => {
  return check(await anon().rpc("product_offers", { p_product_id: productId }), "product_offers") ?? [];
});

export const getProductLowest30d = cache(async (productId: number): Promise<number | null> => {
  const v = check(await anon().rpc("product_lowest_30d", { p_product_id: productId }), "product_lowest_30d");
  return v === null || v === undefined ? null : Number(v);
});

export const getPriceHistory = cache(async (productId: number, days = 90) => {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const res = await anon()
    .from("price_history")
    .select("offer_id, price, recorded_at")
    .eq("product_id", productId)
    .gte("recorded_at", since)
    .order("recorded_at")
    .limit(5000);
  return check(res, "price_history") ?? [];
});

export const getProductsBySlugs = cache(async (slugs: string[]) => {
  if (!slugs.length) return [];
  const res = await anon().from("products").select(PRODUCT_COLUMNS).in("slug", slugs);
  const rows = check(res, "products") ?? [];
  return slugs.map((s) => rows.find((r) => r.slug === s)).filter((r): r is NonNullable<typeof r> => !!r);
});

export const getMerchantBySlug = cache(async (slug: string) => {
  const res = await anon()
    .from("merchants")
    .select("id, slug, name, website, description, has_affiliate, affiliate_network, rating_avg, rating_count, shipping_info")
    .eq("slug", slug)
    .maybeSingle();
  return check(res, "merchant");
});

export const getMerchantOfferCount = cache(async (merchantId: number): Promise<number> => {
  const res = await anon()
    .from("offers")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchantId)
    .eq("is_active", true);
  if (res.error) throw new Error(`offers count: ${res.error.message}`);
  return res.count ?? 0;
});

export const getApprovedReviews = cache(async (merchantId: number) => {
  const res = await anon()
    .from("reviews")
    .select("id, rating, title, body, created_at")
    .eq("merchant_id", merchantId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(50);
  return check(res, "reviews") ?? [];
});

export type PriceDrop = {
  offerId: number;
  price: number;
  oldPrice: number;
  lowest30d: number | null;
  historyDays: number;
  merchantName: string;
  product: { slug: string; title: string; image_path: string | null };
};

/**
 * Recent reductions for the home page: recently updated active offers whose price is below the shop's old price.
 * PostgREST cannot compare two columns, so we filter a recent window here (good enough until a dedicated RPC).
 */
export const getRecentPriceDrops = cache(async (limit = 8): Promise<PriceDrop[]> => {
  const res = await anon()
    .from("offers")
    .select("id, price, old_price, first_seen_at, merchant:merchants(name), product:products!inner(slug, title, image_path, status)")
    .eq("is_active", true)
    .not("old_price", "is", null)
    .eq("product.status", "active")
    .order("updated_at", { ascending: false })
    .limit(200);
  const rows = (check(res, "offers") ?? []) as unknown as {
    id: number;
    price: number;
    old_price: number | null;
    first_seen_at: string;
    merchant: { name: string } | null;
    product: { slug: string; title: string; image_path: string | null } | null;
  }[];
  const seen = new Set<string>();
  const picked = rows
    .filter((r) => r.product && r.old_price !== null && Number(r.old_price) > Number(r.price))
    .filter((r) => (seen.has(r.product!.slug) ? false : (seen.add(r.product!.slug), true)))
    .slice(0, limit);
  const lows = await Promise.all(
    picked.map((r) => anon().rpc("offer_lowest_30d", { p_offer_id: r.id }).then((x) => (x.data === null ? null : Number(x.data)))),
  );
  return picked.map((r, i) => ({
    offerId: r.id,
    price: Number(r.price),
    oldPrice: Number(r.old_price),
    lowest30d: lows[i],
    historyDays: Math.min(30, Math.floor((Date.now() - new Date(r.first_seen_at).getTime()) / 86_400_000)),
    merchantName: r.merchant?.name ?? "",
    product: r.product!,
  }));
});

/** Category path prefixes, e.g. "a/b/c" -> ["a", "a/b", "a/b/c"]. */
export function pathPrefixes(path: string): string[] {
  const parts = path.split("/");
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

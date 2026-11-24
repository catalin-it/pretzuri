import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { routing } from "@/i18n/routing";
import { NOINDEX, SITE_URL } from "@/lib/app-version";
import { catalogClient, getCategoryTree } from "@/lib/catalog/queries";

// One sitemap (static pages + categories + products with offers, both locales, with hreflang alternates).
// Split with generateSitemaps once products approach 20k (2 locales x 25k URL limit margin).
const STATIC_PATHS = ["", "/cum-ordonam", "/despre-afiliere", "/confidentialitate", "/termeni"];
const MAX_PRODUCTS = 20_000;

function entry(path: string, lastModified?: string, priority?: number): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(routing.locales.map((l) => [l, `${SITE_URL}/${l}${path}`]));
  return routing.locales.map((l) => ({
    url: `${SITE_URL}/${l}${path}`,
    lastModified,
    priority,
    alternates: { languages },
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection(); // dynamic: never built at image build time (no DB there)
  if (NOINDEX) return [];
  const [tree, products] = await Promise.all([
    getCategoryTree(),
    catalogClient()
      .from("products")
      .select("slug, updated_at")
      .gt("offer_count", 0)
      .order("id")
      .limit(MAX_PRODUCTS),
  ]);
  if (products.error) throw new Error(products.error.message);
  return [
    ...STATIC_PATHS.flatMap((p) => entry(p, undefined, p === "" ? 1 : 0.3)),
    ...tree.filter((c) => Number(c.product_count) > 0).flatMap((c) => entry(`/c/${c.path}`, undefined, 0.7)),
    ...(products.data ?? []).flatMap((p) => entry(`/p/${p.slug}`, p.updated_at, 0.6)),
  ];
}

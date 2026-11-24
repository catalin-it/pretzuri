import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { Breadcrumb, type Crumb } from "@/components/ui/breadcrumb";
import { JsonLd } from "@/components/seo/json-ld";
import { OffersList } from "@/components/product/offers-list";
import { PriceHistory } from "@/components/product/price-history";
import { ProductImage } from "@/components/product/product-image";
import { SITE_URL } from "@/lib/app-version";
import {
  type ProductDetail,
  getCategoryTree,
  getPriceHistory,
  getProductBySlug,
  getProductLowest30d,
  getProductOffers,
  getRedirectTarget,
  pathPrefixes,
} from "@/lib/catalog/queries";
import { categoryName } from "@/lib/catalog/names";
import { isProductSlug } from "@/lib/compare/slugs";
import { formatPrice } from "@/lib/format";
import { dailyMinSeries } from "@/lib/product/price-chart";
import { localeAlternates } from "@/lib/seo";
import { productImageUrl, specText } from "@/lib/storage";

type Props = { params: Promise<{ locale: string; slug: string }> };

async function load(slug: string): Promise<ProductDetail | null> {
  if (!isProductSlug(slug)) return null;
  return getProductBySlug(slug);
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const p = await load(slug);
  if (!p) return {};
  const t = await getTranslations({ locale, namespace: "ProductPage" });
  const min = p.min_price === null ? null : Number(p.min_price);
  const image = productImageUrl(p.image_path);
  return {
    title: p.title,
    description:
      min !== null
        ? t("metaDescription", { title: p.title, price: formatPrice(min, locale as Locale), count: p.offer_count })
        : t("metaDescriptionNoPrice", { title: p.title }),
    alternates: localeAlternates(locale, `/p/${p.slug}`),
    openGraph: image ? { images: [{ url: image }] } : undefined,
  };
}

export default async function ProductPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const product = await load(slug);
  if (!product) {
    const target = isProductSlug(slug) ? await getRedirectTarget(slug) : null;
    if (target && target !== slug) permanentRedirect(`/${locale}/p/${target}`);
    notFound();
  }
  const t = await getTranslations("ProductPage");
  const brand = one(product.brand);
  const category = one(product.category);

  const [offers, history, lowest30, tree] = await Promise.all([
    getProductOffers(product.id),
    getPriceHistory(product.id),
    getProductLowest30d(product.id),
    getCategoryTree(),
  ]);

  const crumbs: Crumb[] = [];
  if (category) {
    for (const p of pathPrefixes(category.path)) {
      const c = tree.find((n) => n.path === p);
      if (c) crumbs.push({ href: `/c/${c.path}`, label: categoryName(c, locale) });
    }
  }
  crumbs.push({ href: `/p/${product.slug}`, label: product.title });

  const series = dailyMinSeries(
    history.map((h) => ({ offer_id: h.offer_id, price: Number(h.price), recorded_at: h.recorded_at })),
    {
      now: new Date(),
      days: 90,
      activeOfferIds: offers.map((o) => o.offer_id),
      current: new Map(offers.map((o) => [o.offer_id, Number(o.price)])),
    },
  );

  const specs = Object.entries((product.specs ?? {}) as Record<string, unknown>).filter(([, v]) => specText(v) !== "");
  const image = productImageUrl(product.image_path);
  const totals = offers.map((o) => Number(o.total_price ?? o.price));
  const low = totals.length ? Math.min(...totals) : null;
  const high = totals.length ? Math.max(...totals) : null;
  const url = `${SITE_URL}/${locale}/p/${product.slug}`;
  const loginHref = `/cont/autentificare?next=${encodeURIComponent(`/${locale}/p/${product.slug}`)}`;

  return (
    <article className="flex flex-col gap-6">
      <Breadcrumb items={crumbs} locale={locale} />
      <div className="grid gap-6 md:grid-cols-[minmax(0,20rem)_1fr]">
        <ProductImage src={image} alt={product.title} size={320} />
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold">{product.title}</h1>
          {brand ? <p className="text-muted">{t("brand", { brand: brand.name })}</p> : null}
          {low !== null && high !== null ? (
            <p className="text-lg">
              {low === high
                ? t("priceSingle", { price: formatPrice(low, locale as Locale), count: offers.length })
                : t("priceRange", {
                    low: formatPrice(low, locale as Locale),
                    high: formatPrice(high, locale as Locale),
                    count: offers.length,
                  })}
            </p>
          ) : null}
          {lowest30 !== null ? (
            <p className="text-sm text-muted">{t("lowest30", { price: formatPrice(lowest30, locale as Locale) })}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Link href={loginHref} className="rounded-lg border border-border px-3 py-2 text-sm">
              {t("favorite")}
            </Link>
            <Link href={loginHref} className="rounded-lg border border-border px-3 py-2 text-sm">
              {t("alert")}
            </Link>
          </div>
          <p className="text-xs text-muted">{t("accountsSoon")}</p>
        </div>
      </div>

      <section aria-labelledby="offers-h" className="flex flex-col gap-3">
        <h2 id="offers-h" className="text-xl font-bold">
          {t("offersTitle", { count: offers.length })}
        </h2>
        <p className="text-sm text-muted">
          {t("rankingNote")}{" "}
          <Link href="/cum-ordonam" className="underline">
            {t("rankingLink")}
          </Link>
        </p>
        <OffersList offers={offers} />
      </section>

      <section aria-labelledby="history-h" className="flex flex-col gap-3">
        <h2 id="history-h" className="text-xl font-bold">
          {t("historyTitle")}
        </h2>
        <PriceHistory series={series} />
      </section>

      {specs.length > 0 ? (
        <section aria-labelledby="specs-h" className="flex flex-col gap-3">
          <h2 id="specs-h" className="text-xl font-bold">
            {t("specsTitle")}
          </h2>
          <table className="w-full max-w-2xl text-left text-sm">
            <tbody>
              {specs.map(([k, v]) => (
                <tr key={k} className="border-t border-border-subtle">
                  <th scope="row" className="w-1/2 py-2 pr-4 font-medium text-muted">
                    {k}
                  </th>
                  <td className="py-2">{specText(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {product.description ? (
        <section aria-labelledby="desc-h" className="flex flex-col gap-2">
          <h2 id="desc-h" className="text-xl font-bold">
            {t("descriptionTitle")}
          </h2>
          <p className="max-w-3xl whitespace-pre-line text-sm">{product.description}</p>
        </section>
      ) : null}

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.title,
          url,
          ...(image ? { image } : {}),
          ...(brand ? { brand: { "@type": "Brand", name: brand.name } } : {}),
          ...(product.gtins?.[0] ? { gtin: product.gtins[0] } : {}),
          ...(low !== null && high !== null
            ? {
                offers: {
                  "@type": "AggregateOffer",
                  priceCurrency: "RON",
                  lowPrice: low.toFixed(2),
                  highPrice: high.toFixed(2),
                  offerCount: offers.length,
                },
              }
            : {}),
        }}
      />
    </article>
  );
}

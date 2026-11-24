import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { ProductImage } from "@/components/product/product-image";
import { getProductLowest30d, getProductOffers, getProductsBySlugs } from "@/lib/catalog/queries";
import { parseCompareSlugs, unionSpecKeys } from "@/lib/compare/slugs";
import { formatPrice } from "@/lib/format";
import { localeAlternates } from "@/lib/seo";
import { productImageUrl, specText } from "@/lib/storage";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ComparePage" });
  return { title: t("title"), robots: { index: false, follow: true }, alternates: localeAlternates(locale, "/comparare") };
}

export default async function ComparePage({ params, searchParams }: Props) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const t = await getTranslations("ComparePage");
  const loc = locale as Locale;
  const products = await getProductsBySlugs(parseCompareSlugs(sp.p));

  if (products.length < 2) {
    return (
      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted">{t("needTwo")}</p>
        <Link href="/" className="font-semibold text-accent-text underline">
          {t("browse")}
        </Link>
      </section>
    );
  }

  const extra = await Promise.all(
    products.map(async (p) => {
      const [offers, lowest] = await Promise.all([getProductOffers(p.id), getProductLowest30d(p.id)]);
      // Offers come in ranking order: the first one has the best total price.
      const best = offers[0] ? Number(offers[0].total_price ?? offers[0].price) : null;
      return { best, count: offers.length, lowest };
    }),
  );
  const specs = products.map((p) => (p.specs ?? {}) as Record<string, unknown>);
  const keys = unionSpecKeys(specs);
  const dash = <span className="text-muted">–</span>;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] table-fixed text-left text-sm">
          <caption className="sr-only">{t("caption")}</caption>
          <thead>
            <tr>
              <th scope="col" className="w-32 p-2">
                <span className="sr-only">{t("attribute")}</span>
              </th>
              {products.map((p) => (
                <th key={p.id} scope="col" className="p-2 align-top">
                  <Link href={`/p/${p.slug}`} className="flex flex-col gap-2 hover:underline">
                    <ProductImage src={productImageUrl(p.image_path)} alt={p.title} size={120} />
                    <span className="font-semibold">{p.title}</span>
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label={t("bestPrice")}>
              {extra.map((e, i) => (
                <td key={i} className="p-2 font-bold">
                  {e.best !== null ? formatPrice(e.best, loc) : dash}
                </td>
              ))}
            </Row>
            <Row label={t("offers")}>
              {extra.map((e, i) => (
                <td key={i} className="p-2">
                  {e.count}
                </td>
              ))}
            </Row>
            <Row label={t("lowest30")}>
              {extra.map((e, i) => (
                <td key={i} className="p-2">
                  {e.lowest !== null ? formatPrice(e.lowest, loc) : dash}
                </td>
              ))}
            </Row>
            {keys.map((k) => (
              <Row key={k} label={k}>
                {specs.map((s, i) => (
                  <td key={i} className="p-2">
                    {specText(s[k]) || dash}
                  </td>
                ))}
              </Row>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="border-t border-border-subtle">
      <th scope="row" className="p-2 font-medium text-muted">
        {label}
      </th>
      {children}
    </tr>
  );
}

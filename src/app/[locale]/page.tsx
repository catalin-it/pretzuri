import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { ProductImage } from "@/components/product/product-image";
import { getCategoryTree, getRecentPriceDrops } from "@/lib/catalog/queries";
import { categoryName } from "@/lib/catalog/names";
import { formatPrice } from "@/lib/format";
import { omnibusDisplay } from "@/lib/product/omnibus";
import { localeAlternates } from "@/lib/seo";
import { productImageUrl } from "@/lib/storage";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: localeAlternates(locale, "/") };
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const t = await getTranslations("Home");
  const [tree, drops] = await Promise.all([getCategoryTree(), getRecentPriceDrops(8)]);
  const roots = tree.filter((c) => c.depth === 0);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4 py-4">
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="max-w-2xl text-lg text-muted">{t("intro")}</p>
      </section>

      <section aria-labelledby="cats-h" className="flex flex-col gap-3">
        <h2 id="cats-h" className="text-xl font-bold">
          {t("categories")}
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {roots.map((c) => (
            <li key={c.id}>
              <Link
                href={`/c/${c.path}`}
                className="flex h-full flex-col gap-1 rounded-xl border border-border-subtle bg-surface p-3 hover:border-accent"
              >
                <span className="font-semibold">{categoryName(c, locale)}</span>
                <span className="text-sm text-muted">{t("products", { count: Number(c.product_count) })}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {drops.length > 0 ? (
        <section aria-labelledby="drops-h" className="flex flex-col gap-3">
          <h2 id="drops-h" className="text-xl font-bold">
            {t("drops")}
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {drops.map((d) => {
              const omni = omnibusDisplay({ price: d.price, oldPrice: d.oldPrice, lowest30d: d.lowest30d, historyDays: d.historyDays });
              return (
                <li key={d.offerId} className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-surface-raised p-3">
                  <Link href={`/p/${d.product.slug}`} className="flex flex-col gap-2 hover:underline">
                    <ProductImage src={productImageUrl(d.product.image_path)} alt={d.product.title} size={140} />
                    <span className="line-clamp-2 font-semibold">{d.product.title}</span>
                  </Link>
                  <span className="text-sm text-muted">{d.merchantName}</span>
                  <span className="text-lg font-bold">{formatPrice(d.price, loc)}</span>
                  {omni.kind === "reduction" ? (
                    <span className="text-sm">
                      <s className="text-muted">{formatPrice(omni.oldPrice, loc)}</s>{" "}
                      <span className="font-semibold text-price-drop">−{omni.percent}%</span>
                      <br />
                      <span className="text-xs text-muted">
                        {omni.partial
                          ? t("lowestPartial", { price: formatPrice(omni.lowest, loc), days: omni.days })
                          : t("lowest30", { price: formatPrice(omni.lowest, loc) })}
                      </span>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      <p className="text-sm text-muted">
        {t("totalProducts", { count: roots.reduce((s, c) => s + Number(c.product_count), 0) })} ·{" "}
        <Link href="/cum-ordonam" className="underline">
          {t("howWeRank")}
        </Link>
      </p>
    </div>
  );
}

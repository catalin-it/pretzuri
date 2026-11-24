import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { FavoriteButton } from "@/components/account/favorite-button";
import { ProductImage } from "@/components/product/product-image";
import { getFavorites } from "@/lib/account/queries";
import { requireUser } from "@/lib/auth/session";
import { formatPrice } from "@/lib/format";
import { productImageUrl } from "@/lib/storage";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Favorites" });
  return { title: t("title") };
}

export default async function FavoritesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser(locale, "/cont/favorite");
  const [t, items] = await Promise.all([getTranslations("Favorites"), getFavorites()]);
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {items.length === 0 ? (
        <p className="text-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map(({ product: p }) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border border-border-subtle p-3">
              <ProductImage src={productImageUrl(p.image_path)} alt="" size={64} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Link href={`/p/${p.slug}`} className="font-semibold hover:underline">
                  {p.title}
                </Link>
                {p.min_price !== null ? (
                  <span className="text-sm">{t("fromPrice", { price: formatPrice(Number(p.min_price), locale as Locale) })}</span>
                ) : (
                  <span className="text-sm text-muted">{t("noOffers")}</span>
                )}
              </div>
              <FavoriteButton productId={p.id} title={p.title} initial signedIn returnTo={`/${locale}/cont/favorite`} compact refresh />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

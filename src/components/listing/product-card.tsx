import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { ListingItem } from "@/lib/catalog/queries";
import { formatPrice } from "@/lib/format";
import { productImageUrl } from "@/lib/storage";
import { ProductImage } from "@/components/product/product-image";
import { CompareToggle } from "@/components/compare/compare-toggle";
import { FavoriteButton } from "@/components/account/favorite-button";

/** `favorite`: null when signed out (the toggle then links to the sign-in page). */
export async function ProductCard({ item, favorite = null }: { item: ListingItem; favorite?: boolean | null }) {
  const [t, locale] = await Promise.all([getTranslations("Listing"), getLocale() as Promise<Locale>]);
  const min = item.min_price === null ? null : Number(item.min_price);
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-surface-raised p-3">
      <Link href={`/p/${item.slug}`} className="flex flex-col gap-2 hover:underline">
        <ProductImage src={productImageUrl(item.image_path)} alt={item.title} size={160} />
        <span className="line-clamp-3 font-semibold">{item.title}</span>
      </Link>
      {item.brand_name ? <span className="text-sm text-muted">{item.brand_name}</span> : null}
      <div className="mt-auto flex flex-col gap-1">
        {min !== null ? (
          <span className="text-lg font-bold">{t("fromPrice", { price: formatPrice(min, locale) })}</span>
        ) : null}
        <span className="text-sm text-muted">{t("offerCount", { count: Number(item.offer_count) })}</span>
        <CompareToggle slug={item.slug} title={item.title} />
        <FavoriteButton
          productId={Number(item.id)}
          title={item.title}
          initial={!!favorite}
          signedIn={favorite !== null}
          returnTo={`/${locale}/p/${item.slug}`}
          compact
        />
      </div>
    </li>
  );
}

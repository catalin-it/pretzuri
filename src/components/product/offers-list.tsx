import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { OfferRow } from "@/lib/catalog/queries";
import { formatNumber, formatPrice } from "@/lib/format";
import { omnibusDisplay } from "@/lib/product/omnibus";

/**
 * Offers exactly in the order returned by `product_offers()` (DECISIONS "Ranking": total price ascending).
 * Never re-sorted here. Promoted positions are disabled, so there is no "Promovat" block.
 */
export async function OffersList({ offers, source = "product" }: { offers: OfferRow[]; source?: string }) {
  const [t, locale] = await Promise.all([getTranslations("Offers"), getLocale() as Promise<Locale>]);
  if (offers.length === 0) {
    return <p className="rounded-xl border border-border-subtle bg-surface p-4 text-muted">{t("none")}</p>;
  }
  return (
    <ol className="flex flex-col gap-3" aria-label={t("listLabel")}>
      {offers.map((o, i) => {
        const price = Number(o.price);
        const shipping = o.shipping_cost === null ? null : Number(o.shipping_cost);
        const total = o.total_price === null ? price : Number(o.total_price);
        const omni = omnibusDisplay({
          price,
          oldPrice: o.old_price === null ? null : Number(o.old_price),
          lowest30d: o.lowest_30d === null ? null : Number(o.lowest_30d),
          historyDays: o.history_days,
        });
        const rel = o.has_affiliate ? "sponsored nofollow noopener" : "nofollow noopener";
        return (
          <li
            key={o.offer_id}
            className="grid gap-3 rounded-xl border border-border-subtle bg-surface-raised p-4 sm:grid-cols-[1fr_auto]"
            data-testid="offer"
          >
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="sr-only">{t("position", { n: i + 1 })}</span>
                <Link href={`/magazin/${o.merchant_slug}`} className="font-semibold hover:underline">
                  {o.merchant_name}
                </Link>
                {o.has_affiliate ? (
                  <span className="rounded bg-surface px-2 py-0.5 text-xs font-medium text-muted ring-1 ring-border-subtle">
                    {t("affiliate")}
                  </span>
                ) : null}
              </div>
              <span className="text-sm text-muted">
                {o.merchant_rating !== null && o.merchant_rating_count > 0
                  ? t("rating", {
                      rating: formatNumber(Math.round(Number(o.merchant_rating) * 10) / 10, locale),
                      count: o.merchant_rating_count,
                    })
                  : t("noRating")}
              </span>
              <span className="text-sm">{t(`availability.${availabilityKey(o.availability)}`)}</span>
              <span className="line-clamp-2 text-sm text-muted">{o.title}</span>
            </div>
            <div className="flex flex-col gap-1 sm:items-end sm:text-right">
              <span className="text-sm">
                {t("price")}: <strong>{formatPrice(price, locale, o.currency)}</strong>
              </span>
              {omni.kind === "reduction" ? (
                <span className="text-sm">
                  <s className="text-muted">{formatPrice(omni.oldPrice, locale, o.currency)}</s>{" "}
                  <span className="font-semibold text-price-drop">−{omni.percent}%</span>
                  <br />
                  <span className="text-xs text-muted">
                    {omni.partial
                      ? t("lowestPartial", { price: formatPrice(omni.lowest, locale, o.currency), days: omni.days })
                      : t("lowest30", { price: formatPrice(omni.lowest, locale, o.currency) })}
                  </span>
                </span>
              ) : null}
              <span className="text-sm">
                {shipping === null
                  ? t("shippingUnknown")
                  : shipping === 0
                    ? t("shippingFree")
                    : t("shipping", { price: formatPrice(shipping, locale, o.currency) })}
                {o.shipping_days ? ` · ${t("shippingDays", { days: o.shipping_days })}` : ""}
              </span>
              <span className="text-lg font-bold">
                {shipping === null
                  ? formatPrice(total, locale, o.currency)
                  : t("total", { price: formatPrice(total, locale, o.currency) })}
              </span>
              <a
                href={`/go/${o.offer_id}?s=${source}`}
                rel={rel}
                target="_blank"
                className="mt-1 rounded-lg bg-accent px-4 py-2 text-center font-semibold text-accent-contrast hover:bg-accent-hover"
              >
                {t("cta")}
                <span className="sr-only"> {t("ctaSr", { merchant: o.merchant_name })}</span>
              </a>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const AVAILABILITY = ["in_stock", "limited", "out_of_stock", "preorder", "unknown"] as const;
function availabilityKey(a: string): (typeof AVAILABILITY)[number] {
  return (AVAILABILITY as readonly string[]).includes(a) ? (a as (typeof AVAILABILITY)[number]) : "unknown";
}

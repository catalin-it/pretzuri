import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getApprovedReviews, getMerchantBySlug, getMerchantOfferCount } from "@/lib/catalog/queries";
import { isProductSlug } from "@/lib/compare/slugs";
import { formatDate, formatNumber } from "@/lib/format";
import { safeDestination } from "@/lib/go/redirect";
import { localeAlternates } from "@/lib/seo";
import { ReviewForm } from "@/components/reviews/review-form";
import { ReportReview } from "@/components/reviews/report-review";
import { getOwnReview, getReportedReviewIds } from "@/lib/account/queries";
import { getSessionUser } from "@/lib/auth/session";
import { loginHref } from "@/lib/auth/links";

type Props = { params: Promise<{ locale: string; slug: string }> };

async function load(slug: string) {
  return isProductSlug(slug) ? getMerchantBySlug(slug) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const m = await load(slug);
  if (!m) return {};
  const t = await getTranslations({ locale, namespace: "MerchantPage" });
  return { title: m.name, description: t("metaDescription", { name: m.name }), alternates: localeAlternates(locale, `/magazin/${m.slug}`) };
}

export default async function MerchantPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const m = await load(slug);
  if (!m) notFound();
  const loc = locale as Locale;
  const t = await getTranslations("MerchantPage");
  const [offerCount, reviews, user] = await Promise.all([getMerchantOfferCount(m.id), getApprovedReviews(m.id), getSessionUser()]);
  const [own, reported] = user
    ? await Promise.all([getOwnReview(m.id), getReportedReviewIds(reviews.map((r) => r.id))])
    : [null, new Set<number>()];
  const tr = await getTranslations("Reviews");
  const returnTo = `/${locale}/magazin/${m.slug}`;
  const website = safeDestination(m.website);

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{m.name}</h1>
        {website ? (
          <p>
            <a href={website} rel="nofollow noopener" target="_blank" className="text-accent-text underline">
              {new URL(website).hostname}
            </a>
          </p>
        ) : null}
        <p className="text-muted">{t("offers", { count: offerCount })}</p>
        <p>
          {m.rating_avg !== null && m.rating_count > 0
            ? t("rating", { rating: formatNumber(Math.round(Number(m.rating_avg) * 10) / 10, loc), count: m.rating_count })
            : t("noRating")}
        </p>
      </header>

      <section aria-labelledby="aff-h" className="rounded-xl border border-border-subtle bg-surface p-4">
        <h2 id="aff-h" className="font-semibold">
          {t("relationTitle")}
        </h2>
        <p className="text-sm">{m.has_affiliate ? t("affiliateYes") : t("affiliateNo")}</p>
        <p className="text-sm text-muted">
          {t("rankingNote")}{" "}
          <Link href="/cum-ordonam" className="underline">
            {t("rankingLink")}
          </Link>
        </p>
      </section>

      {m.shipping_info ? (
        <section aria-labelledby="ship-h">
          <h2 id="ship-h" className="font-semibold">
            {t("shippingTitle")}
          </h2>
          <p className="whitespace-pre-line text-sm">{m.shipping_info}</p>
        </section>
      ) : null}

      {m.description ? <p className="max-w-3xl whitespace-pre-line text-sm">{m.description}</p> : null}

      <section aria-labelledby="rev-h" className="flex flex-col gap-3">
        <h2 id="rev-h" className="text-xl font-bold">
          {t("reviewsTitle", { count: reviews.length })}
        </h2>
        <p className="text-sm text-muted">{t("reviewsNote")}</p>
        {user ? (
          <ReviewForm merchantId={m.id} own={own} />
        ) : (
          <a href={loginHref(returnTo)} className="w-fit rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface">
            {tr("signInToWrite")}
          </a>
        )}
        {reviews.length === 0 ? (
          <p className="text-muted">{t("noReviews")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-xl border border-border-subtle p-4">
                <p className="font-semibold">
                  <span aria-label={t("stars", { rating: r.rating })}>{"★".repeat(r.rating)}{"☆".repeat(Math.max(0, 5 - r.rating))}</span>
                  {r.title ? ` · ${r.title}` : ""}
                </p>
                <p className="whitespace-pre-line text-sm">{r.body}</p>
                <p className="text-xs text-muted">{formatDate(r.created_at, loc)}</p>
                {user ? (
                  <ReportReview reviewId={r.id} reported={reported.has(r.id)} />
                ) : (
                  <a href={loginHref(returnTo)} className="text-xs underline">
                    {tr("signInToReport")}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

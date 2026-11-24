import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/admin/guard";
import { decideReport, moderateReview } from "@/lib/admin/actions";
import { formatDateTime } from "@/lib/admin/format";
import { cls, Flash, FormContext, Pill, type SearchParams } from "@/components/admin/ui";

type Props = { params: Promise<{ locale: string }>; searchParams: SearchParams };
const LIMIT = 50;

/**
 * Pre-moderation of merchant reviews and DSA notices (DECISIONS "Reviews"). Rejecting or removing needs a statement
 * of reasons, which is stored on the review (shown to its author) and in moderation_log.
 */
export default async function AdminReviews({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  const { supabase } = await requireAdmin(locale);
  const loc = locale as Locale;
  const t = await getTranslations("Admin.reviews");
  const back = `/${locale}/admin/reviews`;

  const [revRes, repRes] = await Promise.all([
    supabase
      .from("reviews")
      .select("id, rating, title, body, created_at, merchant:merchants(name)", { count: "exact" })
      .eq("status", "pending")
      .order("created_at")
      .limit(LIMIT),
    supabase
      .from("review_reports")
      .select("id, reason, details, created_at, review:reviews(id, rating, title, body, status, merchant:merchants(name))", { count: "exact" })
      .eq("status", "open")
      .order("created_at")
      .limit(LIMIT),
  ]);
  if (revRes.error) throw new Error(`reviews: ${revRes.error.message}`);
  if (repRes.error) throw new Error(`review_reports: ${repRes.error.message}`);

  return (
    <section className="flex flex-col gap-6">
      <h1 className={cls.h1}>{t("title")}</h1>
      <Flash ok={sp.ok} err={sp.err} />

      <section aria-labelledby="pending-h" className="flex flex-col gap-3">
        <h2 id="pending-h" className={cls.h2}>
          {t("pending", { count: revRes.count ?? 0 })}
        </h2>
        {revRes.data.length === 0 ? <p className={cls.muted}>{t("noPending")}</p> : null}
        {revRes.data.map((r) => (
          <article key={r.id} className={`${cls.card} flex flex-col gap-3`}>
            <header className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{r.merchant?.name}</span>
              <Pill>{t("rating", { rating: r.rating })}</Pill>
              <span className={cls.muted}>{formatDateTime(r.created_at, loc)}</span>
            </header>
            {r.title ? <h3 className="font-semibold">{r.title}</h3> : null}
            <p className="whitespace-pre-wrap text-sm">{r.body}</p>
            <div className="flex flex-wrap items-start gap-3">
              <form action={moderateReview}>
                <FormContext locale={locale} back={back} />
                <input type="hidden" name="review_id" value={r.id} />
                <input type="hidden" name="action" value="approve" />
                <button type="submit" className={cls.btn}>
                  {t("approve")}
                </button>
              </form>
              <form action={moderateReview} className="flex min-w-64 flex-1 flex-col gap-2">
                <FormContext locale={locale} back={back} />
                <input type="hidden" name="review_id" value={r.id} />
                <input type="hidden" name="action" value="reject" />
                <label className={cls.label}>
                  {t("reasonLabel")}
                  <textarea name="reason" required minLength={10} maxLength={2000} rows={2} className={cls.input} />
                  <span className="text-xs font-normal text-muted">{t("reasonHint")}</span>
                </label>
                <button type="submit" className={`${cls.btnDanger} self-start`}>
                  {t("reject")}
                </button>
              </form>
            </div>
          </article>
        ))}
      </section>

      <section id="reports" aria-labelledby="reports-h" className="flex flex-col gap-3">
        <h2 id="reports-h" className={cls.h2}>
          {t("reports", { count: repRes.count ?? 0 })}
        </h2>
        {repRes.data.length === 0 ? <p className={cls.muted}>{t("noReports")}</p> : null}
        {repRes.data.map((rep) => (
          <article key={rep.id} className={`${cls.card} flex flex-col gap-3`}>
            <header className="flex flex-wrap items-center gap-2">
              <Pill tone="warn">{t(`reportReason_${rep.reason as "spam"}`)}</Pill>
              <span className={cls.muted}>{formatDateTime(rep.created_at, loc)}</span>
            </header>
            {rep.details ? (
              <p className="text-sm">
                <span className="font-semibold">{t("reportDetails")}</span> {rep.details}
              </p>
            ) : null}
            {rep.review ? (
              <blockquote className="border-l-4 border-border-subtle pl-3 text-sm">
                <p className={cls.muted}>
                  {rep.review.merchant?.name} · {t("rating", { rating: rep.review.rating })} · {t(`status_${rep.review.status as "approved"}`)}
                </p>
                {rep.review.title ? <p className="font-semibold">{rep.review.title}</p> : null}
                <p className="whitespace-pre-wrap">{rep.review.body}</p>
              </blockquote>
            ) : null}
            <form action={decideReport} className="flex flex-col gap-2">
              <FormContext locale={locale} back={back} />
              <input type="hidden" name="report_id" value={rep.id} />
              <fieldset className="flex flex-wrap gap-4 text-sm">
                <legend className="sr-only">{t("decision")}</legend>
                <label className={cls.check}>
                  <input type="radio" name="decision" value="actioned" required />
                  {t("actioned")}
                </label>
                <label className={cls.check}>
                  <input type="radio" name="decision" value="dismissed" />
                  {t("dismissed")}
                </label>
                <label className={cls.check}>
                  <input type="checkbox" name="remove_review" />
                  {t("removeReview")}
                </label>
              </fieldset>
              <label className={cls.label}>
                {t("decisionReason")}
                <textarea name="reason" required minLength={10} maxLength={2000} rows={2} className={cls.input} />
              </label>
              <button type="submit" className={`${cls.btn} self-start`}>
                {t("decide")}
              </button>
            </form>
          </article>
        ))}
      </section>
    </section>
  );
}

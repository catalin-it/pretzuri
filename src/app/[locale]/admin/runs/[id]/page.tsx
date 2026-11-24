import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/admin/guard";
import { formatDateTime } from "@/lib/admin/format";
import { idSchema } from "@/lib/admin/schemas";
import { formatNumber } from "@/lib/format";
import { cls, Pill, runTone } from "@/components/admin/ui";

type Props = { params: Promise<{ locale: string; id: string }> };
const MAX_ERRORS = 500;

const COUNTERS = [
  "rows_read",
  "rows_valid",
  "rows_invalid",
  "products_new",
  "offers_new",
  "offers_updated",
  "offers_unchanged",
  "offers_expired",
  "price_changes",
  "categories_unmapped",
  "matches_queued",
] as const;

/** One import run: report counters, message and the stored row errors. */
export default async function AdminRun({ params }: Props) {
  const { locale, id: rawId } = await params;
  const { supabase } = await requireAdmin(locale);
  const id = idSchema.safeParse(rawId);
  if (!id.success) notFound();
  const loc = locale as Locale;
  const t = await getTranslations("Admin.runs");
  const [runRes, errRes] = await Promise.all([
    supabase.from("feed_runs").select("*, feed:feed_sources(id, name, merchant:merchants(id, name))").eq("id", id.data).maybeSingle(),
    supabase
      .from("feed_run_errors")
      .select("id, row_number, external_id, field, reason", { count: "exact" })
      .eq("run_id", id.data)
      .order("id")
      .limit(MAX_ERRORS),
  ]);
  const run = runRes.data;
  if (!run) notFound();

  return (
    <section className="flex flex-col gap-4">
      <p className={cls.muted}>
        <a className="underline" href={`/${locale}/admin/merchants/${run.feed?.merchant?.id}`}>
          {run.feed?.merchant?.name}
        </a>{" "}
        ·{" "}
        <a className="underline" href={`/${locale}/admin/feeds/${run.feed?.id}`}>
          {run.feed?.name}
        </a>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className={cls.h1}>{t("titleRun", { id: run.id })}</h1>
        <Pill tone={runTone(run.status)}>{t(`status_${run.status as "ok"}`)}</Pill>
      </div>
      <p className={cls.muted}>
        {formatDateTime(run.started_at, loc)}
        {run.finished_at ? ` – ${formatDateTime(run.finished_at, loc)}` : ""}
        {run.peak_rss_mb ? ` · ${t("peakRss", { mb: run.peak_rss_mb })}` : ""}
      </p>
      {run.message ? <p className={`${cls.card} whitespace-pre-wrap font-mono text-sm`}>{run.message}</p> : null}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {COUNTERS.map((k) => (
          <div key={k} className={cls.card}>
            <dt className={cls.muted}>{t(`c_${k}`)}</dt>
            <dd className="text-lg font-semibold">{formatNumber(run[k], loc)}</dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="err-h" className="flex flex-col gap-2">
        <h2 id="err-h" className={cls.h2}>
          {t("errors", { count: errRes.count ?? 0 })}
        </h2>
        {errRes.data?.length ? (
          <div className="overflow-x-auto">
            <table className={cls.table}>
              <thead>
                <tr>
                  <th className={cls.th}>{t("row")}</th>
                  <th className={cls.th}>{t("externalId")}</th>
                  <th className={cls.th}>{t("field")}</th>
                  <th className={cls.th}>{t("reason")}</th>
                </tr>
              </thead>
              <tbody>
                {errRes.data.map((e) => (
                  <tr key={e.id}>
                    <td className={cls.td}>{e.row_number ?? "–"}</td>
                    <td className={cls.td}>{e.external_id ?? "–"}</td>
                    <td className={cls.td}>{e.field ?? "–"}</td>
                    <td className={cls.td}>{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={cls.muted}>{t("noErrors")}</p>
        )}
      </section>
    </section>
  );
}

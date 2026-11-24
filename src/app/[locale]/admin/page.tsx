import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/admin/guard";
import { formatNumber } from "@/lib/format";
import { formatDateTime } from "@/lib/admin/format";
import { cls, Pill, runTone, Stat } from "@/components/admin/ui";

type Props = { params: Promise<{ locale: string }> };

type Counts = Record<
  | "products"
  | "offers_active"
  | "merchants"
  | "merchants_active"
  | "feed_sources"
  | "match_open"
  | "categories_unmapped"
  | "reviews_pending"
  | "reports_open"
  | "imports_pending",
  number
>;

export default async function AdminDashboard({ params }: Props) {
  const { locale } = await params;
  const { supabase } = await requireAdmin(locale);
  const loc = locale as Locale;
  const t = await getTranslations("Admin.dashboard");
  const tr = await getTranslations("Admin.runs");
  const [countsRes, runsRes] = await Promise.all([
    supabase.rpc("admin_dashboard"),
    supabase
      .from("feed_runs")
      .select("id, status, started_at, finished_at, rows_read, offers_new, products_new, categories_unmapped, matches_queued, message, feed:feed_sources(id, name, merchant:merchants(name))")
      .order("started_at", { ascending: false })
      .limit(10),
  ]);
  if (countsRes.error) throw new Error(`admin_dashboard: ${countsRes.error.message}`);
  const c = countsRes.data as Counts;
  const n = (v: number) => formatNumber(Number(v ?? 0), loc);
  const base = `/${locale}/admin`;

  return (
    <section className="flex flex-col gap-6">
      <h1 className={cls.h1}>{t("title")}</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label={t("products")} value={n(c.products)} />
        <Stat label={t("offers")} value={n(c.offers_active)} />
        <Stat label={t("merchants", { active: n(c.merchants_active) })} value={n(c.merchants)} href={`${base}/merchants`} />
        <Stat label={t("feeds")} value={n(c.feed_sources)} href={`${base}/merchants`} />
        <Stat label={t("imports")} value={n(c.imports_pending)} />
        <Stat label={t("matchOpen")} value={n(c.match_open)} href={`${base}/matching`} />
        <Stat label={t("unmapped")} value={n(c.categories_unmapped)} href={`${base}/categories`} />
        <Stat label={t("reviewsPending")} value={n(c.reviews_pending)} href={`${base}/reviews`} />
        <Stat label={t("reportsOpen")} value={n(c.reports_open)} href={`${base}/reviews#reports`} />
      </div>
      <section aria-labelledby="runs-h" className="flex flex-col gap-2">
        <h2 id="runs-h" className={cls.h2}>
          {t("lastRuns")}
        </h2>
        {runsRes.data?.length ? (
          <div className="overflow-x-auto">
            <table className={cls.table}>
              <thead>
                <tr>
                  <th className={cls.th}>{tr("feed")}</th>
                  <th className={cls.th}>{tr("status")}</th>
                  <th className={cls.th}>{tr("started")}</th>
                  <th className={cls.th}>{tr("rowsRead")}</th>
                  <th className={cls.th}>{tr("offersNew")}</th>
                  <th className={cls.th}>{tr("unmapped")}</th>
                  <th className={cls.th}>{tr("queued")}</th>
                </tr>
              </thead>
              <tbody>
                {runsRes.data.map((r) => (
                  <tr key={r.id}>
                    <td className={cls.td}>
                      <a className="underline" href={`${base}/runs/${r.id}`}>
                        {r.feed?.merchant?.name} · {r.feed?.name}
                      </a>
                    </td>
                    <td className={cls.td}>
                      <Pill tone={runTone(r.status)}>{tr(`status_${r.status}`)}</Pill>
                    </td>
                    <td className={cls.td}>{formatDateTime(r.started_at, loc)}</td>
                    <td className={cls.td}>{n(r.rows_read)}</td>
                    <td className={cls.td}>{n(r.offers_new)}</td>
                    <td className={cls.td}>{n(r.categories_unmapped)}</td>
                    <td className={cls.td}>{n(r.matches_queued)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={cls.muted}>{tr("none")}</p>
        )}
      </section>
    </section>
  );
}


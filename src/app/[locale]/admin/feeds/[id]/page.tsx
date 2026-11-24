import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/admin/guard";
import { formatDateTime } from "@/lib/admin/format";
import { idSchema } from "@/lib/admin/schemas";
import { formatNumber } from "@/lib/format";
import { cls, Pager, pageParam, Pill, runTone, type SearchParams } from "@/components/admin/ui";

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: SearchParams };
const PAGE = 30;

/** Import runs of one feed source with their report counts. */
export default async function AdminFeedRuns({ params, searchParams }: Props) {
  const { locale, id: rawId } = await params;
  const sp = await searchParams;
  const { supabase } = await requireAdmin(locale);
  const id = idSchema.safeParse(rawId);
  if (!id.success) notFound();
  const loc = locale as Locale;
  const page = pageParam(sp.page);
  const t = await getTranslations("Admin.runs");
  const tc = await getTranslations("Admin.common");
  const [feedRes, runsRes] = await Promise.all([
    supabase.from("feed_sources").select("id, name, merchant:merchants(id, name)").eq("id", id.data).maybeSingle(),
    supabase
      .from("feed_runs")
      .select("*")
      .eq("feed_source_id", id.data)
      .order("started_at", { ascending: false })
      .range((page - 1) * PAGE, page * PAGE),
  ]);
  const feed = feedRes.data;
  if (!feed) notFound();
  if (runsRes.error) throw new Error(`feed_runs: ${runsRes.error.message}`);
  const runs = runsRes.data.slice(0, PAGE);
  const n = (v: number) => formatNumber(v, loc);

  return (
    <section className="flex flex-col gap-4">
      <p className={cls.muted}>
        <a className="underline" href={`/${locale}/admin/merchants/${feed.merchant?.id}`}>
          {feed.merchant?.name}
        </a>
      </p>
      <h1 className={cls.h1}>{t("titleFeed", { name: feed.name })}</h1>
      {runs.length === 0 ? (
        <p className={cls.muted}>{t("none")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className={cls.table}>
            <thead>
              <tr>
                <th className={cls.th}>{t("started")}</th>
                <th className={cls.th}>{t("status")}</th>
                <th className={cls.th}>{t("rowsRead")}</th>
                <th className={cls.th}>{t("rowsInvalid")}</th>
                <th className={cls.th}>{t("offersNew")}</th>
                <th className={cls.th}>{t("offersUpdated")}</th>
                <th className={cls.th}>{t("offersExpired")}</th>
                <th className={cls.th}>{t("productsNew")}</th>
                <th className={cls.th}>{t("unmapped")}</th>
                <th className={cls.th}>{t("queued")}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className={cls.td}>
                    <a className="underline" href={`/${locale}/admin/runs/${r.id}`}>
                      {formatDateTime(r.started_at, loc)}
                    </a>
                  </td>
                  <td className={cls.td}>
                    <Pill tone={runTone(r.status)}>{t(`status_${r.status as "ok"}`)}</Pill>
                  </td>
                  <td className={cls.td}>{n(r.rows_read)}</td>
                  <td className={cls.td}>{n(r.rows_invalid)}</td>
                  <td className={cls.td}>{n(r.offers_new)}</td>
                  <td className={cls.td}>{n(r.offers_updated)}</td>
                  <td className={cls.td}>{n(r.offers_expired)}</td>
                  <td className={cls.td}>{n(r.products_new)}</td>
                  <td className={cls.td}>{n(r.categories_unmapped)}</td>
                  <td className={cls.td}>{n(r.matches_queued)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager
        base={`/${locale}/admin/feeds/${feed.id}`}
        page={page}
        hasNext={runsRes.data.length > PAGE}
        labels={{ prev: tc("prev"), next: tc("next"), nav: tc("pagination") }}
      />
    </section>
  );
}

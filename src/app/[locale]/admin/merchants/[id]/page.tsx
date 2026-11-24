import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/admin/guard";
import { runFeedNow, setMerchantActive } from "@/lib/admin/actions";
import { formatDateTime } from "@/lib/admin/format";
import { idSchema } from "@/lib/admin/schemas";
import { FeedForm, MerchantForm } from "@/components/admin/forms";
import { cls, Flash, FormContext, Pill, runTone, type SearchParams } from "@/components/admin/ui";

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: SearchParams };

export default async function AdminMerchant({ params, searchParams }: Props) {
  const { locale, id: rawId } = await params;
  const sp = await searchParams;
  const { supabase } = await requireAdmin(locale);
  const id = idSchema.safeParse(rawId);
  if (!id.success) notFound();
  const loc = locale as Locale;
  const t = await getTranslations("Admin.merchants");
  const tf = await getTranslations("Admin.feeds");
  const tr = await getTranslations("Admin.runs");
  const tc = await getTranslations("Admin.common");

  const [mRes, fRes, pendingRes] = await Promise.all([
    supabase
      .from("merchants")
      .select("id, slug, name, website, description, shipping_info, has_affiliate, affiliate_network, is_active")
      .eq("id", id.data)
      .maybeSingle(),
    supabase
      .from("feed_sources")
      .select("id, name, type, url, options, schedule_minutes, is_active, last_run_at, next_run_at, last_row_count, feed_runs(id, status, started_at)")
      .eq("merchant_id", id.data)
      .order("id")
      .order("started_at", { referencedTable: "feed_runs", ascending: false })
      .limit(1, { referencedTable: "feed_runs" }),
    supabase.from("import_requests").select("feed_source_id, status").in("status", ["pending", "queued"]),
  ]);
  const m = mRes.data;
  if (!m) notFound();
  if (fRes.error) throw new Error(`feed_sources: ${fRes.error.message}`);
  const pending = new Set((pendingRes.data ?? []).map((r) => r.feed_source_id));
  const back = `/${locale}/admin/merchants/${m.id}`;

  return (
    <section className="flex flex-col gap-6">
      <p className={cls.muted}>
        <a className="underline" href={`/${locale}/admin/merchants`}>
          {t("title")}
        </a>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className={cls.h1}>{m.name}</h1>
        <Pill tone={m.is_active ? "ok" : "neutral"}>{m.is_active ? tc("active") : tc("inactive")}</Pill>
        <form action={setMerchantActive}>
          <FormContext locale={locale} back={back} />
          <input type="hidden" name="id" value={m.id} />
          <input type="hidden" name="active" value={m.is_active ? "0" : "1"} />
          <button type="submit" className={m.is_active ? cls.btnDanger : cls.btnSecondary}>
            {m.is_active ? t("deactivate") : t("activate")}
          </button>
        </form>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <section aria-labelledby="feeds-h" className="flex flex-col gap-3">
        <h2 id="feeds-h" className={cls.h2}>
          {tf("title")}
        </h2>
        {fRes.data.length === 0 ? <p className={cls.muted}>{tf("none")}</p> : null}
        {fRes.data.map((f) => {
          const last = f.feed_runs[0];
          return (
            <article key={f.id} className={`${cls.card} flex flex-col gap-3`}>
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="font-semibold">{f.name}</h3>
                <Pill tone={f.is_active ? "ok" : "neutral"}>{f.is_active ? tc("active") : tc("inactive")}</Pill>
                <span className={cls.muted}>{tf(`type_${f.type as "direct_xml"}`)}</span>
                {last ? (
                  <a className="text-sm underline" href={`/${locale}/admin/runs/${last.id}`}>
                    {tf("lastRun")}: <Pill tone={runTone(last.status)}>{tr(`status_${last.status as "ok"}`)}</Pill>{" "}
                    {formatDateTime(last.started_at, loc)}
                  </a>
                ) : (
                  <span className={cls.muted}>{tf("neverRun")}</span>
                )}
                <a className="text-sm underline" href={`/${locale}/admin/feeds/${f.id}`}>
                  {tf("runs")}
                </a>
                <form action={runFeedNow} className="ml-auto">
                  <FormContext locale={locale} back={back} />
                  <input type="hidden" name="id" value={f.id} />
                  <button type="submit" className={cls.btnSecondary} disabled={pending.has(f.id)}>
                    {pending.has(f.id) ? tf("queued") : tf("runNow")}
                  </button>
                </form>
              </div>
              <p className={cls.muted}>
                {tf("nextRun")}: {formatDateTime(f.next_run_at, loc)}
              </p>
              <details>
                <summary className="cursor-pointer text-sm font-semibold">{tc("edit")}</summary>
                <div className="pt-3">
                  <FeedForm locale={locale} back={back} feed={f} />
                </div>
              </details>
            </article>
          );
        })}
        <details className={cls.card}>
          <summary className="cursor-pointer font-semibold">{tf("create")}</summary>
          <div className="pt-3">
            <FeedForm locale={locale} back={back} merchantId={m.id} />
          </div>
        </details>
      </section>

      <section aria-labelledby="edit-h" className={`${cls.card} flex flex-col gap-3`}>
        <h2 id="edit-h" className={cls.h2}>
          {t("edit")}
        </h2>
        <MerchantForm locale={locale} back={back} merchant={m} />
      </section>
    </section>
  );
}

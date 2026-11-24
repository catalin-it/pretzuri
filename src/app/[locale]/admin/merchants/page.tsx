import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/admin/guard";
import { formatNumber } from "@/lib/format";
import { MerchantForm } from "@/components/admin/forms";
import { cls, Flash, Pill, type SearchParams } from "@/components/admin/ui";

type Props = { params: Promise<{ locale: string }>; searchParams: SearchParams };

export default async function AdminMerchants({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  const { supabase } = await requireAdmin(locale);
  const t = await getTranslations("Admin.merchants");
  const tc = await getTranslations("Admin.common");
  const { data, error } = await supabase
    .from("merchants")
    .select("id, slug, name, has_affiliate, affiliate_network, is_active, feed_sources(count)")
    .order("name");
  if (error) throw new Error(`merchants: ${error.message}`);
  const base = `/${locale}/admin/merchants`;

  return (
    <section className="flex flex-col gap-6">
      <h1 className={cls.h1}>{t("title")}</h1>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="overflow-x-auto">
        <table className={cls.table}>
          <thead>
            <tr>
              <th className={cls.th}>{t("name")}</th>
              <th className={cls.th}>{t("network")}</th>
              <th className={cls.th}>{t("feedCount")}</th>
              <th className={cls.th}>{tc("status")}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((m) => (
              <tr key={m.id}>
                <td className={cls.td}>
                  <a className="font-semibold underline" href={`${base}/${m.id}`}>
                    {m.name}
                  </a>
                  <div className={cls.muted}>{m.slug}</div>
                </td>
                <td className={cls.td}>{m.has_affiliate ? m.affiliate_network : t("networkNone")}</td>
                <td className={cls.td}>{formatNumber(m.feed_sources[0]?.count ?? 0, locale as Locale)}</td>
                <td className={cls.td}>
                  <Pill tone={m.is_active ? "ok" : "neutral"}>{m.is_active ? tc("active") : tc("inactive")}</Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section aria-labelledby="new-h" className={`${cls.card} flex flex-col gap-3`}>
        <h2 id="new-h" className={cls.h2}>
          {t("create")}
        </h2>
        <MerchantForm locale={locale} back={base} />
      </section>
    </section>
  );
}

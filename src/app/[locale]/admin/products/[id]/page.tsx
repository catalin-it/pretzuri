import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/admin/guard";
import { mergeProducts, splitProduct } from "@/lib/admin/actions";
import { idSchema } from "@/lib/admin/schemas";
import { formatPrice } from "@/lib/format";
import { cls, Flash, FormContext, Pill, type SearchParams } from "@/components/admin/ui";

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: SearchParams };

/** Admin view of one product: its offers, split (selected offers -> new product) and manual merge into another. */
export default async function AdminProduct({ params, searchParams }: Props) {
  const { locale, id: rawId } = await params;
  const sp = await searchParams;
  const { supabase } = await requireAdmin(locale);
  const id = idSchema.safeParse(rawId);
  if (!id.success) notFound();
  const loc = locale as Locale;
  const t = await getTranslations("Admin.products");
  const tc = await getTranslations("Admin.common");
  const [pRes, oRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, slug, title, gtins, mpn_norm, status, merged_into, offer_count, min_price, brand:brands(name), category:categories(path, name_ro, name_en)")
      .eq("id", id.data)
      .maybeSingle(),
    supabase
      .from("offers")
      .select("id, title, price, currency, gtin, mpn, is_active, match_method, match_score, url, merchant:merchants(name)")
      .eq("product_id", id.data)
      .order("is_active", { ascending: false })
      .order("total_price"),
  ]);
  const p = pRes.data;
  if (!p) notFound();
  const offers = oRes.data ?? [];
  const back = `/${locale}/admin/products/${p.id}`;
  const merged = p.status === "merged";

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className={cls.h1}>{p.title}</h1>
        <Pill tone={p.status === "active" ? "ok" : "bad"}>{p.status}</Pill>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <p className={cls.muted}>
        #{p.id} · {p.slug} · {p.brand?.name ?? "–"} · {p.category ? (loc === "en" ? p.category.name_en : p.category.name_ro) : "–"}
        {p.gtins.length ? ` · GTIN ${p.gtins.join(", ")}` : ""}
        {p.mpn_norm ? ` · MPN ${p.mpn_norm}` : ""}
      </p>
      <p className="flex flex-wrap gap-3 text-sm">
        {p.status === "active" ? (
          <a className="underline" href={`/${locale}/p/${p.slug}`}>
            {t("publicPage")}
          </a>
        ) : null}
        {merged && p.merged_into ? (
          <a className="underline" href={`/${locale}/admin/products/${p.merged_into}`}>
            {t("mergedInto", { id: p.merged_into })}
          </a>
        ) : null}
      </p>

      <form action={splitProduct} className="flex flex-col gap-3">
        <FormContext locale={locale} back={back} />
        <input type="hidden" name="product_id" value={p.id} />
        <h2 className={cls.h2}>{t("offersTitle", { count: offers.length })}</h2>
        <div className="overflow-x-auto">
          <table className={cls.table}>
            <thead>
              <tr>
                <th className={cls.th}>
                  <span className="sr-only">{t("select")}</span>
                </th>
                <th className={cls.th}>{t("offer")}</th>
                <th className={cls.th}>{t("merchant")}</th>
                <th className={cls.th}>{t("price")}</th>
                <th className={cls.th}>{t("match")}</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.id} className={o.is_active ? "" : "text-muted"}>
                  <td className={cls.td}>
                    <input type="checkbox" name="offer" value={o.id} aria-label={o.title} disabled={merged} />
                  </td>
                  <td className={cls.td}>
                    <a href={o.url} rel="nofollow noopener noreferrer" target="_blank" className="underline">
                      {o.title}
                    </a>
                    <div className={cls.muted}>
                      {o.gtin ? `GTIN ${o.gtin}` : ""} {o.mpn ? `MPN ${o.mpn}` : ""} {o.is_active ? "" : `· ${tc("inactive")}`}
                    </div>
                  </td>
                  <td className={cls.td}>{o.merchant?.name}</td>
                  <td className={cls.td}>{formatPrice(Number(o.price), loc, o.currency)}</td>
                  <td className={cls.td}>
                    {o.match_method ?? "–"}
                    {o.match_score !== null ? ` (${o.match_score})` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!merged && offers.length > 1 ? (
          <div className={`${cls.card} flex flex-wrap items-end gap-3`}>
            <label className={`${cls.label} min-w-64 flex-1`}>
              {t("splitTitle")}
              <input name="title" maxLength={300} placeholder={t("splitTitlePlaceholder")} className={cls.input} />
            </label>
            <button type="submit" className={cls.btnSecondary}>
              {t("split")}
            </button>
          </div>
        ) : null}
      </form>

      {!merged ? (
        <form action={mergeProducts} className={`${cls.card} flex flex-wrap items-end gap-3`}>
          <FormContext locale={locale} back={back} />
          <input type="hidden" name="source" value={p.id} />
          <input type="hidden" name="after" value="target" />
          <label className={`${cls.label} min-w-64 flex-1`}>
            {t("mergeInto")}
            <input name="target" required pattern="[0-9]+|[a-z0-9]+(-[a-z0-9]+)*" placeholder={t("mergeIntoPlaceholder")} className={cls.input} />
            <span className="text-xs font-normal text-muted">{t("mergeHint")}</span>
          </label>
          <button type="submit" className={cls.btnDanger}>
            {t("merge")}
          </button>
        </form>
      ) : null}
    </section>
  );
}

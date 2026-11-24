import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/admin/guard";
import { mapCategories } from "@/lib/admin/actions";
import { idSchema } from "@/lib/admin/schemas";
import { categoryName } from "@/lib/catalog/names";
import { formatNumber } from "@/lib/format";
import { SelectAll } from "@/components/admin/select-all";
import { cls, Flash, FormContext, Pager, pageParam, type SearchParams } from "@/components/admin/ui";

type Props = { params: Promise<{ locale: string }>; searchParams: SearchParams };
const PAGE = 100;

/** Shop category paths -> our tree. Unmapped first, by offer count; bulk assign via a searchable list (datalist). */
export default async function AdminCategories({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  const { supabase } = await requireAdmin(locale);
  const loc = locale as Locale;
  const t = await getTranslations("Admin.categories");
  const tc = await getTranslations("Admin.common");
  const merchantId = idSchema.safeParse(sp.merchant);
  const showAll = sp.show === "all";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const page = pageParam(sp.page);

  let query = supabase
    .from("category_mappings")
    .select("id, source_path, offer_count, category_id, merchant:merchants(id, name), category:categories(id, path, name_ro, name_en)")
    .order("category_id", { ascending: true, nullsFirst: true })
    .order("offer_count", { ascending: false })
    .order("id")
    .range((page - 1) * PAGE, page * PAGE);
  if (!showAll) query = query.is("category_id", null);
  if (merchantId.success) query = query.eq("merchant_id", merchantId.data);
  if (q) query = query.ilike("source_path", `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);

  const [mapRes, catRes, merRes] = await Promise.all([
    query,
    supabase.from("categories").select("id, path, depth, name_ro, name_en").order("path"),
    supabase.from("merchants").select("id, name").order("name"),
  ]);
  if (mapRes.error) throw new Error(`category_mappings: ${mapRes.error.message}`);
  const rows = mapRes.data.slice(0, PAGE);
  const cats = catRes.data ?? [];
  const byId = new Map(cats.map((c) => [c.id, c]));
  /** "Parent › Child" label for a category path. */
  const label = (path: string) =>
    path
      .split("/")
      .map((_, i, parts) => cats.find((c) => c.path === parts.slice(0, i + 1).join("/")))
      .map((c) => (c ? categoryName(c, loc) : "?"))
      .join(" › ");

  const filter: Record<string, string> = {};
  if (merchantId.success) filter.merchant = String(merchantId.data);
  if (showAll) filter.show = "all";
  if (q) filter.q = q;
  const back = `/${locale}/admin/categories${Object.keys(filter).length ? `?${new URLSearchParams(filter)}` : ""}`;

  return (
    <section className="flex flex-col gap-4">
      <h1 className={cls.h1}>{t("title")}</h1>
      <p className={cls.muted}>{t("intro")}</p>
      <Flash ok={sp.ok} err={sp.err} />
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className={cls.label}>
          {t("merchant")}
          <select name="merchant" defaultValue={merchantId.success ? String(merchantId.data) : ""} className={cls.input}>
            <option value="">{t("allMerchants")}</option>
            {(merRes.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className={cls.label}>
          {t("search")}
          <input name="q" defaultValue={q} className={cls.input} />
        </label>
        <label className={cls.check}>
          <input type="checkbox" name="show" value="all" defaultChecked={showAll} />
          {t("showAll")}
        </label>
        <button type="submit" className={cls.btnSecondary}>
          {tc("filter")}
        </button>
      </form>

      <datalist id="category-paths">
        {cats.map((c) => (
          <option key={c.id} value={c.path}>
            {label(c.path)}
          </option>
        ))}
      </datalist>

      {rows.length === 0 ? (
        <p className={cls.muted}>{showAll ? t("none") : t("noneUnmapped")}</p>
      ) : (
        <form action={mapCategories} className="flex flex-col gap-3">
          <FormContext locale={locale} back={back} />
          <div className="overflow-x-auto">
            <table className={cls.table}>
              <thead>
                <tr>
                  <th className={cls.th}>
                    <SelectAll name="ids" label={t("selectAll")} />
                  </th>
                  <th className={cls.th}>{t("merchant")}</th>
                  <th className={cls.th}>{t("sourcePath")}</th>
                  <th className={cls.th}>{t("offers")}</th>
                  <th className={cls.th}>{t("ourCategory")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const cat = r.category_id ? byId.get(r.category_id) : null;
                  return (
                    <tr key={r.id}>
                      <td className={cls.td}>
                        <input type="checkbox" name="ids" value={r.id} aria-label={r.source_path} />
                      </td>
                      <td className={cls.td}>{r.merchant?.name}</td>
                      <td className={`${cls.td} break-all`}>{r.source_path}</td>
                      <td className={cls.td}>{formatNumber(r.offer_count, loc)}</td>
                      <td className={cls.td}>{cat ? label(cat.path) : <span className="text-price-drop">{t("unmapped")}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={`${cls.card} flex flex-wrap items-end gap-3`}>
            <label className={`${cls.label} min-w-64 flex-1`}>
              {t("assign")}
              <input name="category" list="category-paths" placeholder={t("assignPlaceholder")} className={cls.input} autoComplete="off" />
            </label>
            <button type="submit" name="op" value="map" className={cls.btn}>
              {t("assignButton")}
            </button>
            <button type="submit" name="op" value="unmap" className={cls.btnSecondary} formNoValidate>
              {t("unmapButton")}
            </button>
          </div>
        </form>
      )}
      <Pager
        base={`/${locale}/admin/categories`}
        page={page}
        hasNext={mapRes.data.length > PAGE}
        labels={{ prev: tc("prev"), next: tc("next"), nav: tc("pagination") }}
        params={filter}
      />
    </section>
  );
}

import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/admin/guard";
import { mergeProducts, rejectMatch } from "@/lib/admin/actions";
import { formatDateTime } from "@/lib/admin/format";
import { formatNumber, formatPrice } from "@/lib/format";
import { cls, Flash, FormContext, Pager, pageParam, Pill, type SearchParams } from "@/components/admin/ui";

type Props = { params: Promise<{ locale: string }>; searchParams: SearchParams };
const PAGE = 20;

type Candidate = { product_id: number; score?: number };

/**
 * Open matching queue (skill product-matching): an offer got a new visible product because the match was uncertain.
 * Merge into a candidate (the candidate survives), reject (pair never suggested again) or split from the product page.
 */
export default async function AdminMatching({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  const { supabase } = await requireAdmin(locale);
  const loc = locale as Locale;
  const page = pageParam(sp.page);
  const t = await getTranslations("Admin.matching");
  const tc = await getTranslations("Admin.common");

  const { data: items, error } = await supabase
    .from("match_queue")
    .select(
      "id, reason, candidates, created_at, product_id, offer:offers(id, title, price, currency, gtin, mpn, brand_raw, url, merchant:merchants(name))",
    )
    .eq("status", "open")
    .order("created_at")
    .order("id")
    .range((page - 1) * PAGE, page * PAGE);
  if (error) throw new Error(`match_queue: ${error.message}`);
  const rows = items.slice(0, PAGE);

  const ids = new Set<number>();
  for (const r of rows) {
    ids.add(r.product_id);
    for (const c of (r.candidates as Candidate[] | null) ?? []) ids.add(Number(c.product_id));
  }
  const { data: products } = ids.size
    ? await supabase
        .from("products")
        .select("id, slug, title, gtins, mpn_norm, status, offer_count, min_price, created_at, brand:brands(name), category:categories(name_ro, name_en)")
        .in("id", [...ids])
    : { data: [] };
  const byId = new Map((products ?? []).map((p) => [p.id, p]));
  const back = `/${locale}/admin/matching${page > 1 ? `?page=${page}` : ""}`;

  type P = NonNullable<typeof products>[number];
  const ProductBox = ({ p, score }: { p: P | undefined; score?: number }) =>
    p ? (
      <div className="flex flex-col gap-1">
        <a className="font-semibold underline" href={`/${locale}/admin/products/${p.id}`}>
          {p.title}
        </a>
        <span className={cls.muted}>
          #{p.id} · {p.brand?.name ?? t("noBrand")} · {p.category ? (loc === "en" ? p.category.name_en : p.category.name_ro) : t("noCategory")}
        </span>
        <span className={cls.muted}>
          {t("offers", { count: p.offer_count })}
          {p.min_price !== null ? ` · ${formatPrice(Number(p.min_price), loc)}` : ""}
          {p.gtins.length ? ` · GTIN ${p.gtins.join(", ")}` : ""}
          {p.mpn_norm ? ` · MPN ${p.mpn_norm}` : ""}
        </span>
        <span className="flex gap-2">
          {score !== undefined ? <Pill tone={score >= 0.85 ? "ok" : "warn"}>{t("score", { score: formatNumber(score, loc) })}</Pill> : null}
          {p.status !== "active" ? <Pill tone="bad">{p.status}</Pill> : null}
        </span>
      </div>
    ) : (
      <span className={cls.muted}>{t("gone")}</span>
    );

  return (
    <section className="flex flex-col gap-4">
      <h1 className={cls.h1}>{t("title")}</h1>
      <p className={cls.muted}>{t("intro")}</p>
      <Flash ok={sp.ok} err={sp.err} />
      {rows.length === 0 ? <p className={cls.muted}>{t("empty")}</p> : null}
      {rows.map((r) => {
        const cands = ((r.candidates as Candidate[] | null) ?? []).slice(0, 5);
        const product = byId.get(r.product_id);
        return (
          <article key={r.id} className={`${cls.card} flex flex-col gap-3`}>
            <header className="flex flex-wrap items-center gap-2">
              <Pill tone="warn">{t(`reason_${r.reason as "title_review"}`)}</Pill>
              <span className={cls.muted}>
                #{r.id} · {formatDateTime(r.created_at, loc)}
              </span>
            </header>
            {r.offer ? (
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold">{t("offer")}</span>
                <a href={r.offer.url} rel="nofollow noopener noreferrer" target="_blank" className="underline">
                  {r.offer.title}
                </a>
                <span className={cls.muted}>
                  {r.offer.merchant?.name} · {formatPrice(Number(r.offer.price), loc, r.offer.currency)}
                  {r.offer.brand_raw ? ` · ${r.offer.brand_raw}` : ""}
                  {r.offer.gtin ? ` · GTIN ${r.offer.gtin}` : ""}
                  {r.offer.mpn ? ` · MPN ${r.offer.mpn}` : ""}
                </span>
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold">{t("newProduct")}</span>
              <ProductBox p={product} />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">{t("candidates")}</span>
              {cands.length === 0 ? <span className={cls.muted}>{t("noCandidates")}</span> : null}
              <ul className="flex flex-col gap-2">
                {cands.map((c) => {
                  const cp = byId.get(Number(c.product_id));
                  return (
                    <li key={c.product_id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border-subtle p-3">
                      <ProductBox p={cp} score={typeof c.score === "number" ? c.score : undefined} />
                      {cp && cp.status === "active" && product && product.status !== "merged" ? (
                        <form action={mergeProducts}>
                          <FormContext locale={locale} back={back} />
                          <input type="hidden" name="source" value={r.product_id} />
                          <input type="hidden" name="target" value={cp.id} />
                          <input type="hidden" name="queue_id" value={r.id} />
                          <button type="submit" className={cls.btn}>
                            {t("merge")}
                          </button>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
            <footer className="flex flex-wrap gap-2">
              <form action={rejectMatch}>
                <FormContext locale={locale} back={back} />
                <input type="hidden" name="queue_id" value={r.id} />
                <button type="submit" className={cls.btnSecondary}>
                  {t("reject")}
                </button>
              </form>
              <a className={cls.btnSecondary} href={`/${locale}/admin/products/${r.product_id}`}>
                {t("openProduct")}
              </a>
            </footer>
          </article>
        );
      })}
      <Pager
        base={`/${locale}/admin/matching`}
        page={page}
        hasNext={items.length > PAGE}
        labels={{ prev: tc("prev"), next: tc("next"), nav: tc("pagination") }}
      />
    </section>
  );
}

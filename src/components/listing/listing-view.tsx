import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { Facets, ListingItem } from "@/lib/catalog/queries";
import { formatNumber } from "@/lib/format";
import {
  type ListingParams,
  type Sort,
  SORTS,
  SPEC_PREFIX,
  hasFilters,
  pageWindow,
  toQueryString,
  totalPages,
} from "@/lib/listing/params";
import { specText } from "@/lib/storage";
import { ProductCard } from "./product-card";
import { AutoSubmitSelect } from "./auto-submit-select";

type Props = {
  params: ListingParams;
  items: ListingItem[];
  total: number;
  facets: Facets;
  /** Path without locale, e.g. "/cautare" or "/c/it-electronice/laptopuri". */
  basePath: string;
  defaultSort: Sort;
};

const FORM_ID = "listing-filters";

/** Results + facets + sort + pagination. Plain GET form and links: works without JavaScript. */
export async function ListingView({ params, items, total, facets, basePath, defaultSort }: Props) {
  const [t, locale] = await Promise.all([getTranslations("Listing"), getLocale() as Promise<Locale>]);
  const pages = totalPages(total);
  const action = `/${locale}${basePath}`;
  const sorts = SORTS.filter((s) => s !== "relevance" || params.q);
  const href = (over: Partial<ListingParams>) => `${basePath}${toQueryString({ ...params, ...over }, defaultSort)}`;
  const specEntries = Object.entries(facets.specs).filter(([, vals]) => vals.length > 0);

  const filters = (
    <form id={FORM_ID} method="get" action={action} className="flex flex-col gap-5">
      {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">{t("price")}</legend>
        <div className="flex items-center gap-2">
          <label className="flex flex-1 flex-col text-sm">
            {t("priceMin")}
            <input
              type="number"
              name="pret_min"
              min={0}
              step="any"
              inputMode="decimal"
              defaultValue={params.priceMin ?? ""}
              placeholder={facets.price.min !== null ? String(Math.floor(Number(facets.price.min))) : ""}
              className="w-full rounded-lg border border-border bg-background px-2 py-1"
            />
          </label>
          <label className="flex flex-1 flex-col text-sm">
            {t("priceMax")}
            <input
              type="number"
              name="pret_max"
              min={0}
              step="any"
              inputMode="decimal"
              defaultValue={params.priceMax ?? ""}
              placeholder={facets.price.max !== null ? String(Math.ceil(Number(facets.price.max))) : ""}
              className="w-full rounded-lg border border-border bg-background px-2 py-1"
            />
          </label>
        </div>
      </fieldset>
      {facets.brands.length > 0 ? (
        <FacetGroup legend={t("brands")}>
          {facets.brands.map((b) => (
            <Check key={b.id} name="brand" value={String(b.id)} checked={params.brandIds.includes(b.id)}>
              {b.name} <span className="text-muted">({formatNumber(b.count, locale)})</span>
            </Check>
          ))}
        </FacetGroup>
      ) : null}
      {facets.merchants.length > 0 ? (
        <FacetGroup legend={t("merchants")}>
          {facets.merchants.map((m) => (
            <Check key={m.id} name="magazin" value={String(m.id)} checked={params.merchantIds.includes(m.id)}>
              {m.name} <span className="text-muted">({formatNumber(m.count, locale)})</span>
            </Check>
          ))}
        </FacetGroup>
      ) : null}
      {specEntries.map(([key, vals]) => (
        <FacetGroup key={key} legend={key}>
          {vals.map((v) => {
            const value = specText(v.value);
            return (
              <Check key={value} name={SPEC_PREFIX + key} value={value} checked={(params.specs[key] ?? []).includes(value)}>
                {value} <span className="text-muted">({formatNumber(v.count, locale)})</span>
              </Check>
            );
          })}
        </FacetGroup>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-contrast hover:bg-accent-hover">
          {t("apply")}
        </button>
        {hasFilters(params) ? (
          <Link href={href({ priceMin: null, priceMax: null, brandIds: [], merchantIds: [], specs: {}, page: 1 })} className="underline">
            {t("reset")}
          </Link>
        ) : null}
      </div>
    </form>
  );

  return (
    <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
      {/* One form only (ids must be unique): after the results on phones, a sidebar from md up. */}
      <aside id="filtre" aria-label={t("filters")} className="order-2 md:order-1">
        <h2 className="mb-3 text-lg font-semibold md:sr-only">{t("filters")}</h2>
        {filters}
      </aside>
      <section aria-labelledby="results-heading" className="order-1 flex flex-col gap-4 md:order-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p id="results-heading" role="status" className="text-muted">
            {t("results", { count: total })}
          </p>
          <a href="#filtre" className="text-sm underline md:hidden">
            {t("filters")}
          </a>
          <div className="flex items-center gap-2">
            <label htmlFor="sort" className="text-sm">
              {t("sortLabel")}
            </label>
            <AutoSubmitSelect
              id="sort"
              name="sort"
              form={FORM_ID}
              defaultValue={params.sort}
              className="rounded-lg border border-border bg-background px-2 py-1"
            >
              {sorts.map((s) => (
                <option key={s} value={s}>
                  {t(`sort.${s}`)}
                </option>
              ))}
            </AutoSubmitSelect>
            <noscript>
              <button type="submit" form={FORM_ID} className="rounded-lg border border-border px-2 py-1 text-sm">
                {t("sortApply")}
              </button>
            </noscript>
          </div>
        </div>
        {items.length === 0 ? (
          <div className="rounded-xl border border-border-subtle bg-surface p-6">
            <h2 className="font-semibold">{t("emptyTitle")}</h2>
            <p className="text-muted">{hasFilters(params) ? t("emptyFiltered") : t("emptyBody")}</p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
              <ProductCard key={item.id} item={item} />
            ))}
          </ul>
        )}
        {pages > 1 ? (
          <nav aria-label={t("pagination")} className="flex flex-wrap items-center gap-2">
            {params.page > 1 ? (
              <Link rel="prev" href={href({ page: params.page - 1 })} className="rounded-lg border border-border px-3 py-1">
                {t("prev")}
              </Link>
            ) : null}
            {pageWindow(params.page, pages).map((n, i) =>
              n === null ? (
                <span key={`gap-${i}`} aria-hidden="true">
                  …
                </span>
              ) : n === params.page ? (
                <span key={n} aria-current="page" className="rounded-lg bg-accent px-3 py-1 font-semibold text-accent-contrast">
                  {n}
                </span>
              ) : (
                <Link key={n} href={href({ page: n })} className="rounded-lg border border-border px-3 py-1" aria-label={t("pageN", { n })}>
                  {n}
                </Link>
              ),
            )}
            {params.page < pages ? (
              <Link rel="next" href={href({ page: params.page + 1 })} className="rounded-lg border border-border px-3 py-1">
                {t("next")}
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}

function FacetGroup({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 font-semibold">{legend}</legend>
      <div className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">{children}</div>
    </fieldset>
  );
}

function Check({ name, value, checked, children }: { name: string; value: string; checked: boolean; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" name={name} value={value} defaultChecked={checked} className="h-4 w-4 accent-accent" />
      <span>{children}</span>
    </label>
  );
}

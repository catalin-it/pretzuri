import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { ListingView } from "@/components/listing/listing-view";
import { type CategoryNode, getCategoryTree, pathPrefixes, searchListing } from "@/lib/catalog/queries";
import { categoryName } from "@/lib/catalog/names";
import { formatNumber } from "@/lib/format";
import { hasFilters, parseListingParams, type RawParams } from "@/lib/listing/params";
import { localeAlternates } from "@/lib/seo";

type Props = { params: Promise<{ locale: string; slug: string[] }>; searchParams: Promise<RawParams> };

const SEGMENT = /^[a-z0-9-]{1,80}$/;

async function resolve(slug: string[]) {
  const segs = slug.map((s) => decodeURIComponent(s));
  if (segs.length > 6 || !segs.every((s) => SEGMENT.test(s))) return null;
  const path = segs.join("/");
  const tree = await getCategoryTree();
  const node = tree.find((c) => c.path === path);
  if (!node) return null;
  return { node, tree, path };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ locale, slug }, sp] = await Promise.all([params, searchParams]);
  const r = await resolve(slug);
  if (!r) return {};
  const t = await getTranslations({ locale, namespace: "CategoryPage" });
  const name = categoryName(r.node, locale);
  const filtered = hasFilters(parseListingParams(sp)) || Object.keys(sp).some((k) => k !== "pagina");
  return {
    title: name,
    description: t("description", { name }),
    alternates: localeAlternates(locale, `/c/${r.path}`),
    // Filtered/sorted variants are not indexed; the canonical category page is.
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ locale, slug }, sp] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const r = await resolve(slug);
  if (!r) notFound();
  const { node, tree, path } = r;
  const t = await getTranslations("CategoryPage");

  const crumbs = pathPrefixes(path)
    .map((p) => tree.find((c) => c.path === p))
    .filter((c): c is CategoryNode => !!c)
    .map((c) => ({ href: `/c/${c.path}`, label: categoryName(c, locale) }));
  const children = tree.filter((c) => c.parent_id === node.id && Number(c.product_count) > 0);

  const listing = parseListingParams(sp, "offers");
  const data = await searchListing(listing, path);

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb items={crumbs} locale={locale} />
      <h1 className="text-2xl font-bold">{categoryName(node, locale)}</h1>
      {children.length > 0 ? (
        <nav aria-label={t("subcategories")}>
          <ul className="flex flex-wrap gap-2">
            {children.map((c) => (
              <li key={c.id}>
                <Link href={`/c/${c.path}`} className="inline-block rounded-full border border-border-subtle bg-surface px-3 py-1 text-sm hover:border-accent">
                  {categoryName(c, locale)}{" "}
                  <span className="text-muted">({formatNumber(Number(c.product_count), locale as Locale)})</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <ListingView
        params={listing}
        items={data.items}
        total={data.total}
        facets={data.facets}
        basePath={`/c/${path}`}
        defaultSort="offers"
      />
    </div>
  );
}

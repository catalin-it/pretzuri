import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ListingView } from "@/components/listing/listing-view";
import { searchListing } from "@/lib/catalog/queries";
import { parseListingParams, type RawParams } from "@/lib/listing/params";
import { localeAlternates } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<RawParams> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  const t = await getTranslations({ locale, namespace: "SearchPage" });
  const q = parseListingParams(sp).q;
  return {
    title: q ? t("titleQuery", { q }) : t("title"),
    // Search result pages are not indexed (thin/duplicate content); links are still followed.
    robots: { index: false, follow: true },
    alternates: localeAlternates(locale, "/cautare"),
  };
}

export default async function SearchPage({ params, searchParams }: Props) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const t = await getTranslations("SearchPage");
  const first = parseListingParams(sp);
  const defaultSort = first.q ? "relevance" : "offers";
  const listing = parseListingParams(sp, defaultSort);
  const data = await searchListing(listing, null);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{listing.q ? t("titleQuery", { q: listing.q }) : t("title")}</h1>
      <ListingView
        params={listing}
        items={data.items}
        total={data.total}
        facets={data.facets}
        basePath="/cautare"
        defaultSort={defaultSort}
      />
    </div>
  );
}

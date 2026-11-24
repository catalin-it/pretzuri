import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SearchBox } from "@/components/search/search-box";

export async function SiteHeader() {
  const t = await getTranslations("Header");
  return (
    <header className="border-b border-border-subtle bg-surface-raised">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <Link href="/" className="text-xl font-bold tracking-tight text-accent-text" aria-label={t("home")}>
          Pretzuri
        </Link>
        <div className="order-3 w-full sm:order-none sm:w-auto sm:flex-1">
          <SearchBox />
        </div>
      </div>
    </header>
  );
}

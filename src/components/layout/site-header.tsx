import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SearchBox } from "@/components/search/search-box";
import { getRootCategories } from "@/lib/catalog/queries";
import { categoryName } from "@/lib/catalog/names";
import { getSessionUser } from "@/lib/auth/session";

export async function SiteHeader() {
  const [t, locale, roots, user] = await Promise.all([
    getTranslations("Header"),
    getLocale(),
    getRootCategories(),
    getSessionUser(),
  ]);
  return (
    <header className="border-b border-border-subtle bg-surface-raised">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <Link href="/" className="text-xl font-bold tracking-tight text-accent-text" aria-label={t("home")}>
          Pretzuri
        </Link>
        {roots.length > 0 ? (
          // <details> menu: works without JavaScript.
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-lg border border-border px-3 py-2 text-sm font-semibold">
              {t("categories")}
            </summary>
            <nav aria-label={t("categories")} className="absolute left-0 z-30 mt-2 w-64 rounded-xl border border-border-subtle bg-surface-raised p-2 shadow-lg">
              <ul className="flex flex-col">
                {roots.map((c) => (
                  <li key={c.id}>
                    <Link href={`/c/${c.path}`} className="block rounded-lg px-3 py-2 text-sm hover:bg-surface">
                      {categoryName(c, locale)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </details>
        ) : null}
        <div className="order-3 w-full sm:order-none sm:w-auto sm:flex-1">
          <SearchBox />
        </div>
        <Link
          href={user ? "/cont" : "/autentificare"}
          className="rounded-lg border border-border px-3 py-2 text-sm font-semibold"
        >
          {user ? t("account") : t("signIn")}
        </Link>
      </div>
    </header>
  );
}

import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { appVersion } from "@/lib/app-version";

const LINKS = [
  ["/cum-ordonam", "ranking"],
  ["/despre-afiliere", "affiliate"],
  ["/confidentialitate", "privacy"],
  ["/termeni", "terms"],
] as const;

export async function SiteFooter() {
  const t = await getTranslations("Footer");
  return (
    <footer className="border-t border-border-subtle bg-surface text-sm text-muted">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6">
        <nav aria-label={t("navLabel")}>
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {LINKS.map(([href, key]) => (
              <li key={href}>
                <Link href={href} className="underline hover:text-text">
                  {t(key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p>{t("disclosure")}</p>
        <p>
          Pretzuri {appVersion.version}
          {appVersion.env === "dev" ? ` · DEV · ${appVersion.commit}` : ""}
        </p>
      </div>
    </footer>
  );
}

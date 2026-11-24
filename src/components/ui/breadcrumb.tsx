import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { JsonLd } from "@/components/seo/json-ld";
import { SITE_URL } from "@/lib/app-version";

export type Crumb = { href: string; label: string };

/** Breadcrumb with BreadcrumbList JSON-LD. `href` values are locale-less paths. */
export async function Breadcrumb({ items, locale }: { items: Crumb[]; locale: string }) {
  const t = await getTranslations("Common");
  const all = [{ href: "/", label: t("home") }, ...items];
  return (
    <nav aria-label={t("breadcrumb")} className="text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {all.map((c, i) => (
          <li key={c.href} className="flex items-center gap-1">
            {i > 0 ? <span aria-hidden="true">›</span> : null}
            {i === all.length - 1 ? (
              <span aria-current="page">{c.label}</span>
            ) : (
              <Link href={c.href} className="hover:underline">
                {c.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: all.map((c, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: c.label,
            item: `${SITE_URL}/${locale}${c.href === "/" ? "" : c.href}`,
          })),
        }}
      />
    </nav>
  );
}

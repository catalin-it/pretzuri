import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { signOut } from "@/lib/account/actions";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AccountLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // Each page redirects to the sign-in page with its own path as `next`; the layout only renders around it.
  const user = await getSessionUser();
  if (!user) return children;
  const t = await getTranslations("Account");
  const nav = [
    { href: "/cont", label: t("navHome") },
    { href: "/cont/favorite", label: t("navFavorites") },
    { href: "/cont/alerte", label: t("navAlerts") },
    { href: "/cont/istoric", label: t("navHistory") },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{t("signedInAs", { email: user.email ?? "" })}</p>
        <form action={signOut.bind(null, locale)}>
          <button type="submit" className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface">
            {t("signOut")}
          </button>
        </form>
      </div>
      <nav aria-label={t("navLabel")} className="flex flex-wrap gap-2">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className="rounded-lg border border-border-subtle px-3 py-2 text-sm hover:bg-surface">
            {n.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}

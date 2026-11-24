import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getAdminContext } from "@/lib/admin/guard";

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin" });
  return { title: t("title"), robots: { index: false, follow: false, nocache: true } };
}

const SECTIONS = ["", "merchants", "categories", "matching", "reviews", "users", "settings"] as const;

/** Admin shell. Non-admins get a 404 (the area does not reveal itself); every page re-checks with requireAdmin(). */
export default async function AdminLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = await getAdminContext();
  if (!ctx) notFound();
  const t = await getTranslations("Admin.nav");
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label={t("label")} className="flex flex-wrap gap-2 border-b border-border-subtle pb-3 text-sm">
        {SECTIONS.map((s) => (
          <a key={s} href={`/${locale}/admin${s ? `/${s}` : ""}`} className="rounded-lg px-3 py-1.5 font-semibold hover:bg-surface">
            {t(s || "dashboard")}
          </a>
        ))}
        <span className="ml-auto self-center text-muted">{ctx.user.email}</span>
      </nav>
      {children}
    </div>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LoginForm } from "@/components/account/login-form";
import { getSessionUser } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/account/schemas";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Auth" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function LoginPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const next = safeNextPath(Array.isArray(sp.next) ? sp.next[0] : sp.next, locale === "en" ? "en" : "ro");
  if (await getSessionUser()) redirect(next);
  const t = await getTranslations("Auth");
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="max-w-prose text-muted">{t("intro")}</p>
      <LoginForm next={next} />
      <p className="max-w-prose text-xs text-muted">{t("privacyNote")}</p>
    </section>
  );
}

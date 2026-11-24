import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { NOINDEX, SITE_URL } from "@/lib/app-version";
import { QueryProvider } from "@/components/query-provider";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { SwRegister } from "@/components/pwa/sw-register";
import "../globals.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t("title"), template: `%s · Pretzuri` },
    description: t("description"),
    applicationName: "Pretzuri",
    appleWebApp: { capable: true, title: "Pretzuri", statusBarStyle: "default" },
    icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
    formatDetection: { telephone: false },
    robots: NOINDEX ? { index: false, follow: false } : undefined,
    alternates: { languages: { ro: "/ro", en: "/en" } },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1215" },
  ],
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  // Every page is dynamic: the CSP nonce is per request, so HTML cannot be prerendered.
  await connection();
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <QueryProvider>
            <SiteHeader />
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
            <SiteFooter />
            <SwRegister />
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

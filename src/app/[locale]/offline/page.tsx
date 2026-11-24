import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function OfflinePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Offline");
  return (
    <section className="flex flex-col gap-3 py-12 text-center">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted">{t("body")}</p>
    </section>
  );
}

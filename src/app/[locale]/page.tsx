import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  return (
    <section className="flex flex-col gap-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
      <p className="max-w-2xl text-lg text-muted">{t("intro")}</p>
    </section>
  );
}

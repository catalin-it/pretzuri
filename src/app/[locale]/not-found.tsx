import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("NotFound");
  return (
    <section className="flex flex-col items-center gap-3 py-12 text-center">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted">{t("body")}</p>
      <Link href="/" className="font-semibold text-accent-text underline">
        {t("home")}
      </Link>
    </section>
  );
}

"use client";

import { useTranslations } from "next-intl";

/** Shown when a catalog query fails (e.g. the database is unreachable). */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("Error");
  return (
    <section className="flex flex-col items-center gap-3 py-12 text-center">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted">{t("body")}</p>
      <button type="button" onClick={reset} className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-contrast">
        {t("retry")}
      </button>
    </section>
  );
}

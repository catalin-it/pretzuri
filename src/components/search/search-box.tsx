import { getLocale, getTranslations } from "next-intl/server";

/** Plain GET form: works without JavaScript and keeps the query in the URL (shareable, SEO-safe). */
export async function SearchBox({ defaultValue = "" }: { defaultValue?: string }) {
  const [t, locale] = await Promise.all([getTranslations("Search"), getLocale()]);
  return (
    <form role="search" action={`/${locale}/cautare`} method="get" className="flex w-full gap-2">
      <label htmlFor="q" className="sr-only">
        {t("label")}
      </label>
      <input
        id="q"
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder={t("placeholder")}
        maxLength={120}
        className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2"
      />
      <button
        type="submit"
        className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-contrast hover:bg-accent-hover"
      >
        {t("submit")}
      </button>
    </form>
  );
}

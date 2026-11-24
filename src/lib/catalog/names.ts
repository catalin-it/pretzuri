/** Localized category name (categories carry ro and en names). */
export function categoryName(c: { name_ro: string; name_en: string }, locale: string): string {
  return locale === "en" ? c.name_en : c.name_ro;
}

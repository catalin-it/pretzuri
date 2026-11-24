import type { Metadata } from "next";
import { routing } from "@/i18n/routing";

/** Canonical + hreflang alternates for a locale-less path (same Romanian slugs in every locale). */
export function localeAlternates(locale: string, path: string): Metadata["alternates"] {
  const p = path === "/" ? "" : path;
  const languages: Record<string, string> = {};
  for (const l of routing.locales) languages[l] = `/${l}${p}`;
  languages["x-default"] = `/${routing.defaultLocale}${p}`;
  return { canonical: `/${locale}${p}`, languages };
}

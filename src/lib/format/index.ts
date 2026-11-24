// Locale-aware formatting. Every price, number and date shown to users goes through these helpers.
import type { Locale } from "@/i18n/routing";

const BCP47: Record<Locale, string> = { ro: "ro-RO", en: "en-GB" };

export function bcp47(locale: Locale): string {
  return BCP47[locale];
}

/** Price in its currency, e.g. ro: "2.499,99 lei", en: "RON 2,499.99". */
export function formatPrice(amount: number, locale: Locale, currency = "RON"): string {
  return new Intl.NumberFormat(BCP47[locale], {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Short date, e.g. ro: "24.11.2026", en: "24/11/2026". Dates are shown in Romania's time zone. */
export function formatDate(value: Date | string, locale: Locale): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(BCP47[locale], {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Bucharest",
  }).format(d);
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(BCP47[locale]).format(value);
}

/** Percentage drop from `from` to `to`, rounded down to an integer (0 when not a drop). */
export function dropPercent(from: number, to: number): number {
  if (!(from > 0) || !(to < from)) return 0;
  return Math.floor(((from - to) / from) * 100);
}

import type { Locale } from "@/i18n/routing";
import { bcp47 } from "@/lib/format";

/** Date and time (minutes) in Romania's time zone, e.g. ro: "25.11.2026, 14:05". For admin lists (runs, logs). */
export function formatDateTime(value: Date | string, locale: Locale): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(bcp47(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Bucharest",
  }).format(d);
}

/** Byte count as MB/GB text for settings hints. */
export function formatBytes(bytes: number, locale: Locale): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${new Intl.NumberFormat(bcp47(locale), { maximumFractionDigits: 1 }).format(v)} ${units[i]}`;
}

/** Pure helpers for admin form round trips: safe return paths and flash codes in the query string. */

export const FLASH_CODES = [
  "saved",
  "created",
  "queued",
  "alreadyQueued",
  "merged",
  "rejected",
  "split",
  "mapped",
  "approved",
  "moderated",
  "decided",
  "roleChanged",
  "invalid",
  "denied",
  "notFound",
  "refused",
  "duplicate",
  "failed",
] as const;
export type FlashCode = (typeof FLASH_CODES)[number];

const BACK_RE = /^\/(ro|en)\/admin(\/[a-z0-9\-/]*)?(\?[A-Za-z0-9_=&%.\-]*)?$/;

/** Return path of an admin form: only same-site admin paths of the given locale; otherwise the admin home. */
export function safeAdminBack(back: unknown, locale: string): string {
  const home = `/${locale === "en" ? "en" : "ro"}/admin`;
  if (typeof back !== "string" || !BACK_RE.test(back) || back.includes("//")) return home;
  if (!back.startsWith(`${home}`)) return home;
  return back;
}

/** Adds (or replaces) the flash parameter `ok` or `err` on an admin path. */
export function withFlash(path: string, kind: "ok" | "err", code: FlashCode): string {
  const [base, query = ""] = path.split("?", 2);
  const params = new URLSearchParams(query);
  params.delete("ok");
  params.delete("err");
  params.set(kind, code);
  return `${base}?${params.toString()}`;
}

/** Postgres/PostgREST error code -> flash code. */
export function flashForDbError(code: string | undefined | null): FlashCode {
  switch (code) {
    case "42501":
      return "denied";
    case "22023":
    case "23514":
    case "22P02":
      return "invalid";
    case "P0002":
      return "notFound";
    case "P0001":
      return "refused";
    case "23505":
      return "duplicate";
    default:
      return "failed";
  }
}

export function isFlashCode(v: unknown): v is FlashCode {
  return typeof v === "string" && (FLASH_CODES as readonly string[]).includes(v);
}

// Helpers for the /go/<offerId> click redirect. Pure, unit-tested.

export const CLICK_SOURCES = ["product", "listing", "search", "compare", "alert"] as const;
export type ClickSource = (typeof CLICK_SOURCES)[number];

/** Offer ids are positive bigints written as digits only. */
export function parseOfferId(raw: string): number | null {
  if (!/^[1-9]\d{0,15}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

export function normalizeSource(raw: string | null): ClickSource | "other" {
  if (!raw) return "product";
  return (CLICK_SOURCES as readonly string[]).includes(raw) ? (raw as ClickSource) : "other";
}

const BOT_RE =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|whatsapp|skypeuripreview|headless|phantomjs|python-requests|python-urllib|curl\/|wget|httpclient|okhttp|go-http-client|java\/|libwww|scrapy|lighthouse|pagespeed|preview/i;

/** Simple user-agent heuristic; an empty UA counts as a bot. Bot clicks are stored but flagged. */
export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua || !ua.trim()) return true;
  return BOT_RE.test(ua);
}

/** Open-redirect guard: only absolute http(s) URLs with a host and no credentials. */
export function safeDestination(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!u.hostname || u.username || u.password) return null;
  return u.toString();
}

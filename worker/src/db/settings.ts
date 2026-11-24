import type { Queryable } from "./pool.js";

/** Worker-relevant rows of `public.settings` (0001), with safe defaults. */
export interface Settings {
  matchAuto: number;
  matchReview: number;
  mpnMinLength: number;
  mpnStoplist: string[];
  feedMaxBytes: number;
  feedMinRatio: number;
  feedMaxErrorsLogged: number;
  allowedCurrencies: string[];
}

export const defaultSettings: Settings = {
  matchAuto: 0.85,
  matchReview: 0.55,
  mpnMinLength: 4,
  mpnStoplist: ["N/A", "NA", "NONE", "-", "0", "DIVERSE"],
  feedMaxBytes: 2 * 1024 ** 3,
  feedMinRatio: 0.5,
  feedMaxErrorsLogged: 1000,
  allowedCurrencies: ["RON"],
};

function num(v: unknown, d: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
}
function strArr(v: unknown, d: string[]): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : d;
}

export async function loadSettings(db: Queryable): Promise<Settings> {
  const { rows } = await db.query<{ key: string; value: unknown }>("select key, value from public.settings");
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const d = defaultSettings;
  return {
    matchAuto: num(m.get("match_auto"), d.matchAuto),
    matchReview: num(m.get("match_review"), d.matchReview),
    mpnMinLength: num(m.get("mpn_min_length"), d.mpnMinLength),
    mpnStoplist: strArr(m.get("mpn_stoplist"), d.mpnStoplist).map((s) => s.toUpperCase()),
    feedMaxBytes: num(m.get("feed_max_bytes"), d.feedMaxBytes),
    feedMinRatio: num(m.get("feed_min_ratio"), d.feedMinRatio),
    feedMaxErrorsLogged: num(m.get("feed_max_errors_logged"), d.feedMaxErrorsLogged),
    allowedCurrencies: strArr(m.get("allowed_currencies"), d.allowedCurrencies).map((s) => s.toUpperCase()),
  };
}

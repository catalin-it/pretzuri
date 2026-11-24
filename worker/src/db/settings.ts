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
  imageMaxBytes: number;
  imageMaxPx: number;
  imageQuality: number;
  imageMaxFailures: number;
  imageBatch: number;
  imageHostConcurrency: number;
  imageHostDelayMs: number;
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
  imageMaxBytes: 5 * 1024 * 1024,
  imageMaxPx: 600,
  imageQuality: 78,
  imageMaxFailures: 3,
  imageBatch: 200,
  imageHostConcurrency: 2,
  imageHostDelayMs: 300,
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
    imageMaxBytes: num(m.get("image_max_bytes"), d.imageMaxBytes),
    imageMaxPx: num(m.get("image_max_px"), d.imageMaxPx),
    imageQuality: num(m.get("image_quality"), d.imageQuality),
    imageMaxFailures: num(m.get("image_max_failures"), d.imageMaxFailures),
    imageBatch: num(m.get("image_batch"), d.imageBatch),
    imageHostConcurrency: Math.max(1, num(m.get("image_host_concurrency"), d.imageHostConcurrency)),
    imageHostDelayMs: num(m.get("image_host_delay_ms"), d.imageHostDelayMs),
  };
}

// Shapes price_history rows (one row per change) into a daily "lowest price across shops" series and an SVG path.
// Pure, unit-tested.

export type HistoryRow = { offer_id: number; price: number; recorded_at: string };
export type DailyPoint = { date: string; min: number };

const DAY = 86_400_000;

/** Calendar day (YYYY-MM-DD) in Romania's time zone. */
export function dayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Lowest price per day over the last `days` days. Each offer keeps its last known price until its next change;
 * offers that are no longer active (not in `activeOfferIds`) count only up to their last recorded day.
 * `current` (offer id -> current price) closes the series with today's prices. Days before the first record are
 * omitted.
 */
export function dailyMinSeries(
  rows: HistoryRow[],
  opts: { now: Date; days?: number; activeOfferIds?: Iterable<number>; current?: Map<number, number> },
): DailyPoint[] {
  const days = opts.days ?? 90;
  const active = new Set(opts.activeOfferIds ?? []);
  const byOffer = new Map<number, { day: string; price: number }[]>();
  for (const r of [...rows].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))) {
    const list = byOffer.get(r.offer_id) ?? [];
    list.push({ day: dayKey(new Date(r.recorded_at)), price: Number(r.price) });
    byOffer.set(r.offer_id, list);
  }
  const today = dayKey(opts.now);
  for (const [id, price] of opts.current ?? []) {
    const list = byOffer.get(id) ?? [];
    list.push({ day: today, price });
    byOffer.set(id, list);
  }

  const dayList: string[] = [];
  for (let i = days - 1; i >= 0; i--) dayList.push(dayKey(new Date(opts.now.getTime() - i * DAY)));

  const out: DailyPoint[] = [];
  for (const day of new Set(dayList)) {
    let min = Infinity;
    for (const [id, list] of byOffer) {
      // Last price recorded on or before `day`.
      let price: number | null = null;
      for (const e of list) {
        if (e.day <= day) price = e.price;
        else break;
      }
      if (price === null) continue;
      if (!active.has(id) && day > list[list.length - 1].day) continue;
      if (price < min) min = price;
    }
    if (min !== Infinity) out.push({ date: day, min });
  }
  return out;
}

export type ChartGeometry = {
  path: string;
  points: { x: number; y: number; date: string; min: number }[];
  low: number;
  high: number;
};

/** Step-line path for an SVG of `width` x `height` (with `pad` inner padding). */
export function chartGeometry(series: DailyPoint[], width: number, height: number, pad = 8): ChartGeometry | null {
  if (series.length === 0) return null;
  const prices = series.map((p) => p.min);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const span = high - low || 1;
  const n = series.length;
  const points = series.map((p, i) => ({
    x: n === 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (n - 1),
    y: high === low ? height / 2 : pad + ((high - p.min) * (height - 2 * pad)) / span,
    date: p.date,
    min: p.min,
  }));
  const r = (v: number) => Math.round(v * 10) / 10;
  let path = `M${r(points[0].x)} ${r(points[0].y)}`;
  for (let i = 1; i < points.length; i++) path += ` H${r(points[i].x)} V${r(points[i].y)}`;
  if (n === 1) path = `M${pad} ${r(points[0].y)} H${width - pad}`;
  return { path, points, low, high };
}

/** Days where the price changed (for the accessible table), always including the first and last day. */
export function changePoints(series: DailyPoint[]): DailyPoint[] {
  return series.filter((p, i) => i === 0 || i === series.length - 1 || p.min !== series[i - 1].min);
}

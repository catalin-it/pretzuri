// Omnibus (Directive 2019/2161) price-reduction display rules. Pure, unit-tested.
// A reduction (old price + %) is only shown together with the lowest price of the last 30 days; when our own
// history for the offer is shorter, the label says how many days we have been tracking it.

export type OmnibusInput = {
  price: number;
  oldPrice: number | null;
  lowest30d: number | null;
  historyDays: number | null;
};

export type OmnibusDisplay =
  | { kind: "none" }
  | {
      kind: "reduction";
      oldPrice: number;
      percent: number;
      lowest: number;
      /** 30 when the reference is complete, else the number of days tracked (>= 1). */
      days: number;
      partial: boolean;
    };

export function omnibusDisplay({ price, oldPrice, lowest30d, historyDays }: OmnibusInput): OmnibusDisplay {
  if (oldPrice === null || !(oldPrice > price) || !(price > 0)) return { kind: "none" };
  // Never a discount without the 30-day reference.
  if (lowest30d === null || !(lowest30d > 0)) return { kind: "none" };
  const percent = Math.floor(((oldPrice - price) / oldPrice) * 100);
  if (percent < 1) return { kind: "none" };
  const days = historyDays === null ? 30 : Math.max(1, Math.min(30, Math.floor(historyDays)));
  return { kind: "reduction", oldPrice, percent, lowest: Math.min(lowest30d, price), days, partial: days < 30 };
}

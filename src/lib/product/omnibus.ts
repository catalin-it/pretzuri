// Omnibus (Directive 2019/2161) price-reduction display rules. Pure, unit-tested.
// A reduction (struck reference + %) is computed only against our own lowest price of the previous 30 days; when our
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

export function omnibusDisplay({ price, lowest30d, historyDays }: OmnibusInput): OmnibusDisplay {
  // The reference is OUR lowest price of the offer in the 30 days before its current price (offer_lowest_30d, which
  // excludes the current price period). A reduction is shown only against that reference, never against the
  // feed's old_price (DECISIONS "Omnibus"); no history before the current price = no reduction shown.
  if (!(price > 0) || lowest30d === null || !(lowest30d > price)) return { kind: "none" };
  const percent = Math.floor(((lowest30d - price) / lowest30d) * 100);
  if (percent < 1) return { kind: "none" };
  const days = historyDays === null ? 30 : Math.max(1, Math.min(30, Math.floor(historyDays)));
  return { kind: "reduction", oldPrice: lowest30d, percent, lowest: lowest30d, days, partial: days < 30 };
}

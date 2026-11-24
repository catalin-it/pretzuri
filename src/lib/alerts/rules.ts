/**
 * Price alert decision rules. The authoritative implementation is SQL (public.evaluate_price_alerts, migration 0012);
 * this mirror documents the rules, is unit-tested and is used by the UI to explain an alert's state.
 *  - price = lowest TOTAL price (price + shipping) of the product's active offers that are not out of stock;
 *  - fire when price <= target;
 *  - after a notification, fire again only if the price drops below the last notified price, or after 7 days.
 */
export const RENOTIFY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type AlertState = {
  isActive: boolean;
  targetPrice: number;
  lastNotifiedAt: string | Date | null;
  lastNotifiedPrice: number | null;
};

export type OfferForAlert = { totalPrice: number; isActive: boolean; availability: string };

export function alertPrice(offers: OfferForAlert[]): number | null {
  const prices = offers.filter((o) => o.isActive && o.availability !== "out_of_stock").map((o) => o.totalPrice);
  return prices.length ? Math.min(...prices) : null;
}

export function shouldNotify(alert: AlertState, price: number | null, now: Date = new Date()): boolean {
  if (!alert.isActive || price === null || price > alert.targetPrice) return false;
  if (alert.lastNotifiedAt === null) return true;
  if (alert.lastNotifiedPrice !== null && price < alert.lastNotifiedPrice) return true;
  return now.getTime() - new Date(alert.lastNotifiedAt).getTime() > RENOTIFY_AFTER_MS;
}

export type AlertStatus = "paused" | "waiting" | "reached";

export function alertStatus(alert: AlertState, currentPrice: number | null): AlertStatus {
  if (!alert.isActive) return "paused";
  return currentPrice !== null && currentPrice <= alert.targetPrice ? "reached" : "waiting";
}

/** Suggested target for a new alert: 5% under the current lowest price, rounded down to whole lei. */
export function suggestedTarget(currentPrice: number | null): number | null {
  if (currentPrice === null || currentPrice <= 1) return null;
  return Math.max(1, Math.floor(currentPrice * 0.95));
}

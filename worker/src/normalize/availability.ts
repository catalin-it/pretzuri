import { unaccent } from "./text.js";

export type Availability = "in_stock" | "limited" | "out_of_stock" | "preorder" | "unknown";

const MAP: Array<[RegExp, Availability]> = [
  [/^(in_?stock|instock|in stoc|stoc|disponibil|available|da|yes|true|1|in stoc furnizor|stoc furnizor|in stock furnizor)$/, "in_stock"],
  [/^(limited|stoc limitat|limited stock|low stock|ultimele bucati|ultimul produs|stoc redus)$/, "limited"],
  [/^(out_?of_?stock|out of stock|outofstock|stoc epuizat|epuizat|indisponibil|nu|no|false|0|unavailable|fara stoc|nu este in stoc)$/, "out_of_stock"],
  [/^(preorder|pre_?order|pre order|precomanda|backorder|back_?order|la comanda|in curand|available for order)$/, "preorder"],
];

export function normalizeAvailability(raw: string | undefined): Availability {
  if (raw === undefined) return "unknown";
  const s = unaccent(raw).toLowerCase().replace(/[-]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "unknown";
  for (const [re, v] of MAP) if (re.test(s)) return v;
  if (/^in stoc|^in stock/.test(s)) return "in_stock";
  return "unknown";
}

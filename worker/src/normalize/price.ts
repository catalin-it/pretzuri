/**
 * Parses Romanian/international price strings to a number with 2 decimals.
 * "2.499,99 lei" -> 2499.99, "2,499.99" -> 2499.99, "2499.99" -> 2499.99, "1.299" -> 1299, "3 999 RON" -> 3999.
 * Returns null for empty/unparseable/non-positive values.
 */
export function parsePrice(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? round2(raw) : null;
  let s = raw.trim();
  if (!s) return null;
  // Keep digits and separators only (drops "lei", "RON", spaces incl. NBSP / thin space).
  s = s.replace(/[^\d.,-]/g, "");
  if (!s || s.includes("-")) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    // Both present: the last one is the decimal separator.
    const dec = lastDot > lastComma ? "." : ",";
    const thou = dec === "." ? "," : ".";
    normalized = s.split(thou).join("").replace(dec, ".");
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const parts = s.split(sep);
    const last = parts[parts.length - 1] ?? "";
    const isThousands = parts.length > 2 || (last.length === 3 && /^[1-9]\d{0,2}$/.test(parts[0] ?? ""));
    normalized = isThousands ? parts.join("") : parts.join(".");
  } else {
    normalized = s;
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0 || n >= 10_000_000) return null;
  return round2(n);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Currency from an explicit field or the price string; default RON. */
export function parseCurrency(currencyField: string | undefined, priceRaw: string | undefined): string {
  const src = `${currencyField ?? ""} ${priceRaw ?? ""}`.toLowerCase();
  if (/\b(eur|euro)\b|€/.test(src)) return "EUR";
  if (/\busd\b|\$/.test(src)) return "USD";
  const iso = currencyField?.trim().toUpperCase();
  if (iso && /^[A-Z]{3}$/.test(iso)) return iso;
  return "RON";
}

/** Shipping cost: null when absent/unknown (UI: "cost livrare nespecificat"), 0 for free. */
export function parseShipping(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/^(0+([.,]0+)?|gratuit[aă]?|gratis|free|livrare gratuit[aă])(\s*(lei|ron))?$/.test(s)) return 0;
  const n = parsePrice(s);
  return n === null ? null : n;
}

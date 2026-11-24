/** GS1 check digit validation (works for GTIN-8/12/13/14; leading zeros do not change it). */
export function gtinChecksumOk(digits: string): boolean {
  let sum = 0;
  const body = digits.slice(0, -1);
  for (let i = 0; i < body.length; i++) {
    const d = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

export type GtinResult = { gtin: string | null; invalid: boolean };

/**
 * Normalizes a GTIN/EAN: digits only, valid length (8/12/13/14) and checksum, padded to 13 digits
 * (GTIN-14 with indicator 0 is reduced to 13; other GTIN-14 stay 14). Empty -> {null, false}.
 */
export function normalizeGtin(raw: string | undefined): GtinResult {
  if (!raw) return { gtin: null, invalid: false };
  // Some feeds list several codes ("594..., 594..."); take the first.
  const first = raw.split(/[,;|/]/)[0]?.trim() ?? "";
  const digits = first.replace(/[\s-]/g, "");
  if (!digits) return { gtin: null, invalid: false };
  if (!/^\d+$/.test(digits)) return { gtin: null, invalid: true };
  if (![8, 12, 13, 14].includes(digits.length) || /^0+$/.test(digits) || !gtinChecksumOk(digits)) {
    return { gtin: null, invalid: true };
  }
  let g = digits.padStart(13, "0");
  if (g.length === 14 && g.startsWith("0")) g = g.slice(1);
  return { gtin: g, invalid: false };
}

/** Manufacturer part number: upper case, no spaces/dashes/dots/slashes. */
export function normalizeMpn(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.toUpperCase().replace(/[\s\-_./]+/g, "");
  return m ? m.slice(0, 100) : null;
}

/** Whether an MPN may be used for matching (settings.mpn_min_length / mpn_stoplist). */
export function isUsableMpn(mpn: string | null, minLength: number, stoplist: string[]): boolean {
  if (!mpn) return false;
  if (mpn.length < minLength) return false;
  const stop = new Set(stoplist.map((s) => s.toUpperCase().replace(/[\s\-_./]+/g, "")));
  return !stop.has(mpn);
}

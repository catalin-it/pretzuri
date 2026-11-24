// Compare list: 2-4 product slugs in `?p=a,b,c`. Pure, unit-tested (shared by the page and the client bar).

export const COMPARE_MAX = 4;
export const COMPARE_STORAGE_KEY = "pretzuri.compare";
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,199}$/;

export function isProductSlug(s: string): boolean {
  return SLUG_RE.test(s);
}

export function parseCompareSlugs(raw: string | string[] | undefined): string[] {
  const parts = (Array.isArray(raw) ? raw : [raw ?? ""]).flatMap((s) => s.split(","));
  const out: string[] = [];
  for (const p of parts.map((s) => s.trim().toLowerCase())) {
    if (isProductSlug(p) && !out.includes(p)) out.push(p);
  }
  return out.slice(0, COMPARE_MAX);
}

/** Adds or removes a slug, keeping at most COMPARE_MAX (refuses to add beyond the limit). */
export function toggleCompare(list: string[], slug: string): { list: string[]; full: boolean } {
  if (list.includes(slug)) return { list: list.filter((s) => s !== slug), full: false };
  if (list.length >= COMPARE_MAX) return { list, full: true };
  return { list: [...list, slug], full: false };
}

/** Spec keys of all products (union, first-seen order). */
export function unionSpecKeys(specs: Record<string, unknown>[]): string[] {
  const keys: string[] = [];
  for (const s of specs) for (const k of Object.keys(s)) if (!keys.includes(k)) keys.push(k);
  return keys;
}

import type { FieldMap, FlatRecord, RawField, RawOffer, SourceOptions } from "./types.js";

/** Column/tag name normalization used for every lookup: "Product URL" -> "product_url", "image-urls" -> "image_urls". */
export function normKey(k: string): string {
  return k
    .trim()
    .replace(/^﻿/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Default map merged with `options.field_map` (an override replaces the candidates for that field). */
export function resolveFieldMap(base: FieldMap, options: SourceOptions | undefined): FieldMap {
  const out: FieldMap = { ...base };
  const over = options?.field_map;
  if (over && typeof over === "object") {
    for (const [field, v] of Object.entries(over)) {
      if (!(field in base) || v === undefined) continue;
      const list = (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === "string").map(normKey);
      if (list.length) out[field as RawField] = list;
    }
  }
  return out;
}

/**
 * Maps one flat record to a RawOffer: first non-empty candidate per field; `category` joins every non-empty
 * candidate in order (e.g. category + subcategory).
 */
export function mapRecord(rec: FlatRecord, map: FieldMap): RawOffer {
  const f = rec.fields;
  const pick = (keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = f[k];
      if (v !== undefined && v.trim() !== "") return v.trim();
    }
    return undefined;
  };
  const out: RawOffer = {};
  for (const field of Object.keys(map) as RawField[]) {
    if (field === "category") {
      const parts = map.category.map((k) => f[k]?.trim()).filter((v): v is string => !!v);
      // Avoid "Telefoane > Telefoane" when subcategory repeats the category.
      const dedup = parts.filter((p, i) => i === 0 || p.toLowerCase() !== parts[i - 1]?.toLowerCase());
      if (dedup.length) out.category = dedup;
    } else {
      const v = pick(map[field]);
      if (v !== undefined) out[field] = v;
    }
  }
  if (rec.specs && Object.keys(rec.specs).length) out.specs = rec.specs;
  else if (f.specs) out.specs = parseSpecString(f.specs);
  return out;
}

/** CSV specs "RAM=8 GB|Stocare=256 GB" -> {RAM: "8 GB", Stocare: "256 GB"} (max 50 pairs). */
export function parseSpecString(s: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  let n = 0;
  for (const pair of s.split("|")) {
    const i = pair.indexOf("=");
    if (i <= 0) continue;
    const k = pair.slice(0, i).trim().slice(0, 100);
    const v = pair.slice(i + 1).trim().slice(0, 300);
    if (k && v) {
      out[k] = v;
      if (++n >= 50) break;
    }
  }
  return n ? out : undefined;
}

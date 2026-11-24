import { unaccent } from "../normalize/text.js";

/**
 * Title normalization for matching (skill product-matching): lower case, unaccent, shop noise and colors
 * removed, units unified ("1 TB" = "1000gb", "1,5 l" = "1500ml", 55" = "55in"), RAM split out, model codes
 * kept (hyphens inside codes dropped: "SM-S921B" -> "sms921b").
 */

const COLORS = [
  "negru", "neagra", "alb", "alba", "albastru", "albastra", "rosu", "rosie", "verde", "gri", "argintiu", "argintie",
  "auriu", "aurie", "mov", "roz", "galben", "galbena", "violet", "crem", "bej", "maro", "turcoaz", "grafit",
  "black", "white", "blue", "red", "green", "gray", "grey", "silver", "gold", "purple", "pink", "yellow", "graphite",
  "titanium", "titan", "natural", "midnight", "starlight", "space", "onyx", "cobalt", "marble", "amber", "jade",
  "sapphire", "obsidian", "hazel", "porcelain", "cream", "lavender", "mint", "phantom", "awesome", "iceblue",
  "navy", "charcoal", "inox", "steel",
];
const NOISE_PHRASES = [
  "telefon mobil", "telefon", "smartphone", "laptop gaming", "laptop", "notebook", "ultrabook", "televizor",
  "smart tv", "led tv", "qled tv", "oled tv", "masina de spalat rufe", "masina de spalat", "cu incarcare frontala",
  "incarcare frontala", "dual sim", "dual-sim", "4g", "5g", "lte", "wi-fi", "wifi", "+ cadou", "cadou", "promo",
  "oferta", "nou", "new", "original", "sigilat", "garantie", "pentru femei", "pentru barbati", "femei", "barbati",
  "dama", "unisex", "ram", "memorie",
];
/** Words that make a different product variant: must be equal on both sides for an automatic match. */
export const VARIANT_WORDS = new Set([
  "pro", "max", "plus", "ultra", "mini", "lite", "fe", "se", "air", "edge", "neo", "slim", "xl", "edp", "edt",
  "edc", "extrait", "intense", "absolu", "elixir", "resigilat", "refurbished", "renew", "kids",
]);
const STOP = new Set(["de", "cu", "si", "pentru", "la", "din", "pe", "the", "and", "with", "for", "a"]);

const UNIT_RE = /(\d+(?:[.,]\d+)?)\s*(tb|gb|mb|ml|l|kg|w|mah|hz|inch|inci|in|"|''|cm|mm|kw)(?![a-z0-9])/g;

function unitToken(value: string, unit: string): string {
  const v = Number(value.replace(",", "."));
  const fmt = (n: number) => String(Math.round(n * 100) / 100);
  switch (unit) {
    case "tb":
      return `${fmt(v * 1000)}gb`;
    case "l":
      return `${fmt(v * 1000)}ml`;
    case "inch":
    case "inci":
    case '"':
    case "''":
      return `${fmt(v)}in`;
    default:
      return `${fmt(v)}${unit}`;
  }
}

export interface MatchTitle {
  /** Normalized title used for similarity. */
  text: string;
  /** Tokens with digits, by kind: "unit:<unit>" (e.g. unit:gb) or "model". */
  numeric: Map<string, Set<string>>;
  variants: Set<string>;
  ram: string | null;
}

export function normalizeForMatch(title: string): MatchTitle {
  let s = ` ${unaccent(title).toLowerCase()} `;
  s = s.replace(/(\w)\+(?=\W)/g, "$1 plus "); // "S24+" -> "s24 plus"
  // Commas are separators except as decimal commas ("1,5 l", "15,6 inch").
  s = s.replace(/[();:!?*[\]{}]/g, " ").replace(/,(?!\d)|(?<!\d),/g, " ");
  // Perfume concentration before noise removal.
  s = s.replace(/\bapa de parfum\b|\beau de parfum\b/g, " edp ").replace(/\bapa de toaleta\b|\beau de toilette\b/g, " edt ");
  s = s.replace(/\beau de cologne\b|\bapa de colonie\b/g, " edc ");
  // RAM ("8GB RAM", "RAM 8 GB", "8 GB memorie RAM").
  let ram: string | null = null;
  s = s.replace(/(\d+)\s*gb\s+(?:memorie\s+)?ram\b|\bram\s+(\d+)\s*gb\b/g, (_m, a: string | undefined, b: string | undefined) => {
    ram = `${a ?? b}gb`;
    return " ";
  });
  s = s.replace(UNIT_RE, (_m, v: string, u: string) => ` ${unitToken(v, u)} `);
  // Drop hyphens/dots/slashes inside codes: "sm-s921b" -> "sms921b", "i5-13420h" -> "i513420h".
  for (let i = 0; i < 3; i++) s = s.replace(/([a-z0-9])[-./]([a-z0-9])/g, "$1$2");
  s = s.replace(/[-./"'’+&]/g, " ");
  for (const p of NOISE_PHRASES) s = s.replace(new RegExp(`(^|\\s)${p.replace(/[+]/g, "\\+")}(?=\\s|$)`, "g"), " ");
  const tokens = s
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t) && !COLORS.includes(t));
  const numeric = new Map<string, Set<string>>();
  const variants = new Set<string>();
  for (const t of tokens) {
    if (VARIANT_WORDS.has(t)) variants.add(t);
    if (!/\d/.test(t)) continue;
    const m = /^\d+(?:\.\d+)?([a-z]+)$/.exec(t);
    const kind = m && ["gb", "mb", "ml", "kg", "w", "mah", "hz", "in", "cm", "mm", "kw"].includes(m[1]!) ? `unit:${m[1]}` : "model";
    if (!numeric.has(kind)) numeric.set(kind, new Set());
    numeric.get(kind)!.add(t);
  }
  return { text: tokens.join(" "), numeric, variants, ram };
}

/** Every token of `a` is in `b`; for model codes a prefix of >= 6 chars also counts ("ue55cu7172" ~ "ue55cu7172uxxh"). */
function isSubset(a: Set<string>, b: Set<string>, prefixOk: boolean): boolean {
  for (const x of a) {
    if (b.has(x)) continue;
    if (prefixOk && [...b].some((y) => Math.min(x.length, y.length) >= 6 && (y.startsWith(x) || x.startsWith(y)))) continue;
    return false;
  }
  return true;
}

/**
 * Numeric-token guard: for every kind present on both sides, one set must contain the other
 * ("256gb" vs "256gb 8gb" ok; "1000gb" vs "2000gb" conflict; "15" vs "14" conflict). RAM must be equal when
 * both titles state it. Variant words (pro, max, plus, edp/edt, ...) must be equal.
 */
export function guardOk(a: MatchTitle, b: MatchTitle): boolean {
  for (const [kind, sa] of a.numeric) {
    const sb = b.numeric.get(kind);
    if (!sb || !sa.size || !sb.size) continue;
    const p = kind === "model";
    if (!isSubset(sa, sb, p) && !isSubset(sb, sa, p)) return false;
  }
  if (a.ram && b.ram && a.ram !== b.ram) return false;
  if (a.variants.size !== b.variants.size) return false;
  for (const v of a.variants) if (!b.variants.has(v)) return false;
  return true;
}

/** pg_trgm-compatible trigram set (words padded with two leading and one trailing space). */
function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of s.split(/[^a-z0-9]+/).filter(Boolean)) {
    const p = `  ${w} `;
    for (let i = 0; i + 3 <= p.length; i++) out.add(p.slice(i, i + 3));
  }
  return out;
}

export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (!ta.size || !tb.size) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / (ta.size + tb.size - common);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let cur = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length]!;
}

export const GUARD_PENALTY = 0.75;

export interface TitleScore {
  score: number;
  guard: boolean;
}

/** Score = max(trigram similarity, 1 - levenshtein/len) on normalized titles, x0.75 when the guard fails. */
export function scoreTitles(a: MatchTitle | string, b: MatchTitle | string): TitleScore {
  const na = typeof a === "string" ? normalizeForMatch(a) : a;
  const nb = typeof b === "string" ? normalizeForMatch(b) : b;
  const maxLen = Math.max(na.text.length, nb.text.length) || 1;
  const lev = 1 - levenshtein(na.text, nb.text) / maxLen;
  const raw = Math.max(trigramSimilarity(na.text, nb.text), lev);
  const guard = guardOk(na, nb);
  return { score: Math.round((guard ? raw : raw * GUARD_PENALTY) * 1000) / 1000, guard };
}

export type TitleDecision = "auto" | "review" | "new";

/** Thresholds from settings (match_auto / match_review). Auto needs the guard to pass. */
export function decide(s: TitleScore, t: { matchAuto: number; matchReview: number }): TitleDecision {
  if (s.guard && s.score >= t.matchAuto) return "auto";
  if (s.score >= t.matchReview) return "review";
  return "new";
}

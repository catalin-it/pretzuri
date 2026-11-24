/** Lower-case-free unaccent (ă â î ș ț and any combining mark). */
export function unaccent(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

export function collapseSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Same idea as public.norm_text (lower + unaccent + collapsed whitespace); used for in-memory cache keys. */
export function normKey(s: string): string {
  return collapseSpaces(unaccent(s).toLowerCase());
}

/** URL slug: a-z0-9 words joined by "-", max `max` chars (cut at a word boundary). */
export function slugify(s: string, max = 80): string {
  let slug = unaccent(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length > max) {
    slug = slug.slice(0, max);
    const cut = slug.lastIndexOf("-");
    if (cut > max / 2) slug = slug.slice(0, cut);
    slug = slug.replace(/-+$/g, "");
  }
  return slug || "produs";
}

/** Short random suffix for slug collisions. */
export function slugSuffix(len = 5): string {
  let out = "";
  while (out.length < len) out += Math.random().toString(36).slice(2);
  return out.slice(0, len);
}

/** Strip HTML tags/entities from feed descriptions and cap the length. */
export function plainText(s: string | undefined, max = 5000): string | null {
  if (!s) return null;
  const t = collapseSpaces(
    s
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'"),
  );
  return t ? t.slice(0, max) : null;
}

/** Product/offer title: collapsed whitespace, max 300 chars (DB check). */
export function cleanTitle(s: string): string {
  return collapseSpaces(s).slice(0, 300);
}

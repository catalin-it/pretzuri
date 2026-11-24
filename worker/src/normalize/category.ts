import { collapseSpaces } from "./text.js";

/** Unifies a shop category path: separators ">", "»", "›", "|" -> " > ", collapsed spaces, max 500 chars. */
export function normalizeCategoryPath(parts: Array<string | undefined>): string | null {
  const joined = parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" > ");
  if (!joined) return null;
  const s = collapseSpaces(joined.replace(/\s*(>|»|›|\|)\s*/g, " > "))
    .replace(/^(> )+|( >)+$/g, "")
    .trim();
  return s ? s.slice(0, 500) : null;
}

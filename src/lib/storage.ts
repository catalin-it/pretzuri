// Public URLs of files in Supabase Storage (product images are cached there by the feed worker).
export const PRODUCT_IMAGES_BUCKET = "product-images";

export function productImageUrl(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  // Feeds may still carry absolute URLs during import; we never hot-link shop images (CSP img-src).
  if (/^[a-z]+:/i.test(imagePath)) return null;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  if (!base) return null;
  const path = imagePath.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${path}`;
}

/** Spec values are jsonb (string, number, boolean, array): shown as text. */
export function specText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(specText).join(", ");
  return JSON.stringify(v);
}

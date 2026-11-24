import { z } from "zod";

const httpUrl = z
  .string()
  .max(2000, "url too long")
  .refine((u) => {
    try {
      const p = new URL(u);
      return p.protocol === "http:" || p.protocol === "https:";
    } catch {
      return false;
    }
  }, "not an http(s) URL");

/** Presence/shape checks on the mapped raw row (before normalization). */
export const rawOfferSchema = z.object({
  id: z.string({ error: "missing" }).min(1, "missing").max(100, "longer than 100 chars"),
  title: z.string({ error: "missing" }).min(2, "too short"),
  price: z.string({ error: "missing" }).min(1, "missing"),
  url: httpUrl.optional(),
  affiliateUrl: httpUrl.optional(),
});

export { httpUrl };

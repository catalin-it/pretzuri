import "@/lib/zod-setup";
import { z } from "zod";

/** Form validation for accounts, alerts and reviews (server actions validate again; the DB has its own checks). */

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const otpSchema = z.string().trim().regex(/^\d{6}$/);
/** GoTrue minimum is 10 (GOTRUE_PASSWORD_MIN_LENGTH); bcrypt reads at most 72 bytes. */
export const passwordSchema = z
  .string()
  .min(10)
  .refine((s) => new TextEncoder().encode(s).length <= 72);
export const localeSchema = z.enum(["ro", "en"]);

export const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .max(40)
    .transform((s) => (s === "" ? null : s)),
  locale: localeSchema,
  emailAlerts: z.boolean(),
});

export const productIdSchema = z.coerce.number().int().positive();

export const alertSchema = z
  .object({
    productId: productIdSchema,
    targetPrice: z.coerce
      .number()
      .positive()
      .max(10_000_000)
      .transform((n) => Math.round(n * 100) / 100),
    notifyPush: z.boolean(),
    notifyEmail: z.boolean(),
  })
  .refine((a) => a.notifyPush || a.notifyEmail, { path: ["notifyEmail"], message: "channel" });

/** Accepts "123,45" as well as "123.45" (Romanian decimal comma). */
export function parsePriceInput(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, "").replace(/lei$/i, "");
  if (!/^\d{1,8}([.,]\d{1,2})?$/.test(s)) return null;
  const n = Number(s.replace(",", "."));
  return n > 0 ? n : null;
}

export const pushSubscriptionSchema = z.object({
  endpoint: z.url().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(16).max(200), auth: z.string().min(8).max(100) }),
});

export const reviewSchema = z.object({
  merchantId: z.coerce.number().int().positive(),
  rating: z.coerce.number().int().min(1).max(5),
  title: z
    .string()
    .trim()
    .max(120)
    .transform((s) => (s === "" ? null : s)),
  body: z.string().trim().min(20).max(4000),
});

export const REPORT_REASONS = ["illegal", "fake", "offensive", "personal_data", "spam", "other"] as const;
export const reportSchema = z.object({
  reviewId: z.coerce.number().int().positive(),
  reason: z.enum(REPORT_REASONS),
  details: z
    .string()
    .trim()
    .max(2000)
    .transform((s) => (s === "" ? null : s)),
});

/**
 * Where to go after signing in: only same-site paths under a locale (no protocol-relative or absolute URLs,
 * no backslashes). Falls back to the account page.
 */
export function safeNextPath(raw: unknown, locale: "ro" | "en"): string {
  const fallback = `/${locale}/cont`;
  if (typeof raw !== "string" || raw.length > 500) return fallback;
  if (!/^\/(ro|en)(\/|$|\?)/.test(raw)) return fallback;
  if (raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f]/.test(raw)) return fallback;
  return raw;
}

/** Typed confirmation for account deletion: the account email, case-insensitive. */
export function deletionConfirmed(typed: string, email: string | null): boolean {
  return !!email && typed.trim().toLowerCase() === email.trim().toLowerCase();
}

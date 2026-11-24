import "@/lib/zod-setup";
import { z } from "zod";

/** Admin form validation (server actions parse FormData with these; the DB RPCs validate again). */

const slugRe = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const id = z.coerce.number().int().positive();
const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal(""), z.undefined(), z.null()])
  .transform((v) => v === "on" || v === "true" || v === "1");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((s) => (s ? s : null));

export const idSchema = id;

export const merchantSchema = z
  .object({
    slug: z.string().trim().toLowerCase().min(2).max(60).regex(slugRe),
    name: z.string().trim().min(2).max(120),
    website: z.string().trim().url().max(300).regex(/^https?:\/\//),
    description: optionalText(2000),
    shipping_info: optionalText(1000),
    has_affiliate: checkbox,
    affiliate_network: z
      .enum(["", "2performant", "profitshare"])
      .optional()
      .transform((v) => (v ? v : null)),
    is_active: checkbox,
  })
  .refine((m) => !m.has_affiliate || m.affiliate_network !== null, { path: ["affiliate_network"], message: "required" });
export type MerchantInput = z.infer<typeof merchantSchema>;

export const FEED_TYPES = ["2performant", "profitshare", "direct_xml", "direct_csv"] as const;

/** Parses the options textarea: empty = {}, otherwise a JSON object. */
export const feedOptionsSchema = z
  .string()
  .trim()
  .max(10_000)
  .transform((s, ctx) => {
    if (s === "") return {} as Record<string, unknown>;
    try {
      const v: unknown = JSON.parse(s);
      if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch {
      /* reported below */
    }
    ctx.addIssue({ code: "custom", message: "json_object" });
    return z.NEVER;
  });

export const feedSourceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(FEED_TYPES),
  url: z.string().trim().url().max(2000).regex(/^https?:\/\//),
  options: feedOptionsSchema,
  schedule_minutes: z.coerce.number().int().min(15).max(10080),
  is_active: checkbox,
});
export type FeedSourceInput = z.infer<typeof feedSourceSchema>;

/** Statement of reasons (DSA): same bounds as the DB RPCs. */
export const reasonSchema = z.string().trim().min(10).max(2000);

export const moderateReviewSchema = z.discriminatedUnion("action", [
  z.object({ review_id: id, action: z.literal("approve"), reason: z.string().optional() }),
  z.object({ review_id: id, action: z.enum(["reject", "remove"]), reason: reasonSchema }),
]);

export const decideReportSchema = z
  .object({
    report_id: id,
    decision: z.enum(["actioned", "dismissed"]),
    reason: reasonSchema,
    remove_review: checkbox,
  })
  .refine((r) => !r.remove_review || r.decision === "actioned", { path: ["remove_review"], message: "actioned_only" });

/** Ids from repeated form fields or a comma/space separated string; deduplicated, max 500. */
export function parseIdList(values: (string | File)[] | string | null | undefined): number[] {
  const raw = typeof values === "string" ? [values] : (values ?? []);
  const out = new Set<number>();
  for (const v of raw) {
    if (typeof v !== "string") continue;
    for (const part of v.split(/[\s,]+/)) {
      if (!/^\d{1,18}$/.test(part)) continue;
      const n = Number(part);
      if (Number.isSafeInteger(n) && n > 0) out.add(n);
    }
  }
  return [...out].slice(0, 500);
}

export const splitSchema = z.object({
  product_id: id,
  title: optionalText(300).refine((t) => t === null || t.length >= 2, { message: "too_short" }),
});

/** Editable settings and their rules (mirrors public.admin_setting_valid in migration 0020). */
export const SETTINGS_SPEC = {
  match_auto: { kind: "number", min: 0.5, max: 1, step: 0.01 },
  match_review: { kind: "number", min: 0.3, max: 1, step: 0.01 },
  mpn_min_length: { kind: "int", min: 1, max: 20 },
  mpn_stoplist: { kind: "list", maxItems: 500, itemRe: /^.{1,40}$/ },
  feed_max_bytes: { kind: "int", min: 1_048_576, max: 10_737_418_240 },
  feed_min_ratio: { kind: "number", min: 0, max: 1, step: 0.05 },
  feed_max_errors_logged: { kind: "int", min: 0, max: 100_000 },
  allowed_currencies: { kind: "list", maxItems: 20, minItems: 1, itemRe: /^[A-Z]{3}$/ },
  offer_stale_hours: { kind: "int", min: 1, max: 720 },
} as const satisfies Record<
  string,
  | { kind: "number"; min: number; max: number; step: number }
  | { kind: "int"; min: number; max: number }
  | { kind: "list"; maxItems: number; minItems?: number; itemRe: RegExp }
>;
export type SettingKey = keyof typeof SETTINGS_SPEC;
export const SETTING_KEYS = Object.keys(SETTINGS_SPEC) as SettingKey[];

/** Form value of a setting (lists are one item per line). */
export function settingToInput(key: SettingKey, value: unknown): string {
  if (SETTINGS_SPEC[key].kind === "list") return Array.isArray(value) ? value.map(String).join("\n") : "";
  return value === null || value === undefined ? "" : String(value);
}

/** Parses one setting from its form value; returns null when invalid. */
export function parseSetting(key: SettingKey, input: string): number | string[] | null {
  const spec = SETTINGS_SPEC[key];
  if (spec.kind === "list") {
    const items = [...new Set(input.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean))];
    const min = "minItems" in spec ? spec.minItems : 0;
    if (items.length < min || items.length > spec.maxItems) return null;
    return items.every((i) => spec.itemRe.test(i)) ? items : null;
  }
  const s = input.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < spec.min || n > spec.max) return null;
  if (spec.kind === "int" && !Number.isInteger(n)) return null;
  return n;
}

/** Parses the whole settings form. Errors are the keys that failed (incl. the review < auto rule). */
export function parseSettingsForm(form: Record<string, string>): { values: Partial<Record<SettingKey, number | string[]>>; errors: string[] } {
  const values: Partial<Record<SettingKey, number | string[]>> = {};
  const errors: string[] = [];
  for (const key of SETTING_KEYS) {
    if (!(key in form)) continue;
    const v = parseSetting(key, form[key] ?? "");
    if (v === null) errors.push(key);
    else values[key] = v;
  }
  const auto = values.match_auto;
  const review = values.match_review;
  if (typeof auto === "number" && typeof review === "number" && review >= auto) errors.push("match_order");
  return { values, errors };
}

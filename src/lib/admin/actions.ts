"use server";

import { redirect } from "next/navigation";
import type { Json } from "@/lib/database.types";
import { requireAdminAction, type AdminContext } from "./guard";
import { type FlashCode, flashForDbError, safeAdminBack, withFlash } from "./feedback";
import {
  decideReportSchema,
  feedSourceSchema,
  idSchema,
  merchantSchema,
  moderateReviewSchema,
  parseIdList,
  parseSettingsForm,
  SETTING_KEYS,
  splitSchema,
} from "./schemas";

/**
 * Admin server actions. Each one re-checks the admin (aal2) session, validates with zod, calls RLS-protected tables
 * or SECURITY DEFINER RPCs (which check admin_guard() again) and redirects back with a flash code.
 */

type DbError = { code?: string; message: string } | null;

function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

function fields(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string" && !k.startsWith("$")) out[k] = v;
  return out;
}

function back(form: FormData): string {
  return safeAdminBack(str(form, "back"), str(form, "locale"));
}

function finish(form: FormData, kind: "ok" | "err", code: FlashCode, path?: string): never {
  redirect(withFlash(path ?? back(form), kind, code));
}

function finishDb(form: FormData, error: DbError, okCode: FlashCode, path?: string): never {
  if (error) {
    console.error("[admin]", error.code, error.message);
    finish(form, "err", flashForDbError(error.code));
  }
  finish(form, "ok", okCode, path);
}

async function guard(form: FormData): Promise<AdminContext> {
  const ctx = await requireAdminAction();
  if (!ctx) finish(form, "err", "denied");
  return ctx;
}

async function log(ctx: AdminContext, action: string, targetType: string, targetId: string | number, details?: Json) {
  const { error } = await ctx.supabase.from("moderation_log").insert({
    actor_id: ctx.user.id,
    action,
    target_type: targetType,
    target_id: String(targetId),
    details: details ?? null,
  });
  if (error) console.error("[admin] log", error.message);
}

// Merchants ---------------------------------------------------------------------------------------------------

export async function saveMerchant(form: FormData) {
  const ctx = await guard(form);
  const parsed = merchantSchema.safeParse(fields(form));
  if (!parsed.success) finish(form, "err", "invalid");
  const m = parsed.data;
  const row = { ...m, affiliate_network: m.has_affiliate ? m.affiliate_network : null };
  const idRaw = str(form, "id");
  if (idRaw) {
    const id = idSchema.parse(idRaw);
    const { error } = await ctx.supabase.from("merchants").update(row).eq("id", id);
    if (!error) await log(ctx, "merchant_update", "merchant", id, { is_active: row.is_active });
    finishDb(form, error, "saved");
  }
  const { data, error } = await ctx.supabase.from("merchants").insert(row).select("id").single();
  if (error || !data) finishDb(form, error ?? { message: "no row" }, "created");
  await log(ctx, "merchant_create", "merchant", data.id, { slug: row.slug });
  finish(form, "ok", "created", `/${str(form, "locale") === "en" ? "en" : "ro"}/admin/merchants/${data.id}`);
}

export async function setMerchantActive(form: FormData) {
  const ctx = await guard(form);
  const id = idSchema.safeParse(str(form, "id"));
  if (!id.success) finish(form, "err", "invalid");
  const active = str(form, "active") === "1";
  const { error } = await ctx.supabase.from("merchants").update({ is_active: active }).eq("id", id.data);
  if (!error) await log(ctx, active ? "merchant_activate" : "merchant_deactivate", "merchant", id.data);
  finishDb(form, error, "saved");
}

// Feed sources ------------------------------------------------------------------------------------------------

export async function saveFeedSource(form: FormData) {
  const ctx = await guard(form);
  const parsed = feedSourceSchema.safeParse(fields(form));
  if (!parsed.success) finish(form, "err", "invalid");
  const f = { ...parsed.data, options: parsed.data.options as { [key: string]: Json } };
  const idRaw = str(form, "id");
  if (idRaw) {
    const id = idSchema.parse(idRaw);
    const { error } = await ctx.supabase.from("feed_sources").update(f).eq("id", id);
    // The URL may carry tokens: never logged.
    if (!error) await log(ctx, "feed_update", "feed_source", id, { type: f.type, is_active: f.is_active, schedule_minutes: f.schedule_minutes });
    finishDb(form, error, "saved");
  }
  const merchantId = idSchema.safeParse(str(form, "merchant_id"));
  if (!merchantId.success) finish(form, "err", "invalid");
  const { data, error } = await ctx.supabase
    .from("feed_sources")
    .insert({ ...f, merchant_id: merchantId.data })
    .select("id")
    .single();
  if (!error && data) await log(ctx, "feed_create", "feed_source", data.id, { type: f.type, merchant_id: merchantId.data });
  finishDb(form, error, "created");
}

export async function runFeedNow(form: FormData) {
  const ctx = await guard(form);
  const id = idSchema.safeParse(str(form, "id"));
  if (!id.success) finish(form, "err", "invalid");
  const { data, error } = await ctx.supabase.rpc("admin_run_feed", { p_feed_source_id: id.data });
  finishDb(form, error, data === false ? "alreadyQueued" : "queued");
}

// Category mapping --------------------------------------------------------------------------------------------

export async function mapCategories(form: FormData) {
  const ctx = await guard(form);
  const ids = parseIdList(form.getAll("ids"));
  if (!ids.length) finish(form, "err", "invalid");
  let categoryId: number | null = null;
  if (str(form, "op") !== "unmap") {
    const path = str(form, "category").trim();
    if (!path) finish(form, "err", "invalid");
    const { data } = await ctx.supabase.from("categories").select("id").eq("path", path).maybeSingle();
    if (!data) finish(form, "err", "notFound");
    categoryId = data.id;
  }
  const { error } = await ctx.supabase.rpc("admin_map_categories", {
    p_mapping_ids: ids,
    p_category_id: categoryId as number,
  });
  finishDb(form, error, "mapped");
}

// Matching ----------------------------------------------------------------------------------------------------

/** Target as a product id or slug. */
async function resolveProduct(ctx: AdminContext, raw: string): Promise<number | null> {
  const v = raw.trim();
  if (/^\d{1,18}$/.test(v)) return Number(v);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v)) return null;
  const { data } = await ctx.supabase.from("products").select("id").eq("slug", v).maybeSingle();
  return data?.id ?? null;
}

export async function mergeProducts(form: FormData) {
  const ctx = await guard(form);
  const source = idSchema.safeParse(str(form, "source"));
  const target = await resolveProduct(ctx, str(form, "target"));
  if (!source.success || target === null) finish(form, "err", "invalid");
  const queue = str(form, "queue_id") ? idSchema.safeParse(str(form, "queue_id")) : null;
  if (queue && !queue.success) finish(form, "err", "invalid");
  const { error } = await ctx.supabase.rpc("admin_merge_products", {
    p_source: source.data,
    p_target: target,
    ...(queue?.success ? { p_queue_id: queue.data } : {}),
  });
  const next = str(form, "after") === "target" ? `/${str(form, "locale") === "en" ? "en" : "ro"}/admin/products/${target}` : undefined;
  finishDb(form, error, "merged", error ? undefined : next);
}

export async function rejectMatch(form: FormData) {
  const ctx = await guard(form);
  const queue = idSchema.safeParse(str(form, "queue_id"));
  if (!queue.success) finish(form, "err", "invalid");
  const candidates = parseIdList(form.getAll("candidate"));
  const { error } = await ctx.supabase.rpc("admin_reject_match", {
    p_queue_id: queue.data,
    ...(candidates.length ? { p_candidate_ids: candidates } : {}),
  });
  finishDb(form, error, "rejected");
}

export async function splitProduct(form: FormData) {
  const ctx = await guard(form);
  const parsed = splitSchema.safeParse({ product_id: str(form, "product_id"), title: str(form, "title") });
  const offers = parseIdList(form.getAll("offer"));
  if (!parsed.success || !offers.length) finish(form, "err", "invalid");
  const { data, error } = await ctx.supabase.rpc("admin_split_product", {
    p_product_id: parsed.data.product_id,
    p_offer_ids: offers,
    ...(parsed.data.title ? { p_title: parsed.data.title } : {}),
  });
  const newId = (data as { new_product_id?: number } | null)?.new_product_id;
  const next = newId ? `/${str(form, "locale") === "en" ? "en" : "ro"}/admin/products/${newId}` : undefined;
  finishDb(form, error, "split", next);
}

// Reviews -----------------------------------------------------------------------------------------------------

export async function moderateReview(form: FormData) {
  const ctx = await guard(form);
  const parsed = moderateReviewSchema.safeParse(fields(form));
  if (!parsed.success) finish(form, "err", "invalid");
  const { error } = await ctx.supabase.rpc("admin_moderate_review", {
    p_review_id: parsed.data.review_id,
    p_action: parsed.data.action,
    ...(parsed.data.action !== "approve" ? { p_reason: parsed.data.reason } : {}),
  });
  finishDb(form, error, parsed.data.action === "approve" ? "approved" : "moderated");
}

export async function decideReport(form: FormData) {
  const ctx = await guard(form);
  const parsed = decideReportSchema.safeParse(fields(form));
  if (!parsed.success) finish(form, "err", "invalid");
  const { error } = await ctx.supabase.rpc("admin_decide_report", {
    p_report_id: parsed.data.report_id,
    p_decision: parsed.data.decision,
    p_reason: parsed.data.reason,
    p_remove_review: parsed.data.remove_review,
  });
  finishDb(form, error, "decided");
}

// Users -------------------------------------------------------------------------------------------------------

export async function setAdminRole(form: FormData) {
  const ctx = await guard(form);
  const userId = str(form, "user_id");
  if (!/^[0-9a-f-]{36}$/i.test(userId) || userId === ctx.user.id) finish(form, "err", "refused");
  const { error } = await ctx.supabase.rpc("admin_set_role", { p_user_id: userId, p_grant: str(form, "grant") === "1" });
  finishDb(form, error, "roleChanged");
}

// Settings ----------------------------------------------------------------------------------------------------

export async function saveSettings(form: FormData) {
  const ctx = await guard(form);
  const raw = fields(form);
  const input: Record<string, string> = {};
  for (const k of SETTING_KEYS) if (k in raw) input[k] = raw[k] ?? "";
  const { values, errors } = parseSettingsForm(input);
  if (errors.length) finish(form, "err", "invalid");
  const { error } = await ctx.supabase.rpc("admin_update_settings", { p_values: values as Json });
  finishDb(form, error, "saved");
}

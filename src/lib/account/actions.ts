"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  alertSchema,
  deletionConfirmed,
  emailSchema,
  localeSchema,
  otpSchema,
  passwordSchema,
  productIdSchema,
  profileSchema,
  pushSubscriptionSchema,
  reportSchema,
  reviewSchema,
} from "./schemas";

/**
 * Server actions for accounts, favorites, history, alerts, push subscriptions and reviews.
 * Everything runs with the user's session (anon key + cookies), so RLS is the guard; inputs are validated with Zod.
 * The browser never talks to Supabase directly (works while the public API host is not resolvable, too).
 */

export type ActionResult = { ok: true } | { ok: false; error: ActionError };
export type ActionError =
  | "invalid"
  | "auth"
  | "rate_limited"
  | "invalid_code"
  | "invalid_credentials"
  | "weak_password"
  | "limit"
  | "not_found"
  | "server";

const OK: ActionResult = { ok: true };
const fail = (error: ActionError): ActionResult => ({ ok: false, error });

function authError(e: { status?: number; code?: string; message?: string } | null): ActionError {
  if (!e) return "server";
  const code = e.code ?? "";
  if (e.status === 429 || code.includes("rate_limit")) return "rate_limited";
  if (code === "otp_expired" || code === "reauthentication_not_valid" || code === "reauthentication_needed")
    return "invalid_code";
  if (code === "invalid_credentials") return "invalid_credentials";
  if (code === "weak_password") return "weak_password";
  if (code === "email_address_invalid" || code === "validation_failed") return "invalid";
  return "server";
}

async function requireUser() {
  const user = await getSessionUser();
  if (!user) return null;
  return { user, supabase: await createClient() };
}

// --- Auth -----------------------------------------------------------------------------------------------------

export async function requestCode(input: { email: string; locale: string }): Promise<ActionResult> {
  const email = emailSchema.safeParse(input.email);
  const locale = localeSchema.safeParse(input.locale);
  if (!email.success || !locale.success) return fail("invalid");
  const supabase = await createClient();
  // `data.locale` lands in the user metadata on sign-up; the email template picks ro/en from it.
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { shouldCreateUser: true, data: { locale: locale.data } },
  });
  return error ? fail(authError(error)) : OK;
}

export async function verifyCode(input: { email: string; code: string }): Promise<ActionResult> {
  const email = emailSchema.safeParse(input.email);
  const code = otpSchema.safeParse(input.code);
  if (!email.success || !code.success) return fail("invalid_code");
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: email.data, token: code.data, type: "email" });
  return error ? fail(authError(error) === "server" ? "invalid_code" : authError(error)) : OK;
}

export async function passwordSignIn(input: { email: string; password: string }): Promise<ActionResult> {
  const email = emailSchema.safeParse(input.email);
  if (!email.success || typeof input.password !== "string" || input.password.length === 0 || input.password.length > 200)
    return fail("invalid_credentials");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.data, password: input.password });
  return error ? fail(authError(error) === "server" ? "invalid_credentials" : authError(error)) : OK;
}

export async function signOut(locale: string): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect(`/${localeSchema.catch("ro").parse(locale)}`);
}

// --- Account --------------------------------------------------------------------------------------------------

export async function updateProfile(input: z.input<typeof profileSchema>): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const ctx = await requireUser();
  if (!ctx) return fail("auth");
  const { error } = await ctx.supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName, locale: parsed.data.locale, email_alerts: parsed.data.emailAlerts })
    .eq("id", ctx.user.id);
  if (error) return fail("server");
  // Keep the auth metadata in sync: the sign-in email template reads the locale from it.
  await ctx.supabase.auth.updateUser({ data: { locale: parsed.data.locale } });
  return OK;
}

/** Sends a reauthentication code by email (needed to set or change the password). */
export async function requestReauthCode(): Promise<ActionResult> {
  const ctx = await requireUser();
  if (!ctx) return fail("auth");
  const { error } = await ctx.supabase.auth.reauthenticate();
  return error ? fail(authError(error)) : OK;
}

export async function setPassword(input: { password: string; code: string }): Promise<ActionResult> {
  const pw = passwordSchema.safeParse(input.password);
  if (!pw.success) return fail("weak_password");
  const code = otpSchema.safeParse(input.code);
  if (!code.success) return fail("invalid_code");
  const ctx = await requireUser();
  if (!ctx) return fail("auth");
  const { error } = await ctx.supabase.auth.updateUser({ password: pw.data, nonce: code.data });
  return error ? fail(authError(error)) : OK;
}

export async function deleteAccount(input: { confirm: string }): Promise<ActionResult> {
  const ctx = await requireUser();
  if (!ctx) return fail("auth");
  if (!deletionConfirmed(input.confirm ?? "", ctx.user.email)) return fail("invalid");
  const { error } = await ctx.supabase.rpc("delete_my_account");
  if (error) return fail("server");
  await ctx.supabase.auth.signOut({ scope: "local" });
  return OK;
}

// --- Favorites & history --------------------------------------------------------------------------------------

export async function setFavorite(input: { productId: number; on: boolean }): Promise<ActionResult> {
  const id = productIdSchema.safeParse(input.productId);
  if (!id.success) return fail("invalid");
  const ctx = await requireUser();
  if (!ctx) return fail("auth");
  const q = ctx.supabase.from("favorites");
  const { error } = input.on
    ? await q.upsert({ user_id: ctx.user.id, product_id: id.data }, { onConflict: "user_id,product_id", ignoreDuplicates: true })
    : await q.delete().eq("user_id", ctx.user.id).eq("product_id", id.data);
  return error ? fail("server") : OK;
}

export async function clearHistory(): Promise<ActionResult> {
  const ctx = await requireUser();
  if (!ctx) return fail("auth");
  const { error } = await ctx.supabase.from("view_history").delete().eq("user_id", ctx.user.id);
  return error ? fail("server") : OK;
}

export async function removeHistoryItem(input: { productId: number }): Promise<ActionResult> {
  const id = productIdSchema.safeParse(input.productId);
  if (!id.success) return fail("invalid");
  const ctx = await requireUser();
  if (!ctx) return fail("auth");
  const { error } = await ctx.supabase.from("view_history").delete().eq("user_id", ctx.user.id).eq("product_id", id.data);
  return error ? fail("server") : OK;
}

// --- Price alerts ---------------------------------------------------------------------------------------------

export async function saveAlert(input: z.input<typeof alertSchema>): Promise<ActionResult> {
  const parsed = alertSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const ctx = await requireUser();
  if (!ctx) return fail("auth");
  const a = parsed.data;
  const values = { target_price: a.targetPrice, notify_push: a.notifyPush, notify_email: a.notifyEmail, is_active: true };
  const existing = await ctx.supabase
    .from("price_alerts")
    .select("id")
    .eq("user_id", ctx.user.id)
    .eq("product_id", a.productId)
    .maybeSingle();
  if (existing.error) return fail("server");
  const { error } = existing.data
    ? await ctx.supabase.from("price_alerts").update(values).eq("id", existing.data.id)
    : await ctx.supabase.from("price_alerts").insert({ ...values, user_id: ctx.user.id, product_id: a.productId });
  if (error) return fail(error.message.includes("limit") ? "limit" : "server");
  return OK;
}

export async function setAlertActive(input: { alertId: number; active: boolean }): Promise<ActionResult> {
  const id = productIdSchema.safeParse(input.alertId);
  if (!id.success) return fail("invalid");
  const ctx = await requireUser();
  if (!ctx) return fail("auth");
  const { error } = await ctx.supabase.from("price_alerts").update({ is_active: !!input.active }).eq("id", id.data);
  return error ? fail("server") : OK;
}

export async function deleteAlert(input: { alertId: number }): Promise<ActionResult> {
  const id = productIdSchema.safeParse(input.alertId);
  if (!id.success) return fail("invalid");
  const ctx = await requireUser();
  if (!ctx) return fail("auth");
  const { error } = await ctx.supabase.from("price_alerts").delete().eq("id", id.data);
  return error ? fail("server") : OK;
}

export async function savePushSubscription(input: unknown): Promise<ActionResult> {
  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const ctx = await requireUser();
  if (!ctx) return fail("auth");
  const { error } = await ctx.supabase.rpc("register_push_subscription", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.keys.p256dh,
    p_auth: parsed.data.keys.auth,
  });
  return error ? fail("server") : OK;
}

// --- Reviews --------------------------------------------------------------------------------------------------

export async function saveReview(input: z.input<typeof reviewSchema>): Promise<ActionResult> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const ctx = await requireUser();
  if (!ctx) return fail("auth");
  const r = parsed.data;
  const values = { rating: r.rating, title: r.title, body: r.body };
  const existing = await ctx.supabase
    .from("reviews")
    .select("id")
    .eq("user_id", ctx.user.id)
    .eq("merchant_id", r.merchantId)
    .maybeSingle();
  if (existing.error) return fail("server");
  // Any edit goes back to moderation (trigger reviews_guard).
  const { error } = existing.data
    ? await ctx.supabase.from("reviews").update(values).eq("id", existing.data.id)
    : await ctx.supabase.from("reviews").insert({ ...values, merchant_id: r.merchantId, user_id: ctx.user.id });
  return error ? fail("server") : OK;
}

export async function deleteReview(input: { reviewId: number }): Promise<ActionResult> {
  const id = productIdSchema.safeParse(input.reviewId);
  if (!id.success) return fail("invalid");
  const ctx = await requireUser();
  if (!ctx) return fail("auth");
  const { error } = await ctx.supabase.from("reviews").delete().eq("id", id.data).eq("user_id", ctx.user.id);
  return error ? fail("server") : OK;
}

export async function reportReview(input: z.input<typeof reportSchema>): Promise<ActionResult> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const ctx = await requireUser();
  if (!ctx) return fail("auth");
  const { error } = await ctx.supabase.from("review_reports").insert({
    review_id: parsed.data.reviewId,
    reporter_id: ctx.user.id,
    reason: parsed.data.reason,
    details: parsed.data.details,
  });
  // One report per review and person: a second one is fine for the user.
  if (error && error.code !== "23505") return fail("server");
  return OK;
}

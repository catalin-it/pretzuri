import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import type { ExportInput } from "./export";

/** Reads of the signed-in user's own data (session client, RLS). All return empty/null for anonymous visitors. */

const PRODUCT = "product:products(id, slug, title, image_path, min_price, offer_count)";

export type UserProduct = {
  id: number;
  slug: string;
  title: string;
  image_path: string | null;
  min_price: number | null;
  offer_count: number;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export const getProfile = cache(async () => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("display_name, locale, email_alerts, created_at")
    .eq("id", user.id)
    .maybeSingle();
  return data;
});

export type AlertRow = {
  id: number;
  target_price: number;
  notify_push: boolean;
  notify_email: boolean;
  is_active: boolean;
  last_notified_at: string | null;
  last_notified_price: number | null;
};

export async function getProductUserState(productId: number): Promise<{ favorite: boolean; alert: AlertRow | null } | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const [fav, alert] = await Promise.all([
    supabase.from("favorites").select("product_id").eq("user_id", user.id).eq("product_id", productId).maybeSingle(),
    supabase
      .from("price_alerts")
      .select("id, target_price, notify_push, notify_email, is_active, last_notified_at, last_notified_price")
      .eq("user_id", user.id)
      .eq("product_id", productId)
      .maybeSingle(),
  ]);
  return {
    favorite: !!fav.data,
    alert: alert.data
      ? {
          ...alert.data,
          target_price: Number(alert.data.target_price),
          last_notified_price: alert.data.last_notified_price === null ? null : Number(alert.data.last_notified_price),
        }
      : null,
  };
}

/** Which of these products the user has favorited (one query per listing page). Null when signed out. */
export async function getFavoriteIds(productIds: number[]): Promise<Set<number> | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (!productIds.length) return new Set();
  const supabase = await createClient();
  const { data } = await supabase.from("favorites").select("product_id").eq("user_id", user.id).in("product_id", productIds);
  return new Set((data ?? []).map((r) => r.product_id));
}

/**
 * Returns a task that upserts the last view of a product (one row per user+product, 90-day retention by pg_cron).
 * The client is created now (request scope) so the task can run in `after()`, where cookies() is not available.
 */
export async function viewRecorder(userId: string, productId: number): Promise<() => Promise<void>> {
  const supabase = await createClient();
  return async () => {
    await supabase
      .from("view_history")
      .upsert({ user_id: userId, product_id: productId, viewed_at: new Date().toISOString() }, { onConflict: "user_id,product_id" });
  };
}

export async function getFavorites() {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("favorites")
    .select(`created_at, ${PRODUCT}`)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(500);
  return (data ?? [])
    .map((r) => ({ created_at: r.created_at, product: one(r.product as unknown as UserProduct | UserProduct[] | null) }))
    .filter((r): r is { created_at: string; product: UserProduct } => !!r.product);
}

export async function getHistory() {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("view_history")
    .select(`viewed_at, ${PRODUCT}`)
    .eq("user_id", user.id)
    .order("viewed_at", { ascending: false })
    .limit(200);
  return (data ?? [])
    .map((r) => ({ viewed_at: r.viewed_at, product: one(r.product as unknown as UserProduct | UserProduct[] | null) }))
    .filter((r): r is { viewed_at: string; product: UserProduct } => !!r.product);
}

export async function getAlerts() {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("price_alerts")
    .select(`id, target_price, notify_push, notify_email, is_active, last_notified_at, last_notified_price, created_at, ${PRODUCT}`)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? [])
    .map((r) => ({
      id: r.id,
      target_price: Number(r.target_price),
      notify_push: r.notify_push,
      notify_email: r.notify_email,
      is_active: r.is_active,
      last_notified_at: r.last_notified_at,
      last_notified_price: r.last_notified_price === null ? null : Number(r.last_notified_price),
      product: one(r.product as unknown as UserProduct | UserProduct[] | null),
    }))
    .filter((r): r is typeof r & { product: UserProduct } => !!r.product);
}

export async function getOwnReview(merchantId: number) {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select("id, rating, title, body, status, moderation_reason, updated_at")
    .eq("user_id", user.id)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  return data;
}

/** IDs of reviews the user already reported (to show "reported" instead of the button). */
export async function getReportedReviewIds(reviewIds: number[]): Promise<Set<number>> {
  const user = await getSessionUser();
  if (!user || !reviewIds.length) return new Set();
  const supabase = await createClient();
  const { data } = await supabase.from("review_reports").select("review_id").eq("reporter_id", user.id).in("review_id", reviewIds);
  return new Set((data ?? []).map((r) => r.review_id));
}

export async function loadExportInput(): Promise<ExportInput | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const P = "product:products(slug, title)";
  const [me, profile, favorites, alerts, history, reviews, reports, subs] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select("display_name, locale, email_alerts, created_at, updated_at").eq("id", user.id).maybeSingle(),
    supabase.from("favorites").select(`created_at, ${P}`).eq("user_id", user.id),
    supabase
      .from("price_alerts")
      .select(`target_price, notify_push, notify_email, is_active, last_notified_at, last_notified_price, created_at, updated_at, ${P}`)
      .eq("user_id", user.id),
    supabase.from("view_history").select(`viewed_at, ${P}`).eq("user_id", user.id),
    supabase
      .from("reviews")
      .select("rating, title, body, status, moderation_reason, created_at, updated_at, merchant:merchants(slug, name)")
      .eq("user_id", user.id),
    supabase.from("review_reports").select("reason, details, status, created_at").eq("reporter_id", user.id),
    supabase.from("push_subscriptions").select("endpoint, created_at, last_used_at").eq("user_id", user.id),
  ]);
  for (const r of [profile, favorites, alerts, history, reviews, reports, subs]) {
    if (r.error) throw new Error(`export: ${r.error.message}`);
  }
  return {
    user: { id: user.id, email: user.email, created_at: me.data.user?.created_at ?? null },
    profile: profile.data,
    favorites: (favorites.data ?? []) as unknown as ExportInput["favorites"],
    alerts: (alerts.data ?? []) as unknown as ExportInput["alerts"],
    history: (history.data ?? []) as unknown as ExportInput["history"],
    reviews: (reviews.data ?? []) as unknown as ExportInput["reviews"],
    reports: reports.data ?? [],
    pushSubscriptions: subs.data ?? [],
  };
}

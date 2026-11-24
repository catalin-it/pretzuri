import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AdminMfaState = "ok" | "challenge" | "enroll";
export type AdminContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email: string | null };
  /** "ok" = aal2 session; "challenge" = TOTP enrolled, code needed; "enroll" = no TOTP factor yet. */
  mfa: AdminMfaState;
};

/**
 * The admin of this request, or null for anyone else (anonymous, normal users, invalid sessions).
 * The user is validated by GoTrue (getUser), the role by the DB (is_admin()). One call per request (React cache).
 */
export const getAdminContext = cache(async (): Promise<AdminContext | null> => {
  const store = await cookies();
  if (!store.getAll().some((c) => c.name.startsWith("sb-"))) return null;
  const supabase = await createClient();
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData.user) return null;
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) return null;
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const mfa: AdminMfaState =
    aal?.currentLevel === "aal2" ? "ok" : aal?.nextLevel === "aal2" ? "challenge" : "enroll";
  return { supabase, user: { id: userData.user.id, email: userData.user.email ?? null }, mfa };
});

/**
 * Page guard: 404 for non-admins (the admin area does not reveal itself), TOTP step-up page for admins without an
 * aal2 session. Every admin page calls this before loading data.
 */
export async function requireAdmin(locale: string): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) notFound();
  if (ctx.mfa !== "ok") redirect(`/${locale}/admin/mfa`);
  return ctx;
}

/** Server action guard: same rules, but returns null instead of rendering (the action answers "denied"). */
export async function requireAdminAction(): Promise<AdminContext | null> {
  const ctx = await getAdminContext();
  return ctx && ctx.mfa === "ok" ? ctx : null;
}

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = { id: string; email: string | null };

/**
 * The signed-in user of this request, or null. Anonymous visitors (no `sb-` cookie) cost no network call.
 * Validated by GoTrue (getClaims verifies the JWT; with a symmetric key it asks the auth server).
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  if (!store.getAll().some((c) => c.name.startsWith("sb-"))) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const email = typeof data.claims.email === "string" ? data.claims.email : null;
  return { id: data.claims.sub, email };
});

/** For account pages: the user, or a redirect to the sign-in page that comes back to `path` (path without locale). */
export async function requireUser(locale: string, path: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect(`/${locale}/autentificare?next=${encodeURIComponent(`/${locale}${path}`)}`);
  }
  return user;
}

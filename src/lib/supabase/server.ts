import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { getSupabaseEnv, serverAuthFetch } from "./env";

/**
 * Server Supabase client bound to the request cookies (anon key only). Created with the public URL (cookie names)
 * but talks to the internal gateway when SUPABASE_INTERNAL_URL is set (see serverAuthFetch).
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();
  const fetchImpl = serverAuthFetch();

  return createServerClient<Database>(url, anonKey, {
    ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: cookies are read-only there.
          // Safe to ignore once a proxy refreshes sessions.
        }
      },
    },
  });
}

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { getSupabaseEnv } from "./env";

/** Browser Supabase client (publishable/anon key only). */
export function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient<Database>(url, anonKey);
}

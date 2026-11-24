import "@/lib/zod-setup";
import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

/**
 * Validates the public Supabase env lazily (on first client creation), so
 * `next build` does not fail when no client is instantiated.
 * NEXT_PUBLIC_* vars must be referenced literally so Next can inline them.
 */
export function getSupabaseEnv() {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Invalid or missing Supabase env vars: ${names}. Set them in .env.local (see README, "Development").`,
    );
  }
  return {
    url: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

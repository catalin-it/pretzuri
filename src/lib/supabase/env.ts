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

/**
 * URL for server-side catalog reads. `SUPABASE_INTERNAL_URL` (runtime, server-only) lets the web container reach
 * the API over the Docker network or host when the public API hostname is not resolvable from inside (DEV);
 * falls back to the public URL. Not used for session clients (cookie names derive from the public URL).
 */
export function getServerCatalogUrl(): string {
  const internal = process.env.SUPABASE_INTERNAL_URL;
  if (internal && /^https?:\/\//.test(internal)) return internal.replace(/\/$/, "");
  return getSupabaseEnv().url;
}

/**
 * Server-side `fetch` for session (cookie) clients: requests to the public Supabase origin are sent to
 * `SUPABASE_INTERNAL_URL` instead (Docker network inside the web container), while the client is still created with
 * the PUBLIC url so the auth cookie names (`sb-<host>-auth-token`) match the browser's. Undefined when no internal
 * URL is configured (local dev): the default fetch is used.
 */
export function serverAuthFetch(): typeof fetch | undefined {
  const internal = process.env.SUPABASE_INTERNAL_URL;
  if (!internal || !/^https?:\/\//.test(internal)) return undefined;
  const target = internal.replace(/\/$/, "");
  const publicOrigin = new URL(getSupabaseEnv().url).origin;
  return (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return fetch(rewriteOrigin(url, publicOrigin, target), input instanceof Request ? { ...pickRequestInit(input), ...init } : init);
  };
}

/** Replaces `from` (an origin) at the start of `url` with `to`; other URLs are returned unchanged. */
export function rewriteOrigin(url: string, from: string, to: string): string {
  if (url === from || url.startsWith(`${from}/`) || url.startsWith(`${from}?`)) return to + url.slice(from.length);
  return url;
}

function pickRequestInit(r: Request): RequestInit {
  return { method: r.method, headers: r.headers, body: r.body, signal: r.signal, ...(r.body ? { duplex: "half" } : {}) } as RequestInit;
}

/**
 * Content-Security-Policy builder. Pure, so it is unit-tested.
 *
 * The per-request policy (with a nonce) is set in src/proxy.ts; Next.js reads the nonce from the
 * request's CSP header and stamps it on its own inline/bootstrap scripts. `'strict-dynamic'` lets
 * those nonce'd scripts load the rest of the bundle, so no `'unsafe-inline'` is needed for scripts.
 */

export type CspOptions = {
  nonce: string;
  /** NEXT_PUBLIC_SUPABASE_URL (may be undefined/invalid in odd build environments). */
  supabaseUrl?: string;
  isDev?: boolean;
};

/** Origin (https or http) and the matching websocket origin for the Supabase URL. */
export function supabaseOrigins(supabaseUrl: string | undefined): { http: string; ws: string } | null {
  if (!supabaseUrl) return null;
  try {
    const u = new URL(supabaseUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return { http: u.origin, ws: `${u.protocol === "https:" ? "wss:" : "ws:"}//${u.host}` };
  } catch {
    return null;
  }
}

export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function buildCsp({ nonce, supabaseUrl, isDev = false }: CspOptions): string {
  const sb = supabaseOrigins(supabaseUrl);
  const connect = ["'self'", ...(sb ? [sb.http, sb.ws] : []), ...(isDev ? ["ws:", "http://localhost:*"] : [])];
  // Product images are served from our own Storage (cached from feeds), never hot-linked from shops.
  const img = ["'self'", "blob:", "data:", ...(sb ? [sb.http] : [])];
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    // React emits style attributes during SSR, which a nonce cannot cover; inline styles stay allowed.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": img,
    "font-src": ["'self'", "data:"],
    "connect-src": connect,
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}

/** Static policy for routes the proxy does not cover (service worker script): no inline anything. */
export function buildStaticCsp(supabaseUrl: string | undefined): string {
  const sb = supabaseOrigins(supabaseUrl);
  return [
    "default-src 'self'",
    "script-src 'self'",
    `connect-src 'self'${sb ? ` ${sb.http} ${sb.ws}` : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Non-CSP headers applied to every route from next.config.ts. */
export const BASE_SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=(), payment=()" },
  { key: "X-Frame-Options", value: "DENY" },
];

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { getSupabaseEnv, serverAuthFetch } from "./lib/supabase/env";
import { buildCsp, generateNonce } from "./lib/security/csp";

// Next.js 16 `proxy` (formerly middleware):
//  1. per-request CSP nonce,
//  2. refresh the Supabase session cookies (only when a session cookie exists),
//  3. next-intl locale routing.
// No DB calls and no auth redirects here; layouts/pages do them.
const intlMiddleware = createMiddleware(routing);

type CookieToSet = { name: string; value: string; options: Parameters<NextResponse["cookies"]["set"]>[2] };

export default async function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildCsp({
    nonce,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    isDev: process.env.NODE_ENV === "development",
  });
  request.headers.set("x-nonce", nonce);
  request.headers.set("content-security-policy", csp);

  const pending: CookieToSet[] = [];
  const extraHeaders: Record<string, string> = {};

  // Anonymous visitors (most traffic of a price comparator) cost nothing here.
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (hasSession) {
    const { url, anonKey } = getSupabaseEnv();
    const fetchImpl = serverAuthFetch();
    const supabase = createServerClient(url, anonKey, {
      ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            pending.push({ name, value, options });
          }
          Object.assign(extraHeaders, headers);
        },
      },
    });
    await supabase.auth.getClaims();
  }

  const response = intlMiddleware(request);
  response.headers.set("Content-Security-Policy", csp);
  for (const { name, value, options } of pending) response.cookies.set(name, value, options);
  for (const [key, value] of Object.entries(extraHeaders)) response.headers.set(key, value);
  return response;
}

export const config = {
  // Skip API routes, the /go redirect, Next internals and any file with an extension.
  matcher: ["/((?!api|go/|_next|_vercel|serwist|.*\\..*).*)"],
};

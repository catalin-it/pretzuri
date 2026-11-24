// Pure caching predicates shared by the service worker (bundled by esbuild, so keep this file dependency-free)
// and the unit tests. Nothing private and no prices (they must always be fresh) may be served from a cache:
// anything that could be private goes to the network, always.

export type CacheRequestInfo = {
  /** Absolute request URL. */
  url: string;
  /** Origin of the page/service worker (self.location.origin). */
  origin: string;
  /** True when the request carries an Authorization header. */
  hasAuthorization?: boolean;
  /** Origin of the Supabase API (NEXT_PUBLIC_SUPABASE_URL), when known. */
  supabaseOrigin?: string | null;
};

// Supabase service prefixes (GoTrue, PostgREST, Storage, Realtime, Edge Functions) plus our own API routes.
const PRIVATE_PATH = /^\/(?:auth|rest|storage|realtime|functions|graphql|api)(?:\/|$)/;
// Signed/authenticated storage objects, wherever a proxy mounts them.
const STORAGE_PATH = /\/storage\/v\d+\/|\/object\/(?:sign|authenticated)\//;
const TOKEN_PARAMS = ["token", "access_token", "apikey"];

export function originOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** True when the response for this request must NEVER be stored in or served from a cache. */
export function shouldBypassCache(info: CacheRequestInfo): boolean {
  if (info.hasAuthorization) return true;
  let url: URL;
  try {
    url = new URL(info.url);
  } catch {
    return true; // unparseable: be conservative
  }
  // Only same-origin assets are ever cached. Every cross-origin request (Supabase API, Storage
  // signed URLs, third parties) is network-only.
  if (url.origin !== info.origin) return true;
  if (info.supabaseOrigin && url.origin === info.supabaseOrigin) return true;
  if (PRIVATE_PATH.test(url.pathname) || STORAGE_PATH.test(url.pathname)) return true;
  for (const key of TOKEN_PARAMS) if (url.searchParams.has(key)) return true;
  return false;
}

/** Same-origin static brand assets that are safe to cache-first. */
export function isCacheableBrandAsset(url: URL, origin: string): boolean {
  return url.origin === origin && /^\/(?:brand|icons)\//.test(url.pathname);
}

const LOCALE_SEGMENT = /^\/([a-z]{2}(?:-[A-Za-z]{2})?)(?:\/|$)/;

/** Picks the precached offline page for a navigation URL, falling back to the default locale. */
export function offlineUrlFor(pathname: string, locales: readonly string[], defaultLocale: string): string {
  const match = LOCALE_SEGMENT.exec(pathname);
  const locale = match && locales.includes(match[1]) ? match[1] : defaultLocale;
  return `/${locale}/offline`;
}

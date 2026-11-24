/// <reference lib="webworker" />
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";
import { isCacheableBrandAsset, offlineUrlFor, originOf, shouldBypassCache } from "../lib/pwa/cache-rules";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;
// Inlined at build time by esbuild `define` (see src/app/serwist/[path]/route.ts).
declare const __SUPABASE_URL__: string;
declare const __LOCALES__: string[];
declare const __DEFAULT_LOCALE__: string;

const supabaseOrigin = originOf(__SUPABASE_URL__);

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  disableDevLogs: true,
  runtimeCaching: [
    // 1. Private/API same-origin traffic is network-only. Cross-origin requests are not intercepted at all.
    {
      matcher: ({ request, url }) =>
        url.origin === self.location.origin &&
        shouldBypassCache({
          url: url.href,
          origin: self.location.origin,
          hasAuthorization: request.headers.has("authorization"),
          supabaseOrigin,
        }),
      handler: new NetworkOnly(),
    },
    // 2. Icons: cache-first (static, public).
    {
      matcher: ({ url }) => isCacheableBrandAsset(url, self.location.origin),
      handler: new CacheFirst({
        cacheName: "pretzuri-brand",
        plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
    // 3. Navigations always hit the network (prices must be fresh); failures fall back to the offline page.
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkOnly(),
    },
  ],
});

serwist.setCatchHandler(async ({ request }) => {
  if (request.mode === "navigate" || request.destination === "document") {
    const target = offlineUrlFor(new URL(request.url).pathname, __LOCALES__, __DEFAULT_LOCALE__);
    const cached = await serwist.matchPrecache(target);
    if (cached) return cached;
  }
  return Response.error();
});

// --- Web Push (price alerts) ----------------------------------------------------------------------
// Payload: { title, body, url } already localized by the sender. Only same-origin relative URLs are opened.
function safePath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

self.addEventListener("push", (event) => {
  let data: { title?: unknown; body?: unknown; url?: unknown; tag?: unknown } = {};
  try {
    data = event.data ? (event.data.json() as typeof data) : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Pretzuri";
  const options: NotificationOptions = {
    body: typeof data.body === "string" ? data.body : "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: typeof data.tag === "string" ? data.tag : undefined,
    data: { url: safePath(data.url) },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = safePath((event.notification.data as { url?: unknown } | null)?.url);
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if ("navigate" in client) {
          try {
            await (client as WindowClient).navigate(target);
          } catch {
            /* the window is still focused */
          }
        }
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

serwist.addEventListeners();

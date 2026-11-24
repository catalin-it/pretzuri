---
name: pwa-setup
description: Configure or debug Pretzuri PWA features (manifest, Serwist service worker, offline fallback, install prompt, Web Push for price alerts). Use for installability, caching, push notification or iOS home-screen issues.
---
- `src/app/manifest.ts`: localized name/short_name, `display: "standalone"`, theme/background color,
  icons 192/512 + maskable, `start_url` `/ro` (default locale).
- Service worker (Serwist, `src/app/sw.ts` served by `src/app/serwist/[path]/route.ts`): precache the app shell;
  NetworkOnly for navigations, auth and account data; prices must always be fresh, so never serve offers/prices
  from cache except on the offline page. CacheFirst for product thumbnails from Storage (7-day expiry, max entries).
  Offline fallback page `/<locale>/offline`.
- Install prompt: capture `beforeinstallprompt` (Android/desktop); on iOS show a hint for Share → Add to Home Screen.
  Never show it on the first visit; offer it after the user creates a price alert or favorite.
- Web Push for price alerts: VAPID keys via env (public key may be `NEXT_PUBLIC_*`, private key only on the NAS).
  Ask for permission only after the user creates an alert and chooses push. Store the subscription per user in
  `push_subscriptions`; drop it on 404/410. Notification opens the product page, not the shop.
  On iOS, push works only for installed PWAs (16.4+).
- HTTPS is required (LAN IPs are not secure contexts): verify on `https://dev-pretzuri.it-ist.ro`.
- Verify with `npm run build && npm start`, a Lighthouse PWA audit, and a real Android phone + iPhone.

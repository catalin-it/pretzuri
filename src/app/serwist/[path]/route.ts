import { createSerwistRoute } from "@serwist/turbopack";
import { routing } from "@/i18n/routing";

// Serves the service worker at /serwist/sw.js (scope widened to "/" via Service-Worker-Allowed).
// Precaches the hashed build assets, the icons and the localized offline pages. Nothing user-specific, no prices.
const revision = process.env.SERWIST_REVISION ?? crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "src/app/sw.ts",
  globDirectory: ".",
  globPatterns: [".next/static/**/*.{js,css,woff2}", "public/icons/*"],
  globIgnores: ["**/*.map", "**/_buildManifest.js", "**/_ssgManifest.js"],
  additionalPrecacheEntries: routing.locales.map((locale) => ({ url: `/${locale}/offline`, revision })),
  useNativeEsbuild: true,
  esbuildOptions: {
    define: {
      __SUPABASE_URL__: JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""),
      __LOCALES__: JSON.stringify(routing.locales),
      __DEFAULT_LOCALE__: JSON.stringify(routing.defaultLocale),
    },
  },
});

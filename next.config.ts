import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSerwist } from "@serwist/turbopack";
import { readFileSync } from "node:fs";
import { BASE_SECURITY_HEADERS, buildStaticCsp } from "./src/lib/security/csp";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const pkg = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };

const nextConfig: NextConfig = {
  // App version comes from package.json; NEXT_PUBLIC_APP_COMMIT / NEXT_PUBLIC_APP_ENV are Docker build args.
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
  // Runs in Docker (NAS now, VPS later; see infra/nas/README.md).
  output: "standalone",
  async headers() {
    return [
      // Every route. The page CSP (with a per-request nonce) is set in src/proxy.ts.
      { source: "/:path*", headers: BASE_SECURITY_HEADERS },
      {
        // The proxy skips file-like paths, so the service worker script gets a static CSP here.
        source: "/serwist/:path*",
        headers: [
          { key: "Content-Security-Policy", value: buildStaticCsp(process.env.NEXT_PUBLIC_SUPABASE_URL) },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      {
        // Admin and account pages are private: never stored by browsers, proxies or the CDN.
        source: "/:locale/(admin|cont)/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withSerwist(withNextIntl(nextConfig));

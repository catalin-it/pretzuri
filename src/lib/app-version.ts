// Build-time constants (inlined by Next.js; see next.config.ts and the Dockerfile build args).
export type AppEnv = "dev" | "prod";

export const APP_VERSION: string = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
export const APP_COMMIT: string = process.env.NEXT_PUBLIC_APP_COMMIT || "local";
export const APP_ENV: AppEnv = process.env.NEXT_PUBLIC_APP_ENV === "prod" ? "prod" : "dev";

export const appVersion = { version: APP_VERSION, commit: APP_COMMIT, env: APP_ENV } as const;

/** Public site URL (canonical links, sitemap). */
export const SITE_URL: string = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

/** DEV and previews must never be indexed. */
export const NOINDEX: boolean = process.env.NEXT_PUBLIC_NOINDEX !== "false";

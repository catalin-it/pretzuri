// Hard safety net: the suite may only ever talk to DEV. Allowed: the public DEV host, an SSH tunnel to the NAS web
// port, or the in-NAS docker network (infra/nas/e2e.sh runs Playwright in a throw-away container there).
const ALLOWED_ORIGINS = new Set(["https://dev-pretzuri.it-ist.ro", "http://127.0.0.1:3400", "http://web:3000"]);

function guard(raw: string): string {
  const origin = new URL(raw).origin;
  if (!ALLOWED_ORIGINS.has(origin)) {
    throw new Error(`E2E_BASE_URL=${raw} is not DEV. Allowed: ${[...ALLOWED_ORIGINS].join(", ")}.`);
  }
  return origin;
}

export const BASE_URL = guard(process.env.E2E_BASE_URL ?? "https://dev-pretzuri.it-ist.ro");
/** Supabase API gateway of DEV (docker network name inside the NAS container, LAN port from a workstation). */
export const API_URL = process.env.E2E_API_URL ?? "http://api-gw:8000";
/** Public Supabase URL baked into the client bundle at build time; remapped to API_URL by the proxy fixture. */
export const PUBLIC_API_URL = "https://api-dev-pretzuri.it-ist.ro";
export const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? "http://mailpit:8025";
export const MAILPIT_PASS = process.env.E2E_MAILPIT_PASS ?? "";
export const ANON_KEY = process.env.E2E_ANON_KEY ?? "";
export const SERVICE_KEY = process.env.E2E_SERVICE_KEY ?? "";

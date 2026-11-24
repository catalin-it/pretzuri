// Hard safety net: the suite may only ever talk to DEV (public host, or the NAS web port through an SSH tunnel:
// `ssh -N -L 3400:127.0.0.1:3400 pretzuri-nas` + E2E_BASE_URL=http://127.0.0.1:3400).
const ALLOWED_ORIGINS = new Set(["https://dev-pretzuri.it-ist.ro", "http://127.0.0.1:3400"]);

function guard(raw: string): string {
  const origin = new URL(raw).origin;
  if (!ALLOWED_ORIGINS.has(origin)) {
    throw new Error(`E2E_BASE_URL=${raw} is not DEV. Allowed: ${[...ALLOWED_ORIGINS].join(", ")}.`);
  }
  return origin;
}

export const BASE_URL = guard(process.env.E2E_BASE_URL ?? "https://dev-pretzuri.it-ist.ro");

import { appVersion } from "@/lib/app-version";

// Liveness probe for the container healthcheck and uptime checks. No DB call, no personal data.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { ok: true, version: appVersion.version, commit: appVersion.commit, env: appVersion.env },
    { headers: { "Cache-Control": "no-store" } },
  );
}

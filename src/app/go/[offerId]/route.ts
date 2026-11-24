import { NextResponse, type NextRequest } from "next/server";
import { catalogClient } from "@/lib/catalog/queries";
import { isBotUserAgent, normalizeSource, parseOfferId, safeDestination } from "@/lib/go/redirect";

// Outbound click: count it (no personal data: only offer, source, bot flag) and send the visitor to the shop.
const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

function notFoundResponse() {
  const html =
    '<!doctype html><html lang="ro"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    "<title>Oferta nu mai este disponibilă</title>" +
    '<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem">' +
    "<h1>Oferta nu mai este disponibilă</h1><p>This offer is no longer available.</p>" +
    '<p><a href="/ro">Pretzuri</a></p></body></html>';
  return new NextResponse(html, { status: 404, headers: { ...HEADERS, "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params;
  const id = parseOfferId(offerId);
  if (id === null) return notFoundResponse();

  const { data, error } = await catalogClient().rpc("register_click", {
    p_offer_id: id,
    p_source: normalizeSource(request.nextUrl.searchParams.get("s")),
    p_is_bot: isBotUserAgent(request.headers.get("user-agent")),
  });
  if (error) {
    console.error("register_click failed", error.message);
    return new NextResponse("Service unavailable", { status: 503, headers: { ...HEADERS, "Retry-After": "30" } });
  }
  const dest = safeDestination(data);
  if (!dest) return notFoundResponse();
  return NextResponse.redirect(dest, { status: 302, headers: HEADERS });
}

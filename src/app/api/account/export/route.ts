import { NextResponse } from "next/server";
import { exportFileName, shapeExport } from "@/lib/account/export";
import { loadExportInput } from "@/lib/account/queries";

export const dynamic = "force-dynamic";

/** GDPR data export: JSON download of the signed-in user's own data. */
export async function GET() {
  const input = await loadExportInput();
  if (!input) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const body = JSON.stringify(shapeExport(input), null, 2);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName()}"`,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}

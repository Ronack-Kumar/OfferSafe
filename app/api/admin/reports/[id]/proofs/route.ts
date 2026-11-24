import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { isReportId, proofLinks } from "@/lib/admin-reports";

export const dynamic = "force-dynamic";

/** GET /api/admin/reports/:id/proofs: 5-minute download links for a report's attachments. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  if (!isReportId(params.id)) return NextResponse.json({ error: "Invalid report id." }, { status: 400 });

  const links = await proofLinks(auth.session, params.id);
  if (!links) return NextResponse.json({ error: "Couldn't load attachments. Try again." }, { status: 502 });
  return NextResponse.json({ links }, { headers: { "Cache-Control": "no-store" } });
}

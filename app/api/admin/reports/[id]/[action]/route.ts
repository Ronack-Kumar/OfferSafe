import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { approveReport, isReportId, rejectReport } from "@/lib/admin-reports";

export const dynamic = "force-dynamic";

/** POST /api/admin/reports/:id/approve and /api/admin/reports/:id/reject */
export async function POST(req: NextRequest, { params }: { params: { id: string; action: string } }) {
  // Authenticate before looking at anything else in the request.
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  if (params.action !== "approve" && params.action !== "reject") {
    return NextResponse.json({ error: "Unknown action." }, { status: 404 });
  }
  if (!isReportId(params.id)) return NextResponse.json({ error: "Invalid report id." }, { status: 400 });

  const result = params.action === "approve" ? await approveReport(auth.session, params.id) : await rejectReport(auth.session, params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.httpStatus });
  return NextResponse.json({ ok: true, status: result.status });
}

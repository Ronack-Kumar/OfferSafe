import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { listReports } from "@/lib/admin-reports";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const reports = await listReports(auth.session);
  if (!reports) return NextResponse.json({ error: "Couldn't load reports. Try again." }, { status: 502 });
  return NextResponse.json({ reports });
}

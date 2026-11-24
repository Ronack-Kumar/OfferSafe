import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, clearSessionCookies, isSameOrigin, signOut } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (token) await signOut(token);
  const res = NextResponse.json({ ok: true });
  clearSessionCookies(res.cookies);
  return res;
}

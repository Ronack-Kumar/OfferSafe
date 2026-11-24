import { NextResponse, type NextRequest } from "next/server";
import { checkAdminToken, isSameOrigin, setSessionCookies, signInWithPassword, signOut } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });

  const grant = await signInWithPassword(email, password);
  if (!grant) return NextResponse.json({ error: "That email and password don't match an account." }, { status: 401 });

  // A valid account is not enough: only allow-listed admins get a session cookie.
  const check = await checkAdminToken(grant.accessToken);
  if (!check.ok) {
    await signOut(grant.accessToken);
    return NextResponse.json({ error: check.error }, { status: check.status === 401 ? 403 : check.status });
  }

  const res = NextResponse.json({ ok: true });
  setSessionCookies(res.cookies, grant);
  return res;
}

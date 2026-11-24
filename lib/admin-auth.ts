import { NextResponse, type NextRequest } from "next/server";
import { supabasePublicKey } from "./supabase-key";

/**
 * Admin authentication for /admin-offersafe and /api/admin/*.
 *
 * Uses Supabase Auth (email + password) through its REST API. The session lives in
 * two httpOnly cookies. Every admin request is checked on the server:
 *   1. the access token must be accepted by Supabase Auth (GET /auth/v1/user), and
 *   2. the database function is_offersafe_admin() must return true for that user,
 *      i.e. their confirmed email is in public.offersafe_admins.
 * Admin database writes are made with the admin's own access token, so the RLS
 * policies enforce the same rule a second time. The service role key is never used.
 */

export const ACCESS_COOKIE = "osa_access";
export const REFRESH_COOKIE = "osa_refresh";
const REFRESH_MAX_AGE_S = 30 * 24 * 60 * 60;
const AUTH_TIMEOUT_MS = 5000;

export type AdminSession = { accessToken: string; userId: string; email: string };

export type AdminCheck =
  | { ok: true; session: AdminSession }
  | { ok: false; status: 401 | 403 | 503; error: string };

export type TokenGrant = { accessToken: string; refreshToken: string; expiresIn: number };

function supabaseConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = supabasePublicKey();
  return url && key ? { url, key } : null;
}

async function call(path: string, init: RequestInit & { token?: string } = {}): Promise<Response | null> {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  const { token, headers, ...rest } = init;
  try {
    return await fetch(`${cfg.url}${path}`, {
      ...rest,
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${token ?? cfg.key}`,
        "Content-Type": "application/json",
        ...(headers as Record<string, string> | undefined),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

function asGrant(body: unknown): TokenGrant | null {
  const b = body as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown } | null;
  if (!b || typeof b.access_token !== "string" || typeof b.refresh_token !== "string") return null;
  return { accessToken: b.access_token, refreshToken: b.refresh_token, expiresIn: Number(b.expires_in) || 3600 };
}

/** Email + password sign-in. null = wrong credentials or Supabase unreachable. */
export async function signInWithPassword(email: string, password: string): Promise<TokenGrant | null> {
  const res = await call("/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) });
  if (!res?.ok) return null;
  return asGrant(await res.json().catch(() => null));
}

export async function refreshSession(refreshToken: string): Promise<TokenGrant | null> {
  const res = await call("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: refreshToken }) });
  if (!res?.ok) return null;
  return asGrant(await res.json().catch(() => null));
}

export async function signOut(accessToken: string): Promise<void> {
  await call("/auth/v1/logout", { method: "POST", token: accessToken });
}

/** Verifies the token with Supabase Auth, then asks the database whether this user is an admin. */
export async function checkAdminToken(accessToken: string | undefined | null): Promise<AdminCheck> {
  if (!accessToken) return { ok: false, status: 401, error: "Sign in to continue." };

  const userRes = await call("/auth/v1/user", { token: accessToken });
  if (!userRes) return { ok: false, status: 503, error: "Couldn't reach the sign-in service. Try again." };
  if (!userRes.ok) return { ok: false, status: 401, error: "Your session has expired. Sign in again." };
  const user = (await userRes.json().catch(() => null)) as { id?: unknown; email?: unknown } | null;
  if (!user || typeof user.id !== "string") return { ok: false, status: 401, error: "Your session has expired. Sign in again." };

  const adminRes = await call("/rest/v1/rpc/is_offersafe_admin", { method: "POST", body: "{}", token: accessToken });
  if (!adminRes) return { ok: false, status: 503, error: "Couldn't verify admin access. Try again." };
  // Anything but an explicit `true` (including a missing function) is treated as "not an admin".
  const isAdmin = adminRes.ok ? (await adminRes.json().catch(() => false)) === true : false;
  if (!isAdmin) return { ok: false, status: 403, error: "This account doesn't have admin access." };

  return { ok: true, session: { accessToken, userId: user.id, email: typeof user.email === "string" ? user.email : "" } };
}

/** For route handlers: the admin session, or a JSON error response to return as-is. */
export async function requireAdmin(
  req: NextRequest,
): Promise<{ ok: true; session: AdminSession } | { ok: false; response: NextResponse }> {
  if (req.method !== "GET" && req.method !== "HEAD" && !isSameOrigin(req)) {
    return { ok: false, response: NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 }) };
  }
  const check = await checkAdminToken(req.cookies.get(ACCESS_COOKIE)?.value);
  if (!check.ok) return { ok: false, response: NextResponse.json({ error: check.error }, { status: check.status }) };
  return check;
}

/** Blocks cross-site form posts on top of the SameSite=Lax session cookies. */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

type CookieJar = { set: (name: string, value: string, options: Record<string, unknown>) => unknown };

const cookieBase = () => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" });

export function setSessionCookies(jar: CookieJar, grant: TokenGrant): void {
  jar.set(ACCESS_COOKIE, grant.accessToken, { ...cookieBase(), maxAge: grant.expiresIn });
  jar.set(REFRESH_COOKIE, grant.refreshToken, { ...cookieBase(), maxAge: REFRESH_MAX_AGE_S });
}

export function clearSessionCookies(jar: CookieJar): void {
  jar.set(ACCESS_COOKIE, "", { ...cookieBase(), maxAge: 0 });
  jar.set(REFRESH_COOKIE, "", { ...cookieBase(), maxAge: 0 });
}

/** Seconds until the JWT expires (unverified decode, only to decide when to refresh). */
export function secondsUntilExpiry(token: string, now = Date.now()): number {
  try {
    const part = token.split(".")[1] ?? "";
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")));
    return typeof json.exp === "number" ? json.exp - Math.floor(now / 1000) : -1;
  } catch {
    return -1;
  }
}

/** PostgREST call made as the signed-in admin (their token, not a privileged key). */
export async function adminRest(session: AdminSession, path: string, init: RequestInit = {}): Promise<Response | null> {
  return call(`/rest/v1/${path}`, { ...init, token: session.accessToken });
}

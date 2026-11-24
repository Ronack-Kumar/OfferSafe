import { NextResponse, type NextRequest } from "next/server";
import {
  ACCESS_COOKIE,
  clearSessionCookies,
  REFRESH_COOKIE,
  refreshSession,
  secondsUntilExpiry,
  setSessionCookies,
} from "@/lib/admin-auth";

/**
 * Keeps the admin session fresh: when the access token is missing or about to expire
 * and a refresh token exists, swap it for a new pair before the page or API route runs.
 *
 * This does NOT decide who is an admin. The admin page and every /api/admin route
 * check that themselves on the server (lib/admin-auth.ts).
 */
export async function middleware(req: NextRequest) {
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!refresh || (access && secondsUntilExpiry(access) > 60)) return NextResponse.next();

  const grant = await refreshSession(refresh);
  if (!grant) {
    req.cookies.delete(ACCESS_COOKIE);
    req.cookies.delete(REFRESH_COOKIE);
    const res = NextResponse.next({ request: { headers: req.headers } });
    clearSessionCookies(res.cookies);
    return res;
  }

  // Pass the new token to this request's handler, and store both for the browser.
  req.cookies.set(ACCESS_COOKIE, grant.accessToken);
  req.cookies.set(REFRESH_COOKIE, grant.refreshToken);
  const res = NextResponse.next({ request: { headers: req.headers } });
  setSessionCookies(res.cookies, grant);
  return res;
}

export const config = {
  matcher: ["/admin-offersafe/:path*", "/api/admin/:path*"],
};

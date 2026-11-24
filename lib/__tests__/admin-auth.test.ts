import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { json, stubFetch } from "../checks/__tests__/helpers";
import { ACCESS_COOKIE, checkAdminToken, secondsUntilExpiry } from "../admin-auth";
import { POST as login } from "../../app/api/admin/login/route";
import { GET as listReports } from "../../app/api/admin/reports/route";
import { POST as reportAction } from "../../app/api/admin/reports/[id]/[action]/route";

const SUPABASE = "https://project.supabase.co";
const REPORT_ID = "33333333-3333-4333-8333-333333333333";
const ADMIN_TOKEN = "admin-token";
const USER_TOKEN = "user-token";

/**
 * Fake Supabase: /auth/v1/user accepts ADMIN_TOKEN and USER_TOKEN (anything else is
 * a forged/expired token); is_offersafe_admin() is true only for ADMIN_TOKEN.
 */
function fakeSupabase() {
  return stubFetch((url, init) => {
    const auth = new Headers(init?.headers).get("Authorization") ?? "";
    const token = auth.replace(/^Bearer /, "");
    if (url.endsWith("/auth/v1/user")) {
      if (token === ADMIN_TOKEN) return json({ id: "admin-id", email: "admin@example.com" });
      if (token === USER_TOKEN) return json({ id: "user-id", email: "someone@example.com" });
      return json({ msg: "invalid JWT" }, 401);
    }
    if (url.endsWith("/rest/v1/rpc/is_offersafe_admin")) return json(token === ADMIN_TOKEN);
    if (url.includes("/auth/v1/token?grant_type=password")) {
      const body = JSON.parse(String(init?.body));
      if (body.password !== "right-password") return json({ error: "invalid_grant" }, 400);
      return json({ access_token: body.email === "admin@example.com" ? ADMIN_TOKEN : USER_TOKEN, refresh_token: "r", expires_in: 3600 });
    }
    if (url.endsWith("/auth/v1/logout")) return new Response(null, { status: 204 });
    if (url.includes("/rest/v1/pending_reports") && init?.method === "PATCH") {
      return json([{ id: REPORT_ID, company_name: "Acme", status: JSON.parse(String(init.body)).status, website: null, recruiter_email: null }]);
    }
    if (url.includes("/rest/v1/pending_reports")) return json([{ id: REPORT_ID, status: "pending_review" }]);
    if (url.includes("/rest/v1/scam_cases")) return new Response(null, { status: 201 });
    return json({ error: `unexpected ${url}` }, 500);
  });
}

function request(path: string, { token, method = "GET", body, origin = "http://localhost:3000" }: { token?: string; method?: string; body?: unknown; origin?: string | null } = {}) {
  const headers = new Headers({ host: "localhost:3000" });
  if (origin) headers.set("origin", origin);
  if (token) headers.set("cookie", `${ACCESS_COOKIE}=${token}`);
  if (body) headers.set("content-type", "application/json");
  return new NextRequest(`http://localhost:3000${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

const action = (name: string, token?: string, extra: { origin?: string | null } = {}) =>
  reportAction(request(`/api/admin/reports/${REPORT_ID}/${name}`, { token, method: "POST", ...extra }), { params: { id: REPORT_ID, action: name } });

/** Any call that would change data: PATCH/POST to PostgREST tables. */
const writes = (mock: ReturnType<typeof fakeSupabase>) =>
  mock.mock.calls.filter(([url, init]) => String(url).includes("/rest/v1/") && !String(url).includes("/rpc/") && init?.method && init.method !== "GET");

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
});

describe("checkAdminToken", () => {
  it("rejects a missing token without calling Supabase", async () => {
    const mock = fakeSupabase();
    expect(await checkAdminToken(undefined)).toMatchObject({ ok: false, status: 401 });
    expect(mock).not.toHaveBeenCalled();
  });

  it("rejects a token Supabase Auth doesn't accept (forged or expired)", async () => {
    fakeSupabase();
    // A hand-made JWT claiming an admin email is still just a string Supabase rejects.
    const forged = `x.${Buffer.from(JSON.stringify({ email: "admin@example.com", role: "authenticated" })).toString("base64url")}.y`;
    expect(await checkAdminToken(forged)).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects a real user who isn't on the admin list", async () => {
    fakeSupabase();
    expect(await checkAdminToken(USER_TOKEN)).toMatchObject({ ok: false, status: 403 });
  });

  it("treats a failed admin lookup as not an admin", async () => {
    stubFetch((url) => (url.endsWith("/auth/v1/user") ? json({ id: "admin-id" }) : json({ message: "function not found" }, 404)));
    expect(await checkAdminToken(ADMIN_TOKEN)).toMatchObject({ ok: false, status: 403 });
  });

  it("accepts an allow-listed admin", async () => {
    fakeSupabase();
    expect(await checkAdminToken(ADMIN_TOKEN)).toMatchObject({ ok: true, session: { userId: "admin-id", email: "admin@example.com" } });
  });
});

describe("admin API routes", () => {
  it.each(["approve", "reject"])("%s: logged out gets 401 and nothing is written", async (name) => {
    const mock = fakeSupabase();
    const res = await action(name);
    expect(res.status).toBe(401);
    expect(writes(mock)).toHaveLength(0);
  });

  it.each(["approve", "reject"])("%s: signed-in non-admin gets 403 and nothing is written", async (name) => {
    const mock = fakeSupabase();
    const res = await action(name, USER_TOKEN);
    expect(res.status).toBe(403);
    expect(writes(mock)).toHaveLength(0);
  });

  it.each(["approve", "reject"])("%s: forged token gets 401 and nothing is written", async (name) => {
    const mock = fakeSupabase();
    const res = await action(name, "forged.token.value");
    expect(res.status).toBe(401);
    expect(writes(mock)).toHaveLength(0);
  });

  it("blocks a cross-site POST even with an admin cookie", async () => {
    const mock = fakeSupabase();
    const res = await action("approve", ADMIN_TOKEN, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(writes(mock)).toHaveLength(0);
  });

  it("listing reports needs an admin", async () => {
    fakeSupabase();
    expect((await listReports(request("/api/admin/reports"))).status).toBe(401);
    expect((await listReports(request("/api/admin/reports", { token: USER_TOKEN }))).status).toBe(403);
    const ok = await listReports(request("/api/admin/reports", { token: ADMIN_TOKEN }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).reports).toHaveLength(1);
  });

  it("admin approve updates the report and publishes a scam case using the admin's own token", async () => {
    const mock = fakeSupabase();
    const res = await action("approve", ADMIN_TOKEN);
    expect(res.status).toBe(200);
    const w = writes(mock);
    expect(w.map(([url, init]) => `${init?.method} ${String(url).split("/rest/v1/")[1].split("?")[0]}`)).toEqual([
      "PATCH pending_reports",
      "POST scam_cases",
    ]);
    // Only reports that are still open can be decided.
    expect(String(w[0][0])).toContain("status=in.(pending,pending_review,low_confidence)");
    for (const [, init] of w) {
      expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${ADMIN_TOKEN}`);
    }
  });

  it("admin reject only updates the report", async () => {
    const mock = fakeSupabase();
    const res = await action("reject", ADMIN_TOKEN);
    expect(res.status).toBe(200);
    expect(writes(mock).map(([, init]) => JSON.parse(String(init?.body)))).toEqual([{ status: "rejected" }]);
  });

  it("rejects an unknown action or a malformed id for admins", async () => {
    fakeSupabase();
    const bad = await reportAction(request(`/api/admin/reports/${REPORT_ID}/delete`, { token: ADMIN_TOKEN, method: "POST" }), {
      params: { id: REPORT_ID, action: "delete" },
    });
    expect(bad.status).toBe(404);
    const badId = await reportAction(request("/api/admin/reports/1;drop/approve", { token: ADMIN_TOKEN, method: "POST" }), {
      params: { id: "1;drop", action: "approve" },
    });
    expect(badId.status).toBe(400);
  });
});

describe("admin login", () => {
  it("wrong password: 401, no session cookie", async () => {
    fakeSupabase();
    const res = await login(request("/api/admin/login", { method: "POST", body: { email: "admin@example.com", password: "nope" } }));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("valid non-admin account: 403, no session cookie, and the Supabase session is signed out", async () => {
    const mock = fakeSupabase();
    const res = await login(request("/api/admin/login", { method: "POST", body: { email: "someone@example.com", password: "right-password" } }));
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(mock.mock.calls.some(([url]) => String(url).endsWith("/auth/v1/logout"))).toBe(true);
  });

  it("admin: 200 with httpOnly session cookies", async () => {
    fakeSupabase();
    const res = await login(request("/api/admin/login", { method: "POST", body: { email: "Admin@Example.com", password: "right-password" } }));
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${ACCESS_COOKIE}=${ADMIN_TOKEN}`);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
  });
});

describe("secondsUntilExpiry", () => {
  it("reads exp from a JWT and returns -1 for junk", () => {
    const token = `h.${Buffer.from(JSON.stringify({ exp: 1_000_100 })).toString("base64url")}.s`;
    expect(secondsUntilExpiry(token, 1_000_000_000)).toBe(100);
    expect(secondsUntilExpiry("junk")).toBe(-1);
  });
});

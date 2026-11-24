import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { json, stubFetch } from "../checks/__tests__/helpers";
import { ACCESS_COOKIE } from "../admin-auth";
import { GET as proofs } from "../../app/api/admin/reports/[id]/proofs/route";

const SUPABASE = "https://project.supabase.co";
const REPORT_ID = "33333333-3333-4333-8333-333333333333";
const GOOD = "reports/0123456789abcdef/1-offer_letter.pdf";

function fake() {
  return stubFetch((url, init) => {
    const token = new Headers(init?.headers).get("Authorization")?.replace("Bearer ", "");
    if (url.endsWith("/auth/v1/user")) return token === "admin" || token === "user" ? json({ id: token }) : json({}, 401);
    if (url.endsWith("/rpc/is_offersafe_admin")) return json(token === "admin");
    if (url.includes("/rest/v1/pending_reports")) return json([{ proof_urls: [GOOD, "../../etc/passwd"] }]);
    if (url.includes("/storage/v1/object/sign/report-proofs/")) return json({ signedURL: `/object/sign/report-proofs/${GOOD}?token=t` });
    return json({}, 500);
  });
}

const get = (token?: string, id = REPORT_ID) => {
  const headers = new Headers({ host: "localhost:3000" });
  if (token) headers.set("cookie", `${ACCESS_COOKIE}=${token}`);
  return proofs(new NextRequest(`http://localhost:3000/api/admin/reports/${id}/proofs`, { headers }), { params: { id } });
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
});

describe("GET /api/admin/reports/:id/proofs", () => {
  it("refuses logged-out and non-admin users without signing anything", async () => {
    const mock = fake();
    expect((await get()).status).toBe(401);
    expect((await get("user")).status).toBe(403);
    expect(mock.mock.calls.some(([u]) => String(u).includes("/object/sign/"))).toBe(false);
  });

  it("gives the admin short-lived links, signed with the admin's token, for valid paths only", async () => {
    const mock = fake();
    const res = await get("admin");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ links: [{ name: "1-offer_letter.pdf", url: `${SUPABASE}/storage/v1/object/sign/report-proofs/${GOOD}?token=t` }] });
    const signs = mock.mock.calls.filter(([u]) => String(u).includes("/object/sign/"));
    expect(signs).toHaveLength(1);
    expect(new Headers(signs[0][1]?.headers).get("Authorization")).toBe("Bearer admin");
    expect(JSON.parse(String(signs[0][1]?.body))).toEqual({ expiresIn: 300 });
  });

  it("rejects a malformed id", async () => {
    fake();
    expect((await get("admin", "1;drop")).status).toBe(400);
  });
});

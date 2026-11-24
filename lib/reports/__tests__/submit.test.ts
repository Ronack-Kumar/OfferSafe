import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { json, stubFetch } from "../../checks/__tests__/helpers";

vi.mock("../../checks", () => ({
  runFreeChecks: vi.fn(async () => ({ checks: [], signals: [{ key: "domain_age_new", reason: "new" }], reddit: { posts: [], comments: {} } })),
}));

const { parseReportForm, proofPath, reporterFingerprint } = await import("../submit");
const { POST } = await import("../../../app/api/report-scam/route");

const SUPABASE = "https://project.supabase.co";

function form(fields: Record<string, string>, files: File[] = []): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ truthful_confirmation: "true", ...fields })) fd.append(k, v);
  for (const f of files) fd.append("proof_files", f);
  return fd;
}

const pdf = (name = "offer letter.pdf", bytes = 10) => new File([new Uint8Array(bytes)], name, { type: "application/pdf" });

describe("parseReportForm", () => {
  it("requires a company name and the truthfulness confirmation", () => {
    expect(parseReportForm(form({ company_name: " " }))).toMatchObject({ ok: false, error: "Company name is required." });
    expect(parseReportForm(form({ company_name: "Acme", truthful_confirmation: "false" }))).toMatchObject({ ok: false });
  });

  it("rejects bad emails, oversized text and disallowed files", () => {
    expect(parseReportForm(form({ company_name: "Acme", recruiter_email: "not-an-email" }))).toMatchObject({ ok: false });
    expect(parseReportForm(form({ company_name: "x".repeat(201) }))).toMatchObject({ ok: false });
    const exe = new File([new Uint8Array(4)], "run.exe", { type: "application/x-msdownload" });
    expect(parseReportForm(form({ company_name: "Acme" }, [exe]))).toMatchObject({ ok: false });
    expect(parseReportForm(form({ company_name: "Acme" }, [pdf("big.pdf", 5 * 1024 * 1024 + 1)]))).toMatchObject({ ok: false });
    expect(parseReportForm(form({ company_name: "Acme" }, Array.from({ length: 6 }, () => pdf())))).toMatchObject({ ok: false });
  });

  it("accepts a normal report", () => {
    const parsed = parseReportForm(form({ company_name: " Acme Pvt Ltd ", recruiter_email: "hr@acme.example" }, [pdf()]));
    expect(parsed).toMatchObject({ ok: true, fields: { company_name: "Acme Pvt Ltd" } });
  });
});

describe("proofPath", () => {
  // The storage upload policy and submit_scam_report() both enforce this pattern.
  const migration = readFileSync(new URL("../../../supabase/migrations/20261129_submit_scam_report.sql", import.meta.url), "utf8");
  const sqlPattern = migration.match(/name ~ '([^']+)'/)?.[1] ?? "";

  it("produces paths the database accepts, even for hostile file names", () => {
    expect(sqlPattern).toContain("reports/");
    const re = new RegExp(sqlPattern);
    for (const name of ["offer letter.pdf", "../../etc/passwd.pdf", "ऑफर.png", "a".repeat(300) + ".jpg"]) {
      const type = name.endsWith(".png") ? "image/png" : name.endsWith(".jpg") ? "image/jpeg" : "application/pdf";
      expect(proofPath("0123456789abcdef", 0, new File([new Uint8Array(1)], name, { type }))).toMatch(re);
    }
  });
});

describe("reporterFingerprint", () => {
  it("is a sha256 hex digest", () => {
    expect(reporterFingerprint(new Headers({ "x-forwarded-for": "1.2.3.4", "user-agent": "x" }))).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("POST /api/report-scam", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
  });

  const request = (fd: FormData) => new Request("http://localhost:3000/api/report-scam", { method: "POST", body: fd });

  it("saves through submit_scam_report only, uploads proofs, and never fetches the reported website", async () => {
    const mock = stubFetch((url) => {
      if (url.endsWith("/rest/v1/rpc/submit_scam_report")) return json([{ id: "r-1", report_count: 1, status: "pending_review" }]);
      if (url.includes("/storage/v1/object/report-proofs/reports/")) return json({ Key: "ok" });
      return json({ error: `unexpected ${url}` }, 500);
    });
    const res = await POST(
      request(
        form(
          {
            company_name: "TechNova",
            recruiter_email: "hr@gmail.com",
            website_url: "http://169.254.169.254/latest/meta-data",
            payment_text: "Pay Rs 1,999 registration fee within 24 hours",
            reporter_email: "victim@example.com",
          },
          [pdf()],
        ),
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "r-1", status: "pending_review", files_saved: 1, files_failed: 0 });

    const urls = mock.mock.calls.map(([u]) => String(u));
    expect(urls.some((u) => u.includes("169.254.169.254"))).toBe(false);
    // No email goes out: otherwise anyone could make the site email any address.
    expect(urls.some((u) => u.includes("resend.com"))).toBe(false);
    expect(urls.some((u) => u.includes("/rest/v1/pending_reports") || u.includes("/rest/v1/scam_cases"))).toBe(false);

    const rpc = mock.mock.calls.find(([u]) => String(u).endsWith("/rpc/submit_scam_report"));
    const body = JSON.parse(String(rpc?.[1]?.body)).report;
    expect(body.verified_signals).toEqual(expect.arrayContaining(["free_email_domain", "payment_demand_detected", "urgency_language", "new_domain"]));
    expect(body.proof_paths[0]).toMatch(/^reports\/[0-9a-f]{16}\/1-offer_letter\.pdf$/);
    expect(body).not.toHaveProperty("status");
  });

  it("returns 400 for an invalid form without calling Supabase", async () => {
    const mock = stubFetch(() => json({}, 500));
    const res = await POST(request(form({ company_name: "" })));
    expect(res.status).toBe(400);
    expect(mock).not.toHaveBeenCalled();
  });

  it("returns a friendly 502 when the database refuses", async () => {
    stubFetch((url) => (url.includes("submit_scam_report") ? json({ message: "boom" }, 500) : json({})));
    const res = await POST(request(form({ company_name: "Acme" })));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/couldn't save your report/);
  });
});

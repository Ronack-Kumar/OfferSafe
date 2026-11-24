import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveMx = vi.fn();
vi.mock("node:dns/promises", () => ({
  Resolver: class {
    resolveMx = resolveMx;
  },
}));

const { runFreeChecks } = await import("../index");
const { resetMcaState } = await import("../mca");
const { stubFetch, json } = await import("./helpers");

const NOW = new Date("2026-11-24T00:00:00Z");

beforeEach(() => {
  resetMcaState();
  resolveMx.mockReset();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  vi.stubEnv("REDDIT_CLIENT_ID", "");
});

describe("runFreeChecks", () => {
  it("turns flagged checks into scoring signals", async () => {
    resolveMx.mockRejectedValue(Object.assign(new Error("no data"), { code: "ENODATA" }));
    stubFetch((url) => {
      if (url.startsWith("https://rdap.org/")) return json({ events: [{ eventAction: "registration", eventDate: "2026-10-01T00:00:00Z" }] });
      if (url.includes("/mca_import_meta")) return json([{ completed_at: "2026-11-24T00:00:00Z" }]);
      if (url.includes("/mca_companies")) return json([]);
      return new Response("", { status: 404 });
    });

    const out = await runFreeChecks(
      { recruiterEmail: "hr@acme-offers.xyz", companyName: "Acme Offers", cin: "U72200KA2015PTC080000", text: "" },
      NOW,
    );

    expect(out.signals.map((s) => s.key).sort()).toEqual(["cin_not_found", "domain_age_new", "email_no_mx"]);
    expect(out.signals.find((s) => s.key === "domain_age_new")?.reason).toContain("2026-10-01");
    expect(out.checks.find((c) => c.id === "reddit")?.status).toBe("unavailable");
  });

  it("never throws and scores nothing when every source fails", async () => {
    resolveMx.mockRejectedValue(new Error("dns down"));
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("network down");
    }));

    const out = await runFreeChecks({ recruiterEmail: "hr@acme.com", website: "acme.com", companyName: "Acme", cin: "L22210MH1995PLC084781" }, NOW);

    expect(out.signals).toEqual([]);
    const statuses = out.checks.filter((c) => c.id !== "email_disposable").map((c) => c.status);
    expect(statuses.every((s) => s === "unavailable")).toBe(true);
  });

  it("skips domain and MX lookups for free email providers", async () => {
    const fetchMock = stubFetch(() => json([]));
    const out = await runFreeChecks({ recruiterEmail: "someone@gmail.com" }, NOW);
    expect(resolveMx).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("rdap.org"))).toBe(false);
    expect(out.checks.map((c) => c.id)).toEqual(["reddit"]);
  });

  it("flags a disposable inbox and does not look up its domain age", async () => {
    resolveMx.mockResolvedValue([{ exchange: "mx.mailinator.com", priority: 1 }]);
    const fetchMock = stubFetch(() => json([]));
    const out = await runFreeChecks({ recruiterEmail: "hr@mailinator.com" }, NOW);
    expect(out.signals.map((s) => s.key)).toEqual(["email_disposable"]);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("rdap.org"))).toBe(false);
  });
});

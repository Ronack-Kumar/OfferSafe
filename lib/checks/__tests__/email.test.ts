import { afterEach, describe, expect, it, vi } from "vitest";

const resolveMx = vi.fn();
vi.mock("node:dns/promises", () => ({
  Resolver: class {
    resolveMx = resolveMx;
  },
}));

const { checkDisposable, checkMx, isDisposableDomain, lookupMx } = await import("../email");

function dnsError(code: string) {
  return Object.assign(new Error(code), { code });
}

afterEach(() => {
  resolveMx.mockReset();
  vi.useRealTimers();
});

describe("disposable inbox check", () => {
  it("flags domains on the bundled list, including subdomains", () => {
    expect(isDisposableDomain("mailinator.com")).toBe(true);
    expect(isDisposableDomain("inbox.mailinator.com")).toBe(true);
    expect(checkDisposable("mailinator.com").status).toBe("flagged");
  });

  it("passes ordinary company domains", () => {
    expect(isDisposableDomain("infosys.com")).toBe(false);
    expect(checkDisposable("infosys.com").status).toBe("passed");
  });

  it("handles bad input without throwing", () => {
    expect(isDisposableDomain("")).toBe(false);
    expect(isDisposableDomain("com")).toBe(false);
  });
});

describe("MX check", () => {
  it("passes a domain with mail servers", async () => {
    resolveMx.mockResolvedValue([{ exchange: "mx1.acme.com", priority: 10 }]);
    const result = await checkMx("acme.com");
    expect(result.status).toBe("passed");
    expect(result.data).toMatchObject({ exchanges: ["mx1.acme.com"] });
  });

  it("flags a domain with no MX records", async () => {
    resolveMx.mockRejectedValue(dnsError("ENODATA"));
    const result = await checkMx("acme-offers.xyz");
    expect(result.status).toBe("flagged");
    expect(result.detail).toContain("cannot receive email");
  });

  it("flags a Null MX (RFC 7505) as unable to receive mail", async () => {
    resolveMx.mockResolvedValue([{ exchange: ".", priority: 0 }]);
    expect((await checkMx("nomail.example")).status).toBe("flagged");
  });

  it("flags a domain that does not exist", async () => {
    resolveMx.mockRejectedValue(dnsError("ENOTFOUND"));
    const result = await checkMx("does-not-exist-zz9.com");
    expect(result.status).toBe("flagged");
    expect(result.detail).toContain("does not exist");
  });

  it("is unavailable on resolver failures, never a red flag", async () => {
    resolveMx.mockRejectedValue(dnsError("ESERVFAIL"));
    expect((await checkMx("acme.com")).status).toBe("unavailable");
    resolveMx.mockRejectedValue(new Error("weird"));
    expect((await checkMx("acme.com")).status).toBe("unavailable");
  });

  it("is unavailable when DNS does not answer within 5s", async () => {
    vi.useFakeTimers();
    const pending = lookupMx("slow.com", { resolveMx: () => new Promise(() => {}) });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toBeNull();
  });
});

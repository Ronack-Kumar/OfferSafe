import { beforeEach, describe, expect, it } from "vitest";
import { checkSpam, clientIp, MIN_FILL_MS, resetSpamGuard, spamMessage, visitorKey } from "../spam-guard";

const limit = { max: 3, windowMs: 60_000 };
const now = 1_000_000_000;

beforeEach(() => resetSpamGuard());

describe("checkSpam", () => {
  it("flags a filled honeypot as a bot", () => {
    expect(checkSpam({ honeypot: "+91 99999", startedAt: now - 10_000, key: "k" }, limit, now)).toEqual({ ok: false, reason: "bot" });
  });

  it("flags forms submitted faster than a person could fill them", () => {
    expect(checkSpam({ honeypot: "", startedAt: now - (MIN_FILL_MS - 1), key: "k" }, limit, now)).toEqual({ ok: false, reason: "too_fast" });
  });

  it("allows normal submissions, including ones without a start time", () => {
    expect(checkSpam({ honeypot: "", startedAt: now - 20_000, key: "k" }, limit, now)).toEqual({ ok: true });
    expect(checkSpam({ honeypot: undefined, startedAt: undefined, key: "k2" }, limit, now)).toEqual({ ok: true });
  });

  it("rate-limits one visitor and recovers after the window", () => {
    for (let i = 0; i < 3; i++) expect(checkSpam({ honeypot: "", startedAt: 0, key: "k" }, limit, now + i).ok).toBe(true);
    const blocked = checkSpam({ honeypot: "", startedAt: 0, key: "k" }, limit, now + 10);
    expect(blocked).toMatchObject({ ok: false, reason: "rate_limited" });
    expect(spamMessage(blocked as Exclude<typeof blocked, { ok: true }>)).toMatch(/try again in about 1 minute/);
    // Another visitor isn't affected.
    expect(checkSpam({ honeypot: "", startedAt: 0, key: "other" }, limit, now + 10).ok).toBe(true);
    // After the window the visitor can submit again.
    expect(checkSpam({ honeypot: "", startedAt: 0, key: "k" }, limit, now + 61_000).ok).toBe(true);
  });
});

describe("visitorKey", () => {
  it("hashes the client IP per form", () => {
    const h = new Headers({ "x-real-ip": "1.2.3.4" });
    expect(visitorKey(h, "contact")).toMatch(/^contact:[0-9a-f]{64}$/);
    expect(visitorKey(h, "contact")).not.toBe(visitorKey(h, "report"));
    expect(visitorKey(h, "contact")).not.toContain("1.2.3.4");
  });

  it("can't be dodged by changing the user agent", () => {
    const a = new Headers({ "x-real-ip": "1.2.3.4", "user-agent": "bot/1" });
    const b = new Headers({ "x-real-ip": "1.2.3.4", "user-agent": "bot/2" });
    expect(visitorKey(a, "contact")).toBe(visitorKey(b, "contact"));
  });

  it("prefers the platform-set IP over a forged x-forwarded-for", () => {
    const forged = new Headers({ "x-forwarded-for": "9.9.9.9, 1.2.3.4", "x-real-ip": "1.2.3.4" });
    expect(clientIp(forged)).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "x-vercel-forwarded-for": "5.6.7.8", "x-real-ip": "1.2.3.4" }))).toBe("5.6.7.8");
    // Without platform headers, use the hop closest to the server, not the client-supplied first one.
    expect(clientIp(new Headers({ "x-forwarded-for": "9.9.9.9, 1.2.3.4" }))).toBe("1.2.3.4");
  });
});

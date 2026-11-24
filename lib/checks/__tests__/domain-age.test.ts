import { afterEach, describe, expect, it, vi } from "vitest";
import { checkDomainAge, registrationDateFromRdap } from "../domain-age";
import { hangingFetch, json, stubFetch } from "./helpers";

const NOW = new Date("2026-11-24T00:00:00Z");

function rdap(registration: string) {
  return { events: [{ eventAction: "registration", eventDate: registration }, { eventAction: "expiration", eventDate: "2030-01-01T00:00:00Z" }] };
}

afterEach(() => vi.useRealTimers());

describe("checkDomainAge", () => {
  it("flags a domain registered less than 6 months ago and shows the date", async () => {
    const fetchMock = stubFetch(() => json(rdap("2026-09-01T10:00:00Z")));
    const result = await checkDomainAge("acme-offers.xyz", NOW);
    expect(result.status).toBe("flagged");
    expect(result.detail).toContain("Domain registered recently");
    expect(result.detail).toContain("2026-09-01");
    expect(result.data).toMatchObject({ registeredAt: "2026-09-01" });
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://rdap.org/domain/acme-offers.xyz");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "follow" });
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>)["User-Agent"]).toMatch(/^OfferSafe\//);
  });

  it("passes an old domain", async () => {
    stubFetch(() => json(rdap("1992-07-17T04:00:00Z")));
    const result = await checkDomainAge("infosys.com", NOW);
    expect(result.status).toBe("passed");
    expect(result.detail).toContain("1992-07-17");
  });

  it("reports a domain with no registration record as info, not a red flag", async () => {
    stubFetch(() => new Response("", { status: 404 }));
    expect((await checkDomainAge("nope-zz9.com", NOW)).status).toBe("info");
  });

  it("is unavailable on server errors", async () => {
    stubFetch(() => new Response("", { status: 503 }));
    expect((await checkDomainAge("acme.com", NOW)).status).toBe("unavailable");
  });

  it("is unavailable when RDAP does not answer within 5s", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", hangingFetch());
    const pending = checkDomainAge("slow.com", NOW);
    await vi.advanceTimersByTimeAsync(5000);
    const result = await pending;
    expect(result.status).toBe("unavailable");
  });

  it("ignores malformed RDAP bodies", async () => {
    expect(registrationDateFromRdap(null)).toBeNull();
    expect(registrationDateFromRdap({ events: "x" })).toBeNull();
    expect(registrationDateFromRdap({ events: [{ eventAction: "registration", eventDate: "garbage" }] })).toBeNull();
    stubFetch(() => json({ events: [] }));
    expect((await checkDomainAge("acme.com", NOW)).status).toBe("info");
  });
});

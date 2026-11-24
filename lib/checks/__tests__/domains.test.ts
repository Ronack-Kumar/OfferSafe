import { describe, expect, it } from "vitest";
import { companyDomainsToCheck, domainFromEmail, hostFromUrl, isFreeProvider, registrableDomain, websiteHostsInText } from "../domains";

describe("domain extraction", () => {
  it("extracts the email domain and rejects bad input", () => {
    expect(domainFromEmail("HR@Mail.Acme.co.in")).toBe("mail.acme.co.in");
    expect(domainFromEmail("not-an-email")).toBeNull();
    expect(domainFromEmail("a@b")).toBeNull();
    expect(domainFromEmail("@acme.com")).toBeNull();
  });

  it("normalizes website URLs", () => {
    expect(hostFromUrl("https://www.Acme.com/careers?x=1")).toBe("acme.com");
    expect(hostFromUrl("acme.io")).toBe("acme.io");
    expect(hostFromUrl("not a url")).toBeNull();
    expect(hostFromUrl("")).toBeNull();
  });

  it("reduces hosts to the registrable domain, including Indian second-level suffixes", () => {
    expect(registrableDomain("careers.acme.com")).toBe("acme.com");
    expect(registrableDomain("mail.acme.co.in")).toBe("acme.co.in");
    expect(registrableDomain("co.in")).toBeNull();
    expect(registrableDomain("localhost")).toBeNull();
  });

  it("recognizes free providers", () => {
    expect(isFreeProvider("gmail.com")).toBe(true);
    expect(isFreeProvider("yahoo.co.in")).toBe(true);
    expect(isFreeProvider("acme.com")).toBe(false);
  });

  it("finds websites in offer text, ignoring social and chat hosts", () => {
    const text = "Apply at https://careers.acme-hiring.in/apply. Join us on https://wa.me/9199999 or www.linkedin.com/company/acme.";
    expect(websiteHostsInText(text)).toEqual(["careers.acme-hiring.in"]);
  });

  it("skips free providers and de-duplicates the domains to check", () => {
    expect(
      companyDomainsToCheck({
        recruiterEmail: "hr@gmail.com",
        website: "www.acme.com",
        text: "Visit https://jobs.acme.com and https://acme-offers.xyz",
      }),
    ).toEqual(["acme.com", "acme-offers.xyz"]);
    expect(companyDomainsToCheck({})).toEqual([]);
  });
});

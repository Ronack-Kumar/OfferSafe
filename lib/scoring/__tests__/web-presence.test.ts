import { describe, expect, it } from "vitest";
import type { CheckResult } from "../../checks/types";
import { emailDomainStanding } from "../web-presence";

function checks({ ageDays, mx = "passed", disposable = "passed" }: { ageDays?: number; mx?: CheckResult["status"]; disposable?: CheckResult["status"] }): CheckResult[] {
  return [
    { id: "email_disposable", target: "infosys.com", status: disposable, detail: "" },
    { id: "email_mx", target: "infosys.com", status: mx, detail: "" },
    ...(ageDays === undefined
      ? []
      : [{ id: "domain_age" as const, target: "infosys.com", status: "passed" as const, detail: "", data: { ageDays, registeredAt: "1992-03-17" } }]),
  ];
}

describe("emailDomainStanding", () => {
  it("accepts a company domain over 2 years old that receives mail", () => {
    expect(emailDomainStanding("infosys.com", checks({ ageDays: 12000 }))).toMatchObject({ established: true, domain: "infosys.com" });
  });

  it("rejects free providers", () => {
    expect(emailDomainStanding("gmail.com", [])).toMatchObject({ established: false, why: expect.stringContaining("free email provider") });
  });

  it("rejects a domain younger than 2 years", () => {
    expect(emailDomainStanding("infosys.com", checks({ ageDays: 400 }))).toMatchObject({
      established: false,
      why: expect.stringContaining("less than 2 years ago"),
    });
  });

  it("rejects a domain without mail servers", () => {
    expect(emailDomainStanding("infosys.com", checks({ ageDays: 12000, mx: "flagged" }))).toMatchObject({
      established: false,
      why: expect.stringContaining("no mail servers"),
    });
  });

  it("rejects a domain whose MX or age couldn't be checked", () => {
    expect(emailDomainStanding("infosys.com", checks({ ageDays: 12000, mx: "unavailable" })).established).toBe(false);
    expect(emailDomainStanding("infosys.com", checks({})).established).toBe(false);
  });

  it("rejects disposable domains", () => {
    expect(emailDomainStanding("infosys.com", checks({ ageDays: 12000, disposable: "flagged" })).established).toBe(false);
  });

  it("checks the age of the registrable domain for subdomains", () => {
    const list: CheckResult[] = [
      { id: "email_mx", target: "careers.infosys.com", status: "passed", detail: "" },
      { id: "domain_age", target: "infosys.com", status: "passed", detail: "", data: { ageDays: 12000, registeredAt: "1992-03-17" } },
    ];
    expect(emailDomainStanding("careers.infosys.com", list).established).toBe(true);
  });
});

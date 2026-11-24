import { isFreeProvider, registrableDomain } from "../checks/domains";
import type { CheckResult } from "../checks/types";

/** A company email domain at least this old counts as the company's web presence. */
export const ESTABLISHED_DOMAIN_MIN_DAYS = 2 * 365;

export type EmailDomainStanding =
  | { established: true; domain: string; registeredAt: string; ageDays: number }
  | { established: false; domain: string | null; why: string };

/**
 * Decides whether the recruiter's email domain is an established company domain:
 * not a free provider, not disposable, registered over 2 years ago (RDAP), and able
 * to receive mail (MX records). Uses the results the free checks already produced.
 */
export function emailDomainStanding(emailDomain: string | null, checks: CheckResult[]): EmailDomainStanding {
  if (!emailDomain) return { established: false, domain: null, why: "no recruiter email was given" };
  if (isFreeProvider(emailDomain)) {
    return { established: false, domain: emailDomain, why: `${emailDomain} is a free email provider anyone can sign up to` };
  }

  const registrable = registrableDomain(emailDomain) ?? emailDomain;
  const disposable = checks.find((c) => c.id === "email_disposable" && c.target === emailDomain);
  if (disposable?.status === "flagged") {
    return { established: false, domain: emailDomain, why: `${emailDomain} is a disposable (throwaway) email service` };
  }

  const mx = checks.find((c) => c.id === "email_mx" && c.target === emailDomain);
  if (mx?.status !== "passed") {
    return {
      established: false,
      domain: emailDomain,
      why: mx?.status === "flagged" ? `${emailDomain} has no mail servers` : `we couldn't confirm that ${emailDomain} has mail servers`,
    };
  }

  const age = checks.find((c) => c.id === "domain_age" && c.target === registrable);
  const ageDays = typeof age?.data?.ageDays === "number" ? age.data.ageDays : null;
  const registeredAt = typeof age?.data?.registeredAt === "string" ? age.data.registeredAt : null;
  if (ageDays === null || registeredAt === null) {
    return { established: false, domain: emailDomain, why: `we couldn't confirm when ${registrable} was registered` };
  }
  if (ageDays < ESTABLISHED_DOMAIN_MIN_DAYS) {
    return { established: false, domain: emailDomain, why: `${registrable} was only registered on ${registeredAt}, less than 2 years ago` };
  }
  return { established: true, domain: registrable, registeredAt, ageDays };
}

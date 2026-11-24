import { Resolver } from "node:dns/promises";
import disposableList from "./data/disposable-domains.json";
import { cached, DAY_MS } from "./cache";
import { EXTERNAL_TIMEOUT_MS, withTimeout } from "./http";
import { registrableDomain } from "./domains";
import type { CheckResult } from "./types";

const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set(disposableList.domains);

/** True if the domain or any parent domain is on the bundled disposable-inbox list. */
export function isDisposableDomain(domain: string): boolean {
  const labels = domain.toLowerCase().split(".");
  for (let i = 0; i < labels.length - 1; i += 1) {
    if (DISPOSABLE_DOMAINS.has(labels.slice(i).join("."))) return true;
  }
  return false;
}

export function checkDisposable(domain: string): CheckResult {
  if (isDisposableDomain(domain)) {
    return {
      id: "email_disposable",
      target: domain,
      status: "flagged",
      detail: `${domain} is a known disposable (throwaway) inbox provider.`,
    };
  }
  return { id: "email_disposable", target: domain, status: "passed", detail: `${domain} is not on the disposable inbox list.` };
}

type MxLookup = { hasMx: boolean; exchanges: string[]; reason?: "no_records" | "no_domain" };

/** DNS error codes that mean "definitely no MX", as opposed to a resolver failure. */
const NO_MX_CODES = new Set(["ENODATA", "ENOTFOUND"]);

/** null = DNS unavailable (timeout / server failure). */
export async function lookupMx(domain: string, resolver: Pick<Resolver, "resolveMx"> = new Resolver({ timeout: EXTERNAL_TIMEOUT_MS, tries: 1 })): Promise<MxLookup | null> {
  try {
    const records = await withTimeout(resolver.resolveMx(domain), EXTERNAL_TIMEOUT_MS, `MX ${domain}`);
    // A single "." exchange is a Null MX (RFC 7505): the domain explicitly accepts no mail.
    const exchanges = records.map((r) => r.exchange).filter((x) => x && x !== ".");
    return exchanges.length > 0 ? { hasMx: true, exchanges } : { hasMx: false, exchanges: [], reason: "no_records" };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code && NO_MX_CODES.has(code)) {
      return { hasMx: false, exchanges: [], reason: code === "ENOTFOUND" ? "no_domain" : "no_records" };
    }
    return null;
  }
}

export async function checkMx(emailDomain: string): Promise<CheckResult> {
  const domain = emailDomain.toLowerCase();
  const lookup = await cached(`mx:${domain}`, 7 * DAY_MS, () => lookupMx(domain));

  if (lookup === null) {
    return { id: "email_mx", target: domain, status: "unavailable", detail: `Mail server check unavailable for ${domain}.` };
  }
  if (!lookup.hasMx) {
    const why = lookup.reason === "no_domain" ? "does not exist in DNS" : "has no mail (MX) records";
    return {
      id: "email_mx",
      target: domain,
      status: "flagged",
      detail: `Recruiter email domain ${domain} ${why}, so it cannot receive email.`,
    };
  }
  return {
    id: "email_mx",
    target: domain,
    status: "passed",
    detail: `${domain} has mail servers configured.`,
    data: { exchanges: lookup.exchanges.slice(0, 3), registrable: registrableDomain(domain) },
  };
}

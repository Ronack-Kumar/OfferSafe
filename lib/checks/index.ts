import { checkDomainAge } from "./domain-age";
import { companyDomainsToCheck, domainFromEmail, isFreeProvider } from "./domains";
import { checkDisposable, checkMx, isDisposableDomain } from "./email";
import { withTimeout } from "./http";
import { checkCin } from "./mca";
import { checkReddit, type RedditMentionsPayload } from "./reddit";
import type { CheckId, CheckResult, FreeCheckSignal } from "./types";

export type { CheckResult, CheckStatus, FreeCheckSignal, FreeCheckSignalKey } from "./types";
export type { RedditMentionsPayload } from "./reddit";

export type FreeCheckInput = {
  recruiterEmail?: string;
  website?: string;
  /** Offer, payment and extracted text, searched for websites. */
  text?: string;
  companyName?: string;
  cin?: string;
};

export type FreeCheckOutput = {
  checks: CheckResult[];
  signals: FreeCheckSignal[];
  reddit: RedditMentionsPayload;
};

/**
 * Hard ceiling per check. Each external call already has a 5s timeout; this also
 * covers the cache round-trips around it, so a slow check can never hold up the report.
 */
const CHECK_DEADLINE_MS = 9000;

async function safe(id: CheckId, target: string | null, run: () => Promise<CheckResult>): Promise<CheckResult> {
  try {
    return await withTimeout(run(), CHECK_DEADLINE_MS, id);
  } catch {
    return { id, target, status: "unavailable", detail: "Check unavailable." };
  }
}

function signalFor(check: CheckResult): FreeCheckSignal | null {
  if (check.status !== "flagged") return null;
  switch (check.id) {
    case "domain_age":
      return { key: "domain_age_new", reason: check.detail };
    case "email_disposable":
      return { key: "email_disposable", reason: check.detail };
    case "email_mx":
      return { key: "email_no_mx", reason: check.detail };
    case "mca_registry": {
      const reason = check.data?.reason;
      if (reason === "invalid_format") return { key: "cin_invalid_format", reason: check.detail };
      if (reason === "not_found") return { key: "cin_not_found", reason: check.detail };
      if (reason === "not_active") return { key: "company_not_active", reason: check.detail };
      return null;
    }
    default:
      // Reddit is scored by the analyzer's existing reddit_mentions rules.
      return null;
  }
}

/** Runs every free check in parallel. Never throws; unreachable sources are "unavailable". */
export async function runFreeChecks(input: FreeCheckInput, now: Date = new Date()): Promise<FreeCheckOutput> {
  const emailDomain = input.recruiterEmail ? domainFromEmail(input.recruiterEmail) : null;
  const companyEmailDomain = emailDomain && !isFreeProvider(emailDomain) ? emailDomain : null;
  const disposable = companyEmailDomain ? isDisposableDomain(companyEmailDomain) : false;

  const ageDomains = companyDomainsToCheck({
    recruiterEmail: disposable ? undefined : input.recruiterEmail,
    website: input.website,
    text: input.text,
  });

  const cin = input.cin?.trim();
  const companyName = input.companyName?.trim() ?? "";

  const tasks: Array<Promise<CheckResult>> = [
    ...ageDomains.map((domain) => safe("domain_age", domain, () => checkDomainAge(domain, now))),
  ];
  if (companyEmailDomain) {
    tasks.push(Promise.resolve(checkDisposable(companyEmailDomain)));
    tasks.push(safe("email_mx", companyEmailDomain, () => checkMx(companyEmailDomain)));
  }
  // Registry lookups are by CIN/LLPIN only (the slim table has no names).
  if (cin) {
    tasks.push(safe("mca_registry", cin, () => checkCin(cin)));
  }

  const redditTask = withTimeout(checkReddit(companyName, input.recruiterEmail ?? ""), CHECK_DEADLINE_MS, "reddit").catch(() => ({
    check: { id: "reddit", target: companyName || null, status: "unavailable", detail: "Reddit check unavailable." } as CheckResult,
    mentions: { posts: [], comments: {} } as RedditMentionsPayload,
  }));

  const [checks, reddit] = await Promise.all([Promise.all(tasks), redditTask]);
  const all = [...checks, reddit.check];
  const signals = all.map(signalFor).filter((s): s is FreeCheckSignal => s !== null);

  return { checks: all, signals, reddit: reddit.mentions };
}

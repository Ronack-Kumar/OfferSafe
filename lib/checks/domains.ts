/** Free consumer mail providers. Their domains are never checked for age or MX. */
export const FREE_PROVIDER_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "yahoo.in",
  "ymail.com",
  "rocketmail.com",
  "outlook.com",
  "outlook.in",
  "hotmail.com",
  "live.com",
  "live.in",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "pm.me",
  "zoho.com",
  "zohomail.in",
  "yandex.com",
  "yandex.ru",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "rediffmail.com",
  "tutanota.com",
]);

/**
 * Hosts that commonly appear in offers but say nothing about the company's own domain
 * (social, chat, form and file hosts).
 */
const NON_COMPANY_HOSTS = new Set([
  "linkedin.com",
  "wa.me",
  "whatsapp.com",
  "t.me",
  "telegram.me",
  "instagram.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "google.com",
  "forms.gle",
  "docs.google.com",
  "drive.google.com",
  "bit.ly",
  "tinyurl.com",
  "naukri.com",
  "internshala.com",
  "indeed.com",
]);

/** Second-level public suffixes common in Indian/Commonwealth offers (no PSL dependency). */
const TWO_LEVEL_SUFFIXES = new Set([
  "co.in", "net.in", "org.in", "firm.in", "gen.in", "ind.in", "ac.in", "edu.in", "res.in", "gov.in", "nic.in",
  "co.uk", "org.uk", "ac.uk", "com.au", "net.au", "org.au", "co.nz", "com.sg", "com.my", "co.za",
  "com.br", "com.cn", "co.jp", "com.hk", "co.ae", "com.sa",
]);

const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function isValidHostname(value: string): boolean {
  return HOSTNAME_RE.test(value);
}

/** "HR@Mail.Acme.co.in" -> "mail.acme.co.in" */
export function domainFromEmail(email: string): string | null {
  const value = email.trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0) return null;
  const domain = value.slice(at + 1).replace(/\.$/, "");
  return isValidHostname(domain) ? domain : null;
}

/** "https://www.acme.com/careers" or "acme.com" -> "acme.com" */
export function hostFromUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const host = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/\.$/, "");
    return isValidHostname(host) ? host : null;
  } catch {
    return null;
  }
}

/** "mail.acme.co.in" -> "acme.co.in"; the level RDAP registries answer for. */
export function registrableDomain(host: string): string | null {
  const labels = host.toLowerCase().split(".").filter(Boolean);
  if (labels.length < 2) return null;
  const lastTwo = labels.slice(-2).join(".");
  if (TWO_LEVEL_SUFFIXES.has(lastTwo)) {
    return labels.length >= 3 ? labels.slice(-3).join(".") : null;
  }
  return lastTwo;
}

export function isFreeProvider(domain: string): boolean {
  const registrable = registrableDomain(domain) ?? domain;
  return FREE_PROVIDER_DOMAINS.has(domain) || FREE_PROVIDER_DOMAINS.has(registrable);
}

function isNonCompanyHost(host: string): boolean {
  const registrable = registrableDomain(host) ?? host;
  return NON_COMPANY_HOSTS.has(host) || NON_COMPANY_HOSTS.has(registrable);
}

/** Website hosts mentioned in free text (http(s) URLs and bare www. hosts). */
export function websiteHostsInText(text: string): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(/\b(?:https?:\/\/|www\.)[^\s<>"'()]+/gi)) {
    const host = hostFromUrl(match[0].replace(/[.,;:!?]+$/, ""));
    if (host && !isNonCompanyHost(host)) out.add(host);
  }
  return [...out];
}

/**
 * Registrable company domains to verify: recruiter email domain first, then the
 * website field, then websites found in the offer text. Free providers and
 * social/chat hosts are excluded. Capped to keep external calls bounded.
 */
export function companyDomainsToCheck(input: { recruiterEmail?: string; website?: string; text?: string }, max = 3): string[] {
  const hosts = [
    input.recruiterEmail ? domainFromEmail(input.recruiterEmail) : null,
    input.website ? hostFromUrl(input.website) : null,
    ...websiteHostsInText(input.text ?? ""),
  ];
  const out: string[] = [];
  for (const host of hosts) {
    if (!host || isFreeProvider(host) || isNonCompanyHost(host)) continue;
    const domain = registrableDomain(host);
    if (domain && !out.includes(domain)) out.push(domain);
  }
  return out.slice(0, max);
}

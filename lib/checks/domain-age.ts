import { cached, DAY_MS } from "./cache";
import { fetchWithTimeout, OFFERSAFE_USER_AGENT } from "./http";
import type { CheckResult } from "./types";

/** Domains younger than this are flagged. */
export const RECENT_DOMAIN_MONTHS = 6;

type RdapLookup = { found: true; registeredAt: string | null } | { found: false };

type RdapEvent = { eventAction?: unknown; eventDate?: unknown };

/** Reads the "registration" event date from an RDAP domain response. */
export function registrationDateFromRdap(body: unknown): string | null {
  const events = (body as { events?: unknown })?.events;
  if (!Array.isArray(events)) return null;
  const registration = (events as RdapEvent[]).find(
    (e) => typeof e?.eventAction === "string" && e.eventAction.toLowerCase() === "registration",
  );
  const date = typeof registration?.eventDate === "string" ? registration.eventDate : null;
  return date && !Number.isNaN(Date.parse(date)) ? date : null;
}

/** RDAP lookup via the rdap.org bootstrap (it redirects to the right registry). null = unavailable. */
export async function lookupRdap(domain: string): Promise<RdapLookup | null> {
  try {
    const res = await fetchWithTimeout(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      redirect: "follow",
      headers: { Accept: "application/rdap+json, application/json", "User-Agent": OFFERSAFE_USER_AGENT },
    });
    if (res.status === 404) return { found: false };
    if (!res.ok) return null;
    return { found: true, registeredAt: registrationDateFromRdap(await res.json()) };
  } catch {
    return null;
  }
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (DAY_MS * 30.44);
}

function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export async function checkDomainAge(domain: string, now: Date = new Date()): Promise<CheckResult> {
  // The registration date never changes, so it can be cached for the full 30 days;
  // the age itself is always computed against `now`.
  const lookup = await cached(`rdap:${domain}`, 30 * DAY_MS, () => lookupRdap(domain));

  if (lookup === null) {
    return { id: "domain_age", target: domain, status: "unavailable", detail: `Domain age check unavailable for ${domain}.` };
  }
  if (!lookup.found) {
    return {
      id: "domain_age",
      target: domain,
      status: "info",
      detail: `No public registration record was found for ${domain}.`,
    };
  }
  if (!lookup.registeredAt) {
    return {
      id: "domain_age",
      target: domain,
      status: "info",
      detail: `The registry for ${domain} does not publish a registration date.`,
    };
  }

  const registered = formatDate(lookup.registeredAt);
  const ageMonths = monthsBetween(new Date(lookup.registeredAt), now);
  const data = { registeredAt: registered, ageDays: Math.max(0, Math.floor((now.getTime() - Date.parse(lookup.registeredAt)) / DAY_MS)) };

  if (ageMonths < RECENT_DOMAIN_MONTHS) {
    return {
      id: "domain_age",
      target: domain,
      status: "flagged",
      detail: `Domain registered recently: ${domain} was registered on ${registered} (less than ${RECENT_DOMAIN_MONTHS} months ago).`,
      data,
    };
  }
  return { id: "domain_age", target: domain, status: "passed", detail: `${domain} was registered on ${registered}.`, data };
}

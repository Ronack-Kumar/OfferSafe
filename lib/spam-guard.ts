import { createHash } from "node:crypto";

/**
 * Lightweight spam protection for the public forms (Contact, Report a scam), with no
 * extra services:
 *  - a honeypot field that people never see or fill in, but bots usually do;
 *  - a minimum time between opening the form and submitting it;
 *  - a per-visitor rate limit (IP + user agent, hashed).
 *
 * The rate limit lives in server memory, so on Vercel it applies per running instance.
 * It stops bursts from one visitor; it is not a hard global quota.
 */

export { HONEYPOT_FIELD, STARTED_AT_FIELD } from "./spam-fields";
export const MIN_FILL_MS = 3000;

export type GuardResult = { ok: true } | { ok: false; reason: "bot" | "too_fast" | "rate_limited"; retryAfterSeconds?: number };

type Window = { hits: number[]; windowMs: number };
const windows = new Map<string, Window>();

/** Test hook. */
export function resetSpamGuard(): void {
  windows.clear();
}

/**
 * The visitor's IP as set by the hosting platform. On Vercel, x-real-ip and
 * x-vercel-forwarded-for are written by the edge (client values are overwritten), so
 * they're preferred over the leftmost x-forwarded-for entry, which a client can forge
 * where no proxy rewrites it. The user agent is deliberately not part of the key: it's
 * client-controlled and would let a bot dodge the limit by rotating it.
 */
export function clientIp(headers: Headers): string {
  const vercel = headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  const real = headers.get("x-real-ip")?.trim();
  const xff = headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  return vercel || real || xff?.[xff.length - 1] || "unknown";
}

export function visitorKey(headers: Headers, scope: string): string {
  return `${scope}:${createHash("sha256").update(clientIp(headers)).digest("hex")}`;
}

export function checkSpam(
  input: { honeypot: unknown; startedAt: unknown; key: string },
  limit: { max: number; windowMs: number },
  now = Date.now(),
): GuardResult {
  if (typeof input.honeypot === "string" && input.honeypot.trim() !== "") return { ok: false, reason: "bot" };

  const started = Number(input.startedAt);
  if (Number.isFinite(started) && started > 0 && now - started < MIN_FILL_MS) return { ok: false, reason: "too_fast" };

  const w = windows.get(input.key) ?? { hits: [], windowMs: limit.windowMs };
  w.windowMs = limit.windowMs;
  w.hits = w.hits.filter((t) => now - t < limit.windowMs);
  if (w.hits.length >= limit.max) {
    const retryAfterSeconds = Math.ceil((limit.windowMs - (now - w.hits[0])) / 1000);
    windows.set(input.key, w);
    return { ok: false, reason: "rate_limited", retryAfterSeconds };
  }
  w.hits.push(now);
  windows.set(input.key, w);

  // Keep memory bounded on long-lived instances.
  if (windows.size > 5000) {
    windows.forEach((v, k) => {
      // Each entry is cleaned with its own window, so a short-window form can't
      // evict a long-window form's history early.
      if (!v.hits.some((t) => now - t < v.windowMs)) windows.delete(k);
    });
  }
  return { ok: true };
}

export function spamMessage(result: Exclude<GuardResult, { ok: true }>): string {
  if (result.reason === "rate_limited") {
    const minutes = Math.max(1, Math.ceil((result.retryAfterSeconds ?? 60) / 60));
    return `You've sent several messages in a short time. Please try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }
  return "That was a little too quick. Please check your details and submit again.";
}

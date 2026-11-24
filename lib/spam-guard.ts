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

type Window = { hits: number[] };
const windows = new Map<string, Window>();

/** Test hook. */
export function resetSpamGuard(): void {
  windows.clear();
}

export function visitorKey(headers: Headers, scope: string): string {
  const ip = (headers.get("x-forwarded-for") || "").split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
  const ua = headers.get("user-agent") || "unknown";
  return `${scope}:${createHash("sha256").update(`${ip}|${ua}`).digest("hex")}`;
}

export function checkSpam(
  input: { honeypot: unknown; startedAt: unknown; key: string },
  limit: { max: number; windowMs: number },
  now = Date.now(),
): GuardResult {
  if (typeof input.honeypot === "string" && input.honeypot.trim() !== "") return { ok: false, reason: "bot" };

  const started = Number(input.startedAt);
  if (Number.isFinite(started) && started > 0 && now - started < MIN_FILL_MS) return { ok: false, reason: "too_fast" };

  const w = windows.get(input.key) ?? { hits: [] };
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
    for (const [k, v] of windows) {
      if (!v.hits.some((t) => now - t < limit.windowMs)) windows.delete(k);
    }
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

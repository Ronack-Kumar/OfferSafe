export const EXTERNAL_TIMEOUT_MS = 5000;

/** Descriptive client id. rdap.org rejects Node's default "node" User-Agent with a 403. */
export const OFFERSAFE_USER_AGENT = "OfferSafe/1.0 (+https://offer-safe.vercel.app; job-offer scam checker)";

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/** fetch() that aborts after `ms` (default 5s) and never uses the Next.js data cache. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms: number = EXTERNAL_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } catch (error) {
    if (controller.signal.aborted) throw new TimeoutError(url, ms);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Rejects with TimeoutError if `promise` does not settle within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

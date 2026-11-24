import { unstable_cache } from "next/cache";

/**
 * Lookup cache for RDAP, MX and Reddit results, backed by the Next.js Data Cache
 * (`unstable_cache`). On Vercel this is shared across instances, lives only on the
 * server, needs no database key, and cannot be read or written from a browser, so
 * results can't be leaked or poisoned. Entries expire on their own after `ttlMs`.
 */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Thrown inside the cached function so an unavailable lookup is never cached. */
class LookupUnavailable extends Error {}

/**
 * Returns the cached value for `key`, or runs `load` and caches its result.
 * `load` returns `null` when the lookup was unavailable; that is never cached.
 * If the Data Cache itself isn't available (tests, scripts), `load` runs uncached.
 */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T | null>): Promise<T | null> {
  let loaded: { value: T } | undefined;
  const run = unstable_cache(
    async () => {
      const value = await load();
      if (value === null) throw new LookupUnavailable(key);
      loaded = { value };
      return value;
    },
    ["offersafe-lookup", key],
    { revalidate: Math.max(60, Math.floor(ttlMs / 1000)), tags: ["offersafe-lookup"] },
  );

  try {
    return await run();
  } catch (error) {
    if (loaded) return loaded.value; // looked up fine, only caching failed
    if (error instanceof LookupUnavailable) return null;
    // The cache layer failed before running the lookup: run it directly.
    try {
      return await load();
    } catch {
      return null;
    }
  }
}

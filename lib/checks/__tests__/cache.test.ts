import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();
const unstableCache = vi.fn(
  (fn: () => Promise<unknown>, keyParts: string[], _opts?: { revalidate?: number }) =>
    async () => {
      const k = keyParts.join("|");
      if (store.has(k)) return store.get(k);
      const value = await fn(); // a throw propagates and nothing is stored
      store.set(k, value);
      return value;
    },
);
vi.mock("next/cache", () => ({ unstable_cache: unstableCache }));

const { cached, DAY_MS } = await import("../cache");

beforeEach(() => {
  store.clear();
  unstableCache.mockClear();
});

describe("cached (Next.js Data Cache)", () => {
  it("returns a cache hit without running the lookup again", async () => {
    const load = vi.fn(async () => ({ found: true }));
    expect(await cached("rdap:acme.com", 30 * DAY_MS, load)).toEqual({ found: true });
    expect(await cached("rdap:acme.com", 30 * DAY_MS, load)).toEqual({ found: true });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("passes the TTL in seconds and keys entries by lookup key", async () => {
    await cached("mx:acme.com", 7 * DAY_MS, async () => ({ hasMx: true }));
    const [, keyParts, opts] = unstableCache.mock.calls[0];
    expect(keyParts).toEqual(["offersafe-lookup", "mx:acme.com"]);
    expect(opts).toMatchObject({ revalidate: 7 * 24 * 60 * 60 });
  });

  it("never caches an unavailable (null) result", async () => {
    const load = vi.fn(async () => null);
    expect(await cached("rdap:slow.com", DAY_MS, load)).toBeNull();
    expect(await cached("rdap:slow.com", DAY_MS, load)).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
    expect(store.size).toBe(0);
  });

  it("still answers when the cache layer itself fails", async () => {
    unstableCache.mockImplementationOnce(() => async () => {
      throw new Error("Invariant: incrementalCache missing");
    });
    expect(await cached("k", DAY_MS, async () => 2)).toBe(2);
  });

  it("returns the looked-up value if storing it fails", async () => {
    unstableCache.mockImplementationOnce((fn: () => Promise<unknown>) => async () => {
      await fn();
      throw new Error("cache write failed");
    });
    const load = vi.fn(async () => 3);
    expect(await cached("k2", DAY_MS, load)).toBe(3);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("returns null if the lookup throws", async () => {
    expect(
      await cached("k3", DAY_MS, async () => {
        throw new TypeError("network down");
      }),
    ).toBeNull();
  });
});

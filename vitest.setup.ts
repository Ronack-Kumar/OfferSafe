import { vi } from "vitest";

// Outside a Next.js server there is no Data Cache: make unstable_cache a pass-through.
// cache.test.ts overrides this with an in-memory fake to test caching itself.
vi.mock("next/cache", () => ({
  unstable_cache:
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    (...args: A) =>
      fn(...args),
}));

import { vi } from "vitest";

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

/** A fetch that never answers on its own and rejects once its AbortSignal fires (timeout). */
export function hangingFetch() {
  return vi.fn((_url: string, init?: RequestInit) =>
    new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }),
  );
}

/** Stubs global fetch with a router: (url, init) => Response. */
export function stubFetch(route: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const mock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => route(String(input), init));
  vi.stubGlobal("fetch", mock);
  return mock;
}

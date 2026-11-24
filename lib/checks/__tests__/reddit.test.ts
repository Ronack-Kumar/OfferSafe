import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkReddit, isClearScamReport, resetRedditState } from "../reddit";
import { hangingFetch, json, stubFetch } from "./helpers";

function post(id: string, title: string, selftext = "") {
  return { kind: "t3", data: { id, title, selftext, subreddit: "developersIndia", score: 12, permalink: `/r/developersIndia/comments/${id}/x/`, url: "", created_utc: 1 } };
}

function redditApi(searchChildren: unknown[], comments: unknown[] = []) {
  return stubFetch((url) => {
    if (url.endsWith("/api/v1/access_token")) return json({ access_token: "tok", expires_in: 3600 });
    if (url.includes("/search?")) return json({ data: { children: searchChildren } });
    if (url.includes("/comments/")) return json([{}, { data: { children: comments } }]);
    return new Response("", { status: 404 });
  });
}

beforeEach(() => {
  resetRedditState();
  vi.stubEnv("REDDIT_CLIENT_ID", "id");
  vi.stubEnv("REDDIT_CLIENT_SECRET", "secret");
  vi.stubEnv("REDDIT_USER_AGENT", "web:offersafe-test:v1.0 (by /u/tester)");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
});
afterEach(() => vi.useRealTimers());

describe("isClearScamReport", () => {
  it("needs both the company and explicit scam language", () => {
    expect(isClearScamReport("Acme Hiring is a scam, they asked for a fee", ["Acme Hiring"])).toBe(true);
    expect(isClearScamReport("Interview experience at Acme Hiring", ["Acme Hiring"])).toBe(false);
    expect(isClearScamReport("Another scam company", ["Acme Hiring"])).toBe(false);
  });
});

describe("checkReddit", () => {
  it("is unavailable (and makes no request) when credentials are missing", async () => {
    vi.stubEnv("REDDIT_CLIENT_SECRET", "");
    const fetchMock = stubFetch(() => json({}));
    const { check, mentions } = await checkReddit("Acme Hiring", "hr@acme.com");
    expect(check.status).toBe("unavailable");
    expect(mentions.posts).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips when there is nothing to search for", async () => {
    expect((await checkReddit("", "")).check.status).toBe("skipped");
  });

  it("flags clear scam reports and keeps only those posts", async () => {
    const fetchMock = redditApi(
      [
        post("a1", "Acme Hiring scam - asked me to pay a training fee"),
        post("a2", "PSA: Acme Hiring is fraud", "They took a deposit"),
        post("a3", "Acme Hiring interview experience"),
      ],
      [{ kind: "t1", data: { id: "c1", author: "u1", body: "Same, they scammed me too", score: 5, created_utc: 1 } }],
    );
    const { check, mentions } = await checkReddit("Acme Hiring", "hr@acme.com");
    expect(check.status).toBe("flagged");
    expect(mentions.posts.map((p) => p.id).sort()).toEqual(["a1", "a2"]);
    expect(mentions.comments.a1?.[0]?.id).toBe("c1");

    const tokenCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/access_token"));
    const headers = tokenCall?.[1]?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toContain("offersafe");
    expect(headers.Authorization).toMatch(/^Basic /);
  });

  it("passes when nothing clearly reports a scam", async () => {
    redditApi([post("b1", "Acme Hiring salary for freshers?")]);
    const { check, mentions } = await checkReddit("Acme Hiring", "");
    expect(check.status).toBe("passed");
    expect(mentions.posts).toEqual([]);
  });

  it("backs off after a 429 instead of retrying immediately", async () => {
    const fetchMock = stubFetch((url) => {
      if (url.endsWith("/access_token")) return json({ access_token: "tok", expires_in: 3600 });
      return new Response("", { status: 429, headers: { "x-ratelimit-reset": "120" } });
    });
    expect((await checkReddit("Acme Hiring", "")).check.status).toBe("unavailable");
    const callsAfterFirst = fetchMock.mock.calls.length;

    expect((await checkReddit("Other Co", "")).check.status).toBe("unavailable");
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it("is unavailable when Reddit does not answer within 5s", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", hangingFetch());
    const pending = checkReddit("Acme Hiring", "");
    await vi.advanceTimersByTimeAsync(5000);
    expect((await pending).check.status).toBe("unavailable");
  });

  it("is unavailable when the token request is rejected", async () => {
    stubFetch(() => new Response("", { status: 401 }));
    expect((await checkReddit("Acme Hiring", "")).check.status).toBe("unavailable");
  });
});

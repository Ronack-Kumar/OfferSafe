import { cached, DAY_MS } from "./cache";
import { fetchWithTimeout } from "./http";
import type { CheckResult } from "./types";

/**
 * Reddit search via OAuth app-only (client_credentials) tokens.
 *
 * Optional: needs REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET and REDDIT_USER_AGENT.
 * Missing config, auth failures, 429s and timeouts all yield an "unavailable" check;
 * this module never throws to its caller.
 */
export const REDDIT_SUBREDDITS = ["developersIndia", "Indian_Academia", "IndiaCareers", "scams"];

/** Stay well under Reddit's 100 requests/minute limit for OAuth clients. */
export const REDDIT_MAX_REQUESTS_PER_MINUTE = 90;

/** Terms that make a post or comment a clear scam report, not just a mention. */
const CLEAR_SCAM_TERMS = /\b(scam|scams|scammed|scammer|scammers|fraud|fraudulent|fake (?:offer|job|internship|company|recruiter)|cheated|ponzi|extort(?:ed|ion)?)\b/i;

export type RedditPost = {
  id: string;
  title: string;
  subreddit: string;
  score: number;
  permalink: string;
  url: string;
  created_utc: number;
};

export type RedditComment = { id: string; author: string; body: string; score: number; created_utc: number };

/** Same shape the analyzer already stores in cases.reddit_mentions_json. */
export type RedditMentionsPayload = { posts: RedditPost[]; comments: Record<string, RedditComment[]> };

type RedditConfig = { clientId: string; clientSecret: string; userAgent: string };

export function redditConfig(env: NodeJS.ProcessEnv = process.env): RedditConfig | null {
  const clientId = env.REDDIT_CLIENT_ID?.trim();
  const clientSecret = env.REDDIT_CLIENT_SECRET?.trim();
  const userAgent = env.REDDIT_USER_AGENT?.trim();
  return clientId && clientSecret && userAgent ? { clientId, clientSecret, userAgent } : null;
}

// ---- Module-level state (per server instance) -------------------------------------

let token: { value: string; expiresAt: number } | null = null;
let backoffUntil = 0;
const requestLog: number[] = [];

/** Test hook. */
export function resetRedditState(): void {
  token = null;
  backoffUntil = 0;
  requestLog.length = 0;
}

/** Sliding-window limiter: returns false instead of waiting, so the report is never blocked. */
function takeRequestSlot(now: number): boolean {
  while (requestLog.length > 0 && now - requestLog[0] >= 60_000) requestLog.shift();
  if (requestLog.length >= REDDIT_MAX_REQUESTS_PER_MINUTE) return false;
  requestLog.push(now);
  return true;
}

class RedditUnavailable extends Error {}

function noteRateLimit(res: Response, now: number): void {
  // Reddit sends x-ratelimit-reset (seconds); fall back to Retry-After, then 60s.
  const seconds = Number(res.headers.get("x-ratelimit-reset") ?? res.headers.get("retry-after") ?? 60);
  backoffUntil = now + (Number.isFinite(seconds) && seconds > 0 ? seconds : 60) * 1000;
}

async function redditFetch(url: string, init: RequestInit, cfg: RedditConfig): Promise<Response> {
  const now = Date.now();
  if (now < backoffUntil || !takeRequestSlot(now)) throw new RedditUnavailable("rate limited");
  const res = await fetchWithTimeout(url, {
    ...init,
    headers: { "User-Agent": cfg.userAgent, ...(init.headers as Record<string, string> | undefined) },
  });
  if (res.status === 429) {
    noteRateLimit(res, now);
    throw new RedditUnavailable("429");
  }
  const remainingHeader = res.headers.get("x-ratelimit-remaining");
  if (remainingHeader !== null && Number(remainingHeader) < 1) noteRateLimit(res, now);
  return res;
}

async function getToken(cfg: RedditConfig): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const res = await redditFetch(
    "https://www.reddit.com/api/v1/access_token",
    {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    },
    cfg,
  );
  if (!res.ok) throw new RedditUnavailable(`token HTTP ${res.status}`);
  const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string") throw new RedditUnavailable("no token");
  const ttl = typeof body.expires_in === "number" ? body.expires_in : 3600;
  token = { value: body.access_token, expiresAt: Date.now() + ttl * 1000 };
  return token.value;
}

async function apiGet(path: string, cfg: RedditConfig): Promise<unknown> {
  const accessToken = await getToken(cfg);
  const res = await redditFetch(`https://oauth.reddit.com${path}`, { headers: { Authorization: `Bearer ${accessToken}` } }, cfg);
  if (res.status === 401) token = null;
  if (!res.ok) throw new RedditUnavailable(`HTTP ${res.status}`);
  return res.json();
}

function asPost(raw: unknown): (RedditPost & { selftext: string }) | null {
  const d = raw as Record<string, unknown> | null;
  if (!d || typeof d.id !== "string" || typeof d.title !== "string" || typeof d.permalink !== "string") return null;
  return {
    id: d.id,
    title: d.title,
    subreddit: typeof d.subreddit === "string" ? d.subreddit : "",
    score: Number(d.score) || 0,
    permalink: d.permalink,
    url: typeof d.url === "string" ? d.url : "",
    created_utc: Number(d.created_utc) || 0,
    selftext: typeof d.selftext === "string" ? d.selftext : "",
  };
}

function asComment(raw: unknown): RedditComment | null {
  const d = raw as Record<string, unknown> | null;
  if (!d || typeof d.id !== "string" || typeof d.body !== "string" || !d.body.trim()) return null;
  return {
    id: d.id,
    author: typeof d.author === "string" ? d.author : "[deleted]",
    body: d.body.trim(),
    score: Number(d.score) || 0,
    created_utc: Number(d.created_utc) || 0,
  };
}

function mentions(text: string, needle: string): boolean {
  return needle.length > 0 && text.toLowerCase().includes(needle.toLowerCase());
}

/** A clear scam report names the company/email AND uses explicit scam language. */
export function isClearScamReport(text: string, needles: string[]): boolean {
  return CLEAR_SCAM_TERMS.test(text) && needles.some((n) => mentions(text, n));
}

async function searchClearReports(query: string, needles: string[], cfg: RedditConfig): Promise<RedditPost[]> {
  const params = new URLSearchParams({ q: query, restrict_sr: "1", sort: "relevance", t: "all", limit: "25", raw_json: "1" });
  const listing = (await apiGet(`/r/${REDDIT_SUBREDDITS.join("+")}/search?${params.toString()}`, cfg)) as {
    data?: { children?: Array<{ data?: unknown }> };
  };
  return (listing.data?.children ?? [])
    .map((c) => asPost(c.data))
    .filter((p): p is RedditPost & { selftext: string } => p !== null)
    .filter((p) => isClearScamReport(`${p.title}\n${p.selftext}`, needles))
    .map(({ selftext: _selftext, ...post }) => post);
}

async function fetchClearComments(post: RedditPost, cfg: RedditConfig): Promise<RedditComment[]> {
  const listing = (await apiGet(`/comments/${encodeURIComponent(post.id)}?limit=20&sort=top&depth=1&raw_json=1`, cfg)) as Array<{
    data?: { children?: Array<{ kind?: string; data?: unknown }> };
  }>;
  return (listing?.[1]?.data?.children ?? [])
    .filter((c) => c.kind === "t1")
    .map((c) => asComment(c.data))
    .filter((c): c is RedditComment => c !== null)
    // The post already names the company, so the comment only needs scam language.
    .filter((c) => CLEAR_SCAM_TERMS.test(c.body))
    .slice(0, 10);
}

function quoteTerm(term: string): string {
  return `"${term.replace(/"/g, "")}"`;
}

/** null = unavailable. */
async function searchReddit(companyName: string, recruiterEmail: string, cfg: RedditConfig): Promise<RedditMentionsPayload | null> {
  const needles = [companyName, recruiterEmail].filter(Boolean);
  try {
    const queries = needles.map(quoteTerm);
    const results = await Promise.all(queries.map((q) => searchClearReports(q, needles, cfg)));
    const posts = [...new Map(results.flat().map((p) => [p.id, p])).values()].sort((a, b) => b.score - a.score);
    const top = posts.slice(0, 3);
    const commentLists = await Promise.all(top.map((p) => fetchClearComments(p, cfg).catch(() => [])));
    return { posts, comments: Object.fromEntries(top.map((p, i) => [p.id, commentLists[i]])) };
  } catch {
    return null;
  }
}

export type RedditCheck = { check: CheckResult; mentions: RedditMentionsPayload };

const EMPTY: RedditMentionsPayload = { posts: [], comments: {} };

export async function checkReddit(companyName: string, recruiterEmail: string): Promise<RedditCheck> {
  const name = companyName.trim();
  const email = recruiterEmail.trim().toLowerCase();
  const target = [name, email].filter(Boolean).join(" / ") || null;

  if (!name && !email) {
    return { check: { id: "reddit", target, status: "skipped", detail: "No company name or recruiter email to search for." }, mentions: EMPTY };
  }
  const cfg = redditConfig();
  if (!cfg) {
    return { check: { id: "reddit", target, status: "unavailable", detail: "Reddit check unavailable." }, mentions: EMPTY };
  }

  const key = `reddit:${name.toLowerCase()}|${email}`;
  const found = await cached(key, 7 * DAY_MS, () => searchReddit(name, email, cfg));
  if (found === null) {
    return { check: { id: "reddit", target, status: "unavailable", detail: "Reddit check unavailable." }, mentions: EMPTY };
  }

  const count = found.posts.length;
  return {
    check: {
      id: "reddit",
      target,
      // Matches the existing reddit_mentions rule, which needs at least 2 posts to score.
      status: count >= 2 ? "flagged" : count === 1 ? "info" : "passed",
      detail:
        count > 0
          ? `${count} Reddit post${count === 1 ? "" : "s"} in r/${REDDIT_SUBREDDITS.join(", r/")} report this company or email as a scam.`
          : `No clear scam reports found in r/${REDDIT_SUBREDDITS.join(", r/")}.`,
      data: { posts: count },
    },
    mentions: found,
  };
}

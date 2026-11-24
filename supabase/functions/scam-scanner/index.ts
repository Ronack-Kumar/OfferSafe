// supabase/functions/scam-scanner/index.ts
// Runs on a cron schedule — scans Reddit + Google Alerts RSS for new Indian job scams
// and auto-inserts verified ones into scam_cases table.
// Auto-approval: cases scoring 3+ verification points are approved automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const REDDIT_SUBREDDITS = [
  "india", "IndianWorkplace", "Indiajobs", "InternshipsIndia",
  "cscareerquestions", "bangalore", "hyderabad", "delhi", "mumbai",
];

// Replace with your actual Google Alerts RSS URLs
// Go to google.com/alerts → create alert → Deliver to: RSS feed → copy URL
const GOOGLE_ALERTS_RSS: string[] = [
  "https://www.google.com/alerts/feeds/05435832649865164466/16446344036330979273",
  "https://www.google.com/alerts/feeds/05435832649865164466/8130347498442078603",
  "https://www.google.com/alerts/feeds/05435832649865164466/16446344036330979003",
];

const SCAM_KEYWORDS = [
  "scam", "fraud", "fake", "warning", "avoid", "cheated", "money", "fee",
  "deposit", "kit", "training fee", "joining fee", "paid", "never joined",
  "ghosted", "police", "cyber crime", "internship scam", "job scam",
  "fake offer", "fake company",
];

const INDIA_JOB_KEYWORDS = [
  "india", "pvt ltd", "private limited", "ltd", "internship",
  "fresher", "hiring", "recruitment", "offer letter", "joining",
];

// Patterns that strongly indicate a real scam (not just venting)
const HIGH_CONFIDENCE_PATTERNS = [
  /paid.{0,30}(kit|laptop|software|device)/i,
  /joining fee/i,
  /training fee/i,
  /deposit.{0,20}(refund|reimburse)/i,
  /never (received|got).{0,30}(money|salary|stipend)/i,
  /cyber crime/i,
  /police complaint/i,
  /offer letter.{0,40}(fake|fraud|forged)/i,
  /asked.{0,30}(pay|money|fee|deposit)/i,
  /warning.{0,20}(avoid|scam|fraud)/i,
];

type ScamCandidate = {
  title: string;
  body: string;
  source: string;
  url: string;
  score: number;
  numComments: number;
};

type ExtractedScamCase = {
  is_scam: boolean;
  confidence: number;
  case_name: string;
  company_name_variants: string[];
  email_patterns: string[];
  domain_patterns: string[];
  phone_patterns: string[];
  scam_type: string;
  description: string;
  severity: string;
};

// ── Verification scoring ───────────────────────────────────────────────────
// Score >= 3 out of 7 = auto-approve, else = pending for manual review
function verificationScore(candidate: ScamCandidate, extracted: ExtractedScamCase): number {
  let score = 0;
  const text = `${candidate.title} ${candidate.body}`.toLowerCase();

  // AI confidence
  if (extracted.confidence >= 80) score += 2;
  else if (extracted.confidence >= 60) score += 1;

  // Has a real specific company name
  const hasCompany = extracted.company_name_variants.some(
    (v) => v.length > 4 && !["company", "fake", "scam"].includes(v.toLowerCase())
  );
  if (hasCompany) score += 1;

  // Multiple strong scam patterns in the text
  const patternMatches = HIGH_CONFIDENCE_PATTERNS.filter((p) => p.test(text)).length;
  if (patternMatches >= 3) score += 2;
  else if (patternMatches >= 1) score += 1;

  // Reddit community validation (upvotes = real people agreed)
  if (candidate.score >= 20) score += 1;
  else if (candidate.score >= 5) score += 0.5;

  // Has specific scam artifacts (domains/emails found)
  if (
    extracted.domain_patterns.length > 0 ||
    extracted.email_patterns.length > 0 ||
    extracted.phone_patterns.length > 0
  ) score += 1;

  // Title explicitly warns (human intentionally wrote a warning post)
  if (/warning|scam alert|fraud alert|avoid/i.test(candidate.title)) score += 1;

  return score;
}

async function fetchRedditPosts(subreddit: string): Promise<ScamCandidate[]> {
  try {
    const url = `https://www.reddit.com/r/${subreddit}/search.json?q=scam+fraud+fake+warning&sort=new&limit=15&t=week`;
    const res = await fetch(url, { headers: { "User-Agent": "OfferSafe-Scanner/1.0" } });
    if (!res.ok) return [];
    const data = await res.json() as {
      data?: { children?: Array<{ data?: Record<string, unknown> }> };
    };
    return (data.data?.children ?? []).map((child) => {
      const d = child.data ?? {};
      return {
        title: String(d.title ?? ""),
        body: String(d.selftext ?? ""),
        source: `r/${subreddit}`,
        url: `https://www.reddit.com${d.permalink ?? ""}`,
        score: Number(d.score ?? 0),
        numComments: Number(d.num_comments ?? 0),
      };
    });
  } catch {
    return [];
  }
}

async function fetchGoogleAlerts(feedUrl: string): Promise<ScamCandidate[]> {
  try {
    const res = await fetch(feedUrl);
    if (!res.ok) return [];
    const xml = await res.text();
    const entries: ScamCandidate[] = [];
    for (const match of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
      const entry = match[1];
      const title = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
      const content = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
      const link = entry.match(/href="([^"]+)"/)?.[1] ?? "";
      if (title) entries.push({ title, body: content, source: "Google Alerts", url: link, score: 0, numComments: 0 });
    }
    return entries;
  } catch {
    return [];
  }
}

function isRelevantScamPost(c: ScamCandidate): boolean {
  const text = `${c.title} ${c.body}`.toLowerCase();
  return SCAM_KEYWORDS.some((kw) => text.includes(kw)) &&
    INDIA_JOB_KEYWORDS.some((kw) => text.includes(kw));
}

async function extractScamData(candidate: ScamCandidate): Promise<ExtractedScamCase | null> {
  const prompt = `You are a scam detection analyst for Indian job markets.
Analyze this post. Return ONLY valid JSON, no markdown, no explanation.

Title: ${candidate.title}
Content: ${candidate.body.slice(0, 1500)}
Source: ${candidate.source}

JSON format:
{
  "is_scam": true or false,
  "confidence": 0-100,
  "case_name": "short name e.g. 'Fake Software Kit Internship Scam'",
  "company_name_variants": ["exact company name", "alternate spellings"],
  "email_patterns": ["suspicious email domain patterns"],
  "domain_patterns": ["suspicious domains"],
  "phone_patterns": [],
  "scam_type": "advance_fee" | "joining_fee" | "software_kit" | "fake_company" | "data_theft" | "mlm" | "other",
  "description": "2-3 sentence factual summary of how this scam works",
  "severity": "low" | "medium" | "high" | "critical"
}

Rules:
- is_scam: false if NOT about an Indian job/internship scam
- confidence 80+ only if there is a specific named company AND clear evidence of fraud
- Extract real company names, domains, and email patterns if mentioned`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3-8b-8192",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
        temperature: 0.1,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content ?? "";
    return JSON.parse(raw.replace(/```json|```/g, "").trim()) as ExtractedScamCase;
  } catch {
    return null;
  }
}

async function alreadyExists(variants: string[]): Promise<boolean> {
  for (const variant of variants.slice(0, 3)) {
    if (variant.length < 4) continue;
    const { data } = await supabase.from("scam_cases").select("id").ilike("case_name", `%${variant}%`).limit(1);
    if (data?.length) return true;
    const { data: d2 } = await supabase.from("scam_cases").select("id").contains("company_name_variants", [variant.toLowerCase()]).limit(1);
    if (d2?.length) return true;
  }
  return false;
}

Deno.serve(async () => {
  console.log("🔍 OfferSafe scam scanner starting...");
  const allCandidates: ScamCandidate[] = [];

  for (const sub of REDDIT_SUBREDDITS) {
    allCandidates.push(...await fetchRedditPosts(sub));
    await new Promise((r) => setTimeout(r, 400));
  }
  for (const feed of GOOGLE_ALERTS_RSS) {
    allCandidates.push(...await fetchGoogleAlerts(feed));
  }

  console.log(`Total fetched: ${allCandidates.length}`);
  const relevant = allCandidates.filter(isRelevantScamPost);
  console.log(`Relevant: ${relevant.length}`);

  const seen = new Set<string>();
  const unique = relevant.filter((c) => {
    const key = c.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  console.log(`Unique: ${unique.length}`);

  let autoApproved = 0, pendingReview = 0, rejected = 0;

  for (const candidate of unique.slice(0, 20)) {
    const extracted = await extractScamData(candidate);
    if (!extracted?.is_scam) { rejected++; continue; }

    const exists = await alreadyExists(extracted.company_name_variants);
    if (exists) { rejected++; continue; }

    const vScore = verificationScore(candidate, extracted);
    const status = vScore >= 3 ? "approved" : "pending";

    const { error } = await supabase.from("scam_cases").insert({
      case_name: extracted.case_name,
      company_name_variants: extracted.company_name_variants.map((v) => v.toLowerCase()),
      email_patterns: extracted.email_patterns,
      domain_patterns: extracted.domain_patterns,
      phone_patterns: extracted.phone_patterns,
      scam_type: extracted.scam_type,
      description: extracted.description,
      source_note: `${candidate.source} — auto-detected ${new Date().toISOString().split("T")[0]} — vscore:${vScore}/7`,
      severity: extracted.severity,
      status,
    });

    if (!error) {
      if (status === "approved") { autoApproved++; console.log(`✅ Auto-approved (${vScore}/7): ${extracted.case_name}`); }
      else { pendingReview++; console.log(`⏳ Pending (${vScore}/7): ${extracted.case_name}`); }
    } else {
      console.error("Insert error:", error.message);
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  const result = { autoApproved, pendingReview, rejected, scanned: unique.length };
  console.log("Done:", result);
  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
});

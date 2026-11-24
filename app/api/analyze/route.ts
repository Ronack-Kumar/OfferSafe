import { MISSING_SUPABASE_ENV, supabasePublicKey } from "@/lib/supabase-key";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { runFreeChecks, type FreeCheckOutput } from "@/lib/checks";
import { findCinInText, isValidCinFormat } from "@/lib/checks/mca";
import { explain, says } from "@/lib/scoring/explanations";
import {
  detectAny,
  detectNoInterview,
  detectPattern,
  detectPaymentRequest,
  detectUrgency,
  INTERVIEW_WORDS,
  PAID_TRAINING_PATTERNS,
  PURCHASE_PATTERN,
  REGISTERED_CLAIM,
  REIMBURSEMENT_PATTERNS,
  WHATSAPP_PATTERN,
} from "@/lib/scoring/text-signals";
import { emailDomainStanding } from "@/lib/scoring/web-presence";
import { DEFAULT_NEXT_STEPS, nextStepsPrompt, parseNextSteps } from "@/lib/scoring/next-steps";

type SignalSeverity = "critical" | "high" | "medium" | "low";

type SignalKey =
  | "known_scam_match"
  | "email_free_provider"
  | "email_domain_mismatch"
  | "cin_invalid_format"
  | "gmail_as_official"
  | "payment_requested"
  | "reimbursement_trap"
  | "paid_training_placement"
  | "domain_age_new"
  | "unrealistic_stipend"
  | "urgency_language"
  | "no_company_web_presence"
  | "domain_missing"
  | "no_interview_mentioned"
  | "whatsapp_only_recruitment"
  | "cin_missing"
  | "poor_formatting"
  | "vague_role"
  | "reddit_mentions"
  | "reddit_comment_scam_score"
  // Added by the free verification checks (lib/checks).
  | "email_disposable"
  | "email_no_mx"
  | "cin_not_found"
  | "company_not_active";

type TriggeredSignal = {
  key: SignalKey;
  weight: number;
  severity: SignalSeverity;
  reason: string;
};

type ScamCase = {
  id: string;
  case_name: string;
  company_name_variants: string[] | null;
  email_patterns: string[] | null;
  domain_patterns: string[] | null;
  phone_patterns: string[] | null;
  scam_type: string;
  description: string;
  source_note: string | null;
  severity: string;
  status: string;
};

type AnalyzePayload = {
  companyName?: string;
  recruiterName?: string;
  recruiterEmail?: string;
  phone?: string;
  website?: string;
  cin?: string;
  offerText?: string;
  paymentText?: string;
  extractedText?: string;
  linkedinUrl?: string;
  jobTitle?: string;
  roleDescription?: string;
};

type ExtractedEntities = {
  companyName: string | null;
  recruiterName: string | null;
  emailDomain: string | null;
  phone: string | null;
  websiteDomain: string | null;
  cin: string | null;
  dates: string[];
  stipendAmount: number | null;
  paymentDemands: string[];
};

const SIGNALS: Record<SignalKey, { weight: number; severity: SignalSeverity }> = {
  known_scam_match: { weight: 45, severity: "critical" },
  email_free_provider: { weight: 25, severity: "high" },
  email_domain_mismatch: { weight: 20, severity: "high" },
  cin_invalid_format: { weight: 20, severity: "high" },
  gmail_as_official: { weight: 20, severity: "high" },
  payment_requested: { weight: 35, severity: "high" },
  reimbursement_trap: { weight: 30, severity: "high" },
  paid_training_placement: { weight: 30, severity: "high" },
  domain_age_new: { weight: 15, severity: "medium" },
  unrealistic_stipend: { weight: 15, severity: "medium" },
  urgency_language: { weight: 15, severity: "medium" },
  no_company_web_presence: { weight: 15, severity: "medium" },
  domain_missing: { weight: 10, severity: "medium" },
  no_interview_mentioned: { weight: 10, severity: "medium" },
  whatsapp_only_recruitment: { weight: 10, severity: "medium" },
  cin_missing: { weight: 5, severity: "low" },
  poor_formatting: { weight: 5, severity: "low" },
  vague_role: { weight: 5, severity: "low" },
  reddit_mentions: { weight: 20, severity: "high" },
  reddit_comment_scam_score: { weight: 10, severity: "high" },
  email_disposable: { weight: 25, severity: "high" },
  email_no_mx: { weight: 20, severity: "high" },
  cin_not_found: { weight: 20, severity: "high" },
  company_not_active: { weight: 20, severity: "high" },
};

/** At or above this score the verdict is already clear, so AI extraction is skipped. */
const CLEAR_RESULT_SCORE = 66;

const REDDIT_COMMENT_KEYWORDS = [
  "paid",
  "fee",
  "scam",
  "fake",
  "fraud",
  "money",
  "kit",
  "deposit",
  "cheated",
  "ghosted",
  "never joined",
  "warning",
  "avoid",
  "don't join",
  "do not join",
  "reported",
  "police",
];

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "rediffmail.com",
  "ymail.com",
]);

const PAYMENT_KEYWORDS = [
  "pay",
  "fee",
  "deposit",
  "purchase",
  "kit",
  "software",
  "reimburse",
  "refundable",
  "advance",
  "security deposit",
  "registration fee",
  "training fee",
];

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function lower(value: string): string {
  return value.trim().toLowerCase();
}

function containsAny(text: string, keywords: string[]): boolean {
  const t = lower(text);
  return keywords.some((k) => t.includes(lower(k)));
}

function extractEmailDomain(email: string): string | null {
  const value = lower(email);
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  return value.slice(at + 1);
}

function extractDomain(urlOrDomain: string): string | null {
  const raw = toText(urlOrDomain);
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    return parsed.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    const fallback = raw.replace(/^www\./i, "").toLowerCase();
    return fallback.includes(".") ? fallback : null;
  }
}

function extractDates(text: string): string[] {
  const out = new Set<string>();
  const dateRegexes = [
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
    /\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b/g,
    /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{2,4}\b/gi,
  ];
  for (const re of dateRegexes) {
    for (const match of text.matchAll(re)) {
      if (match[0]) out.add(match[0]);
    }
  }
  return [...out];
}

function extractStipendAmount(text: string): number | null {
  const matches = [
    ...text.matchAll(/\b(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d+)?)\b/gi),
    ...text.matchAll(/\b([\d,]+(?:\.\d+)?)\s*(?:rs\.?|inr|₹)\b/gi),
  ];
  const values = matches
    .map((m) => Number((m[1] || "").replace(/,/g, "")))
    .filter((n) => Number.isFinite(n));
  if (values.length === 0) return null;
  return Math.max(...values);
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function fallbackEntityExtraction(input: AnalyzePayload, fullText: string): ExtractedEntities {
  const emailDomain = extractEmailDomain(input.recruiterEmail || "");
  const websiteDomain = extractDomain(input.website || "");
  const paymentDemands = PAYMENT_KEYWORDS.filter((k) => lower(fullText).includes(lower(k)));
  return {
    companyName: input.companyName || null,
    recruiterName: input.recruiterName || null,
    emailDomain,
    phone: input.phone || null,
    websiteDomain,
    cin: input.cin || null,
    dates: extractDates(fullText),
    stipendAmount: extractStipendAmount(fullText),
    paymentDemands,
  };
}

function normalizeExtractedEntities(parsed: Record<string, unknown>, fallback: ExtractedEntities): ExtractedEntities {
  return {
    companyName: toText(parsed.companyName) || fallback.companyName,
    recruiterName: toText(parsed.recruiterName) || fallback.recruiterName,
    emailDomain: toText(parsed.emailDomain) || fallback.emailDomain,
    phone: toText(parsed.phone) || fallback.phone,
    websiteDomain: toText(parsed.websiteDomain) || fallback.websiteDomain,
    cin: toText(parsed.cin) || fallback.cin,
    dates: Array.isArray(parsed.dates) ? parsed.dates.map((x) => String(x)) : fallback.dates,
    stipendAmount:
      typeof parsed.stipendAmount === "number"
        ? parsed.stipendAmount
        : typeof parsed.stipendAmount === "string" && parsed.stipendAmount.trim()
          ? Number(parsed.stipendAmount.replace(/,/g, ""))
          : fallback.stipendAmount,
    paymentDemands: Array.isArray(parsed.paymentDemands)
      ? parsed.paymentDemands.map((x) => String(x))
      : fallback.paymentDemands,
  };
}

async function extractEntitiesWithGemini(input: AnalyzePayload, fullSubmittedText: string): Promise<ExtractedEntities> {
  const fallback = fallbackEntityExtraction(input, fullSubmittedText);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback;

  try {
    const prompt =
      'Extract the following entities from this job/internship offer text. Return ONLY valid JSON with these keys: companyName, recruiterName, emailDomain, phone, websiteDomain, cin, dates, stipendAmount, paymentDemands. If a field is not found return null.';
    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(`${prompt}\n\n${fullSubmittedText}`);
    const text = result.response.text();
    const parsed = parseJsonObject(text);
    if (!parsed) return fallback;
    return normalizeExtractedEntities(parsed, fallback);
  } catch {
    return fallback;
  }
}

function confidenceFromFilledFields(input: AnalyzePayload): "Low" | "Medium" | "High" {
  const fields = [
    input.companyName,
    input.cin,
    input.recruiterEmail,
    input.phone,
    input.website,
    input.linkedinUrl,
    input.offerText,
    input.paymentText,
    input.extractedText,
  ];
  const filled = fields.filter((f) => toText(f).length > 0).length;
  if (filled <= 1) return "Low";
  if (filled <= 3) return "Medium";
  return "High";
}

function verdictFromScore(score: number): "LOW RISK" | "CAUTION" | "SUSPICIOUS" | "HIGH-RISK SCAM" {
  if (score <= 20) return "LOW RISK";
  if (score <= 40) return "CAUTION";
  if (score <= 65) return "SUSPICIOUS";
  return "HIGH-RISK SCAM";
}

function commentHasScamKeyword(body: string): boolean {
  return containsAny(body, REDDIT_COMMENT_KEYWORDS);
}

async function supabaseRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = supabasePublicKey();

  if (!url || !anon) {
    throw new Error(MISSING_SUPABASE_ENV);
  }

  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const message = await res.text();
    throw new Error(`Supabase request failed (${res.status}): ${message}`);
  }

  // Inserts with Prefer: return=minimal answer 201 with an empty body.
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/**
 * The AI only writes the "what to check next" list (see lib/scoring/next-steps.ts).
 * Red-flag explanations are built deterministically from the user's text (addSignal).
 */
async function callGroqForNextSteps(triggeredSignals: TriggeredSignal[]): Promise<string[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || triggeredSignals.length === 0) return DEFAULT_NEXT_STEPS;

  try {
    // Only fixed signal names go to the model, never the (untrusted) offer text.
    const prompt = nextStepsPrompt(triggeredSignals.map((s) => s.key));

    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });
    return parseNextSteps(completion.choices[0]?.message?.content ?? "");
  } catch {
    return DEFAULT_NEXT_STEPS;
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AnalyzePayload;

    const input: AnalyzePayload = {
      companyName: toText(body.companyName),
      recruiterName: toText(body.recruiterName),
      recruiterEmail: toText(body.recruiterEmail),
      phone: toText(body.phone),
      website: toText(body.website),
      cin: toText(body.cin),
      offerText: toText(body.offerText),
      paymentText: toText(body.paymentText),
      extractedText: toText(body.extractedText),
      linkedinUrl: toText(body.linkedinUrl),
      jobTitle: toText(body.jobTitle),
      roleDescription: toText(body.roleDescription),
    };

    const fullText = [input.offerText, input.paymentText, input.extractedText].filter(Boolean).join("\n");

    const fullSubmittedText = [
      `Company Name: ${input.companyName || ""}`,
      `Recruiter Name: ${input.recruiterName || ""}`,
      `Recruiter Email: ${input.recruiterEmail || ""}`,
      `Phone: ${input.phone || ""}`,
      `Website: ${input.website || ""}`,
      `CIN: ${input.cin || ""}`,
      `LinkedIn URL: ${input.linkedinUrl || ""}`,
      `Job Title: ${input.jobTitle || ""}`,
      `Role Description: ${input.roleDescription || ""}`,
      `Offer Text: ${input.offerText || ""}`,
      `Payment Text: ${input.paymentText || ""}`,
      `Extracted Text: ${input.extractedText || ""}`,
    ].join("\n");

    // 1. Free, deterministic work first: regex entity extraction, known-case data, free checks.
    const scamCasesPromise = supabaseRequest<ScamCase[]>("scam_cases?status=eq.approved&select=*");
    const fallbackEntities = fallbackEntityExtraction(input, fullSubmittedText);

    const freeCheckInputFor = (entities: ExtractedEntities) => ({
      recruiterEmail: input.recruiterEmail,
      website: input.website || entities.websiteDomain || "",
      text: fullText,
      companyName: entities.companyName || input.companyName || "",
      cin: input.cin || entities.cin || findCinInText(fullText) || "",
    });

    const [scamCases, initialFreeChecks] = await Promise.all([
      scamCasesPromise,
      runFreeChecks(freeCheckInputFor(fallbackEntities)),
    ]);

    const evaluate = (extractedEntities: ExtractedEntities, freeChecks: FreeCheckOutput) => {
      const emailDomain = extractedEntities.emailDomain || extractEmailDomain(input.recruiterEmail || "");
      const websiteDomain = extractedEntities.websiteDomain || extractDomain(input.website || "");

      let matchedCase: ScamCase | null = null;
      let matchedOn = "";
      const companyInput = lower(extractedEntities.companyName || input.companyName || "");

      for (const c of scamCases) {
        const companyHit = (c.company_name_variants || []).find((v) => {
          const vv = lower(v || "");
          return vv.length > 0 && companyInput.length > 0 && (companyInput.includes(vv) || vv.includes(companyInput));
        });

        const emailHit = (c.email_patterns || []).find(
          (p) => p && input.recruiterEmail && lower(input.recruiterEmail).includes(lower(p)),
        );

        const domainHit = (c.domain_patterns || []).find((p) => {
          if (!p || !websiteDomain) return false;
          const candidate = lower(p);
          return websiteDomain === candidate || websiteDomain.endsWith(`.${candidate}`);
        });

        if (companyHit || emailHit || domainHit) {
          matchedCase = c;
          matchedOn = companyHit
            ? `The company name “${extractedEntities.companyName || input.companyName}”`
            : emailHit
              ? `The recruiter email “${input.recruiterEmail}”`
              : `The website “${websiteDomain}”`;
          break;
        }
      }

      // Reddit (OAuth, optional): only posts/comments that are clear scam reports are kept.
      const redditMentionsData = freeChecks.reddit;
      const strongRedditMentions = redditMentionsData.posts.filter((item) => item.score >= 1);
      const scamKeywordCommentCount = Object.values(redditMentionsData.comments)
        .flat()
        .filter((comment) => commentHasScamKeyword(comment.body)).length;

      const triggered: TriggeredSignal[] = [];

      // `reason` is the user-facing explanation: what we found (quoting the user's own
      // words where there are any), then why it matters.
      const addSignal = (key: SignalKey, finding: string) => {
        const exists = triggered.some((s) => s.key === key);
        if (!exists) {
          triggered.push({
            key,
            weight: SIGNALS[key].weight,
            severity: SIGNALS[key].severity,
            reason: explain(key, finding),
          });
        }
      };

      const addCustomSignal = (key: SignalKey, finding: string, weight: number, severity: SignalSeverity) => {
        const exists = triggered.some((s) => s.key === key);
        if (!exists) {
          triggered.push({ key, weight, severity, reason: explain(key, finding) });
        }
      };

      if (matchedCase) {
        addSignal("known_scam_match", `${matchedOn} matches a reported scam in our database: “${matchedCase.case_name}”.`);
      }

      const email = lower(input.recruiterEmail || "") || (emailDomain ? `@${emailDomain}` : "");

      if (emailDomain && FREE_EMAIL_DOMAINS.has(emailDomain)) {
        addSignal("email_free_provider", `The recruiter writes from “${email}”, a free ${emailDomain} address.`);
      }

      if (emailDomain && websiteDomain && emailDomain !== websiteDomain && !emailDomain.endsWith(`.${websiteDomain}`)) {
        addSignal(
          "email_domain_mismatch",
          `The recruiter's email is at “${emailDomain}” but the company website you gave is “${websiteDomain}”.`,
        );
      }

      const cinValue = extractedEntities.cin || input.cin || findCinInText(fullText) || "";

      if (cinValue) {
        if (!isValidCinFormat(cinValue)) {
          addSignal("cin_invalid_format", `The CIN you gave, “${cinValue}”, isn't in a valid format.`);
        }
      } else {
        addSignal("cin_missing", "No CIN (company registration number) was given or found in the offer text.");
      }

      const registeredHit = detectPattern(`${input.companyName || ""}\n${fullText}`, REGISTERED_CLAIM);
      const registeredClaim = Boolean(cinValue) || Boolean(registeredHit);

      if (registeredClaim && emailDomain && (emailDomain === "gmail.com" || emailDomain === "yahoo.com")) {
        const claim = registeredHit ? `calls the company “${registeredHit.quote}”` : `gives the CIN “${cinValue}”`;
        addSignal("gmail_as_official", `The offer ${claim}, but the official contact is “${email}”.`);
      }

      const paymentHit = detectPaymentRequest(fullText);
      if (paymentHit) {
        addSignal("payment_requested", `${says(paymentHit)} That is a request for money from you.`);
      }

      const reimbursementHit = detectAny(fullText, REIMBURSEMENT_PATTERNS);
      if (reimbursementHit && PURCHASE_PATTERN.test(fullText)) {
        addSignal("reimbursement_trap", says(reimbursementHit));
      }

      const paidTrainingHit = detectAny(fullText, PAID_TRAINING_PATTERNS);
      if (paidTrainingHit) {
        addSignal("paid_training_placement", says(paidTrainingHit));
      }

      // A non-free recruiter domain that is over 2 years old and receives mail counts
      // as the company's web presence, so a missing website isn't held against it.
      const emailStanding = emailDomainStanding(emailDomain, freeChecks.checks);
      const standingNote =
        !emailStanding.established && emailStanding.domain
          ? ` The recruiter's email domain doesn't count as one because ${emailStanding.why}.`
          : "";

      if (!websiteDomain && !emailStanding.established) {
        addSignal("domain_missing", `No company website was given.${standingNote}`);
      }

      const stipend = extractedEntities.stipendAmount;
      const isInternship = /(intern|internship)/i.test(`${input.jobTitle} ${fullText}`);
      const isFresher = /(fresher|entry level|graduate)/i.test(`${input.jobTitle} ${fullText}`);

      if (stipend !== null) {
        if ((isInternship && stipend > 80000) || (isFresher && stipend > 200000)) {
          const amountHit = detectAny(fullText, [/(?:rs\.?|inr|₹)\s*[\d,]+(?:\.\d+)?/i, /[\d,]+(?:\.\d+)?\s*(?:rs\.?|inr|₹)/i]);
          const amount = amountHit ? says(amountHit) : `The offer pays ₹${stipend.toLocaleString("en-IN")}.`;
          addSignal(
            "unrealistic_stipend",
            `${amount} That is far above the usual pay for ${isInternship ? "an internship" : "a fresher role"}.`,
          );
        }
      }

      const urgencyHit = detectUrgency(fullText);
      if (urgencyHit) {
        addSignal("urgency_language", `${says(urgencyHit)} That pressures you to act fast.`);
      }

      if (!input.website && !input.linkedinUrl && !emailStanding.established) {
        addSignal("no_company_web_presence", `Neither a company website nor a LinkedIn page was provided.${standingNote}`);
      }

      // Saying outright that there is no interview is a strong signal; merely not
      // mentioning one is a weak one.
      const noInterviewHit = detectNoInterview(fullText);
      const offerTextWordCount = fullText.trim().split(/\s+/).filter(Boolean).length;
      if (noInterviewHit) {
        addCustomSignal(
          "no_interview_mentioned",
          `${says(noInterviewHit)} You are being hired without any selection process.`,
          20,
          "high",
        );
      } else if (offerTextWordCount > 50 && !INTERVIEW_WORDS.test(fullText)) {
        addSignal("no_interview_mentioned", `The offer text (${offerTextWordCount} words) never mentions an interview, test or assessment.`);
      }

      const whatsappHit = detectPattern(`${input.phone || ""}\n${fullText}`, WHATSAPP_PATTERN);
      if (whatsappHit) {
        addSignal("whatsapp_only_recruitment", says(whatsappHit));
      }

      if (fullText && offerTextWordCount > 80) {
        const parts: Array<[boolean, string]> = [
          [
            /(company address|address:)/i.test(fullText) ||
              // A street-style address with an Indian PIN code, e.g. "Hosur Road, Bengaluru 560100".
              /\b(?:road|rd\.?|street|st\.?|nagar|marg|lane|sector|phase|floor|building|tower|park|city|layout)\b[^.\n]{0,60}\b[1-9]\d{5}\b/i.test(fullText),
            "company address",
          ],
          [Boolean(cinValue) || /(registration number|\bcin\b|incorporation no)/i.test(fullText), "registration number (CIN)"],
          [/\b(date|dated)\b/i.test(fullText), "date"],
          [/(authorized signatory|authorised signatory|hr manager|signatory)/i.test(fullText), "authorised signatory"],
          [/(letterhead|official letterhead|www\.)/i.test(fullText), "letterhead"],
        ];
        const missing = parts.filter(([ok]) => !ok).map(([, label]) => label);
        if (missing.length >= 3) {
          const list = `${missing.slice(0, -1).join(", ")} or ${missing[missing.length - 1]}`;
          addSignal("poor_formatting", `We couldn't find a ${list} in the offer text.`);
        }
      }

      const titleWordCount = (input.jobTitle || "").split(/\s+/).filter(Boolean).length;
      const roleWordCount = (input.roleDescription || "").split(/\s+/).filter(Boolean).length;

      if (titleWordCount > 0 && titleWordCount < 3 && roleWordCount > 0 && roleWordCount < 30) {
        addSignal(
          "vague_role",
          `The job title is just “${input.jobTitle}” and the role description is only ${roleWordCount} word${roleWordCount === 1 ? "" : "s"} long.`,
        );
      }

      if (strongRedditMentions.length >= 2) {
        addSignal(
          "reddit_mentions",
          `${strongRedditMentions.length} Reddit posts report this company or email as a scam, for example “${strongRedditMentions[0].title}”.`,
        );
      }

      if (scamKeywordCommentCount >= 2) {
        addCustomSignal(
          "reddit_comment_scam_score",
          `${scamKeywordCommentCount} Reddit comments about this company contain scam warnings.`,
          10,
          "high",
        );
      } else if (scamKeywordCommentCount >= 1) {
        addCustomSignal("reddit_comment_scam_score", "A Reddit comment about this company contains a scam warning.", 5, "medium");
      }

      // Free verification checks (domain age, disposable inbox, MX, MCA registry). Their
      // text already names the exact domain, date or CIN.
      for (const signal of freeChecks.signals) {
        addSignal(signal.key, signal.reason);
      }

      const riskScore = Math.min(
        triggered.reduce((sum, s) => sum + s.weight, 0),
        100,
      );
      return { triggered, riskScore, matchedCase, emailDomain, websiteDomain, cinValue, redditMentionsData };
    };

    // 2. Only when the free result is still unclear, spend an AI call on entity extraction,
    //    then re-run the free checks if it surfaced anything new (lookups are cached).
    let extractedEntities = fallbackEntities;
    let freeChecks = initialFreeChecks;
    let evaluation = evaluate(extractedEntities, freeChecks);

    if (evaluation.riskScore < CLEAR_RESULT_SCORE) {
      const aiEntities = await extractEntitiesWithGemini(input, fullSubmittedText);
      if (JSON.stringify(aiEntities) !== JSON.stringify(fallbackEntities)) {
        extractedEntities = aiEntities;
        const before = JSON.stringify(freeCheckInputFor(fallbackEntities));
        if (JSON.stringify(freeCheckInputFor(aiEntities)) !== before) {
          freeChecks = await runFreeChecks(freeCheckInputFor(aiEntities));
        }
        evaluation = evaluate(extractedEntities, freeChecks);
      }
    }

    const { triggered, riskScore, matchedCase, emailDomain, websiteDomain, cinValue, redditMentionsData } = evaluation;
    const verdict = verdictFromScore(riskScore);
    const confidence = confidenceFromFilledFields(input);

    const nextSteps = await callGroqForNextSteps(triggered);
    // Every explanation is built from the user's own text (see addSignal); the AI only
    // writes the next-steps checklist.
    const signalExplanations: Record<string, string> = Object.fromEntries(triggered.map((s) => [s.key, s.reason]));

    const insertPayload = {
      inputs_json: input,
      extracted_entities_json: {
        company_name: extractedEntities.companyName,
        recruiter_name: extractedEntities.recruiterName,
        email_domain: emailDomain,
        phone: extractedEntities.phone,
        website_domain: websiteDomain,
        cin: cinValue || null,
        dates: extractedEntities.dates,
        stipend_amount: extractedEntities.stipendAmount,
        payment_demands: extractedEntities.paymentDemands,
      },
      signals_json: triggered,
      matched_case_id: matchedCase?.id ?? null,
      risk_score: riskScore,
      verdict: verdict,
      confidence: confidence,
      explanation_json: {
        signalExplanations,
        nextSteps,
      },
      reddit_mentions_json: redditMentionsData,
      verification_checks_json: freeChecks.checks,
    };

    // The id is generated here and the insert doesn't read the row back, so the public
    // key never needs SELECT on cases (reports are read one at a time via get_case()).
    const id = crypto.randomUUID();
    const insertCase = (payload: Record<string, unknown>) =>
      supabaseRequest<null>("cases", {
        method: "POST",
        headers: {
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ id, ...payload }),
      });

    try {
      await insertCase(insertPayload);
    } catch (error) {
      // Until the 20261124 migration adds the column, store the report without it
      // rather than failing the whole analysis.
      if (!(error instanceof Error) || !error.message.includes("verification_checks_json")) throw error;
      const { verification_checks_json: _omitted, ...legacyPayload } = insertPayload;
      await insertCase(legacyPayload);
    }

    return NextResponse.json({ id }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
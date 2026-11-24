/**
 * Phrase detectors for the offer text. Each returns the exact words that triggered it
 * (as the user wrote them) plus a short quote of the surrounding clause, so the report
 * can show the user precisely what raised the flag.
 *
 * Patterns cover English and common Hinglish (romanized Hindi) phrasing.
 */

export type PhraseHit = {
  /** The exact matched words, as written in the user's text. */
  phrase: string;
  /** The clause around the match (also exact text), trimmed to a readable length. */
  quote: string;
};

const MAX_QUOTE = 140;
/** Characters that end a clause when widening a match into a quote. */
const CLAUSE_END = /[.!?\n;|]/;

/** Widens [start, end) to the enclosing clause, capped at MAX_QUOTE characters. */
export function quoteAround(text: string, start: number, end: number): string {
  let from = start;
  while (from > 0 && !CLAUSE_END.test(text[from - 1]) && start - from < 70) from--;
  let to = end;
  while (to < text.length && !CLAUSE_END.test(text[to]) && to - end < 70) to++;
  // Don't cut words in half.
  if (from > 0 && !CLAUSE_END.test(text[from - 1])) {
    const space = text.indexOf(" ", from);
    if (space !== -1 && space < start) from = space + 1;
  }
  if (to < text.length && !CLAUSE_END.test(text[to])) {
    const space = text.lastIndexOf(" ", to);
    if (space > end) to = space;
  }
  let quote = text.slice(from, to).replace(/\s+/g, " ").trim();
  if (quote.length > MAX_QUOTE) quote = text.slice(start, end).replace(/\s+/g, " ").trim();
  const lead = from > 0 && !CLAUSE_END.test(text[from - 1]) ? "…" : "";
  const tail = to < text.length && !CLAUSE_END.test(text[to]) ? "…" : "";
  return `${lead}${quote}${tail}`;
}

/** Earliest match of any pattern that passes `accept`. Patterns must not be global. */
export function findFirst(
  text: string,
  patterns: RegExp[],
  accept: (text: string, start: number, end: number) => boolean = () => true,
): PhraseHit | null {
  let best: { start: number; end: number } | null = null;
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (!accept(text, start, end)) continue;
      if (!best || start < best.start) best = { start, end };
      break;
    }
  }
  if (!best) return null;
  return { phrase: text.slice(best.start, best.end), quote: quoteAround(text, best.start, best.end) };
}

// ---- Urgency ---------------------------------------------------------------------

export const URGENCY_PATTERNS: RegExp[] = [
  // "within 24 hours", "within 48 hrs", "within the next 2 hours", "within twenty-four hours"
  /\bwithin\s+(?:the\s+next\s+)?(?:\d{1,3}|one|two|three|six|twelve|twenty[- ]?four|forty[- ]?eight)\s*(?:hours?|hrs?|days?|minutes?|mins?)\b/i,
  // Hinglish: "24 ghante ke andar", "2 ghante mein"
  /\b\d{1,3}\s*(?:ghante|ghanton|ghanto|ghanta)(?:\s+(?:ke\s+andar|mein|me|main))?/i,
  /\btoday\s+only\b/i,
  /\bonly\s+today\b/i,
  /\b(?:by|before)\s+(?:end\s+of\s+)?(?:today|tonight)\b/i,
  /\baaj\s+(?:hi|hee|tak|raat\s+tak)\b/i,
  /\bimmediately\b/i,
  /\b(?:turant|fauran|jaldi\s+(?:se|karo|karein|kare|kijiye)|abhi\s+ke\s+abhi)\b/i,
  // "seat will be cancelled", "your seat will be given to another candidate"
  /\bseats?\s+(?:will|would|shall|may)\s+(?:be\s+)?(?:cancell?ed|forfeited|released|lost|given\s+to|allotted\s+to)\b/i,
  // Hinglish: "seat cancel ho jayegi", "seat cancel kar di jayegi"
  /\bseats?\s+cancel\s+(?:ho|kar)\b/i,
  /\b(?:offer|selection)\s+(?:will|would|shall)\s+be\s+(?:cancell?ed|revoked|withdrawn|forfeited)\b/i,
  /\b(?:offer|selection)\s+cancel\s+(?:ho|kar)\b/i,
  /\blast\s+date\b/i,
  /\blimited\s+(?:seats?|slots?|positions?|vacancies)\b/i,
  /\bact\s+now\b/i,
  /\boffer\s+expires?\b/i,
  /\burgent(?:ly)?\b/i,
];

export function detectUrgency(text: string): PhraseHit | null {
  return findFirst(text, URGENCY_PATTERNS);
}

// ---- No interview ----------------------------------------------------------------

export const NO_INTERVIEW_PATTERNS: RegExp[] = [
  /\bno\s+(?:interviews?|tests?|assessments?|screening)\s+(?:is\s+|are\s+)?(?:needed|required|necessary|involved)\b/i,
  /\bno\s+need\s+(?:of|for|to\s+(?:attend|give|take))\s+(?:an?\s+|any\s+)?(?:interviews?|tests?)\b/i,
  /\bwithout\s+(?:an?\s+|any\s+)?(?:interviews?|tests?|assessments?)\b/i,
  /\bdirect(?:ly)?\s+(?:selected|selection|hired|hiring|joining|appointed|appointment|placed)\b/i,
  /\b(?:you\s+are|you've\s+been|you\s+have\s+been)\s+selected\s+directly\b/i,
  // Hinglish
  /\binterview\s+(?:ki|ka)\s+(?:koi\s+)?(?:zarurat|zaroorat|jarurat|jaroorat|need)\s+nahi\b/i,
  /\binterview\s+nahi\s+(?:hoga|hai|lenge|lega|chahiye|dena)\b/i,
  /\bbina\s+(?:kisi\s+)?(?:interview|test)\b/i,
  /\bseedha\s+(?:selection|select|selected|joining|join)\b/i,
];

export function detectNoInterview(text: string): PhraseHit | null {
  return findFirst(text, NO_INTERVIEW_PATTERNS);
}

/** Words that show some selection process took place. */
export const INTERVIEW_WORDS = /\b(?:interview(?:s|ed)?|tests?|assessments?|shortlist(?:ed|ing)?|selection\s+process|technical\s+round|hr\s+round)\b/i;

// ---- Payment requests ------------------------------------------------------------

export const PAYMENT_PATTERNS: RegExp[] = [
  // "pay Rs 1,999", "pay the refundable fee", "deposit ₹500", "transfer the amount"
  /\b(?:pay|deposit|transfer|send)\s+(?:a\s+|an\s+|the\s+|your\s+|us\s+)?(?:(?:small|nominal|one[- ]time|refundable|non[- ]refundable|registration|security|training|joining|processing|verification|onboarding|kit|application)\s+){0,2}(?:amount|fees?|charges?|sum|money|payment|(?:rs\.?|inr|₹|rupees)\s*[\d,]+|₹?\d[\d,]*)/i,
  /\b(?:registration|security|training|joining|processing|verification|onboarding|documentation|kit|refundable|caution|application|certification|uniform|id\s+card)\s+(?:fees?|charges?|deposit|amount)\b/i,
  /\brefundable\s+(?:deposit|amount|payment)\b/i,
  /\b(?:purchase|buy)\s+(?:a\s+|the\s+|your\s+|our\s+)?(?:laptop|kit|software|course|training|equipment|starter|device|tools?)\b/i,
  /\b(?:upi|gpay|google\s+pay|phonepe|paytm)\b/i,
  // Hinglish: "fees bhejo", "payment karna hoga", "paise jama karo", "payment ke baad"
  /\b(?:fees?|paise|paisa|payment|amount)\s+(?:bhejo|bhejiye|bhejein|bhejna|jama\s+kar\w*|dena|deni|dijiye|karo|karna|karni|karein)\b/i,
  /\bpayment\s+ke\s+baad\b/i,
];

/** "does not charge any fee", "no registration fee", "never ask for money" etc. */
const NEGATION_BEFORE = /\b(?:no|not|never|nor|without|doesn't|don't|won't|free\s+of)\b[^.!?\n;]*$/i;

function notNegated(text: string, start: number): boolean {
  // Look back within the same clause only.
  const before = text.slice(Math.max(0, start - 60), start);
  const clause = before.split(/[.!?\n;]/).pop() ?? "";
  return !NEGATION_BEFORE.test(clause);
}

export function detectPaymentRequest(text: string): PhraseHit | null {
  return findFirst(text, PAYMENT_PATTERNS, (t, start) => notNegated(t, start));
}

// ---- Other text signals ----------------------------------------------------------

export const REIMBURSEMENT_PATTERNS: RegExp[] = [/\b(?:reimburs(?:e|ed)\s+after\s+joining|will\s+be\s+reimbursed|refund(?:ed)?\s+after\s+joining)\b/i];
export const PURCHASE_PATTERN = /\b(?:purchase|buy)\b/i;

export const PAID_TRAINING_PATTERNS: RegExp[] = [
  /\bguaranteed\s+(?:placement|job)\b/i,
  /\bpay\s+for\s+(?:the\s+)?training\b/i,
  /\bcertification\s+fees?\s+before\s+joining\b/i,
  /\bplacement\s+after\s+(?:the\s+)?course\b/i,
  /\b100\s*%\s+(?:placement|job)\s+guarantee\b/i,
];

export const WHATSAPP_PATTERN = /\bwhats\s?app\b/i;

export const REGISTERED_CLAIM = /\b(?:registered|pvt\.?\s*ltd\.?|private\s+limited|llp|inc\.?)\b/i;

export function detectPattern(text: string, pattern: RegExp): PhraseHit | null {
  return findFirst(text, [pattern]);
}

export function detectAny(text: string, patterns: RegExp[]): PhraseHit | null {
  return findFirst(text, patterns);
}

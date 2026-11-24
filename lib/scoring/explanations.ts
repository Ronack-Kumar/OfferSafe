import type { PhraseHit } from "./text-signals";

/**
 * Plain-language "why this matters" for each red flag. Every report line is
 * "<what we found, quoting the user's text>" + " " + WHY[key].
 */
export const WHY: Record<string, string> = {
  known_scam_match:
    "Someone has already reported this pattern as a scam, so treat the offer as unsafe until you confirm it through the company's official website or HR.",
  email_free_provider:
    "Established companies hire from their own domain (name@company.com). Anyone can create a free Gmail or Yahoo address in a minute and pretend to be a recruiter.",
  email_domain_mismatch:
    "A real recruiter normally writes from the same domain as the company's website. A lookalike or unrelated domain is a common way to impersonate a well-known company.",
  cin_invalid_format:
    "Every Indian company has a 21-character CIN (or an LLPIN for LLPs). A number in the wrong format can't belong to a registered company.",
  cin_missing:
    "Genuine Indian offer letters usually show the company's CIN. Without it you can't look the company up in the government's MCA registry, so ask the recruiter for it.",
  gmail_as_official:
    "A company that is really registered would use its own email domain for official hiring, not a free personal inbox.",
  payment_requested:
    "Genuine employers never charge you to apply, join or receive an offer letter. Any fee, deposit or \"refundable\" payment is the most common sign of a job scam.",
  reimbursement_trap:
    "Being asked to buy something now with a promise of reimbursement after joining is a known trick: the money is never returned and the job never starts.",
  paid_training_placement:
    "Paying for training in exchange for a \"guaranteed\" job is a common scam. Real employers train new hires at their own cost.",
  domain_age_new:
    "Scam operations often register a fresh domain for each campaign. Established employers have domains that are years old.",
  unrealistic_stipend:
    "Pay far above the market rate for the role is bait to make you act before thinking it through.",
  urgency_language:
    "Short deadlines push you to pay or share documents before you have time to check the company. Real employers give you days to decide and never cancel an offer because you didn't pay.",
  no_company_web_presence:
    "Real companies are easy to find online. Look up the company yourself and contact it through its official website, not through links or numbers from the offer.",
  domain_missing:
    "A company website lets you check the careers page and contact details independently. Without one, nothing in the offer can be cross-checked.",
  no_interview_mentioned:
    "Legitimate employers assess candidates before hiring, with at least an interview, a test or a call. An offer that skips selection usually wants your money or documents, not your work.",
  whatsapp_only_recruitment:
    "Companies hire through official email and their own portals. Recruiting only over WhatsApp hides who you're dealing with and is typical of scams.",
  poor_formatting:
    "Genuine offer letters include the company's address, registration number, a date and an authorised signatory. Missing several of these suggests the letter wasn't issued by a real HR team.",
  vague_role:
    "Real offers describe the job clearly. A vague role often hides that there is no actual work behind the offer.",
  reddit_mentions:
    "Several people have publicly reported problems with this company or email. Read those threads before you go further.",
  reddit_comment_scam_score:
    "Other users have left scam warnings in public discussions about this company. Read them before you go further.",
  email_disposable:
    "Disposable inboxes are throwaway addresses that vanish after use. No real employer recruits from one.",
  email_no_mx:
    "A domain with no mail servers can't receive email, so it can't be a working company mailbox. The address is probably fake or only used for sending.",
  cin_not_found:
    "The CIN isn't in the official registry snapshot, so it may be made up or copied wrongly. Ask for it again and check it on the MCA website.",
  company_not_active:
    "A company that is struck off, dormant or being wound up shouldn't be hiring. Check its status on the MCA website before you go further.",
};

/** "Your offer says “…”." using the exact words from the user's text. */
export function says(hit: PhraseHit, where = "Your offer"): string {
  return `${where} says “${hit.quote}”.`;
}

export function explain(key: string, finding: string): string {
  const why = WHY[key];
  return why ? `${finding} ${why}` : finding;
}

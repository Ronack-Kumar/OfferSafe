/** Display names only. Scoring lives in app/api/analyze/route.ts and is unchanged. */
export const SIGNAL_TITLES: Record<string, string> = {
  known_scam_match: "Matches a known scam",
  email_free_provider: "Free email address",
  email_domain_mismatch: "Email and website don't match",
  cin_invalid_format: "CIN in the wrong format",
  gmail_as_official: "Gmail used as the official contact",
  payment_requested: "Asks you to pay",
  reimbursement_trap: "“Pay now, reimbursed later”",
  paid_training_placement: "Paid training or placement",
  domain_age_new: "Website registered recently",
  unrealistic_stipend: "Pay that's too good to be true",
  urgency_language: "Pressure to act fast",
  no_company_web_presence: "No company web presence",
  domain_missing: "No company website",
  no_interview_mentioned: "No interview",
  whatsapp_only_recruitment: "Hiring over WhatsApp",
  cin_missing: "No company registration number",
  poor_formatting: "Missing offer-letter details",
  vague_role: "Vague role",
  reddit_mentions: "Reported on Reddit",
  reddit_comment_scam_score: "Scam warnings in Reddit comments",
  email_disposable: "Throwaway email address",
  email_no_mx: "Email address can't receive mail",
  cin_not_found: "CIN not in the official registry",
  company_not_active: "Company isn't active",
};

export function signalTitle(key: string): string {
  return SIGNAL_TITLES[key] ?? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export const INPUT_LABELS: Record<string, string> = {
  companyName: "Company",
  recruiterName: "Recruiter",
  recruiterEmail: "Recruiter email",
  phone: "Phone",
  website: "Website",
  cin: "CIN",
  offerText: "Offer or email text",
  paymentText: "Payment request",
  extractedText: "Text from the offer letter",
  linkedinUrl: "LinkedIn",
  jobTitle: "Job title",
  roleDescription: "Role description",
};

export function inputLabel(key: string): string {
  return INPUT_LABELS[key] ?? key;
}

export const SEVERITY_LABELS: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

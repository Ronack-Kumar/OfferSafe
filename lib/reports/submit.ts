import { createHash, randomBytes } from "node:crypto";
import { runFreeChecks } from "../checks";
import { isFreeProvider, domainFromEmail } from "../checks/domains";
import { isValidCinFormat } from "../checks/mca";
import { detectNoInterview, detectPaymentRequest, detectUrgency } from "../scoring/text-signals";

/**
 * "Report a scam" submissions.
 *
 * Reports are saved through the database function submit_scam_report(), which can only
 * add a report (the public key can't read or change other reports). Reports are never
 * published as known scams automatically: an admin approves them on /admin-offersafe.
 * The website is checked with an RDAP domain-age lookup, never by fetching the URL the
 * reporter typed (which could point at internal addresses).
 */

export const MAX_PROOF_FILES = 5;
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const PROOF_TYPES: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

const LIMITS: Record<string, number> = {
  company_name: 200,
  recruiter_name: 200,
  recruiter_email: 320,
  recruiter_phone: 40,
  website_url: 500,
  linkedin_url: 500,
  cin: 30,
  role_offered: 200,
  how_contacted: 40,
  offer_text: 10000,
  chat_text: 10000,
  payment_text: 5000,
  reporter_email: 320,
};

export type ReportFields = Record<keyof typeof LIMITS, string>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ParsedReport = { ok: true; fields: ReportFields; files: File[] } | { ok: false; error: string };

export function parseReportForm(form: FormData): ParsedReport {
  const fields = {} as ReportFields;
  for (const [key, max] of Object.entries(LIMITS)) {
    const value = String(form.get(key) ?? "").trim();
    if (value.length > max) return { ok: false, error: `${key.replace(/_/g, " ")} is too long (max ${max} characters).` };
    fields[key] = value;
  }
  if (!fields.company_name) return { ok: false, error: "Company name is required." };
  if (String(form.get("truthful_confirmation")) !== "true") {
    return { ok: false, error: "Please confirm the report is truthful before submitting." };
  }
  for (const key of ["recruiter_email", "reporter_email"] as const) {
    if (fields[key] && !EMAIL.test(fields[key])) return { ok: false, error: `Check the ${key.replace(/_/g, " ")}: it isn't a valid email address.` };
  }

  const files = form.getAll("proof_files").filter((item): item is File => typeof item === "object" && item !== null && "arrayBuffer" in item && item.size > 0);
  if (files.length > MAX_PROOF_FILES) return { ok: false, error: `You can attach up to ${MAX_PROOF_FILES} files.` };
  for (const file of files) {
    if (!PROOF_TYPES[file.type]) return { ok: false, error: "Only PDF, JPG and PNG files can be attached." };
    if (file.size > MAX_PROOF_BYTES) return { ok: false, error: "Each file must be 5 MB or smaller." };
  }
  return { ok: true, fields, files };
}

/** Stable, non-reversible id for counting distinct reporters (IP + user agent). */
export function reporterFingerprint(headers: Headers): string {
  const ip = (headers.get("x-forwarded-for") || "").split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
  const ua = headers.get("user-agent") || "unknown";
  return createHash("sha256").update(`${ip}|${ua}`).digest("hex");
}

/** Storage path under the upload rule: reports/<16 hex>/<safe name>.<ext> */
export function proofPath(folder: string, index: number, file: File): string {
  const ext = PROOF_TYPES[file.type] ?? "bin";
  const base = file.name.replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60) || "file";
  return `reports/${folder}/${index + 1}-${base}.${ext}`;
}

export function newProofFolder(): string {
  return randomBytes(8).toString("hex");
}

/** Signals that help the admin triage the report. They never publish anything. */
export async function reportSignals(fields: ReportFields): Promise<string[]> {
  const text = [fields.offer_text, fields.chat_text, fields.payment_text].filter(Boolean).join("\n");
  const signals: string[] = [];

  const emailDomain = fields.recruiter_email ? domainFromEmail(fields.recruiter_email) : null;
  if (emailDomain && isFreeProvider(emailDomain)) signals.push("free_email_domain");
  if (fields.cin && !isValidCinFormat(fields.cin)) signals.push("invalid_cin_format");
  if (detectPaymentRequest(text)) signals.push("payment_demand_detected");
  if (detectUrgency(text)) signals.push("urgency_language");
  if (detectNoInterview(text)) signals.push("no_interview");

  // Domain age, disposable inbox and MX via the free checks (RDAP/DNS lookups only).
  const checks = await runFreeChecks({ recruiterEmail: fields.recruiter_email, website: fields.website_url, cin: fields.cin });
  for (const s of checks.signals) {
    if (s.key === "domain_age_new") signals.push("new_domain");
    if (s.key === "email_disposable") signals.push("disposable_email");
    if (s.key === "email_no_mx") signals.push("email_no_mx");
    if (s.key === "cin_not_found") signals.push("cin_not_found");
    if (s.key === "company_not_active") signals.push("company_not_active");
  }
  return [...new Set(signals)];
}

export function evidenceText(fields: ReportFields): string {
  return [
    fields.offer_text && `Offer letter:\n${fields.offer_text}`,
    fields.chat_text && `Conversation:\n${fields.chat_text}`,
    fields.payment_text && `Payment request:\n${fields.payment_text}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

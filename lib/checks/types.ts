/** Outcome of one free verification check, as stored in the report. */
export type CheckStatus =
  /** A red flag was found and scored. */
  | "flagged"
  /** Looked up, nothing suspicious. */
  | "passed"
  /** Informational only, never scored (e.g. registry name search). */
  | "info"
  /** Not applicable for this submission (no input, free provider, etc.). */
  | "skipped"
  /** The external source could not be reached in time; nothing was scored. */
  | "unavailable";

export type CheckId = "domain_age" | "email_disposable" | "email_mx" | "mca_registry" | "reddit";

export type CheckResult = {
  id: CheckId;
  /** What was checked, e.g. the domain or CIN. */
  target: string | null;
  status: CheckStatus;
  /** Human-readable, report-ready sentence. */
  detail: string;
  /** Structured facts for the report (dates, registry fields...). */
  data?: Record<string, unknown>;
};

/** Signal keys the free checks may add on top of the existing rules. */
export type FreeCheckSignalKey =
  | "domain_age_new"
  | "email_disposable"
  | "email_no_mx"
  | "cin_invalid_format"
  | "cin_not_found"
  | "company_not_active";

export type FreeCheckSignal = { key: FreeCheckSignalKey; reason: string };

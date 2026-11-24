import {
  CIN_REGEX,
  hashIdentifier,
  identifierKind,
  MCA_STATUS_ACTIVE,
  mcaStatusLabel,
  normalizeIdentifier,
} from "../../scripts/lib/mca-shared.mjs";
import { supabasePublicKey } from "../supabase-key";
import { fetchWithTimeout } from "./http";
import type { CheckResult } from "./types";

/**
 * MCA company master data, imported once into the `mca_companies` table by
 * scripts/import-mca.mjs from the data.gov.in "Registrars of Companies (RoC)-wise
 * Company Master Data" resource. Nothing here calls data.gov.in at request time.
 *
 * To fit the Supabase free tier the table stores only a 64-bit hash of each
 * normalized CIN/LLPIN plus status and registration date, so lookups are by CIN or
 * LLPIN only (no name search). The data is a snapshot: a match means "found in the
 * official registry snapshot", never "verified".
 */

export { CIN_REGEX, hashIdentifier, normalizeIdentifier };

/** Finds a CIN, or an LLPIN labelled as such, inside free text. */
const CIN_IN_TEXT = /\b[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b/;
const LLPIN_IN_TEXT = /\bLLPIN\b[\s:.#-]*([A-Z]{3}-\d{4})\b/;

/** Kept for callers: trim, uppercase, drop whitespace (hyphens stay, LLPINs need them). */
export const normalizeCin = normalizeIdentifier;

/** True for a well-formed CIN or LLPIN, after normalization. */
export function isValidCinFormat(value: string): boolean {
  return identifierKind(normalizeIdentifier(value)) !== null;
}

export function findCinInText(text: string): string | null {
  const upper = text.toUpperCase();
  return upper.match(CIN_IN_TEXT)?.[0] ?? upper.match(LLPIN_IN_TEXT)?.[1] ?? null;
}

export type McaCompany = { statusCode: number; status: string; registeredOn: string | null };

type McaRow = { status: number; registration_date: string | null };

/**
 * null = unavailable (not configured, timeout, HTTP error).
 * Reads with the public (publishable) key: mca_companies and mca_import_meta have a
 * read-only RLS policy, and no write policy. The secret key is used only by the import script.
 */
async function selectRows<T>(path: string): Promise<T[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = supabasePublicKey();
  if (!url || !key) return null;
  try {
    const res = await fetchWithTimeout(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) return null;
    const rows = (await res.json()) as unknown;
    return Array.isArray(rows) ? (rows as T[]) : null;
  } catch {
    return null;
  }
}

const IMPORT_CHECK_TTL_MS = 10 * 60 * 1000;
let importReady: { value: boolean; checkedAt: number } | null = null;

/** Test hook. */
export function resetMcaState(): void {
  importReady = null;
}

/**
 * True once scripts/import-mca.mjs has completed. Until then lookups are
 * "unavailable", so an empty or partial table never produces "CIN not found".
 */
async function registryImported(): Promise<boolean> {
  if (importReady && Date.now() - importReady.checkedAt < IMPORT_CHECK_TTL_MS) return importReady.value;
  const rows = await selectRows<{ completed_at: string }>("mca_import_meta?id=eq.1&select=completed_at");
  if (rows === null) return false; // transient: don't remember
  importReady = { value: rows.length > 0, checkedAt: Date.now() };
  return importReady.value;
}

/** null = unavailable; undefined = not in the snapshot. */
async function findByIdentifier(normalized: string): Promise<McaCompany | undefined | null> {
  if (!(await registryImported())) return null;
  const rows = await selectRows<McaRow>(
    `mca_companies?cin_hash=eq.${hashIdentifier(normalized)}&select=status,registration_date&limit=1`,
  );
  if (rows === null) return null;
  const row = rows[0];
  if (!row) return undefined;
  return { statusCode: Number(row.status), status: mcaStatusLabel(Number(row.status)), registeredOn: row.registration_date };
}

export async function checkCin(rawCin: string): Promise<CheckResult> {
  const id = normalizeIdentifier(rawCin);
  const kind = identifierKind(id);
  // Validate the format before any lookup.
  if (!kind) {
    return {
      id: "mca_registry",
      target: rawCin,
      status: "flagged",
      detail: `Invalid CIN format: "${rawCin}" is neither a 21-character CIN (e.g. L22210MH1995PLC084781) nor an LLPIN (e.g. AAA-0008).`,
      data: { reason: "invalid_format" },
    };
  }
  const label = kind === "llpin" ? "LLPIN" : "CIN";

  const company = await findByIdentifier(id);
  if (company === null) {
    return { id: "mca_registry", target: id, status: "unavailable", detail: "Official company registry check unavailable." };
  }
  if (company === undefined) {
    return {
      id: "mca_registry",
      target: id,
      status: "flagged",
      detail: `${label} not found: ${id} was not found in the official registry snapshot.`,
      data: { reason: "not_found", kind },
    };
  }
  if (company.statusCode !== MCA_STATUS_ACTIVE) {
    return {
      id: "mca_registry",
      target: id,
      status: "flagged",
      detail: `Company status not Active: ${id} is listed as "${company.status}" in the official registry snapshot.`,
      data: { reason: "not_active", kind, company },
    };
  }
  return {
    id: "mca_registry",
    target: id,
    status: "passed",
    detail: `${id} was found in the official registry snapshot with status Active${company.registeredOn ? `, registered on ${company.registeredOn}` : ""}.`,
    data: { kind, company },
  };
}

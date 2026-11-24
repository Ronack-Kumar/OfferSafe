import { adminRest, adminStorage, type AdminSession } from "./admin-auth";

/** Report statuses an admin can still approve or reject. */
export const OPEN_STATUSES = ["pending", "pending_review", "low_confidence"] as const;

export type PendingReport = {
  id: string;
  submitted_at: string;
  company_name: string | null;
  recruiter_email: string | null;
  website: string | null;
  cin: string | null;
  what_happened: string | null;
  evidence_text: string | null;
  source: string | null;
  source_url: string | null;
  report_count: number | null;
  status: string;
  proof_urls: string[] | null;
};

const REPORT_COLUMNS =
  "id,submitted_at,company_name,recruiter_email,website,cin,what_happened,evidence_text,source,source_url,report_count,status,proof_urls";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ActionResult = { ok: true; status: string } | { ok: false; httpStatus: number; error: string };

export function isReportId(value: string): boolean {
  return UUID.test(value);
}

export async function listReports(session: AdminSession): Promise<PendingReport[] | null> {
  const res = await adminRest(session, `pending_reports?select=${REPORT_COLUMNS}&order=submitted_at.desc`);
  if (!res?.ok) return null;
  return (await res.json()) as PendingReport[];
}

function domainFromWebsite(website: string | null): string | null {
  if (!website) return null;
  try {
    const withProto = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    return new URL(withProto).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function emailPattern(email: string | null): string[] {
  const local = email?.includes("@") ? email.split("@")[0]?.toLowerCase() : "";
  return local ? [local] : [];
}

/** Sets the decision on a still-open report. Returns the updated row, or null if it wasn't open. */
async function decide(session: AdminSession, id: string, status: "approved" | "rejected"): Promise<PendingReport | null | "error"> {
  const res = await adminRest(
    session,
    `pending_reports?id=eq.${id}&status=in.(${OPEN_STATUSES.join(",")})&select=${REPORT_COLUMNS}`,
    { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status }) },
  );
  if (!res?.ok) return "error";
  const rows = (await res.json()) as PendingReport[];
  return rows[0] ?? null;
}

export async function rejectReport(session: AdminSession, id: string): Promise<ActionResult> {
  const row = await decide(session, id, "rejected");
  if (row === "error") return { ok: false, httpStatus: 502, error: "Couldn't update the report. Try again." };
  if (!row) return { ok: false, httpStatus: 409, error: "This report was already decided or doesn't exist." };
  return { ok: true, status: "rejected" };
}

export async function approveReport(session: AdminSession, id: string): Promise<ActionResult> {
  const row = await decide(session, id, "approved");
  if (row === "error") return { ok: false, httpStatus: 502, error: "Couldn't update the report. Try again." };
  if (!row) return { ok: false, httpStatus: 409, error: "This report was already decided or doesn't exist." };

  const company = (row.company_name || "Unknown company").trim();
  const domain = domainFromWebsite(row.website);
  const insert = await adminRest(session, "scam_cases", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      case_name: company,
      company_name_variants: [company.toLowerCase()],
      email_patterns: emailPattern(row.recruiter_email),
      domain_patterns: domain ? [domain] : [],
      phone_patterns: [],
      scam_type: "user_reported",
      description: row.what_happened || row.evidence_text || "User submitted scam report",
      source_note: `${row.source || "Other"}${row.source_url ? ` - ${row.source_url}` : ""}`,
      severity: "medium",
      status: "approved",
    }),
  });
  if (!insert?.ok) {
    // Reopen the report so it can be approved again.
    await adminRest(session, `pending_reports?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "pending_review" }) });
    return { ok: false, httpStatus: 502, error: "Couldn't publish the scam case. The report is still pending." };
  }
  return { ok: true, status: "approved" };
}

export type ProofLink = { name: string; url: string };

const PROOF_PATH = /^reports\/[0-9a-f]{16}\/[A-Za-z0-9_-]{1,100}\.(pdf|jpg|png)$/;
const PROOF_LINK_SECONDS = 300;

/**
 * Short-lived download links for a report's attachments. Signed with the admin's own
 * token, so storage RLS ("report proofs admin read") decides access.
 */
export async function proofLinks(session: AdminSession, id: string): Promise<ProofLink[] | null> {
  const res = await adminRest(session, `pending_reports?id=eq.${id}&select=proof_urls`);
  if (!res?.ok) return null;
  const rows = (await res.json()) as Array<{ proof_urls: unknown }>;
  const paths = Array.isArray(rows[0]?.proof_urls) ? (rows[0].proof_urls as unknown[]).filter((p): p is string => typeof p === "string" && PROOF_PATH.test(p)) : [];
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;

  const links = await Promise.all(
    paths.map(async (path) => {
      const signed = await adminStorage(session, `object/sign/report-proofs/${path}`, {
        method: "POST",
        body: JSON.stringify({ expiresIn: PROOF_LINK_SECONDS }),
      });
      if (!signed?.ok) return null;
      const body = (await signed.json().catch(() => null)) as { signedURL?: string } | null;
      return body?.signedURL ? { name: path.split("/").pop() ?? path, url: `${base}/storage/v1${body.signedURL}` } : null;
    }),
  );
  return links.filter((l): l is ProofLink => l !== null);
}

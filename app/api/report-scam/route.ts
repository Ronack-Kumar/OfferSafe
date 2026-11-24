import { NextResponse } from "next/server";
import { MISSING_SUPABASE_ENV, supabasePublicKey } from "@/lib/supabase-key";
import {
  evidenceText,
  newProofFolder,
  parseReportForm,
  proofPath,
  reporterFingerprint,
  reportSignals,
  type ReportFields,
} from "@/lib/reports/submit";

export const dynamic = "force-dynamic";

type Submitted = { id: string; report_count: number; status: string };

function supabase(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = supabasePublicKey();
  if (!url || !key) throw new Error(MISSING_SUPABASE_ENV);
  return { url, key };
}

/** Uploads to the private report-proofs bucket. Returns the stored path, or null on failure. */
async function uploadProof(path: string, file: File): Promise<string | null> {
  const { url, key } = supabase();
  try {
    const res = await fetch(`${url}/storage/v1/object/report-proofs/${path}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "x-upsert": "false", "Content-Type": file.type },
      body: await file.arrayBuffer(),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    return res.ok ? path : null;
  } catch {
    return null;
  }
}

async function saveReport(fields: ReportFields, signals: string[], proofPaths: string[], fingerprint: string): Promise<Submitted> {
  const { url, key } = supabase();
  const res = await fetch(`${url}/rest/v1/rpc/submit_scam_report`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      report: {
        company_name: fields.company_name,
        recruiter_name: fields.recruiter_name,
        recruiter_email: fields.recruiter_email,
        recruiter_phone: fields.recruiter_phone,
        website: fields.website_url,
        linkedin_url: fields.linkedin_url,
        cin: fields.cin,
        role_offered: fields.role_offered,
        how_contacted: fields.how_contacted,
        what_happened: fields.chat_text || fields.offer_text || fields.payment_text,
        evidence_text: evidenceText(fields),
        reporter_email: fields.reporter_email,
        verified_signals: signals,
        proof_paths: proofPaths,
        reporter_fingerprint: fingerprint,
      },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`submit_scam_report failed (${res.status})`);
  const rows = (await res.json()) as Submitted[];
  if (!rows[0]?.id) throw new Error("submit_scam_report returned no id");
  return rows[0];
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Couldn't read the form. Please try again." }, { status: 400 });
  }

  const parsed = parseReportForm(form);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { fields, files } = parsed;

  try {
    const folder = newProofFolder();
    const [signals, uploaded] = await Promise.all([
      reportSignals(fields),
      Promise.all(files.map((file, i) => uploadProof(proofPath(folder, i, file), file))),
    ]);
    const proofPaths = uploaded.filter((p): p is string => p !== null);

    const saved = await saveReport(fields, signals, proofPaths, reporterFingerprint(req.headers));

    return NextResponse.json({
      id: saved.id,
      status: saved.status,
      report_count: saved.report_count,
      signal_count: signals.length,
      files_saved: proofPaths.length,
      files_failed: files.length - proofPaths.length,
    });
  } catch (error) {
    console.error("report-scam failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "We couldn't save your report right now. Please try again in a few minutes." }, { status: 502 });
  }
}

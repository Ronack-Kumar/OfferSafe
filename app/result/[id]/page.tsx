import { notFound } from "next/navigation";
import { RedditSection } from "@/components/reddit-section";
import Link from "next/link";
import { DownloadReportButton } from "@/components/download-report-button";
import { QuotedText } from "@/components/quoted-text";
import { supabaseGet, supabasePost } from "@/lib/supabase-rest";
import { inputLabel, SEVERITY_LABELS, signalTitle } from "@/lib/signal-labels";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CaseRow = {
  id: string;
  inputs_json: Record<string, unknown> | null;
  extracted_entities_json: Record<string, unknown> | null;
  signals_json: Array<{ key: string; severity: string; weight: number; reason?: string }> | null;
  matched_case_id: string | null;
  risk_score: number;
  verdict: string;
  confidence: string;
  explanation_json: {
    signalExplanations?: Record<string, string>;
    nextSteps?: string[];
  } | null;
  reddit_mentions_json:
    | {
        posts?: Array<{
          id: string;
          title: string;
          subreddit: string;
          score: number;
          permalink: string;
          url: string;
        }>;
        comments?: Record<
          string,
          Array<{
            id: string;
            author: string;
            body: string;
            score: number;
          }>
        >;
      }
    | Array<{
        id: string;
        title: string;
        subreddit: string;
        score: number;
        permalink: string;
        url: string;
      }>
    | null;
  /** Added by the free verification checks; absent on older reports. */
  verification_checks_json?: Array<{
    id: string;
    target: string | null;
    status: "flagged" | "passed" | "info" | "skipped" | "unavailable";
    detail: string;
  }> | null;
};

const CHECK_LABELS: Record<string, string> = {
  domain_age: "Domain age",
  email_disposable: "Disposable inbox",
  email_mx: "Email can receive mail",
  mca_registry: "Official company registry (MCA)",
  reddit: "Reddit scam reports",
};

function checkStatus(status: string): { label: string; tone: string } {
  switch (status) {
    case "flagged":
      return { label: "Red flag", tone: "risk" };
    case "passed":
      return { label: "OK", tone: "ok" };
    case "info":
      return { label: "Info", tone: "note" };
    case "unavailable":
      return { label: "Check unavailable", tone: "muted" };
    default:
      return { label: "Not applicable", tone: "muted" };
  }
}

type ScamCaseRow = {
  id: string;
  case_name: string;
  scam_type: string;
  description: string;
  severity: string;
  company_name_variants: string[] | null;
  email_patterns: string[] | null;
  domain_patterns: string[] | null;
};

const VERDICTS: Record<string, { tone: string; title: string; advice: string }> = {
  "LOW RISK": { tone: "ok", title: "Low risk", advice: "No serious red flags. Still confirm the offer through the company's official channels." },
  CAUTION: { tone: "warn", title: "Caution", advice: "Some warning signs. Ask for an interview and an email from the company's own domain." },
  SUSPICIOUS: { tone: "orange", title: "Suspicious", advice: "Several red flags. Don't share documents or pay anything until you've verified the company." },
  "HIGH-RISK SCAM": { tone: "risk", title: "High-risk scam", advice: "Walk away. Don't pay, and report it so the next student is warned." },
};

export default async function ResultPage({ params }: { params: { id: string } }) {
  // Reports are fetched one at a time by id (get_case), never listed.
  if (!UUID.test(params.id)) notFound();
  const rows = await supabasePost<CaseRow[]>("rpc/get_case", { case_id: params.id });
  const row = rows[0];
  if (!row) notFound();

  const matched =
    row.matched_case_id
      ? await supabaseGet<ScamCaseRow[]>(
          `scam_cases?id=eq.${row.matched_case_id}&select=id,case_name,scam_type,description,severity,company_name_variants,email_patterns,domain_patterns`,
        )
      : [];

  const matchedCase = matched[0];
  const signals = row.signals_json ?? [];
  const explanations = row.explanation_json?.signalExplanations ?? {};
  const nextSteps = row.explanation_json?.nextSteps ?? [];
  const score = row.risk_score ?? 0;
  const verificationChecks = (row.verification_checks_json ?? []).filter((check) => check.status !== "skipped");
  const redditRaw = row.reddit_mentions_json;
  const redditMentions = Array.isArray(redditRaw) ? redditRaw : redditRaw?.posts ?? [];
  const redditCommentsByPost = Array.isArray(redditRaw) ? {} : redditRaw?.comments ?? {};
  // Older reports have no verification checks; treat their stored Reddit data as available.
  const redditAvailable = row.verification_checks_json?.find((check) => check.id === "reddit")?.status !== "unavailable";

  const inputEntries = Object.entries(row.inputs_json ?? {}).filter(([, value]) => String(value ?? "").trim().length > 0);
  const missingFields = [
    "companyName",
    "cin",
    "recruiterEmail",
    "phone",
    "website",
    "linkedinUrl",
    "offerText",
    "paymentText",
    "extractedText",
  ].filter((key) => !(row.inputs_json && String(row.inputs_json[key] ?? "").trim()));

  const verdict = VERDICTS[row.verdict] ?? { tone: "muted", title: row.verdict, advice: "" };
  const sortedSignals = [...signals].sort((a, b) => b.weight - a.weight);
  const pct = Math.max(0, Math.min(score, 100));

  return (
    <div className="wrap pb-8 pt-6">
      <style media="print">{`
        .report-grid { display: block !important; }
        .score-card { position: static !important; color: #000 !important; background: #fff !important; border: 2px solid #000; margin-bottom: 16px; }
        .score-card * { color: #000 !important; }
        .card, .flag, .rcheck { break-inside: avoid; box-shadow: none !important; border: 1px solid #cbd5e1 !important; }
        a { pointer-events: none !important; color: inherit !important; text-decoration: none !important; }
      `}</style>

      <div className="print-hide mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow">Your report</p>
        <Link href="/analyze" className="btn-ghost">
          Check another offer
        </Link>
      </div>

      <div className="report-grid">
        <aside className={`score-card tone-${verdict.tone}`} aria-label="Risk score">
          <p className="score-label">Risk score</p>
          <p className="score-big">
            {score}
            <small>/100</small>
          </p>
          <div className="score-bar" aria-hidden="true">
            <i style={{ width: `${pct}%` }} />
          </div>
          <div className="score-scale" aria-hidden="true">
            <span>Low risk</span>
            <span>Caution</span>
            <span>Scam</span>
          </div>
          <div className="score-verdict">
            <strong>{verdict.title}</strong>
            <span>{verdict.advice}</span>
            <span className="score-conf">Confidence: {row.confidence}</span>
          </div>
        </aside>

        <div className="min-w-0 space-y-10">
          {matchedCase ? (
            <div className="matched" role="note">
              <p className="font-bold">Matches a known scam: {matchedCase.case_name}</p>
              <p className="mt-1 text-[15px]">Details are listed further down, under &ldquo;Known scam match&rdquo;.</p>
            </div>
          ) : null}

          <section aria-labelledby="flags-title">
            <h1 id="flags-title" className="section-title mb-2 text-[clamp(28px,3vw,38px)]">
              {sortedSignals.length === 0
                ? "No red flags found."
                : `${sortedSignals.length} red flag${sortedSignals.length === 1 ? "" : "s"}, most serious first.`}
            </h1>
            <p className="lede mb-6 text-[16px]">
              {sortedSignals.length === 0
                ? "Nothing in what you shared matched our scam signals. That isn't proof the offer is real, so still verify it."
                : "Each flag shows the exact words that triggered it and why it matters. Points add up to the score, capped at 100."}
            </p>
            {sortedSignals.length ? (
              <div className="grid gap-3">
                {sortedSignals.map((signal) => (
                  <article key={signal.key} className="flag">
                    <div className="flag-head">
                      <h2>{signalTitle(signal.key)}</h2>
                      <span className={`sev sev-${signal.severity}`}>
                        <span className="sr-only">{SEVERITY_LABELS[signal.severity] ?? signal.severity} severity, </span>+{signal.weight}
                      </span>
                    </div>
                    <p>
                      <QuotedText text={explanations[signal.key] ?? signal.reason ?? "Explanation unavailable."} />
                    </p>
                  </article>
                ))}
              </div>
            ) : null}
          </section>

          <section aria-labelledby="next-title" className="next">
            <h2 id="next-title">What to do next</h2>
            <ol>
              {nextSteps.length ? nextSteps.map((step) => <li key={step}>{step}</li>) : <li>Verify the company through its official website and channels.</li>}
            </ol>
          </section>

          {verificationChecks.length > 0 ? (
            <section aria-labelledby="checks-title">
              <h2 id="checks-title" className="sub-title">
                Free verification checks
              </h2>
              <ul className="rchecks">
                {verificationChecks.map((check, index) => {
                  const status = checkStatus(check.status);
                  return (
                    <li key={`${check.id}-${check.target ?? index}`} className="rcheck">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3>{CHECK_LABELS[check.id] ?? check.id.replaceAll("_", " ")}</h3>
                        <span className={`status-badge tone-${status.tone}`}>{status.label}</span>
                      </div>
                      <p className="break-words">{check.detail}</p>
                    </li>
                  );
                })}
              </ul>
              <p className="hint mt-3">Registry results come from a snapshot of MCA data and are information, not verification.</p>
            </section>
          ) : null}

          <RedditSection posts={redditMentions} comments={redditCommentsByPost} available={redditAvailable} />

          {matchedCase ? (
            <section aria-labelledby="match-title" className="card space-y-4">
              <h2 id="match-title" className="sub-title !mb-0">
                Known scam match
              </h2>
              <p>
                <strong>{matchedCase.case_name}</strong>{" "}
                <span className="text-[var(--graphite)]">
                  ({matchedCase.scam_type}, {matchedCase.severity})
                </span>
              </p>
              <p className="text-[var(--graphite)]">{matchedCase.description}</p>
              {[
                ["Also known as", matchedCase.company_name_variants],
                ["Suspicious email patterns", matchedCase.email_patterns],
                ["Known fake domains", matchedCase.domain_patterns],
              ].map(([label, items]) =>
                Array.isArray(items) && items.length ? (
                  <div key={label as string} className="space-y-2">
                    <p className="text-sm font-semibold">{label as string}</p>
                    <ul className="chips">
                      {items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </section>
          ) : null}

          <section aria-labelledby="evidence-title" className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="card">
              <h2 id="evidence-title" className="sub-title">
                What you shared
              </h2>
              {inputEntries.length === 0 ? (
                <p className="text-[var(--graphite)]">No details were provided.</p>
              ) : (
                <dl className="evidence">
                  {inputEntries.map(([key, value]) => (
                    <div key={key}>
                      <dt>{inputLabel(key)}</dt>
                      <dd className="break-words">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            <div className="card">
              <h2 className="sub-title">Not provided</h2>
              {missingFields.length ? (
                <>
                  <p className="hint mb-3">Adding these makes the check more reliable.</p>
                  <ul className="chips">
                    {missingFields.map((key) => (
                      <li key={key}>{inputLabel(key)}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-[var(--graphite)]">You filled in everything we use.</p>
              )}
            </div>
          </section>

          <p className="hint">This is a risk assessment, not legal advice. Always verify independently before making any decisions.</p>

          <div className="print-hide flex flex-wrap items-center gap-3">
            <DownloadReportButton />
            <Link href="/analyze" className="btn-secondary">
              Check another offer
            </Link>
            <Link href="/report-a-scam" className="btn-ghost">
              Report this as a scam
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";

type SearchParams = {
  id?: string;
  signals?: string;
  status?: string;
  files_failed?: string;
};

export default function ReportSubmittedPage({ searchParams }: { searchParams: SearchParams }) {
  const reportId = searchParams.id || "Unavailable";
  const signals = Math.max(0, Number(searchParams.signals || 0) || 0);
  const filesFailed = Math.max(0, Number(searchParams.files_failed || 0) || 0);
  const lowConfidence = searchParams.status === "low_confidence";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="card space-y-4">
        <p className="label" style={{ color: "var(--safe)" }}>
          Submission received
        </p>
        <h1 className="text-3xl">Thank you for helping protect students</h1>
        <p className="break-all">
          Report reference: <span className="font-semibold">{reportId}</span>
        </p>
        {signals > 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            We found {signals} warning sign{signals === 1 ? "" : "s"} in what you shared.
          </p>
        ) : null}
        <p className="card p-3 text-sm font-medium" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
          {lowConfidence
            ? "A moderator will review your report. Adding the offer text, payment details or a screenshot helps us confirm it faster."
            : "A moderator will review your report. If it's confirmed, it's added to our list of known scams to warn other job seekers."}
        </p>
        {filesFailed > 0 ? (
          <p className="text-sm" style={{ color: "var(--danger)" }}>
            {filesFailed} attachment{filesFailed === 1 ? "" : "s"} couldn&apos;t be uploaded. The rest of your report was saved.
          </p>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href="/analyze" className="btn-primary inline-flex items-center">
          Check another offer
        </Link>
        <Link href="/report-a-scam" className="btn-secondary inline-flex items-center">
          Report another scam
        </Link>
      </div>
    </div>
  );
}

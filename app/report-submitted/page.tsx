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
    <div className="wrap pb-8 pt-6">
      <section className="mx-auto max-w-[720px]">
        <p className="eyebrow mb-3">Report received</p>
        <h1 className="page-title mb-5">
          Thank you for <span className="swipe">warning the next student</span>.
        </h1>
        <div className="sheet space-y-4 p-6 sm:p-8">
          <p className="break-all">
            <span className="text-[var(--graphite)]">Report reference</span>
            <br />
            <span className="font-semibold">{reportId}</span>
          </p>
          {signals > 0 ? (
            <p>
              We found <strong>{signals}</strong> warning sign{signals === 1 ? "" : "s"} in what you shared.
            </p>
          ) : null}
          <p className="callout callout-note">
            {lowConfidence
              ? "A moderator will review your report. Adding the offer text, payment details or a screenshot helps us confirm it faster."
              : "A moderator will review your report. If it's confirmed, it's added to the scam register to warn other job seekers."}
          </p>
          {filesFailed > 0 ? (
            <p role="alert" className="callout callout-error">
              {filesFailed} attachment{filesFailed === 1 ? "" : "s"} couldn&apos;t be uploaded. The rest of your report was saved.
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/analyze" className="btn-primary">
            Check another offer
          </Link>
          <Link href="/scam-cases" className="btn-secondary">
            Browse the scam register
          </Link>
        </div>
      </section>
    </div>
  );
}

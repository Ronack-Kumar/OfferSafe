"use client";

export function DownloadReportButton() {
  function onDownload() {
    window.print();
  }

  return (
    <button type="button" onClick={onDownload} className="btn-primary">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
      </svg>
      Download PDF report
    </button>
  );
}

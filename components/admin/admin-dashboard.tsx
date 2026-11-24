"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PendingReport } from "@/lib/admin-reports";
import ReportAttachments from "./report-attachments";
import SignOutButton from "./sign-out-button";

const OPEN = new Set(["pending", "pending_review", "low_confidence"]);

export default function AdminDashboard({ email }: { email: string }) {
  const [rows, setRows] = useState<PendingReport[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAuthFailure = (status: number) => {
    if (status === 401) window.location.assign("/admin-offersafe/login");
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reports", { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { reports?: PendingReport[]; error?: string } | null;
      if (!res.ok) {
        handleAuthFailure(res.status);
        throw new Error(body?.error ?? "Couldn't load reports.");
      }
      setRows(body?.reports ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load reports.");
      setRows((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const list = rows ?? [];
    return {
      pending: list.filter((r) => OPEN.has(r.status)).length,
      approved: list.filter((r) => r.status === "approved").length,
      rejected: list.filter((r) => r.status === "rejected").length,
    };
  }, [rows]);

  async function act(id: string, action: "approve" | "reject") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reports/${id}/${action}`, { method: "POST" });
      if (!res.ok) {
        handleAuthFailure(res.status);
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Couldn't ${action} the report.`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Couldn't ${action} the report.`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">OfferSafe Admin</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Signed in as {email}
          </p>
        </div>
        <SignOutButton />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card">
          <p className="label">Pending</p>
          <p className="text-2xl font-bold">{counts.pending}</p>
        </div>
        <div className="card">
          <p className="label">Approved</p>
          <p className="text-2xl font-bold">{counts.approved}</p>
        </div>
        <div className="card">
          <p className="label">Rejected</p>
          <p className="text-2xl font-bold">{counts.rejected}</p>
        </div>
      </div>

      {error ? (
        <p role="alert" className="card p-3 text-sm" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}

      {rows === null ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Loading reports…
        </p>
      ) : rows.length === 0 ? (
        <div className="card text-sm" style={{ color: "var(--muted)" }}>
          No reports yet. New submissions from the Report a scam form will show up here.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((report) => (
            <article key={report.id} className="card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="break-words text-lg font-semibold">{report.company_name || "Unknown company"}</h2>
                <span className="status-badge border border-[#d1d5db] bg-[#f3f4f6] text-[#374151]">{report.status}</span>
              </div>
              <p className="break-words text-sm" style={{ color: "var(--muted)" }}>
                {report.what_happened || "No details provided."}
              </p>
              <div className="break-words text-xs" style={{ color: "var(--muted)" }}>
                {report.recruiter_email || "No email"} | {report.website || "No website"} | {report.source || "Unknown source"}
              </div>
              <div className="text-xs font-medium" style={{ color: "var(--muted)" }}>
                Report count: {report.report_count ?? 1}
              </div>
              <ReportAttachments reportId={report.id} count={Array.isArray(report.proof_urls) ? report.proof_urls.length : 0} />
              {OPEN.has(report.status) ? (
                <div className="flex gap-2">
                  <button type="button" disabled={busyId === report.id} onClick={() => act(report.id, "approve")} className="btn-primary">
                    Approve
                  </button>
                  <button type="button" disabled={busyId === report.id} onClick={() => act(report.id, "reject")} className="btn-danger">
                    Reject
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

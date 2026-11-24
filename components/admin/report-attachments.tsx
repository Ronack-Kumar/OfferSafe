"use client";

import { useState } from "react";

type Link = { name: string; url: string };

/** Loads 5-minute download links for a report's attachments when the admin asks for them. */
export default function ReportAttachments({ reportId, count }: { reportId: string; count: number }) {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (count === 0) return null;

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reports/${reportId}/proofs`, { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { links?: Link[]; error?: string } | null;
      if (res.status === 401) window.location.assign("/admin-offersafe/login");
      if (!res.ok) throw new Error(body?.error ?? "Couldn't load attachments.");
      setLinks(body?.links ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load attachments.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1 text-xs">
      {links === null ? (
        <button type="button" className="btn-secondary" onClick={load} disabled={busy}>
          {busy ? "Loading…" : `View ${count} attachment${count === 1 ? "" : "s"}`}
        </button>
      ) : links.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No attachments could be found for this report.</p>
      ) : (
        <ul className="space-y-1">
          {links.map((link) => (
            <li key={link.url}>
              <a href={link.url} target="_blank" rel="noopener noreferrer" className="underline">
                {link.name}
              </a>{" "}
              <span style={{ color: "var(--muted)" }}>(link expires in 5 minutes)</span>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

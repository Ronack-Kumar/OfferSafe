"use client";
import { supabasePublicKey } from "@/lib/supabase-key";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ScamCase = {
  id: string;
  case_name: string;
  scam_type: string;
  severity: string;
  description: string;
};

function typeLabel(type: string): string {
  if (type === "all") return "All types";
  const t = type.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function severityLabel(severity: string): string {
  return severity ? severity.charAt(0).toUpperCase() + severity.slice(1) : "Unknown";
}

export default function ScamCasesPage() {
  const [rows, setRows] = useState<ScamCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [scamType, setScamType] = useState("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const anon = supabasePublicKey();
        if (!base || !anon) throw new Error("Missing Supabase env vars");
        const res = await fetch(`${base}/rest/v1/scam_cases?status=eq.approved&select=id,case_name,scam_type,severity,description`, {
          headers: {
            apikey: anon,
            Authorization: `Bearer ${anon}`,
          },
          cache: "no-store",
        });
        if (!res.ok) throw new Error(await res.text());
        setRows((await res.json()) as ScamCase[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load scam cases");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const scamTypes = useMemo(() => ["all", ...Array.from(new Set(rows.map((r) => r.scam_type))).sort()], [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const matchesType = scamType === "all" || r.scam_type === scamType;
      const matchesSearch = r.case_name.toLowerCase().includes(search.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [rows, scamType, search]);

  function clearFilters() {
    setSearch("");
    setScamType("all");
  }

  return (
    <div className="wrap pb-8 pt-6">
      <div className="mb-10 grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <p className="eyebrow mb-3">Scam register</p>
          <h1 className="page-title mb-4">The register of known scams.</h1>
          <p className="lede">
            Every case here was reported and checked. If your recruiter&apos;s name, email or website matches one, your report
            says so.
          </p>
        </div>
        <Link href="/report-a-scam" className="btn-primary">
          Report a scam
        </Link>
      </div>

      <div className="reg-tools">
        <div className="chips-filter" role="group" aria-label="Filter by scam type">
          {scamTypes.map((type) => (
            <button key={type} type="button" className="chipbtn" aria-pressed={scamType === type} onClick={() => setScamType(type)}>
              {typeLabel(type)}
            </button>
          ))}
        </div>
        <div className="reg-search">
          <label htmlFor="register-search" className="label">
            Search by company name
          </label>
          <div className="search-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input id="register-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. TechNova" />
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" className="callout callout-error mb-4">
          We couldn&apos;t load the register right now. Please refresh the page.
        </p>
      ) : null}

      <div className="register" aria-busy={loading}>
        <table>
          <caption className="sr-only">Known scam cases</caption>
          <thead>
            <tr>
              <th scope="col" className="col-no">
                No.
              </th>
              <th scope="col">Case</th>
              <th scope="col">Type</th>
              <th scope="col">Severity</th>
              <th scope="col">What happens</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 4 }, (_, i) => (
                  <tr key={i} className="reg-skeleton" aria-hidden="true">
                    <td className="col-no">
                      <span />
                    </td>
                    <td>
                      <span />
                    </td>
                    <td>
                      <span />
                    </td>
                    <td>
                      <span />
                    </td>
                    <td>
                      <span />
                    </td>
                  </tr>
                ))
              : filtered.map((row, i) => (
                  <tr key={row.id} style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
                    <td className="col-no" data-label="No.">
                      {String(rows.indexOf(row) + 1).padStart(3, "0")}
                    </td>
                    <td className="reg-name" data-label="Case">
                      {row.case_name}
                    </td>
                    <td data-label="Type">{typeLabel(row.scam_type)}</td>
                    <td data-label="Severity">
                      <span className={`reg-sev reg-sev-${row.severity}`}>{severityLabel(row.severity)}</span>
                    </td>
                    <td className="reg-desc" data-label="What happens">
                      {row.description}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
        {!loading && !error && !filtered.length ? (
          <div className="reg-empty">
            <p>
              {rows.length
                ? `No cases match${search ? ` “${search}”` : ""}. That doesn't make the offer safe, so check the offer itself.`
                : "The register is empty right now."}
            </p>
            {rows.length ? (
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <button type="button" className="btn-secondary" onClick={clearFilters}>
                  Clear filters
                </button>
                <Link href="/analyze" className="btn-primary">
                  Check an offer
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {!loading && rows.length ? (
        <p className="hint mt-3" aria-live="polite">
          Showing {filtered.length} of {rows.length} cases.
        </p>
      ) : null}
    </div>
  );
}

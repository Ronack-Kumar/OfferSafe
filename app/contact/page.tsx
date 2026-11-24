"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import HoneypotField from "@/components/honeypot-field";
import { HONEYPOT_FIELD, STARTED_AT_FIELD } from "@/lib/spam-fields";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [trap, setTrap] = useState("");
  const [startedAt] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message, [HONEYPOT_FIELD]: trap, [STARTED_AT_FIELD]: startedAt }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to submit");
      setStatus("Thanks for reaching out. We received your message.");
      setName("");
      setEmail("");
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="wrap pb-8 pt-6">
      <div className="form-layout">
        <div className="form-intro">
          <p className="eyebrow mb-3">Contact</p>
          <h1 className="page-title mb-4">Get in touch.</h1>
          <p className="lede">
            Found a scam we missed, or think a result was wrong? Send us a note and we&apos;ll reply to the email you give.
          </p>
          <p className="hint mt-6">
            To report a fake offer, use{" "}
            <Link href="/report-a-scam" className="font-semibold text-[var(--ink)] underline underline-offset-4">
              Report a scam
            </Link>{" "}
            instead. It reaches the moderation queue directly.
          </p>
        </div>

        <form onSubmit={onSubmit} className="form-section relative" aria-busy={submitting}>
          <HoneypotField value={trap} onChange={setTrap} />
          <div className="field">
            <label className="label" htmlFor="c-name">
              Name
            </label>
            <input id="c-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
          </div>
          <div className="field">
            <label className="label" htmlFor="c-email">
              Email
            </label>
            <input id="c-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div className="field">
            <label className="label" htmlFor="c-message">
              Message
            </label>
            <textarea id="c-message" className="textarea h-40" value={message} onChange={(e) => setMessage(e.target.value)} required />
          </div>

          {error ? (
            <p role="alert" className="callout callout-error">
              {error}
            </p>
          ) : null}
          {status ? (
            <p role="status" className="callout callout-ok">
              {status}
            </p>
          ) : null}

          <div>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Sending…
                </>
              ) : (
                "Send message"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

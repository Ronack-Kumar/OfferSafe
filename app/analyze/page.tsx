"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChangeEvent } from "react";

type AnalyzeForm = {
  companyName: string;
  cin: string;
  recruiterEmail: string;
  recruiterName: string;
  offerText: string;
  phone: string;
  website: string;
  linkedinUrl: string;
  paymentText: string;
  extractedText: string;
  jobTitle: string;
  roleDescription: string;
};

const initialState: AnalyzeForm = {
  companyName: "",
  cin: "",
  recruiterEmail: "",
  recruiterName: "",
  offerText: "",
  phone: "",
  website: "",
  linkedinUrl: "",
  paymentText: "",
  extractedText: "",
  jobTitle: "",
  roleDescription: "",
};

export default function AnalyzePage() {
  const router = useRouter();
  const [form, setForm] = useState<AnalyzeForm>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error || "Failed to analyze offer");
      router.push(`/result/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setSubmitting(false);
    }
  }

  function bind<K extends keyof AnalyzeForm>(key: K) {
    return {
      value: form[key],
      onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((prev) => ({ ...prev, [key]: e.target.value })),
    };
  }

  return (
    <div className="wrap pb-8 pt-6">
      <div className="form-layout">
        <div className="form-intro">
          <p className="eyebrow mb-3">Check an offer</p>
          <h1 className="page-title mb-4">Paste what they sent you.</h1>
          <p className="lede mb-8">
            Every field is optional. The more you add, the more checks we can run. Nothing here is shared with the recruiter.
          </p>
          <ul className="intro-list">
            <li>
              <b>The offer or message text</b> lets us quote the exact words that look wrong.
            </li>
            <li>
              <b>The recruiter&apos;s email</b> is checked for free and throwaway domains, mail servers and domain age.
            </li>
            <li>
              <b>The CIN</b> is looked up in a snapshot of the government&apos;s MCA company registry.
            </li>
          </ul>
        </div>

        <form onSubmit={onSubmit} className="space-y-5" aria-busy={submitting}>
          <fieldset className="form-section">
            <legend>
              <span className="step-num" aria-hidden="true">
                1
              </span>
              The offer
            </legend>
            <div className="field">
              <label className="label" htmlFor="f-offer">
                Offer or email text
              </label>
              <textarea id="f-offer" className="textarea h-40" {...bind("offerText")} placeholder="Paste the full message or offer letter" />
            </div>
            <div className="field">
              <label className="label" htmlFor="f-payment">
                Payment request, if any
              </label>
              <textarea id="f-payment" className="textarea h-28" {...bind("paymentText")} placeholder="e.g. Pay ₹2,499 for your training kit via UPI" />
            </div>
            <div className="field">
              <label className="label" htmlFor="f-extracted">
                Text from an offer letter PDF or image
              </label>
              <textarea id="f-extracted" className="textarea h-32" {...bind("extractedText")} />
            </div>
          </fieldset>

          <fieldset className="form-section">
            <legend>
              <span className="step-num" aria-hidden="true">
                2
              </span>
              The company
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="field">
                <label className="label" htmlFor="f-company">
                  Company name
                </label>
                <input id="f-company" className="input" {...bind("companyName")} autoComplete="off" />
              </div>
              <div className="field">
                <label className="label" htmlFor="f-cin">
                  CIN
                </label>
                <input id="f-cin" className="input" {...bind("cin")} aria-describedby="f-cin-hint" autoComplete="off" spellCheck={false} />
                <p id="f-cin-hint" className="hint">
                  21-character CIN (e.g. L22210MH1995PLC084781) or LLPIN (e.g. AAA-0008)
                </p>
              </div>
              <div className="field">
                <label className="label" htmlFor="f-website">
                  Company website
                </label>
                <input id="f-website" className="input" {...bind("website")} inputMode="url" autoComplete="off" placeholder="example.com" />
              </div>
              <div className="field">
                <label className="label" htmlFor="f-linkedin">
                  LinkedIn page
                </label>
                <input id="f-linkedin" className="input" {...bind("linkedinUrl")} inputMode="url" autoComplete="off" />
              </div>
            </div>
          </fieldset>

          <fieldset className="form-section">
            <legend>
              <span className="step-num" aria-hidden="true">
                3
              </span>
              The recruiter
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="field">
                <label className="label" htmlFor="f-email">
                  Recruiter email
                </label>
                <input id="f-email" className="input" {...bind("recruiterEmail")} inputMode="email" autoComplete="off" spellCheck={false} />
              </div>
              <div className="field">
                <label className="label" htmlFor="f-phone">
                  Phone number
                </label>
                <input id="f-phone" className="input" {...bind("phone")} inputMode="tel" autoComplete="off" />
              </div>
              <div className="field sm:col-span-2">
                <label className="label" htmlFor="f-recruiter">
                  Recruiter name
                </label>
                <input id="f-recruiter" className="input" {...bind("recruiterName")} autoComplete="off" />
              </div>
            </div>
          </fieldset>

          <fieldset className="form-section">
            <legend>
              <span className="step-num" aria-hidden="true">
                4
              </span>
              The role
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="field">
                <label className="label" htmlFor="f-title">
                  Job title
                </label>
                <input id="f-title" className="input" {...bind("jobTitle")} autoComplete="off" />
              </div>
              <div className="field">
                <label className="label" htmlFor="f-role">
                  Role description
                </label>
                <textarea id="f-role" className="textarea h-24" {...bind("roleDescription")} />
              </div>
            </div>
          </fieldset>

          {error ? (
            <p role="alert" className="callout callout-error">
              {error}
            </p>
          ) : null}

          <div className="submit-bar">
            <button type="submit" disabled={submitting} className="btn-primary w-full sm:w-auto">
              {submitting ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Checking the offer…
                </>
              ) : (
                "Check this offer"
              )}
            </button>
            <p className="hint">Takes up to 20 seconds. You&apos;ll get a report with every red flag explained.</p>
          </div>
        </form>
      </div>
    </div>
  );
}

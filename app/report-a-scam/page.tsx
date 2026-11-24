"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ReportForm = {
  company_name: string;
  recruiter_name: string;
  recruiter_email: string;
  recruiter_phone: string;
  website_url: string;
  linkedin_url: string;
  cin: string;
  role_offered: string;
  how_contacted: string;
  offer_text: string;
  chat_text: string;
  payment_text: string;
  reporter_email: string;
  truthful_confirmation: boolean;
};

const initial: ReportForm = {
  company_name: "",
  recruiter_name: "",
  recruiter_email: "",
  recruiter_phone: "",
  website_url: "",
  linkedin_url: "",
  cin: "",
  role_offered: "",
  how_contacted: "Email",
  offer_text: "",
  chat_text: "",
  payment_text: "",
  reporter_email: "",
  truthful_confirmation: false,
};

const CONTACT_METHODS = ["Email", "WhatsApp", "LinkedIn", "Internshala", "Naukri", "Other"];
const MAX_FILES = 5;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export default function ReportScamPage() {
  const router = useRouter();
  const [form, setForm] = useState<ReportForm>(initial);
  const [step, setStep] = useState(1);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof ReportForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateBool<K extends keyof ReportForm>(key: K, value: boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onFileChange(selected: FileList | null) {
    if (!selected) return;
    const picked = Array.from(selected);
    if (picked.length > MAX_FILES) {
      setError(`You can upload up to ${MAX_FILES} files.`);
      return;
    }
    const validTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
    for (const file of picked) {
      if (!validTypes.has(file.type)) {
        setError("Only PDF, JPG, and PNG files are allowed.");
        return;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError("Each file must be 5MB or smaller.");
        return;
      }
    }
    setError(null);
    setFiles(picked);
  }

  const progressPercent = useMemo(() => (step / 3) * 100, [step]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      if (!form.company_name.trim()) throw new Error("Company name is required");
      if (!form.truthful_confirmation) throw new Error("Please confirm the truthfulness statement before submitting.");

      const payload = new FormData();
      for (const [key, value] of Object.entries(form)) {
        if (key === "truthful_confirmation") {
          payload.append(key, String(Boolean(value)));
        } else {
          payload.append(key, String(value ?? ""));
        }
      }
      for (const file of files) {
        payload.append("proof_files", file);
      }

      const res = await fetch("/api/report-scam", {
        method: "POST",
        body: payload,
      });
      const data = (await res.json().catch(() => null)) as
        | { id?: string; status?: string; signal_count?: number; files_failed?: number; error?: string }
        | null;
      if (!res.ok || !data?.id) throw new Error(data?.error || "We couldn't save your report. Please try again.");

      setForm(initial);
      setFiles([]);
      setMessage("Report submitted. Thank you for helping the community.");
      const query = new URLSearchParams({
        id: data.id,
        status: data.status || "pending_review",
        signals: String(data.signal_count ?? 0),
        files_failed: String(data.files_failed ?? 0),
      });
      router.push(`/report-submitted?${query.toString()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setLoading(false);
    }
  }

  const STEPS = ["Who contacted you", "What they sent", "Proof and confirmation"];

  return (
    <div className="wrap pb-8 pt-6">
      <div className="form-layout">
        <div className="form-intro">
          <p className="eyebrow mb-3">Report a scam</p>
          <h1 className="page-title mb-4">Warn the next student.</h1>
          <p className="lede mb-8">
            Tell us about an offer that turned out to be fake. A moderator reviews every report before it&apos;s added to the scam
            register.
          </p>
          <ul className="intro-list">
            <li>
              <b>Only the company name is required.</b> Everything else helps us confirm it faster.
            </li>
            <li>
              <b>Your email is never published.</b> Attachments are private and only moderators can see them.
            </li>
          </ul>
        </div>

        <div className="min-w-0 space-y-5">
          <ol className="stepper" aria-label="Report progress">
            {STEPS.map((label, i) => (
              <li key={label} className={step === i + 1 ? "current" : step > i + 1 ? "done" : ""} aria-current={step === i + 1 ? "step" : undefined}>
                <span className="step-num" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="stepper-label">{label}</span>
              </li>
            ))}
          </ol>
          <p className="sr-only" aria-live="polite">
            Step {step} of 3, {Math.round(progressPercent)}% complete: {STEPS[step - 1]}
          </p>

          <form onSubmit={submit} className="relative space-y-5" aria-busy={loading}>
            {step === 1 ? (
              <fieldset className="form-section">
                <legend>Who contacted you</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="field sm:col-span-2">
                    <label className="label" htmlFor="r-company">
                      Company name <span className="text-[var(--risk)]">(required)</span>
                    </label>
                    <input id="r-company" className="input" value={form.company_name} onChange={(e) => update("company_name", e.target.value)} required autoComplete="off" />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="r-recruiter">
                      Recruiter name
                    </label>
                    <input id="r-recruiter" className="input" value={form.recruiter_name} onChange={(e) => update("recruiter_name", e.target.value)} autoComplete="off" />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="r-email">
                      Recruiter email
                    </label>
                    <input id="r-email" className="input" inputMode="email" value={form.recruiter_email} onChange={(e) => update("recruiter_email", e.target.value)} autoComplete="off" spellCheck={false} />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="r-phone">
                      Recruiter phone
                    </label>
                    <input id="r-phone" className="input" inputMode="tel" value={form.recruiter_phone} onChange={(e) => update("recruiter_phone", e.target.value)} autoComplete="off" />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="r-website">
                      Company website
                    </label>
                    <input id="r-website" className="input" inputMode="url" value={form.website_url} onChange={(e) => update("website_url", e.target.value)} autoComplete="off" />
                  </div>
                  <div className="field sm:col-span-2">
                    <label className="label" htmlFor="r-linkedin">
                      LinkedIn URL (recruiter or company)
                    </label>
                    <input id="r-linkedin" className="input" inputMode="url" value={form.linkedin_url} onChange={(e) => update("linkedin_url", e.target.value)} autoComplete="off" />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="r-cin">
                      CIN
                    </label>
                    <input id="r-cin" className="input" value={form.cin} onChange={(e) => update("cin", e.target.value)} autoComplete="off" spellCheck={false} />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="r-role">
                      Job or internship offered
                    </label>
                    <input id="r-role" className="input" value={form.role_offered} onChange={(e) => update("role_offered", e.target.value)} autoComplete="off" />
                  </div>
                  <div className="field sm:col-span-2">
                    <label className="label" htmlFor="r-how">
                      How they contacted you
                    </label>
                    <select id="r-how" className="select" value={form.how_contacted} onChange={(e) => update("how_contacted", e.target.value)}>
                      {CONTACT_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {method}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </fieldset>
            ) : null}

            {step === 2 ? (
              <fieldset className="form-section">
                <legend>What they sent</legend>
                <div className="field">
                  <label className="label" htmlFor="r-offer">
                    Offer letter text
                  </label>
                  <textarea id="r-offer" className="textarea h-36" value={form.offer_text} onChange={(e) => update("offer_text", e.target.value)} />
                </div>
                <div className="field">
                  <label className="label" htmlFor="r-chat">
                    Chat or conversation text
                  </label>
                  <textarea id="r-chat" className="textarea h-36" value={form.chat_text} onChange={(e) => update("chat_text", e.target.value)} />
                </div>
                <div className="field">
                  <label className="label" htmlFor="r-payment">
                    Payment request details
                  </label>
                  <textarea id="r-payment" className="textarea h-28" value={form.payment_text} onChange={(e) => update("payment_text", e.target.value)} />
                </div>
              </fieldset>
            ) : null}

            {step === 3 ? (
              <fieldset className="form-section">
                <legend>Proof and confirmation</legend>
                <div className="field">
                  <label className="label" htmlFor="r-files">
                    Proof (offer letter, chat or payment screenshots)
                  </label>
                  <input id="r-files" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => onFileChange(e.target.files)} className="input" aria-describedby="r-files-hint" />
                  <p id="r-files-hint" className="hint">
                    Optional. Up to 5 PDF, JPG or PNG files, 5 MB each.
                    {files.length ? ` ${files.length} file${files.length === 1 ? "" : "s"} selected.` : ""}
                  </p>
                </div>
                <div className="field">
                  <label className="label" htmlFor="r-reporter">
                    Your email (optional)
                  </label>
                  <input id="r-reporter" className="input" type="email" value={form.reporter_email} onChange={(e) => update("reporter_email", e.target.value)} autoComplete="email" />
                </div>
                <label className="confirm">
                  <input type="checkbox" checked={form.truthful_confirmation} onChange={(e) => updateBool("truthful_confirmation", e.target.checked)} required />
                  <span>I confirm this report is truthful to the best of my knowledge.</span>
                </label>
              </fieldset>
            ) : null}

            {error ? (
              <p role="alert" className="callout callout-error">
                {error}
              </p>
            ) : null}
            {message ? (
              <p role="status" className="callout callout-ok">
                {message}
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => setStep((prev) => Math.max(1, prev - 1))} disabled={step === 1 || loading} className="btn-secondary">
                Back
              </button>
              {step < 3 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (step === 1 && !form.company_name.trim()) {
                      setError("Company name is required to continue.");
                      return;
                    }
                    setError(null);
                    setStep((prev) => Math.min(3, prev + 1));
                  }}
                  disabled={loading}
                  className="btn-primary"
                >
                  Next
                </button>
              ) : (
                <button type="submit" disabled={loading} className="btn-primary">
                  {loading ? (
                    <>
                      <span className="spinner" aria-hidden="true" />
                      Submitting…
                    </>
                  ) : (
                    "Submit report"
                  )}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

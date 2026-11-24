"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

type Sample = { key: string; label: string; hint: string; from: string; quote: ReactNode; tells: string[] };

const SAMPLES: Sample[] = [
  {
    key: "whatsapp",
    label: "WhatsApp",
    hint: "Most common",
    from: "Unknown number on WhatsApp",
    quote: (
      <>
        You are <mark>directly selected</mark>, no interview. Pay <mark>₹2,499 for training kit</mark> to confirm.{" "}
        <mark>Offer valid 2 hours</mark>.
      </>
    ),
    tells: ["No interview", "Payment request", "Urgency"],
  },
  {
    key: "email",
    label: "Email",
    hint: "Fake offer letters",
    from: "careers.technova@gmail.com",
    quote: (
      <>
        Please find attached your offer letter. <mark>Kindly deposit ₹4,999 refundable security</mark> before joining. Reply from{" "}
        <mark>this Gmail ID</mark> only.
      </>
    ),
    tells: ["Free email provider", "Payment request", "Gmail used as official"],
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    hint: "Fake recruiters",
    from: "InMail from “Senior Talent Partner”",
    quote: (
      <>
        Your profile is a great fit. We&apos;ll move this to <mark>WhatsApp for faster hiring</mark>. Company site is{" "}
        <mark>under maintenance</mark>.
      </>
    ),
    tells: ["WhatsApp-only hiring", "No company web presence"],
  },
  {
    key: "internshala",
    label: "Internshala",
    hint: "Paid “training”",
    from: "Internship listing message",
    quote: (
      <>
        Selected candidates must complete our <mark>paid certification (₹1,500)</mark> before the internship begins.
      </>
    ),
    tells: ["Paid training or placement", "Payment request"],
  },
  {
    key: "naukri",
    label: "Naukri",
    hint: "Placement fees",
    from: "Recruiter call follow-up",
    quote: (
      <>
        Guaranteed placement at a top MNC. <mark>Registration fee ₹3,000</mark>, <mark>salary ₹80,000 for freshers</mark>.
      </>
    ),
    tells: ["Payment request", "Unrealistic stipend"],
  },
];

/** Accessible tabs (WAI-ARIA tabs pattern, automatic activation, roving tabindex). */
export function PlatformTabs() {
  const [active, setActive] = useState(0);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let next: number | null = null;
    if (e.key in keys) next = (i + keys[e.key] + SAMPLES.length) % SAMPLES.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = SAMPLES.length - 1;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  }

  const sample = SAMPLES[active];
  return (
    <div className="channels">
      <div className="tabs" role="tablist" aria-label="Where the offer reached you">
        {SAMPLES.map((s, i) => (
          <button
            key={s.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${s.key}`}
            aria-selected={i === active}
            aria-controls="platform-panel"
            tabIndex={i === active ? 0 : -1}
            className="tab"
            onClick={() => setActive(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {s.label}
            <small>{s.hint}</small>
          </button>
        ))}
      </div>
      <div className="sample" role="tabpanel" id="platform-panel" aria-labelledby={`tab-${sample.key}`} tabIndex={0}>
        <div key={sample.key} className="rise">
          <p className="sample-from">{sample.from}</p>
          <blockquote className="doc">{sample.quote}</blockquote>
          <ul className="tells" aria-label="What gives it away">
            {sample.tells.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

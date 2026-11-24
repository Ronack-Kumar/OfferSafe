"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Signature moment: a realistic offer letter gets marked up phrase by phrase, notes
 * appear in the margin, and the risk score settles. Hovering or focusing a note
 * highlights its phrase (and vice versa). With reduced motion everything appears at once.
 */

const FLAGS = [
  { title: "No interview", note: "You were “selected” without being interviewed." },
  { title: "Upfront payment", note: "Real employers never charge for a training kit." },
  { title: "Pressure", note: "The deadline exists to stop you from checking." },
  { title: "Gmail address", note: "HR writes from Gmail, not a company domain." },
];
const SCORE = 85;

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const onChange = () => setReduce(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduce;
}

export function HeroLetter() {
  const reduce = usePrefersReducedMotion();
  const [shown, setShown] = useState(0);
  const [slip, setSlip] = useState(false);
  const [score, setScore] = useState(0);
  const [focus, setFocus] = useState<number | null>(null);
  const timers = useRef<number[]>([]);

  const play = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    if (reduce) {
      setShown(FLAGS.length);
      setSlip(true);
      setScore(SCORE);
      return;
    }
    setShown(0);
    setSlip(false);
    setScore(0);
    FLAGS.forEach((_, i) => timers.current.push(window.setTimeout(() => setShown(i + 1), 900 + i * 650)));
    timers.current.push(
      window.setTimeout(() => {
        setSlip(true);
        const t0 = performance.now();
        const step = (t: number) => {
          const p = Math.min(1, (t - t0) / 900);
          setScore(Math.round(SCORE * (1 - Math.pow(1 - p, 3))));
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }, 900 + FLAGS.length * 650 + 150),
    );
  }, [reduce]);

  useEffect(() => {
    play();
    const list = timers.current;
    return () => list.forEach((t) => window.clearTimeout(t));
  }, [play]);

  const hl = (i: number, text: string) => (
    <>
      <span
        className={`letter-hl${shown > i ? " on" : ""}${focus === i ? " focus" : ""}`}
        onMouseEnter={() => setFocus(i)}
        onMouseLeave={() => setFocus(null)}
      >
        {text}
      </span>
      <sup className={`letter-num${shown > i ? " on" : ""}`} aria-hidden="true">
        {i + 1}
      </sup>
    </>
  );

  return (
    <div className="stage">
      <button type="button" className="btn-ghost replay" onClick={play}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
        </svg>
        Replay
      </button>

      <article className="letter sheet doc" aria-label="Example offer letter with four red flags highlighted">
        <div className="letter-head">
          <div className="letter-co">
            TechNova Global Solutions
            <small>hr.technova@gmail.com</small>
          </div>
          <div className="letter-date">18 Nov 2026</div>
        </div>
        <p>Dear Candidate,</p>
        <p>
          {hl(0, "Congratulations! You have been selected")} for the role of Software Intern with a stipend of ₹35,000 per month.
        </p>
        <p>
          To confirm your seat, {hl(1, "please pay ₹2,499 for your training kit")} via UPI to technova.hr@okaxis {hl(2, "within 24 hours")}.
        </p>
        <p>For any questions, reach our HR team at {hl(3, "hr.technova@gmail.com")}.</p>
        <p className="letter-sig">
          Regards,
          <br />
          Priya S., HR Manager
        </p>
      </article>

      <ol className="notes" aria-label="Red flags in the example letter">
        {FLAGS.map((flag, i) => (
          <li
            key={flag.title}
            className={`note${shown > i ? " on" : ""}${focus === i ? " focus" : ""}`}
            tabIndex={0}
            onMouseEnter={() => setFocus(i)}
            onMouseLeave={() => setFocus(null)}
            onFocus={() => setFocus(i)}
            onBlur={() => setFocus(null)}
          >
            <b>
              <i aria-hidden="true">{i + 1}</i>
              {flag.title}
            </b>
            <span>{flag.note}</span>
          </li>
        ))}
      </ol>

      <div className={`slip${slip ? " on" : ""}`} role="status" aria-live="polite">
        <div className="slip-num">
          <span>{score}</span>
          <small>/100</small>
        </div>
        <div>
          <div className="slip-v">High risk. Don&apos;t pay.</div>
          <div className="slip-s">4 red flags in one short letter</div>
        </div>
      </div>
    </div>
  );
}

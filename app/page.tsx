import Link from "next/link";
import { HeroLetter } from "@/components/home/hero-letter";
import { PlatformTabs } from "@/components/home/platform-tabs";

/** Point values mirror SIGNALS in app/api/analyze/route.ts. */
const INDEX = [
  {
    title: "Money",
    sub: "Where most scams end up",
    items: [
      ["Payment requested", "+35"],
      ["Paid training or placement", "+30"],
      ["Reimbursement trap", "+30"],
      ["Unrealistic stipend", "+15"],
    ],
  },
  {
    title: "Identity",
    sub: "Who is really writing to you",
    items: [
      ["Known scam match", "+45"],
      ["Free or throwaway email", "+25"],
      ["Gmail used as official", "+20"],
      ["Email can't receive mail", "+20"],
      ["CIN invalid, unknown or inactive", "+20"],
      ["CIN missing", "+5"],
    ],
  },
  {
    title: "Pressure",
    sub: "How they rush the decision",
    items: [
      ["“No interview needed”", "+20"],
      ["Urgency language", "+15"],
      ["WhatsApp-only hiring", "+10"],
      ["Vague role", "+5"],
      ["Poor formatting", "+5"],
    ],
  },
  {
    title: "Presence",
    sub: "What the internet knows",
    items: [
      ["Domain registered recently", "+15"],
      ["No company web presence", "+15"],
      ["No website given", "+10"],
      ["Reddit scam reports", "+20"],
    ],
  },
];

const ArrowIcon = () => (
  <svg className="arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export default function HomePage() {
  return (
    <>
      <div className="wrap">
        <section className="hero" aria-labelledby="hero-title">
          <div>
            <h1 id="hero-title" className="hero-title">
              Read your offer the way a <span className="swipe">scammer hopes</span> you won&apos;t.
            </h1>
            <p className="lede mb-8 mt-6 text-[19px]">
              Paste the recruiter&apos;s email, offer letter or payment request. OfferSafe marks every red flag, explains it, and tells
              you whether to walk away.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/analyze" className="btn-primary">
                Check an offer
                <ArrowIcon />
              </Link>
              <Link href="/scam-cases" className="btn-secondary">
                Browse known scams
              </Link>
            </div>
            <p className="hint mt-7">Free, and you don&apos;t need an account.</p>
          </div>
          <HeroLetter />
        </section>
      </div>

      <section className="band band-paper" aria-labelledby="platforms-title">
        <div className="wrap">
          <h2 id="platforms-title" className="section-title mb-4">
            Every platform has its own version of the same scam.
          </h2>
          <p className="lede mb-12">Pick where the offer reached you to see what it usually looks like, and what gives it away.</p>
          <PlatformTabs />
        </div>
      </section>

      <section className="band" aria-labelledby="index-title">
        <div className="wrap">
          <h2 id="index-title" className="section-title mb-4">
            Every check, grouped the way scams work.
          </h2>
          <p className="lede mb-12">
            Every offer is read against the same list. Each red flag adds points to the risk score, capped at 100. Company
            registration numbers are checked against a snapshot of the government&apos;s MCA registry.
          </p>
          <div className="index">
            {INDEX.map((group) => (
              <div key={group.title} className="group">
                <h3>{group.title}</h3>
                <p>{group.sub}</p>
                <ul>
                  {group.items.map(([label, pts]) => (
                    <li key={label}>
                      {label}
                      <em>{pts}</em>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="band band-paper" aria-labelledby="closing-title">
        <div className="wrap closing">
          <div>
            <h2 id="closing-title" className="section-title mb-4">
              Got an offer that feels off?
            </h2>
            <p className="lede">It takes one paste to find out. If it turns out to be a scam, report it so the next student is warned.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/analyze" className="btn-primary">
              Check an offer
              <ArrowIcon />
            </Link>
            <Link href="/report-a-scam" className="btn-secondary">
              Report a scam
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

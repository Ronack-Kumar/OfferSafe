import Link from "next/link";
import { BrandMark } from "./brand-mark";

const LINKS = [
  { href: "/scam-cases", label: "Scam register" },
  { href: "/report-a-scam", label: "Report a scam" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  return (
    <header className="site-header print-hide">
      <div className="wrap flex h-[76px] items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 text-[19px] font-extrabold tracking-[-0.02em]">
          <BrandMark />
          OfferSafe
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="nav-link">
              {link.label}
            </Link>
          ))}
          <Link href="/analyze" className="btn-primary ml-2 !min-h-[40px] !px-4 text-sm">
            Check an offer
          </Link>
        </nav>

        {/* Small screens: the main action stays visible; the rest sit behind a disclosure. */}
        <div className="flex items-center gap-2 md:hidden">
          <Link href="/analyze" className="btn-primary !min-h-[40px] !px-4 text-sm">
            Check an offer
          </Link>
          <details className="mobile-menu">
            <summary aria-label="More pages" className="btn-ghost !min-h-[40px] !px-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </summary>
            <nav aria-label="More pages" className="mobile-menu-panel">
              {LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="nav-link">
                  {link.label}
                </Link>
              ))}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

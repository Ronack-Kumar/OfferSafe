import Link from "next/link";
import { BrandMark } from "./brand-mark";

export function SiteFooter() {
  return (
    <footer className="print-hide mt-16 border-t border-[var(--line)]">
      <div className="wrap grid gap-8 py-10 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-[17px] font-extrabold tracking-[-0.02em]">
            <BrandMark size={22} />
            OfferSafe
          </p>
          <p className="max-w-[46ch] text-sm text-[var(--graphite)]">
            Helps students and job seekers in India spot fake offers before they pay or share documents. A risk assessment,
            not legal advice.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-[var(--graphite)]">
          <Link href="/analyze" className="footer-link">
            Check an offer
          </Link>
          <Link href="/scam-cases" className="footer-link">
            Scam register
          </Link>
          <Link href="/report-a-scam" className="footer-link">
            Report a scam
          </Link>
          <Link href="/contact" className="footer-link">
            Contact
          </Link>
        </nav>
      </div>
      <div className="wrap pb-10 text-sm text-[var(--graphite)]">© {new Date().getFullYear()} OfferSafe</div>
    </footer>
  );
}

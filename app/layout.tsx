import type { Metadata, Viewport } from "next";
import { IBM_Plex_Serif, Schibsted_Grotesk } from "next/font/google";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import "./globals.css";
import "./styles/home.css";
import "./styles/pages.css";

const ui = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const doc = IBM_Plex_Serif({ subsets: ["latin"], weight: ["400", "500"], style: ["normal", "italic"], variable: "--font-doc", display: "swap" });

export const metadata: Metadata = {
  title: "OfferSafe: check a job or internship offer for scams",
  description:
    "Paste a recruiter email, offer letter or payment request. OfferSafe marks every red flag, explains it, and tells you whether to walk away.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#e6e9ec",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${ui.variable} ${doc.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}

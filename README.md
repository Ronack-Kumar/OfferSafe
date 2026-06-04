# OfferSafe

A web app that helps you verify job offers and avoid recruitment scams. Built with Next.js, Supabase, and AI-powered analysis via Gemini and Groq.

Live: https://offer-safe.vercel.app

---

## What it does

Paste or upload a job offer and the app analyzes it for red flags — suspicious salary promises, vague company details, requests for personal info upfront, and other common scam patterns. It uses Gemini and Groq to do the heavy lifting and Resend to email you the results.

---

## Stack

- Next.js 14 + TypeScript
- Supabase — auth and database
- Gemini API + Groq API — AI analysis
- Resend — email delivery
- Tailwind CSS
- Deployed on Vercel

---

## Running locally

```bash
git clone https://github.com/Raunack/OfferSafe.git
cd OfferSafe
npm install
cp .env.local.example .env.local
```

Fill in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GEMINI_API_KEY=
GROQ_API_KEY=
RESEND_API_KEY=
```

Then run the Supabase migrations from `supabase/migrations/` and start the dev server:

```bash
npm run dev
```

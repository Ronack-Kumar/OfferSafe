# OfferSafe

Scam risk analyzer for job and internship offers. Built for students and job seekers in India who want to verify an offer before sharing documents or sending money.

Live: https://offer-safe.vercel.app

![OfferSafe job-offer risk analysis homepage](docs/screenshots/app-preview.webp)

---

## What it does

You paste in whatever you received — recruiter message, offer letter, payment request, company details — and it gives you an evidence-based risk score. It also cross-references against community-reported scam cases, so if someone else already reported the same company or recruiter, it'll catch that too.

There's also a public scam reports page where anyone can browse or submit known cases.

---

## Stack

- Next.js 14 + TypeScript
- Supabase — database and auth
- Gemini API + Groq API — AI risk analysis
- Resend — email
- Tailwind CSS
- Deployed on Vercel

---

## Running locally

```bash
git clone https://github.com/Ronack-Kumar/OfferSafe.git
cd OfferSafe
npm install
cp .env.local.example .env.local
```

Fill in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
GEMINI_API_KEY=
GROQ_API_KEY=
RESEND_API_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATA_GOV_IN_API_KEY=
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=
```

Supabase keys live in **Project Settings → API Keys → Publishable and secret API keys**:
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is the `sb_publishable_...` key (public), and
`SUPABASE_SERVICE_ROLE_KEY` is the `sb_secret_...` key. Only the local MCA import script uses it: never add it to
Vercel, never prefix it with `NEXT_PUBLIC_`. The deployed app needs only the publishable key.
The legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is still read as a fallback until Supabase retires it at the end of 2026.

Run migrations from `supabase/migrations/`, then:

```bash
npm run dev
```

Checks:

```bash
npm test            # unit tests (network calls are mocked)
npm run typecheck
npm run lint
```

---

## Free verification checks

Every analysis runs these free checks before any AI call. Each external lookup has a 5-second
timeout. If a source can't be reached, the report says "check unavailable" and nothing is scored.

| Check | Source | Flag (score) |
|---|---|---|
| Domain age | RDAP via `rdap.org`, for the recruiter email domain and any website in the offer | Registered less than 6 months ago (+15) |
| Disposable inbox | Bundled copy of [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains) | Disposable domain (+25) |
| Mail servers | DNS MX lookup | Domain can't receive mail (+20) |
| Company registry | Your imported copy of MCA master data (see below), by CIN or LLPIN | Invalid CIN format (+20), CIN/LLPIN not found (+20), status not Active (+20) |
| Reddit | Optional, OAuth app-only | At least 2 clear scam reports (existing Reddit rules) |

Free email providers (gmail.com, outlook.com, etc.) are skipped for domain age and MX checks. The existing free-email rule already covers them.
Registry results say "found in the official registry snapshot", never "verified". There is no company-name search:
the table stores only hashed CINs/LLPINs to fit the free tier.

RDAP, MX and Reddit results are cached for 7–30 days in the Next.js Data Cache (`unstable_cache`). On Vercel it is
shared across instances and server-only, so cached results can't be read or changed from a browser, and entries
expire on their own. Nothing is cached in the database.

Refresh the disposable-domain list now and then:

```bash
npm run update:disposable
```

### MCA company data (one-time import)

Registry checks read the `mca_companies` table with the publishable key (read-only RLS policy; no client writes).
The app never calls data.gov.in while handling a request.

1. Get a free data.gov.in API key: sign up at <https://data.gov.in> (top right, **Sign Up**) and verify your email.
   Then open **My Account → API Keys** (<https://data.gov.in/user/me/api-keys>) and generate a key.
2. Put it in `.env.local` as `DATA_GOV_IN_API_KEY`, together with `NEXT_PUBLIC_SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` (the `sb_secret_...` key; only this script uses it).
3. Apply the migrations in `supabase/migrations/` in filename order.
4. Run the import once:

```bash
npm run import:mca
```

The import goes through the "Registrars of Companies (RoC)-wise Company Master Data" resource
(`4dbe5667-7b6b-41d7-82af-211562424d9a`, about 3.7 million companies) one `CompanyStateCode` at a time.
It retries on errors and throttling and saves its progress to `scripts/.mca-import-state.json`.
If it's interrupted, run the same command again to resume. Use `--reset` to start over, `--states goa,delhi` to import only some states,
and `--limit` / `--delay` to tune paging.
Registry lookups stay "unavailable" until a full import finishes. An empty table never reports "CIN not found".

To fit the Supabase free tier (500 MB), each row stores only a 64-bit hash of the normalized CIN/LLPIN
(trimmed, uppercased, spaces removed), the status as a small code and the registration date: about 250 MB for
3.7 million companies. The import stops on its own if the database gets within 50 MB of 500 MB (`--max-db-mb`).

### Reddit (optional)

Create a "script" app at <https://www.reddit.com/prefs/apps>. Set `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET`,
and set a descriptive `REDDIT_USER_AGENT` such as `web:offersafe:v1.0 (by /u/yourname)`. The check searches
r/developersIndia, r/Indian_Academia, r/IndiaCareers and r/scams. It stays under 100 requests/minute and backs off on 429 responses.
Without credentials, or if Reddit stops responding, it is skipped and the report shows it as unavailable.

---

*Not legal advice. For awareness only.*

## Admin access

`/admin-offersafe` is for moderators and isn't linked from the site. It uses Supabase Auth (email + password), and every check runs on the server:

- The admin page and every `/api/admin/*` route verify the session with Supabase Auth, then call the database function `is_offersafe_admin()`.
- Approve and reject are made with the admin's own access token, so the RLS policies on `pending_reports` enforce admin-only decisions again in the database. The service role key is never used at runtime.
- Sessions are stored in httpOnly, SameSite=Lax cookies and refreshed by `middleware.ts`.

To set up an admin:

1. Apply `supabase/migrations/20261127_admin_auth.sql`.
2. In Supabase > Authentication > Users, click **Add user**, enter your email and a strong password, and tick **Auto Confirm User**.
3. Add the email to the allow-list (lowercase):
   ```sql
   INSERT INTO public.offersafe_admins (email) VALUES ('you@example.com');
   ```
4. Recommended: turn off public sign-ups in Supabase > Authentication > Sign In / Providers. Admin access never depends on it, but it keeps the users list clean.

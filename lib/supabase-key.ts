/**
 * The public Supabase API key, safe for browser and server code.
 *
 * Prefers the new publishable key (sb_publishable_...). Falls back to the legacy JWT
 * `anon` key, which Supabase retires at the end of 2026, so deployments keep working
 * until NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is set everywhere.
 *
 * The env vars are referenced literally so Next.js can inline them in client bundles.
 */
export function supabasePublicKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined;
}

export const MISSING_SUPABASE_ENV =
  "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";

-- MCA table: hashed-CIN layout to fit the Supabase free tier, plus lookup-cache cleanup.

-- 1. Replace the text-CIN layout. It was never fully imported; it holds only the
--    re-importable size-test sample rows.
DROP TABLE IF EXISTS public.mca_companies;

CREATE TABLE public.mca_companies (
  -- hashIdentifier() in scripts/lib/mca-shared.mjs: first 8 bytes of MD5 of the normalized
  -- CIN/LLPIN (trimmed, uppercased, spaces removed), as a signed bigint. Same as
  -- ('x' || substr(md5(id), 1, 16))::bit(64)::bigint
  cin_hash bigint PRIMARY KEY,
  registration_date date,
  status smallint NOT NULL       -- codes in scripts/lib/mca-shared.mjs
);
-- Server-only: RLS on and no policies, so only the secret (service role) key can read it.
ALTER TABLE public.mca_companies ENABLE ROW LEVEL SECURITY;

-- 2. Lookup-cache cleanup: delete expired rows, then cap the table at max_rows
--    (keeping the most recently written), so it cannot slowly fill the free tier.
CREATE OR REPLACE FUNCTION public.offersafe_purge_lookup_cache(max_rows integer DEFAULT 50000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  expired integer;
  overflow integer;
BEGIN
  DELETE FROM public.lookup_cache WHERE expires_at < pg_catalog.now();
  GET DIAGNOSTICS expired = ROW_COUNT;

  DELETE FROM public.lookup_cache
  WHERE key IN (
    SELECT key FROM public.lookup_cache ORDER BY updated_at DESC OFFSET max_rows
  );
  GET DIAGNOSTICS overflow = ROW_COUNT;

  RETURN expired + overflow;
END;
$$;
REVOKE ALL ON FUNCTION public.offersafe_purge_lookup_cache(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.offersafe_purge_lookup_cache(integer) TO service_role;

-- Daily at 03:30 UTC (after the existing 02:00 scam-scanner job). Re-running this
-- migration updates the job in place instead of adding a duplicate.
SELECT cron.schedule(
  'offersafe-purge-lookup-cache',
  '30 3 * * *',
  $$SELECT public.offersafe_purge_lookup_cache()$$
);

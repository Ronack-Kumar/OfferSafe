-- Free verification checks (feat/free-checks)

-- 1. Report: per-check results shown on the result page. Additive; existing rows keep NULL.
ALTER TABLE IF EXISTS public.cases
  ADD COLUMN IF NOT EXISTS verification_checks_json jsonb;

-- 2. Cache for external lookups (RDAP, MX, Reddit). Server-only: RLS on and no policies,
--    so only SUPABASE_SERVICE_ROLE_KEY (server code) can read or write it.
CREATE TABLE IF NOT EXISTS public.lookup_cache (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lookup_cache_expires_at_idx ON public.lookup_cache (expires_at);
ALTER TABLE public.lookup_cache ENABLE ROW LEVEL SECURITY;

-- 3. MCA company master data, imported once by scripts/import-mca.mjs (never fetched at
--    request time). Kept slim to fit the free tier: fixed-width columns first for tight
--    row packing. Status codes: scripts/lib/mca-shared.mjs. Server-only (no policies).
CREATE TABLE IF NOT EXISTS public.mca_companies (
  registration_date date,
  status smallint NOT NULL,
  cin text PRIMARY KEY,          -- CIN, or LLPIN for LLPs (e.g. AAA-0008)
  name_norm text NOT NULL        -- normalizeCompanyName(CompanyName)
);
ALTER TABLE public.mca_companies ENABLE ROW LEVEL SECURITY;
-- The name_norm index is added separately, only if the measured size fits.

-- One row describing the last completed import. Lookups report "unavailable" until it
-- exists, so a partial or empty table never produces "CIN not found".
CREATE TABLE IF NOT EXISTS public.mca_import_meta (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  completed_at timestamptz NOT NULL,
  record_count integer NOT NULL,
  source_total integer,
  source_updated_at timestamptz
);
ALTER TABLE public.mca_import_meta ENABLE ROW LEVEL SECURITY;

-- 4. Database size, for the import's free-tier guard. Callable by the service role only.
CREATE OR REPLACE FUNCTION public.offersafe_db_size()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$ SELECT pg_catalog.pg_database_size(pg_catalog.current_database()) $$;
REVOKE ALL ON FUNCTION public.offersafe_db_size() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.offersafe_db_size() TO service_role;

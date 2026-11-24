-- Deployed app reads MCA data with the publishable key; runtime cache moves to the
-- Vercel/Next.js Data Cache, so the database lookup cache is removed.

-- 1. Read-only public access to the MCA snapshot (public government data; CINs are
--    stored only as hashes). No write policies, so RLS denies INSERT/UPDATE/DELETE.
--    Table grants are revoked too: TRUNCATE is not governed by RLS.
CREATE POLICY "mca_companies public read" ON public.mca_companies
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "mca_import_meta public read" ON public.mca_import_meta
  FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.mca_companies, public.mca_import_meta
  FROM anon, authenticated;

-- 2. Remove the database lookup cache and its cleanup job.
SELECT cron.unschedule('offersafe-purge-lookup-cache')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'offersafe-purge-lookup-cache');
DROP FUNCTION IF EXISTS public.offersafe_purge_lookup_cache(integer);
DROP TABLE IF EXISTS public.lookup_cache;

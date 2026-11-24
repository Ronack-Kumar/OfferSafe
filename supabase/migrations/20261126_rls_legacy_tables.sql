-- Row Level Security for the original tables (cases, scam_cases, pending_reports).
--
-- Until now these had RLS off and full grants, so anyone holding the public
-- (publishable) key could DELETE or TRUNCATE them. The app still performs all of its
-- reads and writes with that public key, so this migration allows exactly the
-- operations the app uses today and nothing more:
--
--   cases            SELECT, INSERT                 (/api/analyze, /result/[id])
--   scam_cases       SELECT + UPDATE approved rows, INSERT approved rows
--                    (/api/analyze, /api/report-scam, /scam-cases, /admin-offersafe)
--   pending_reports  SELECT, INSERT, UPDATE         (/api/report-scam, /admin-offersafe)
--
-- DELETE and TRUNCATE are removed for anon/authenticated on all three. The
-- scam-scanner edge function uses the service role, which bypasses RLS.
--
-- Not solved here (needs app changes): rows in cases can still be listed in bulk with
-- the public key, and /admin-offersafe has no login. See the follow-up notes in the PR.
--
-- Rollback:
--   ALTER TABLE public.cases DISABLE ROW LEVEL SECURITY;  (and the same for the others)
--   GRANT DELETE, TRUNCATE ON public.cases, public.scam_cases, public.pending_reports
--     TO anon, authenticated;

-- cases ------------------------------------------------------------------------------
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cases public read" ON public.cases
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "cases public insert" ON public.cases
  FOR INSERT TO anon, authenticated WITH CHECK (true);
REVOKE UPDATE, DELETE, TRUNCATE ON public.cases FROM anon, authenticated;

-- scam_cases -------------------------------------------------------------------------
ALTER TABLE public.scam_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scam_cases public read approved" ON public.scam_cases
  FOR SELECT TO anon, authenticated USING (status = 'approved');
CREATE POLICY "scam_cases insert approved" ON public.scam_cases
  FOR INSERT TO anon, authenticated WITH CHECK (status = 'approved');
CREATE POLICY "scam_cases update approved" ON public.scam_cases
  FOR UPDATE TO anon, authenticated USING (status = 'approved') WITH CHECK (status = 'approved');
REVOKE DELETE, TRUNCATE ON public.scam_cases FROM anon, authenticated;

-- pending_reports --------------------------------------------------------------------
ALTER TABLE public.pending_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pending_reports public read" ON public.pending_reports
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "pending_reports public insert" ON public.pending_reports
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "pending_reports public update" ON public.pending_reports
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
REVOKE DELETE, TRUNCATE ON public.pending_reports FROM anon, authenticated;

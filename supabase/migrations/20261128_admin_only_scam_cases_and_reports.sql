-- Close the last public write/read paths around moderation. Applied 2026-11-24.
--
-- Before this, the public (publishable) key could still insert or edit approved rows
-- in scam_cases, which publishes a "known scam" that every analysis matches against,
-- and could read every pending report, including reporter emails. Both bypassed the
-- admin login.
--
-- After it:
--   scam_cases       public: read approved rows only (analyzer, /scam-cases)
--                    admin (is_offersafe_admin()): insert and update
--   pending_reports  admin only: read. Public updates already match no rows because
--                    they can't see any.
--
-- The "Report a scam" form (/api/report-scam) wrote these tables with the public key.
-- It was already failing (it selects a non-existent column, website_url). When it's
-- fixed, submissions need a narrow SECURITY DEFINER function that only inserts a
-- report, instead of direct table access.

DROP POLICY "scam_cases insert approved" ON public.scam_cases;
DROP POLICY "scam_cases update approved" ON public.scam_cases;
REVOKE INSERT, UPDATE ON public.scam_cases FROM anon;
CREATE POLICY "scam_cases admin insert" ON public.scam_cases
  FOR INSERT TO authenticated WITH CHECK (public.is_offersafe_admin());
CREATE POLICY "scam_cases admin update" ON public.scam_cases
  FOR UPDATE TO authenticated USING (public.is_offersafe_admin()) WITH CHECK (public.is_offersafe_admin());

DROP POLICY "pending_reports public read" ON public.pending_reports;
CREATE POLICY "pending_reports admin read" ON public.pending_reports
  FOR SELECT TO authenticated USING (public.is_offersafe_admin());

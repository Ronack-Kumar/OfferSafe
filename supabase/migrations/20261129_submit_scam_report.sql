-- "Report a scam" submissions through one narrow function, private proof files.
--
-- Since 20261128 the public key can't read pending_reports or write scam_cases, so
-- /api/report-scam can no longer use the tables directly (and it was already broken:
-- it referenced columns that don't exist). Submissions now go through
-- submit_scam_report(), which can only add one report and returns only its own id,
-- count and status. Reports are never published automatically; an admin approves them.
--
-- The function is callable with the public key, so its inputs (reporter fingerprint,
-- signals) are hints for the admin queue, not trusted facts: a caller can inflate a
-- report's corroboration count or signals, but that only changes its triage label
-- (pending_review vs low_confidence). Publishing always needs an admin.

-- 1. Columns the form collects that the table was missing.
ALTER TABLE public.pending_reports ADD COLUMN IF NOT EXISTS recruiter_name text;
ALTER TABLE public.pending_reports ADD COLUMN IF NOT EXISTS reporter_fingerprint text;
CREATE INDEX IF NOT EXISTS pending_reports_company_lower_idx ON public.pending_reports (lower(company_name));

-- 2. The submit function.
CREATE OR REPLACE FUNCTION public.submit_scam_report(report jsonb)
RETURNS TABLE (id uuid, report_count integer, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  company text := btrim(coalesce(report->>'company_name', ''));
  fingerprint text := coalesce(report->>'reporter_fingerprint', '');
  signals jsonb := coalesce(report->'verified_signals', '[]'::jsonb);
  proofs jsonb := coalesce(report->'proof_paths', '[]'::jsonb);
  proof text;
  reporters integer;
  new_status text;
  new_id uuid;
BEGIN
  IF company = '' OR length(company) > 200 THEN
    RAISE EXCEPTION 'company_name is required (max 200 characters)' USING ERRCODE = '22023';
  END IF;
  IF fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid reporter fingerprint' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(signals) <> 'array' OR jsonb_array_length(signals) > 20 THEN
    RAISE EXCEPTION 'invalid verified_signals' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(proofs) <> 'array' OR jsonb_array_length(proofs) > 5 THEN
    RAISE EXCEPTION 'at most 5 proof files' USING ERRCODE = '22023';
  END IF;
  FOR proof IN SELECT jsonb_array_elements_text(proofs) LOOP
    IF proof !~ '^reports/[0-9a-f]{16}/[A-Za-z0-9_-]{1,100}\.(pdf|jpg|png)$' THEN
      RAISE EXCEPTION 'invalid proof path' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Distinct reporters for this company, counting this one.
  SELECT count(DISTINCT p.reporter_fingerprint) + 1 INTO reporters
  FROM public.pending_reports p
  WHERE lower(p.company_name) = lower(company)
    AND p.reporter_fingerprint IS NOT NULL
    AND p.reporter_fingerprint <> fingerprint;

  new_status := CASE WHEN jsonb_array_length(signals) >= 1 OR reporters >= 2 THEN 'pending_review' ELSE 'low_confidence' END;

  INSERT INTO public.pending_reports (
    company_name, recruiter_name, recruiter_email, recruiter_phone, website, linkedin_url, cin,
    role_offered, how_contacted, source, what_happened, evidence_text, reporter_email,
    proof_urls, verified_signals, verification_result, status, report_count, auto_verified,
    reporter_fingerprint
  ) VALUES (
    company,
    left(nullif(btrim(report->>'recruiter_name'), ''), 200),
    left(nullif(btrim(report->>'recruiter_email'), ''), 320),
    left(nullif(btrim(report->>'recruiter_phone'), ''), 40),
    left(nullif(btrim(report->>'website'), ''), 500),
    left(nullif(btrim(report->>'linkedin_url'), ''), 500),
    left(nullif(btrim(report->>'cin'), ''), 30),
    left(nullif(btrim(report->>'role_offered'), ''), 200),
    left(nullif(btrim(report->>'how_contacted'), ''), 40),
    left(nullif(btrim(report->>'how_contacted'), ''), 40),
    left(nullif(btrim(report->>'what_happened'), ''), 20000),
    left(nullif(btrim(report->>'evidence_text'), ''), 20000),
    left(nullif(btrim(report->>'reporter_email'), ''), 320),
    proofs,
    signals,
    jsonb_build_object('signals', signals, 'confidence',
      CASE WHEN jsonb_array_length(signals) >= 3 THEN 'high' WHEN jsonb_array_length(signals) >= 1 THEN 'medium' ELSE 'low' END),
    new_status,
    reporters,
    false,
    fingerprint
  )
  RETURNING pending_reports.id INTO new_id;

  -- Keep the corroboration count current on this company's other open reports.
  UPDATE public.pending_reports p
  SET report_count = reporters
  WHERE lower(p.company_name) = lower(company)
    AND p.id <> new_id
    AND p.status NOT IN ('approved', 'rejected');

  RETURN QUERY SELECT new_id, reporters, new_status;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_scam_report(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_scam_report(jsonb) TO anon, authenticated;

-- 3. Direct table writes from the public key are no longer needed. Admins keep their
--    status update (policy "pending_reports admin update" + the column grant).
DROP POLICY IF EXISTS "pending_reports public insert" ON public.pending_reports;
DROP POLICY IF EXISTS "pending_reports public update" ON public.pending_reports;
REVOKE INSERT, UPDATE ON public.pending_reports FROM anon;
REVOKE INSERT ON public.pending_reports FROM authenticated;

-- 4. Proof files: private bucket limited to PDF/JPG/PNG up to 5 MB. Anyone may upload a
--    new .pdf/.jpg/.png file under reports/<random>/ (no overwrite, no listing, no
--    reading); only admins can read them.
UPDATE storage.buckets
SET public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png']
WHERE id = 'report-proofs';
DROP POLICY IF EXISTS "report proofs upload" ON storage.objects;
DROP POLICY IF EXISTS "report proofs admin read" ON storage.objects;
CREATE POLICY "report proofs upload" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'report-proofs' AND name ~ '^reports/[0-9a-f]{16}/[A-Za-z0-9_-]{1,100}\.(pdf|jpg|png)$');
CREATE POLICY "report proofs admin read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'report-proofs' AND public.is_offersafe_admin());

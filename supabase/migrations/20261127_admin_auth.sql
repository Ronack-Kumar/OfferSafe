-- Admin access for /admin-offersafe, enforced in the database as well as the API.
--
-- Admins are Supabase Auth users whose email is listed in public.offersafe_admins.
-- The table starts empty, so nobody is an admin until you add your email:
--   INSERT INTO public.offersafe_admins (email) VALUES ('you@example.com');
-- Create the matching user in Supabase > Authentication > Users ("Add user",
-- auto-confirm) with a password only you know.
--
-- The admin API routes call PostgREST with the signed-in admin's own access token
-- (role "authenticated"), never with the service role key, so these policies are
-- what actually allows approve/reject.

-- 1. Allow-list. RLS on with no policies: not readable or writable with the public key.
CREATE TABLE IF NOT EXISTS public.offersafe_admins (
  email text PRIMARY KEY CHECK (email = lower(email)),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.offersafe_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.offersafe_admins FROM anon, authenticated;

-- 2. True only for a signed-in user with a confirmed email on the allow-list.
--    Reads the email from auth.users (not from the token claims).
CREATE OR REPLACE FUNCTION public.is_offersafe_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN public.offersafe_admins a ON a.email = lower(u.email)
    WHERE u.id = auth.uid()
      AND u.email_confirmed_at IS NOT NULL
  );
$$;
REVOKE ALL ON FUNCTION public.is_offersafe_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_offersafe_admin() TO anon, authenticated;

-- 3. pending_reports: only admins may set or change the final decision
--    (approved/rejected). /api/report-scam keeps inserting and updating reports in
--    the other statuses with the public key.
DROP POLICY IF EXISTS "pending_reports public insert" ON public.pending_reports;
DROP POLICY IF EXISTS "pending_reports public update" ON public.pending_reports;

CREATE POLICY "pending_reports public insert" ON public.pending_reports
  FOR INSERT TO anon, authenticated
  WITH CHECK (status IS NULL OR status NOT IN ('approved', 'rejected'));

CREATE POLICY "pending_reports public update" ON public.pending_reports
  FOR UPDATE TO anon, authenticated
  USING (status IS NULL OR status NOT IN ('approved', 'rejected'))
  WITH CHECK (status IS NULL OR status NOT IN ('approved', 'rejected'));

CREATE POLICY "pending_reports admin update" ON public.pending_reports
  FOR UPDATE TO authenticated
  USING (public.is_offersafe_admin())
  WITH CHECK (public.is_offersafe_admin());

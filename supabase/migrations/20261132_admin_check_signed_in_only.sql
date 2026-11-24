-- is_offersafe_admin() is only ever needed for signed-in users: every policy that calls it
-- is TO authenticated, and the app calls it with the moderator's own access token.
-- Removing anon access clears the Supabase advisor warning without changing behaviour.
REVOKE EXECUTE ON FUNCTION public.is_offersafe_admin() FROM anon;

COMMENT ON TABLE public.offersafe_admins IS 'Moderator allow-list. RLS is on with no policies on purpose: no API role can read or change it; only is_offersafe_admin() (security definer) looks at it.';

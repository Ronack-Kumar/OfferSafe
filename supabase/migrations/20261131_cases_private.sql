-- Step 2 of 2 for private reports. Apply only AFTER the code that reads reports via
-- get_case() and inserts with return=minimal is live (fix/leftovers PR). Applying it
-- earlier breaks /result pages and new analyses on the old code.
--
-- Removes the public read on cases, so the public key can no longer list every saved
-- analysis (offer text, emails, phone numbers people pasted). New analyses can still be
-- saved; reports are read one at a time with get_case(id).
DROP POLICY IF EXISTS "cases public read" ON public.cases;
REVOKE SELECT ON public.cases FROM anon, authenticated;

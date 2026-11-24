-- Step 1 of 2 for private reports. Apply BEFORE deploying the code that uses it.
--
-- get_case(case_id) returns a single saved analysis when you already know its id (the
-- link /result/<id> the user was given). Ids are random UUIDs, so this doesn't let
-- anyone list or guess other people's reports. Additive only: nothing breaks if the
-- current code is still running.
CREATE OR REPLACE FUNCTION public.get_case(case_id uuid)
RETURNS SETOF public.cases
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT * FROM public.cases WHERE id = case_id LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_case(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_case(uuid) TO anon, authenticated;

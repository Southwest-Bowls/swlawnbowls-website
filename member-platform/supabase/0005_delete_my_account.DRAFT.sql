-- ============================================================================
-- DRAFT -- NOT APPLIED -- DO NOT RUN until reviewed. Run first on a scratch Supabase project.
-- In-app "Delete my account and data" (required by Apple guideline 5.1.1(v) and Google Play).
-- The app calls rpc('delete_my_account') with the signed-in user's token.
-- What it must do, in one transaction:
--   1. unlink the caller's member claim(s) (private.member_links or equivalent), keep the roster row itself
--      (the roster is the Division's record, not the user's account);
--   2. delete the caller's profile / contact-change requests / any entry rows they created that are not paid
--      (paid entries are accounting records: keep with the name, drop the login link);
--   3. delete the auth user (auth.users) so the email can sign up again.
-- Deleting from auth.users needs a SECURITY DEFINER function owned by a role allowed to do it. Verify on a scratch
-- project that it works before relying on it. Published tournament results are never touched.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_my_account() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  -- TODO(step 1/2): adapt table names to the live schema (see 0004_my_membership.sql) after checking it.
  -- DELETE FROM private.contact_change_requests WHERE requested_by = uid;
  -- UPDATE private.member_links SET user_id = NULL WHERE user_id = uid;
  DELETE FROM auth.users WHERE id = uid;
END $$;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

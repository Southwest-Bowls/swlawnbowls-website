-- ============================================================================
-- 0005 (Supabase) -- "Delete my account and data".
-- Required by Apple 5.1.1(v) and Google Play. The app calls rpc('delete_my_account') with the signed-in
-- user's token (assets/app/app.js, data-del-go).
--
-- STATUS: written 2026-10-16, NOT YET APPLIED. Do not run until STEP 1 has been checked (below).
--
-- What it does, in one transaction, for the CALLER only (auth.uid()):
--   1. deletes the caller's contact-change requests (private.contact_change_requests.requested_by = uid)
--   2. unlinks the caller from their membership record (private.account_member_links.auth_subject = uid).
--      The roster row itself (private.members and friends) is kept: it is the Division's record, not the account.
--   3. deletes the sign-in account (auth.users), so the email can sign up again.
-- Published tournament results are never touched (they are not stored in these tables).
-- ============================================================================

-- STEP 1 (read-only, run first, send the output back): find anything else that points at a signed-in user.
--   SELECT table_schema, table_name, column_name
--     FROM information_schema.columns
--    WHERE column_name IN ('auth_subject', 'requested_by', 'user_id', 'created_by', 'auth_user_id')
--      AND table_schema NOT IN ('pg_catalog', 'information_schema', 'auth', 'storage', 'realtime', 'extensions', 'vault');
--   SELECT conrelid::regclass AS table_with_fk FROM pg_constraint WHERE confrelid = 'auth.users'::regclass;
-- If either query lists a table other than the two handled below, add a DELETE (or UPDATE ... SET NULL) for it first.

-- STEP 2: create the function.
CREATE OR REPLACE FUNCTION public.delete_my_account() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  DELETE FROM private.contact_change_requests WHERE requested_by = uid::text;
  DELETE FROM private.account_member_links    WHERE auth_subject = uid::text;
  DELETE FROM auth.users WHERE id = uid;
END $$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- STEP 3: test with a throwaway address that is on the roster or allowlist: sign in on a phone, open
-- More > App settings > Delete my account and data, confirm; then check:
--   SELECT count(*) FROM auth.users WHERE email = '<the test address>';                  -- expect 0
--   SELECT count(*) FROM private.account_member_links WHERE auth_subject = '<its old id>'; -- expect 0
-- and that the member's roster record (private.members) is still there.

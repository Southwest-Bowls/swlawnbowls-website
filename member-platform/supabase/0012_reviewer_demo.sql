-- ============================================================================
-- 0012 (Supabase) -- demo account for Apple / Google reviewers.
-- STATUS: written 2026-10-28, NOT YET APPLIED. Run by hand in the SQL Editor (Giulia).
--
-- Why: reviewers cannot read our members' email, and the app signs members in with an emailed code.
-- The app has a small password screen for ONE demo account (More > My SWD > Sign in > "App store review
-- sign-in", address /app/signin?review=1). Real members have no password, so nothing changes for them.
-- The demo account is a made-up member (Riley Reviewer); no real person's data is behind it.
--
-- STEP 1 (dashboard, not SQL): Authentication > Users > Add user > "Create new user"
--     Email: app.review@swlawnbowls.org     Password: a long random one (keep it in a password manager)
--     Tick "Auto Confirm User". The address does not need to receive mail.
--     Then check Authentication > Sign In / Providers > Email is enabled (password sign-in allowed).
-- STEP 2: run the block below (creates the made-up member and puts the address on the sign-in list).
-- STEP 3: put the email and password in App Store Connect > App Review Information > Sign-in required
--     (and in Play Console > App access). Do not put the password in git or in these docs.
-- STEP 4: test: sign in from the app's review screen; My SWD should show "Riley Reviewer", Laguna Woods.
-- Remove after review is finished (block at the bottom), or keep it for future updates and rotate the password.
-- ============================================================================
DO $$
DECLARE a uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM private.members WHERE approved_by = 'REVIEWER') THEN RETURN; END IF;
  INSERT INTO private.members (first_name, last_name, display_name, approved_by)
    VALUES ('Riley', 'Reviewer', 'Riley Reviewer', 'REVIEWER') RETURNING id INTO a;
  INSERT INTO private.member_contacts (member_id, kind, value_original, value_normalized)
    VALUES (a, 'email', 'app.review@swlawnbowls.org', 'app.review@swlawnbowls.org');
  INSERT INTO private.member_clubs (member_id, club_id, relationship, source_value)
    VALUES (a, 'laguna-woods', 'home', 'REVIEWER');
  INSERT INTO private.membership_records (member_id, organization, season, dues_raw, novice_raw, begnov_raw, approved_status)
    VALUES (a, 'SWD', '2026', 'x', NULL, NULL, 'paid'), (a, 'BOWLS_USA', '2026', 'x', NULL, NULL, 'paid');
  INSERT INTO private.signin_allowlist (email, note) VALUES ('app.review@swlawnbowls.org', 'REVIEWER') ON CONFLICT DO NOTHING;
END $$;

-- To remove the demo member again (then delete the user under Authentication > Users):
-- DELETE FROM private.contact_change_requests WHERE member_id IN (SELECT id FROM private.members WHERE approved_by = 'REVIEWER');
-- DELETE FROM private.account_member_links WHERE member_id IN (SELECT id FROM private.members WHERE approved_by = 'REVIEWER');
-- DELETE FROM private.membership_records WHERE member_id IN (SELECT id FROM private.members WHERE approved_by = 'REVIEWER');
-- DELETE FROM private.member_clubs WHERE member_id IN (SELECT id FROM private.members WHERE approved_by = 'REVIEWER');
-- DELETE FROM private.member_contacts WHERE member_id IN (SELECT id FROM private.members WHERE approved_by = 'REVIEWER');
-- DELETE FROM private.members WHERE approved_by = 'REVIEWER';
-- DELETE FROM private.signin_allowlist WHERE note = 'REVIEWER';

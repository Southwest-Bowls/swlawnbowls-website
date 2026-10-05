-- Made-up test members (approved_by = 'TEST'); remove before launch with
-- the DELETE block at the bottom of this file. No real people.
DO $$
DECLARE a uuid; b uuid; c uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM private.members WHERE approved_by = 'TEST') THEN RETURN; END IF;
  INSERT INTO private.members (first_name, last_name, display_name, approved_by) VALUES ('Tess', 'Example', 'Tess Example', 'TEST') RETURNING id INTO a;
  INSERT INTO private.members (first_name, last_name, display_name, approved_by) VALUES ('Sam', 'Sample', 'Sam Sample', 'TEST') RETURNING id INTO b;
  INSERT INTO private.members (first_name, last_name, display_name, approved_by) VALUES ('Alex', 'Sample', 'Alex Sample', 'TEST') RETURNING id INTO c;
  INSERT INTO private.member_contacts (member_id, kind, value_original, value_normalized) VALUES
    (a, 'email', 'test.solo@example.com', 'test.solo@example.com'), (a, 'phone', '(555) 010-0001', '5550100001'),
    (b, 'email', 'test.household@example.com', 'test.household@example.com'),
    (c, 'email', 'Test.Household@example.com ', 'test.household@example.com');
  INSERT INTO private.member_clubs (member_id, club_id, relationship, source_value) VALUES
    (a, 'laguna-woods', 'home', 'TEST'), (b, 'santa-anita', 'home', 'TEST'), (c, 'santa-anita', 'home', 'TEST');
  INSERT INTO private.membership_records (member_id, organization, season, dues_raw, novice_raw, begnov_raw, approved_status) VALUES
    (a, 'SWD', '2026', 'x', 'N', '2025/03', 'paid'), (a, 'BOWLS_USA', '2026', 'x', NULL, NULL, 'paid'),
    (b, 'SWD', '2026', 'x', '', '2019/05', 'paid'), (b, 'BOWLS_USA', '2026', NULL, NULL, NULL, NULL),
    (c, 'SWD', '2026', 'x', 'N', '2024-06-01 00:00:00', 'paid'), (c, 'BOWLS_USA', '2026', 'x', NULL, NULL, 'paid');
  INSERT INTO private.signin_allowlist (email, note) VALUES
    ('test.solo@example.com', 'TEST'), ('test.household@example.com', 'TEST'), ('test.nobody@example.com', 'TEST')
  ON CONFLICT DO NOTHING;
END $$;

-- To remove all test data before launch:
-- DELETE FROM private.contact_change_requests WHERE member_id IN (SELECT id FROM private.members WHERE approved_by = 'TEST');
-- DELETE FROM private.account_member_links WHERE member_id IN (SELECT id FROM private.members WHERE approved_by = 'TEST');
-- DELETE FROM private.membership_records WHERE member_id IN (SELECT id FROM private.members WHERE approved_by = 'TEST');
-- DELETE FROM private.member_clubs WHERE member_id IN (SELECT id FROM private.members WHERE approved_by = 'TEST');
-- DELETE FROM private.member_contacts WHERE member_id IN (SELECT id FROM private.members WHERE approved_by = 'TEST');
-- DELETE FROM private.members WHERE approved_by = 'TEST';
-- DELETE FROM private.signin_allowlist WHERE note = 'TEST';

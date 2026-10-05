-- 0002 (Supabase) — create member records from the reviewed 2026 roster.
--
-- Rules (from the operator's review, 2026-10-04/05):
--   * One member per staged roster row. Repeated names and shared emails were
--     reviewed as different people / shared household inboxes, so nothing is
--     merged here.
--   * Rows in a group the reviewer marked "same person" are HELD: no member is
--     created for them until the merge itself is approved.
--   * Club comes only from an approved club mapping; "no match" gives no club.
--   * Names, emails and phones are copied exactly as written (plus a
--     lower-cased email for matching). Address stays in the staged row only.
--   * SW dues: the roster is the 2026 SW dues list — "dues sw man/woman" is
--     marked on every row, so the SWD 2026 record is "paid" when marked.
--     Bowls USA dues are kept raw, with no status, until their meaning is agreed.
--   * Novice evidence (Novices, begnov) is kept exactly as written.
-- Safe to run once: it refuses to run if members already exist.
SET search_path = private, extensions;

CREATE OR REPLACE FUNCTION private.build_members_2026(p_operator text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = private, extensions AS $$
DECLARE
  r record; m uuid; made int := 0; held int := 0; email text; phone text; club text;
BEGIN
  IF EXISTS (SELECT 1 FROM members) THEN RAISE EXCEPTION 'members already built'; END IF;

  CREATE TEMP TABLE held_rows ON COMMIT DROP AS
    SELECT DISTINCT ir.staged_row_id
    FROM review_issue_rows ir
    JOIN LATERAL (SELECT decision FROM review_decisions d WHERE d.issue_id = ir.issue_id
                  ORDER BY decided_at DESC LIMIT 1) last ON true
    WHERE last.decision = 'same_person_pending_approval';

  FOR r IN SELECT s.* FROM staged_member_rows s ORDER BY s.source_sheet, s.source_row LOOP
    IF EXISTS (SELECT 1 FROM held_rows h WHERE h.staged_row_id = r.id) THEN held := held + 1; CONTINUE; END IF;

    INSERT INTO members (first_name, last_name, display_name, approved_by)
    VALUES (trim(r.raw->>'name_First'), trim(r.raw->>'name_Last'),
            trim(trim(r.raw->>'name_First') || ' ' || trim(r.raw->>'name_Last')), p_operator)
    RETURNING id INTO m;

    INSERT INTO member_source_links (staged_row_id, member_id, linked_by, reason)
    VALUES (r.id, m, p_operator, 'Built from reviewed 2026 roster row');

    email := nullif(trim(r.raw->>'email'), '');
    IF email IS NOT NULL THEN
      INSERT INTO member_contacts (member_id, kind, value_original, value_normalized, source_staged_row_id)
      VALUES (m, 'email', r.raw->>'email', lower(email), r.id);
    END IF;
    phone := nullif(trim(r.raw->>'Area-code-Phone-#'), '');
    IF phone IS NOT NULL THEN
      INSERT INTO member_contacts (member_id, kind, value_original, value_normalized, source_staged_row_id)
      VALUES (m, 'phone', r.raw->>'Area-code-Phone-#', regexp_replace(phone, '[^0-9+]', '', 'g'), r.id);
    END IF;

    SELECT approved_club_id INTO club FROM club_crosswalk
     WHERE batch_id = r.batch_id AND status = 'approved'
       AND trim(home_club_raw) = trim(coalesce(r.raw->>'Home Club', '')) AND trim(club1_raw) = trim(coalesce(r.raw->>'club1', ''));   -- roster has stray end spaces
    IF club IS NOT NULL THEN
      INSERT INTO member_clubs (member_id, club_id, relationship, source_value)
      VALUES (m, club, 'home', r.raw->>'Home Club');
    END IF;

    INSERT INTO membership_records (member_id, organization, season, dues_raw, novice_raw, begnov_raw, approved_status, source_staged_row_id)
    VALUES (m, 'SWD', '2026',
            nullif(trim(coalesce(r.raw->>'dues sw man', '') || coalesce(r.raw->>'dues sw woman', '')), ''),
            r.raw->>'Novices', r.raw->>'begnov',
            CASE WHEN trim(coalesce(r.raw->>'dues sw man', '') || coalesce(r.raw->>'dues sw woman', '')) <> '' THEN 'paid' END,
            r.id);
    INSERT INTO membership_records (member_id, organization, season, dues_raw, approved_status, source_staged_row_id)
    VALUES (m, 'BOWLS_USA', '2026',
            nullif(trim(coalesce(r.raw->>'dues us man', '') || coalesce(r.raw->>'dues us woman', '')), ''), NULL, r.id);

    UPDATE staged_member_rows SET review_status = 'ready' WHERE id = r.id;
    made := made + 1;
  END LOOP;

  INSERT INTO audit_events (actor, action, entity, summary)
  VALUES (p_operator, 'build_members', 'members', jsonb_build_object('created', made, 'held_for_merge_approval', held));
  RETURN jsonb_build_object('created', made, 'held_for_merge_approval', held);
END $$;

INSERT INTO schema_migrations (version) VALUES ('0002_members_from_review') ON CONFLICT DO NOTHING;

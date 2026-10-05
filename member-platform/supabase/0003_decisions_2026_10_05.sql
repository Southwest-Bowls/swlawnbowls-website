-- 0003 (Supabase) — the operator's answers of 2026-10-05.
--   1. Novice status ends 2 years after the begnov month.
--   2. "dues us man/woman" = Bowls USA dues paid.
--   3. The 4 groups first marked "same person" are to stay SEPARATE people.
SET search_path = private, extensions;

-- One staged row → one member (the same steps 0002 used, now reusable)
CREATE OR REPLACE FUNCTION private.build_member_row(p_row uuid, p_operator text, p_reason text)
RETURNS uuid LANGUAGE plpgsql SET search_path = private, extensions AS $$
DECLARE r record; m uuid; email text; phone text; club text; sw text; us text;
BEGIN
  SELECT * INTO r FROM staged_member_rows WHERE id = p_row;
  IF r.id IS NULL THEN RAISE EXCEPTION 'no staged row %', p_row; END IF;
  IF EXISTS (SELECT 1 FROM member_source_links WHERE staged_row_id = p_row) THEN RAISE EXCEPTION 'row % already has a member', p_row; END IF;

  INSERT INTO members (first_name, last_name, display_name, approved_by)
  VALUES (trim(r.raw->>'name_First'), trim(r.raw->>'name_Last'),
          trim(trim(r.raw->>'name_First') || ' ' || trim(r.raw->>'name_Last')), p_operator)
  RETURNING id INTO m;
  INSERT INTO member_source_links (staged_row_id, member_id, linked_by, reason) VALUES (r.id, m, p_operator, p_reason);

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
     AND trim(home_club_raw) = trim(coalesce(r.raw->>'Home Club', '')) AND trim(club1_raw) = trim(coalesce(r.raw->>'club1', ''));
  IF club IS NOT NULL THEN
    INSERT INTO member_clubs (member_id, club_id, relationship, source_value) VALUES (m, club, 'home', r.raw->>'Home Club');
  END IF;

  sw := nullif(trim(coalesce(r.raw->>'dues sw man', '') || coalesce(r.raw->>'dues sw woman', '')), '');
  us := nullif(trim(coalesce(r.raw->>'dues us man', '') || coalesce(r.raw->>'dues us woman', '')), '');
  INSERT INTO membership_records (member_id, organization, season, dues_raw, novice_raw, begnov_raw, approved_status, source_staged_row_id)
  VALUES (m, 'SWD', '2026', sw, r.raw->>'Novices', r.raw->>'begnov', CASE WHEN sw IS NOT NULL THEN 'paid' END, r.id);
  INSERT INTO membership_records (member_id, organization, season, dues_raw, approved_status, source_staged_row_id)
  VALUES (m, 'BOWLS_USA', '2026', us, CASE WHEN us IS NOT NULL THEN 'paid' END, r.id);

  UPDATE staged_member_rows SET review_status = 'ready' WHERE id = r.id;
  RETURN m;
END $$;

-- The begnov month as a date: "2024/10", "2024/10 " and "2024-10-01 00:00:00"
-- all give 2024-10-01. Anything else (blank, year 0001) gives NULL — the
-- member is then told to ask the Division, never guessed.
CREATE OR REPLACE FUNCTION private.begnov_month(p text)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN m[1]::int BETWEEN 1950 AND 2100 AND m[2]::int BETWEEN 1 AND 12
              THEN make_date(m[1]::int, m[2]::int, 1) END
  FROM (SELECT regexp_match(coalesce(p, ''), '^\s*(\d{4})[/-](\d{1,2})') m) x
$$;
-- Novice status ends 2 years after the begnov month (last novice day =
-- the day before the 2-year anniversary of the 1st of that month).
CREATE OR REPLACE FUNCTION private.novice_until(p_begnov text)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT (private.begnov_month(p_begnov) + interval '2 years' - interval '1 day')::date
$$;

DO $$
DECLARE i record; r record; made int := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '0003_decisions_2026_10_05') THEN RETURN; END IF;

  -- 3. Keep the four groups separate: a new decision (decisions are append-only)
  FOR i IN SELECT ri.id FROM review_issues ri
           JOIN LATERAL (SELECT decision FROM review_decisions d WHERE d.issue_id = ri.id ORDER BY decided_at DESC LIMIT 1) l ON true
           WHERE l.decision = 'same_person_pending_approval' LOOP
    INSERT INTO review_decisions (issue_id, decision, reason, decided_by)
    VALUES (i.id, 'keep_separate', 'Keep them separate (GG, 2026-10-05)', 'GG');
    UPDATE review_issues SET resolution = 'keep_separate' WHERE id = i.id;
    FOR r IN SELECT ir.staged_row_id FROM review_issue_rows ir
             WHERE ir.issue_id = i.id
               AND NOT EXISTS (SELECT 1 FROM member_source_links l WHERE l.staged_row_id = ir.staged_row_id) LOOP
      PERFORM build_member_row(r.staged_row_id, 'GG', 'Kept separate on review (GG, 2026-10-05)');
      made := made + 1;
    END LOOP;
  END LOOP;

  -- 2. Bowls USA dues: marked = paid
  UPDATE membership_records SET approved_status = 'paid'
   WHERE organization = 'BOWLS_USA' AND season = '2026' AND dues_raw IS NOT NULL AND approved_status IS NULL;

  INSERT INTO audit_events (actor, action, entity, summary)
  VALUES ('GG', 'apply_decisions_2026_10_05', 'members',
          jsonb_build_object('members_created_kept_separate', made,
                             'novice_rule', 'ends 2 years after begnov',
                             'bowls_usa_dues', 'marked = paid'));
  INSERT INTO schema_migrations (version) VALUES ('0003_decisions_2026_10_05');
END $$;

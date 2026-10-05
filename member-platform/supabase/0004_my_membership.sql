-- 0004 (Supabase) — "My membership": what a signed-in member may do.
--
-- Members never touch the private tables. They can call three functions,
-- each limited to their own record:
--   public.my_membership()           what the app shows
--   public.claim_member(member_id)   "This is me"
--   public.request_contact_change()  suggest a new email or phone (reviewed, never automatic)
--
-- While testing, only addresses on private.signin_allowlist get any answer.
-- Going live = UPDATE private.app_settings SET signin_open = true (operator's decision).
-- New sign-ups are also switched off in Supabase Auth until then.
SET search_path = private, extensions;

CREATE TABLE IF NOT EXISTS private.app_settings (
  id           boolean PRIMARY KEY DEFAULT true CHECK (id),
  signin_open  boolean NOT NULL DEFAULT false,
  changed_by   text,
  changed_at   timestamptz NOT NULL DEFAULT now()
);
INSERT INTO private.app_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS private.signin_allowlist (
  email     text PRIMARY KEY CHECK (email = lower(trim(email))),
  note      text NOT NULL,
  added_at  timestamptz NOT NULL DEFAULT now()
);

-- Suggested contact changes wait here for the operator; nothing is overwritten.
CREATE TABLE IF NOT EXISTS private.contact_change_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     uuid NOT NULL REFERENCES private.members(id),
  kind          text NOT NULL CHECK (kind IN ('email', 'phone')),
  new_value     text NOT NULL CHECK (length(trim(new_value)) BETWEEN 3 AND 200),
  requested_by  text NOT NULL,          -- auth user id
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  decided_by    text,
  decided_at    timestamptz
);

-- ---- helpers (private) ---------------------------------------------------
CREATE OR REPLACE FUNCTION private.caller_allowed() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (SELECT signin_open FROM private.app_settings)
      OR EXISTS (SELECT 1 FROM private.signin_allowlist a WHERE a.email = lower(auth.jwt() ->> 'email'))
$$;

CREATE OR REPLACE FUNCTION private.member_card(p_member uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', m.id,
    'name', m.display_name,
    'club', (SELECT jsonb_build_object('id', c.id, 'name', c.name) FROM private.member_clubs mc
              JOIN private.clubs c ON c.id = mc.club_id WHERE mc.member_id = m.id AND mc.relationship = 'home' LIMIT 1),
    'season', '2026',
    'swDuesPaid', EXISTS (SELECT 1 FROM private.membership_records r WHERE r.member_id = m.id
                           AND r.organization = 'SWD' AND r.season = '2026' AND r.approved_status = 'paid'),
    'usaDuesPaid', EXISTS (SELECT 1 FROM private.membership_records r WHERE r.member_id = m.id
                           AND r.organization = 'BOWLS_USA' AND r.season = '2026' AND r.approved_status = 'paid'),
    'begnovMonth', (SELECT private.begnov_month(r.begnov_raw) FROM private.membership_records r
                     WHERE r.member_id = m.id AND r.organization = 'SWD' AND r.season = '2026' LIMIT 1),
    'noviceUntil', (SELECT private.novice_until(r.begnov_raw) FROM private.membership_records r
                     WHERE r.member_id = m.id AND r.organization = 'SWD' AND r.season = '2026' LIMIT 1),
    'email', (SELECT value_original FROM private.member_contacts WHERE member_id = m.id AND kind = 'email' LIMIT 1),
    'phone', (SELECT value_original FROM private.member_contacts WHERE member_id = m.id AND kind = 'phone' LIMIT 1),
    'pendingChanges', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', q.kind, 'value', q.new_value, 'at', q.created_at) ORDER BY q.created_at)
                        FROM private.contact_change_requests q WHERE q.member_id = m.id AND q.status = 'pending'), '[]'::jsonb)
  )
  FROM private.members m WHERE m.id = p_member AND m.deleted_at IS NULL
$$;

-- Members whose roster email is the caller's (signed-in, confirmed) email
CREATE OR REPLACE FUNCTION private.email_candidates() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT DISTINCT c.member_id FROM private.member_contacts c JOIN private.members m ON m.id = c.member_id
  WHERE c.kind = 'email' AND m.deleted_at IS NULL
    AND c.value_normalized = lower(auth.jwt() ->> 'email')
    AND coalesce(auth.jwt() ->> 'email', '') <> ''
$$;

-- ---- what members can call (public) -------------------------------------
CREATE OR REPLACE FUNCTION public.my_membership() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid text := auth.uid()::text; linked uuid; pending uuid; cands jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'sign in first'; END IF;
  IF NOT private.caller_allowed() THEN RETURN jsonb_build_object('state', 'not_open'); END IF;

  SELECT member_id INTO linked FROM private.account_member_links
   WHERE auth_subject = uid AND claim_status = 'verified' ORDER BY created_at DESC LIMIT 1;
  IF linked IS NOT NULL THEN RETURN jsonb_build_object('state', 'linked', 'member', private.member_card(linked)); END IF;

  SELECT member_id INTO pending FROM private.account_member_links
   WHERE auth_subject = uid AND claim_status = 'pending' ORDER BY created_at DESC LIMIT 1;
  IF pending IS NOT NULL THEN
    RETURN jsonb_build_object('state', 'pending', 'name', (SELECT display_name FROM private.members WHERE id = pending));
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.display_name,
           'club', (SELECT c.name FROM private.member_clubs mc JOIN private.clubs c ON c.id = mc.club_id
                     WHERE mc.member_id = m.id AND mc.relationship = 'home' LIMIT 1)) ORDER BY m.display_name), '[]'::jsonb)
    INTO cands
    FROM private.members m WHERE m.id IN (SELECT private.email_candidates());
  IF jsonb_array_length(cands) = 0 THEN RETURN jsonb_build_object('state', 'not_found'); END IF;
  RETURN jsonb_build_object('state', 'choose', 'candidates', cands, 'shared', jsonb_array_length(cands) > 1);
END $$;

-- "This is me". Linked straight away only when this email belongs to exactly
-- one member and nobody else has claimed them; otherwise it waits for the
-- operator (shared household inboxes never link anyone automatically).
CREATE OR REPLACE FUNCTION public.claim_member(p_member uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid text := auth.uid()::text; n int; taken boolean; st text; how text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'sign in first'; END IF;
  IF NOT private.caller_allowed() THEN RETURN jsonb_build_object('state', 'not_open'); END IF;
  IF EXISTS (SELECT 1 FROM private.account_member_links WHERE auth_subject = uid AND claim_status IN ('verified', 'pending')) THEN
    RETURN public.my_membership();
  END IF;
  IF p_member NOT IN (SELECT private.email_candidates()) THEN RAISE EXCEPTION 'not one of your records'; END IF;

  SELECT count(*) INTO n FROM private.email_candidates();
  SELECT EXISTS (SELECT 1 FROM private.account_member_links WHERE member_id = p_member AND claim_status = 'verified') INTO taken;
  IF n = 1 AND NOT taken THEN st := 'verified'; how := 'email_one_member';
  ELSE st := 'pending'; how := CASE WHEN taken THEN 'already_claimed' ELSE 'email_shared_household' END;
  END IF;

  INSERT INTO private.account_member_links (auth_subject, member_id, claim_status, method) VALUES (uid, p_member, st, how);
  INSERT INTO private.audit_events (actor, action, entity, entity_id, summary)
  VALUES ('member:' || uid, 'claim_member', 'members', p_member::text, jsonb_build_object('status', st, 'method', how));
  RETURN public.my_membership();
END $$;

CREATE OR REPLACE FUNCTION public.request_contact_change(p_kind text, p_value text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid text := auth.uid()::text; mid uuid; v text := trim(coalesce(p_value, ''));
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'sign in first'; END IF;
  IF NOT private.caller_allowed() THEN RETURN jsonb_build_object('state', 'not_open'); END IF;
  SELECT member_id INTO mid FROM private.account_member_links WHERE auth_subject = uid AND claim_status = 'verified' LIMIT 1;
  IF mid IS NULL THEN RAISE EXCEPTION 'link your membership first'; END IF;
  IF p_kind NOT IN ('email', 'phone') THEN RAISE EXCEPTION 'email or phone only'; END IF;
  IF p_kind = 'email' AND v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'that email does not look right'; END IF;
  IF p_kind = 'phone' AND length(regexp_replace(v, '[^0-9]', '', 'g')) NOT BETWEEN 7 AND 15 THEN RAISE EXCEPTION 'that phone number does not look right'; END IF;
  IF (SELECT count(*) FROM private.contact_change_requests WHERE member_id = mid AND status = 'pending') >= 5 THEN
    RAISE EXCEPTION 'you already have changes waiting for review';
  END IF;
  INSERT INTO private.contact_change_requests (member_id, kind, new_value, requested_by) VALUES (mid, p_kind, v, uid);
  INSERT INTO private.audit_events (actor, action, entity, entity_id, summary)
  VALUES ('member:' || uid, 'request_contact_change', 'members', mid::text, jsonb_build_object('kind', p_kind));
  RETURN public.my_membership();
END $$;

-- Only signed-in users may call these; nobody may call the private helpers.
REVOKE ALL ON FUNCTION public.my_membership(), public.claim_member(uuid), public.request_contact_change(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_membership(), public.claim_member(uuid), public.request_contact_change(text, text) TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;

INSERT INTO private.schema_migrations (version) VALUES ('0004_my_membership') ON CONFLICT DO NOTHING;

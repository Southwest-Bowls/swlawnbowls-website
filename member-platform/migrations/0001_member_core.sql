-- ===================================================================
-- 0001 — Southwest member platform: restricted roster staging, review,
-- and the core member tables (empty until an operator approves records).
--
-- Rules enforced here, not only in code:
--   * Every source row is staged exactly as received (raw values, blanks
--     kept) with its sheet/row provenance and a checksum.
--   * Re-importing the same file is a no-op (unique batch fingerprint).
--   * Nothing is merged automatically: members are created only through
--     an explicit, recorded operator decision (a later step).
--   * Names, emails and source row numbers are never member identifiers:
--     members get UUIDs; a reviewed source→member link maps rows to them.
--   * Review decisions and audit events are append-only.
-- ===================================================================

-- ---------- Staging --------------------------------------------------
CREATE TABLE import_batches (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file          text NOT NULL,          -- e.g. "2026 SWD Alpha list of membership 072726.xlsx"
  source_sha256        text NOT NULL,          -- fingerprint of the authoritative Excel file
  source_sheet         text NOT NULL,
  snapshot_date        date,                   -- the date the file represents (from its name)
  staging_file_sha256  text NOT NULL,          -- fingerprint of the staging CSV actually imported
  row_count            integer NOT NULL CHECK (row_count > 0),
  status               text NOT NULL DEFAULT 'staged'
                         CHECK (status IN ('staged', 'superseded', 'rolled_back')),
  created_by           text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  notes                text,
  UNIQUE (source_sha256, staging_file_sha256)
);

CREATE TABLE staged_member_rows (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id           uuid NOT NULL REFERENCES import_batches(id),
  source_sheet       text NOT NULL,
  source_row         integer NOT NULL CHECK (source_row > 0),
  row_checksum       text NOT NULL,             -- sha256 of the raw values in column order
  raw                jsonb NOT NULL,            -- every source column, exactly as received
  validation_flags   text[] NOT NULL DEFAULT '{}',
  review_status      text NOT NULL DEFAULT 'pending'
                       CHECK (review_status IN ('pending', 'ready', 'kept_separate', 'needs_info', 'excluded')),
  UNIQUE (batch_id, source_row)
);
-- Raw source values are immutable once staged
CREATE FUNCTION forbid_raw_change() RETURNS trigger AS $$
BEGIN
  IF NEW.raw IS DISTINCT FROM OLD.raw OR NEW.row_checksum IS DISTINCT FROM OLD.row_checksum
     OR NEW.source_row IS DISTINCT FROM OLD.source_row OR NEW.batch_id IS DISTINCT FROM OLD.batch_id THEN
    RAISE EXCEPTION 'staged source values are immutable (row %)', OLD.source_row;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER staged_rows_immutable BEFORE UPDATE ON staged_member_rows
  FOR EACH ROW EXECUTE FUNCTION forbid_raw_change();

-- ---------- Review queue ----------------------------------------------
CREATE TABLE review_issues (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id    uuid NOT NULL REFERENCES import_batches(id),
  kind        text NOT NULL CHECK (kind IN (
                'repeated_name', 'shared_email', 'begnov_format_review',
                'email_syntax_review', 'missing_email', 'multiple_or_ambiguous_club_codes')),
  group_key   text NOT NULL,                     -- stable key from the audit (e.g. "rows 9/11")
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolution  text,                              -- the latest decision, for listing
  UNIQUE (batch_id, kind, group_key)
);
CREATE TABLE review_issue_rows (
  issue_id       uuid NOT NULL REFERENCES review_issues(id),
  staged_row_id  uuid NOT NULL REFERENCES staged_member_rows(id),
  PRIMARY KEY (issue_id, staged_row_id)
);

-- Every operator decision, with who and why. Append-only.
CREATE TABLE review_decisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id    uuid NOT NULL REFERENCES review_issues(id),
  decision    text NOT NULL CHECK (decision IN (
                'keep_separate',                 -- distinct people / records
                'same_person_pending_approval',  -- reviewer believes one person; merge happens only at member approval
                'shared_household_contact',      -- legitimate shared email; grants no access to others
                'value_confirmed',               -- flagged value is correct as-is
                'needs_info',                    -- ask the roster owner
                'reopen')),
  reason      text NOT NULL CHECK (length(trim(reason)) >= 3),
  decided_by  text NOT NULL,
  decided_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- Club crosswalk (approved, never inferred) ------------------
CREATE TABLE clubs (
  id          text PRIMARY KEY,                  -- the website's permanent club id (clubs-data.json)
  name        text NOT NULL,
  city        text
);
CREATE TABLE club_crosswalk (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id          uuid NOT NULL REFERENCES import_batches(id),
  home_club_raw     text NOT NULL,
  club1_raw         text NOT NULL,
  record_count      integer NOT NULL,
  suggested_club_id text REFERENCES clubs(id),   -- a suggestion only; never used until approved
  code_conflict     text,                        -- set when this code usually appears with another club's label
  approved_club_id  text REFERENCES clubs(id),
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'no_match', 'needs_info')),
  decided_by        text,
  decided_at        timestamptz,
  reason            text,
  UNIQUE (batch_id, home_club_raw, club1_raw),
  CHECK (status <> 'approved' OR (approved_club_id IS NOT NULL AND decided_by IS NOT NULL AND reason IS NOT NULL))
);

-- ---------- Members (empty until explicit approval) --------------------
CREATE TABLE members (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name     text NOT NULL,
  last_name      text NOT NULL,
  display_name   text,
  approved_by    text NOT NULL,
  approved_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
-- Which staged rows an operator linked to which member. A row maps to at
-- most one member; re-imports reuse these reviewed links, never row numbers.
CREATE TABLE member_source_links (
  staged_row_id  uuid PRIMARY KEY REFERENCES staged_member_rows(id),
  member_id      uuid NOT NULL REFERENCES members(id),
  linked_by      text NOT NULL,
  linked_at      timestamptz NOT NULL DEFAULT now(),
  reason         text NOT NULL
);
-- Contact details are restricted and never unique: households share inboxes.
CREATE TABLE member_contacts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id             uuid NOT NULL REFERENCES members(id),
  kind                  text NOT NULL CHECK (kind IN ('email', 'phone', 'address')),
  value_original        text NOT NULL,
  value_normalized      text,
  verified_at           timestamptz,
  verification_method   text,
  source_staged_row_id  uuid REFERENCES staged_member_rows(id)
);
CREATE TABLE member_clubs (
  member_id     uuid NOT NULL REFERENCES members(id),
  club_id       text NOT NULL REFERENCES clubs(id),
  relationship  text NOT NULL CHECK (relationship IN ('home', 'other')),
  source_value  text,
  PRIMARY KEY (member_id, club_id, relationship)
);
-- Raw dues / novice / begnov evidence is kept verbatim; meanings are pending.
CREATE TABLE membership_records (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id             uuid NOT NULL REFERENCES members(id),
  organization          text NOT NULL CHECK (organization IN ('SWD', 'BOWLS_USA')),
  season                text NOT NULL,
  dues_raw              text,               -- e.g. "x", "X" or blank — NOT paid/unpaid
  novice_raw            text,
  begnov_raw            text,
  approved_status       text,               -- set only once definitions are agreed
  source_staged_row_id  uuid REFERENCES staged_member_rows(id)
);
-- Accounts are not members. A login links to a member only after a
-- verified claim; sharing an email never links anyone automatically.
CREATE TABLE account_member_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_subject  text NOT NULL,
  member_id     uuid NOT NULL REFERENCES members(id),
  claim_status  text NOT NULL DEFAULT 'pending' CHECK (claim_status IN ('pending', 'verified', 'rejected')),
  method        text,
  reviewer      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auth_subject, member_id)
);

-- ---------- Audit -------------------------------------------------------
-- What changed, by whom — never secrets or full private payloads.
CREATE TABLE audit_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at         timestamptz NOT NULL DEFAULT now(),
  actor      text NOT NULL,
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  text,
  summary    jsonb
);

-- Append-only tables
CREATE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER review_decisions_append_only BEFORE UPDATE OR DELETE ON review_decisions
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

CREATE TABLE schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO schema_migrations (version) VALUES ('0001_member_core');

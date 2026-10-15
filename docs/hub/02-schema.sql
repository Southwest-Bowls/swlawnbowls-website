-- ============================================================================
-- DRAFT -- NOT APPLIED -- DO NOT RUN
-- ============================================================================
-- SWD Hub, tournament entries: 0005_hub_entries (proposed name).
-- Status: design draft for review by Giulia, Anne and Bill. Nothing here has
-- been run, parsed by a Postgres server, or tested. Expect syntax fixes on the
-- first real run (do that on a scratch Supabase project, never production).
--
-- Decisions this draft encodes (Giulia, 2026-10):
--   * Money goes to SWD's own PayPal account. Card data never touches our code:
--     PayPal (and Apple Pay / Google Pay through it) carries the card; we store
--     only PayPal order/capture ids, amounts and status.
--   * Pay-by-check-or-cash is a first-class path: the entry is held as
--     pending_payment and the TD marks it paid when the check/cash arrives.
--   * Refunds are handled by Anne and Bill (admins, or TDs with tds.can_refund). The database records
--     the decision and the amount due; the money itself moves in PayPal (or by
--     check) outside this database and is then recorded here.
--   * Withdrawal: player requests in the app, Anne or Bill approve and refund.
--     The rule TEXT is TBD and is configured per event (events.withdrawal_rule).
--   * Entries, results and records live here instead of Google Sheets.
--     (Results/draw tables are NOT in this file; see OPEN QUESTIONS.)
--   * No pilot event chosen yet. Nothing here is specific to one event.
--
-- Conventions copied from member-platform/supabase/0004:
--   * SECURITY DEFINER functions with SET search_path = '' and fully qualified names.
--   * Members are in schema "private" (private.members); we only reference them.
--     Players never read "private"; the public API exposes only "public".
--   * Audit is append-only.
--
-- Layout: hub tables live in "public" (so Supabase's API can serve them under
-- row-level security). Helper functions live in "hub_private" (not exposed).
-- Every table has RLS ON and NO direct write policies for players: all player
-- writes go through the functions at the bottom.
-- ============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS hub_private;
REVOKE ALL ON SCHEMA hub_private FROM PUBLIC;
GRANT USAGE ON SCHEMA hub_private TO anon, authenticated, service_role;  -- needed so RLS policies can call helpers

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
CREATE TYPE public.event_status AS ENUM
  ('draft', 'published', 'entries_open', 'entries_closed', 'in_progress', 'completed', 'cancelled');
  -- Mirrors the PRD lifecycle. 'published' = visible, entries not yet open.

CREATE TYPE public.fee_unit AS ENUM ('per_team', 'per_player');

CREATE TYPE public.entry_status AS ENUM
  ('pending_payment',  -- submitted; waiting for PayPal capture, or for a check/cash to arrive
   'confirmed',       -- paid (online or recorded by a TD); counts on the public list
   'waitlisted',      -- event full; separate list
   'withdrawn',       -- player withdrew and the withdrawal was approved (or TD withdrew them)
   'expired',         -- payment never arrived within the hold time; slot released
   'cancelled');      -- event cancelled or TD/admin removed the entry

CREATE TYPE public.payment_method AS ENUM ('paypal', 'check', 'cash', 'other');
  -- 'paypal' includes Apple Pay and Google Pay (they ride on PayPal checkout).
  -- 'other' = e.g. paid at the green, comped. OPEN QUESTION: is 'other' allowed.

CREATE TYPE public.payment_status AS ENUM
  ('created',            -- PayPal order created, not captured
   'paid',
   'failed',
   'partially_refunded',
   'refunded',
   'voided');            -- recorded in error (offline); kept for the trail, never deleted

CREATE TYPE public.withdrawal_status AS ENUM ('requested', 'approved', 'rejected', 'cancelled');
CREATE TYPE public.refund_status AS ENUM
  ('none_due', 'due', 'issued', 'failed');   -- 'due' = approved, money not yet sent

CREATE TYPE public.player_position AS ENUM ('skip', 'vice', 'lead', 'second', 'player');
CREATE TYPE public.td_role AS ENUM ('director', 'assistant');
  -- OPEN QUESTION: do assistants need fewer powers than directors (e.g. no refunds)?

CREATE TYPE public.check_in_status AS ENUM ('checked_in', 'no_show');

-- ---------------------------------------------------------------------------
-- admins  (not in the requested list; required so "admin sees all" has a source)
-- ---------------------------------------------------------------------------
CREATE TABLE public.hub_admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id),
  note       text NOT NULL,                       -- e.g. 'Bill', 'Giulia (backup)'
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.hub_admins IS
  'Division admins: see and do everything in the Hub, including approving withdrawals and recording refunds. Seeded by hand by the operator; no API write policy. OPEN QUESTION: are Anne and Bill admins, or is Bill admin and Anne a TD on every event?';
ALTER TABLE public.hub_admins ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
CREATE TABLE public.events (
  id               text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]*$'),   -- same slug as events-data.json "id"
  title            text NOT NULL,
  format           text NOT NULL,           -- as in events-data.json: singles | pairs | triples | fours | 2+2 ...
  team_size        smallint NOT NULL CHECK (team_size BETWEEN 1 AND 8),     -- players per entry (singles 1, pairs 2, triples 3, fours 4)
  start_date       date,                    -- events-data.json has human text ("Saturday, April 18, 2026"); parse during import
  club_name        text,                    -- host club; OPEN QUESTION: link to private.clubs?
  status           public.event_status NOT NULL DEFAULT 'draft',
  fee_cents        integer CHECK (fee_cents >= 0),     -- NULL = fee not set (some 2026 events have no fee in the JSON)
  fee_unit         public.fee_unit NOT NULL DEFAULT 'per_team',
  currency         char(3) NOT NULL DEFAULT 'USD',
  entry_deadline   timestamptz,
  max_entries      integer CHECK (max_entries > 0),    -- NULL = no cap
  pay_online       boolean NOT NULL DEFAULT true,      -- offer PayPal (+ Apple/Google Pay)
  pay_check_cash   boolean NOT NULL DEFAULT true,      -- offer pay-by-check-or-cash
  check_payable_to text,                               -- OPEN QUESTION: payee text for checks, and who it is mailed to
  check_mail_to    text,                               -- today's contact.mailTo in events-data.json
  offline_hold_hours integer CHECK (offline_hold_hours > 0),
                                                       -- how long a check/cash entry keeps its slot; NULL = until entry_deadline. OPEN QUESTION: policy.
  online_hold_minutes integer NOT NULL DEFAULT 30 CHECK (online_hold_minutes > 0),  -- from the PRD (PayPal order not captured)
  td_contact_name  text,                               -- shown on the form; today's contact.name/email/phone
  td_contact_email text,
  td_contact_phone text,
  refund_policy_text text,                             -- shown to players. TBD: rule text not yet decided.
  withdrawal_rule  jsonb NOT NULL DEFAULT '{}'::jsonb, -- machine-readable, per event. See comment.
  legacy_paypal_button jsonb,                          -- the old events-data.json "paypal" block, kept for the transition
  legacy_entries_pub_url text,                         -- Google Sheet pubUrl, until the public list replaces it
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (pay_online OR pay_check_cash)
);
COMMENT ON TABLE public.events IS
  'One row per tournament; id equals the events-data.json id so migration is 1:1. Players and the public may read events past draft. TDs may edit details of their own events; admins everything.';
COMMENT ON COLUMN public.events.withdrawal_rule IS
  'RULE TEXT IS TBD. Optional keys read by hub_private.suggested_refund(): {"full_refund_until":"<timestamptz>","refund_percent_after":<0-100>}. Empty {} = no suggestion; ("self_service_until" from the PRD is NOT supported: every withdrawal is approved by Anne or Bill, nothing is refunded automatically.) Anne or Bill pick the refund amount by hand. Rules may differ by event.';
COMMENT ON COLUMN public.events.fee_cents IS
  'Fee in cents; fee_unit says whether it is per team or per player (e.g. "$450 per team ($150 per player)" needs a human decision when imported).';
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE INDEX events_status_idx ON public.events (status);
CREATE INDEX events_start_date_idx ON public.events (start_date);

-- ---------------------------------------------------------------------------
-- tds  (who runs which event)
-- ---------------------------------------------------------------------------
CREATE TABLE public.tds (
  event_id   text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id),
  role       public.td_role NOT NULL DEFAULT 'director',
  can_refund boolean NOT NULL DEFAULT false,   -- true for Anne and Bill only (set by an admin). Other TDs can view, not decide or refund.
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
COMMENT ON TABLE public.tds IS
  'Tournament directors assigned per event. A TD sees entries, payments, withdrawals and check-ins ONLY for events listed here. Assigned by an admin; no API write policy for TDs.';
ALTER TABLE public.tds ENABLE ROW LEVEL SECURITY;
CREATE INDEX tds_user_idx ON public.tds (user_id);

-- ---------------------------------------------------------------------------
-- helper functions used by policies (hub_private, not exposed)
-- ---------------------------------------------------------------------------
CREATE FUNCTION hub_private.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.hub_admins a WHERE a.user_id = auth.uid())
$$;

CREATE FUNCTION hub_private.is_td(p_event text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.tds t WHERE t.event_id = p_event AND t.user_id = auth.uid())
$$;

CREATE FUNCTION hub_private.can_run(p_event text) RETURNS boolean   -- admin, or TD of that event
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT hub_private.is_admin() OR hub_private.is_td(p_event)
$$;

-- Who may approve or reject a withdrawal and record a refund: an admin, or a TD of that event flagged can_refund.
-- (Decision: refunds are handled by Anne and Bill, not by every TD.)
CREATE FUNCTION hub_private.can_refund(p_event text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT hub_private.is_admin()
      OR EXISTS (SELECT 1 FROM public.tds t WHERE t.event_id = p_event AND t.user_id = auth.uid() AND t.can_refund)
$$;

-- The verified member record(s) of the signed-in user (see private.account_member_links)
CREATE FUNCTION hub_private.my_member_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT l.member_id FROM private.account_member_links l
   WHERE l.auth_subject = auth.uid()::text AND l.claim_status = 'verified'
$$;

-- NOTE: the two helpers below (hub_private.is_player_on, hub_private.can_see_entry) are created after the
-- entries tables exist; they are SECURITY DEFINER so policies on entries and entry_players do not
-- call each other (that would recurse forever).

-- ---------------------------------------------------------------------------
-- entries
-- ---------------------------------------------------------------------------
CREATE TABLE public.entries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         text NOT NULL REFERENCES public.events(id),
  entry_no         integer NOT NULL,                       -- 1,2,3... per event; shown publicly instead of the uuid
  status           public.entry_status NOT NULL DEFAULT 'pending_payment',
  submitted_by     uuid NOT NULL REFERENCES auth.users(id),
  team_name        text,
  contact_name     text NOT NULL,                          -- PRIVATE: not in the public view
  contact_email    text NOT NULL,                          -- PRIVATE
  contact_phone    text,                                   -- PRIVATE
  amount_due_cents integer NOT NULL CHECK (amount_due_cents >= 0),   -- computed in create_entry from fee and fee_unit
  payment_choice   public.payment_method NOT NULL,         -- what the player chose at entry time
  hold_expires_at  timestamptz,                            -- pending_payment only; NULL = no automatic expiry
  idempotency_key  text,                                   -- client-generated; double-tapping Submit cannot create two entries
  notes_from_player text,
  notes_internal   text,                                   -- TD-only note
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  confirmed_at     timestamptz,
  UNIQUE (event_id, entry_no),
  UNIQUE (submitted_by, idempotency_key)
);
COMMENT ON TABLE public.entries IS
  'One team (or single) entered in one event. Contact details and payment choice are private: visible to the submitter, the event''s TDs and admins; the public sees only the public_entry_list view. Written only by create_entry(), mark_paid(), approve_withdrawal() etc., never directly.';
ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX entries_event_status_idx ON public.entries (event_id, status);
CREATE INDEX entries_submitter_idx ON public.entries (submitted_by);
CREATE INDEX entries_hold_idx ON public.entries (hold_expires_at) WHERE status = 'pending_payment';

-- ---------------------------------------------------------------------------
-- entry_players
-- ---------------------------------------------------------------------------
CREATE TABLE public.entry_players (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id    uuid NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  seat        smallint NOT NULL CHECK (seat > 0),
  member_id   uuid REFERENCES private.members(id),   -- NULL = non-member / free text. OPEN QUESTION: are non-members allowed? (rules say all players must be Bowls USA members)
  full_name   text NOT NULL,                           -- copied from the member record when member_id is set
  club_name   text,                                    -- denormalized so the public list needs no join to "private"
  position    public.player_position,
  is_novice   boolean,                                 -- NULL = unknown; set by TD or computed. OPEN QUESTION: use private.novice_until() automatically?
  UNIQUE (entry_id, seat),
  UNIQUE (entry_id, member_id)
);
COMMENT ON TABLE public.entry_players IS
  'The players on an entry, one row each. This is the structural fix for the old PayPal 127-character truncation: PayPal never sees player data, only the entry id. Names and clubs are public via the entry list; member_id is not.';
ALTER TABLE public.entry_players ENABLE ROW LEVEL SECURITY;
CREATE INDEX entry_players_member_idx ON public.entry_players (member_id) WHERE member_id IS NOT NULL;

CREATE FUNCTION hub_private.is_player_on(p_entry uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.entry_players p
                  WHERE p.entry_id = p_entry AND p.member_id IN (SELECT hub_private.my_member_ids()))
$$;

-- true when the signed-in user may see this entry: submitter, listed player, TD of the event, or admin
CREATE FUNCTION hub_private.can_see_entry(p_entry uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.entries e
                  WHERE e.id = p_entry
                    AND (e.submitted_by = auth.uid() OR hub_private.can_run(e.event_id) OR hub_private.is_player_on(e.id)))
$$;

-- ---------------------------------------------------------------------------
-- payments  (no card data, ever)
-- ---------------------------------------------------------------------------
CREATE TABLE public.payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id           uuid NOT NULL REFERENCES public.entries(id),
  method             public.payment_method NOT NULL,
  status             public.payment_status NOT NULL,
  amount_cents       integer NOT NULL CHECK (amount_cents >= 0),
  refunded_cents     integer NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0 AND refunded_cents <= amount_cents),
  currency           char(3) NOT NULL DEFAULT 'USD',
  paypal_order_id    text UNIQUE,
  paypal_capture_id  text UNIQUE,                       -- idempotency: the webhook may fire twice
  reference          text,                              -- check number, receipt number, etc.
  note               text,
  recorded_by        uuid REFERENCES auth.users(id),    -- NULL when written by the PayPal webhook (service role)
  received_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  raw_provider_event jsonb,                             -- webhook payload; admin/service only (column privileges below)
  CHECK (method <> 'paypal' OR status = 'failed' OR paypal_order_id IS NOT NULL)
);
COMMENT ON TABLE public.payments IS
  'Money received for an entry: PayPal captures (written by the webhook) or check/cash recorded by a TD. Holds ids, amounts and status only; card numbers never reach this database. Rows are never deleted: a mistake is set to voided. raw_provider_event is hidden from everyone except admins and the service role.';
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX payments_entry_idx ON public.payments (entry_id);

-- ---------------------------------------------------------------------------
-- withdrawals
-- ---------------------------------------------------------------------------
CREATE TABLE public.withdrawals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id          uuid NOT NULL REFERENCES public.entries(id),
  requested_by      uuid NOT NULL REFERENCES auth.users(id),
  reason            text,
  status            public.withdrawal_status NOT NULL DEFAULT 'requested',
  suggested_refund_cents integer,                       -- from events.withdrawal_rule at request time; NULL = no rule, decide by hand
  refund_cents      integer CHECK (refund_cents >= 0),  -- amount approved by Anne or Bill
  refund_status     public.refund_status NOT NULL DEFAULT 'none_due',
  refund_reference  text,                               -- PayPal refund id, or check number
  decided_by        uuid REFERENCES auth.users(id),
  decision_note     text,
  requested_at      timestamptz NOT NULL DEFAULT now(),
  decided_at        timestamptz,
  refund_issued_at  timestamptz
);
COMMENT ON TABLE public.withdrawals IS
  'A player asks to withdraw (request_withdrawal); Anne or Bill (admin, or TD with can_refund) approve or reject it, choosing the refund amount (approve_withdrawal). The refund itself is sent in PayPal or by check, then recorded with record_refund_issued(). Rule text is TBD and per event.';
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX withdrawals_one_open_per_entry ON public.withdrawals (entry_id) WHERE status = 'requested';
CREATE INDEX withdrawals_status_idx ON public.withdrawals (status);

-- ---------------------------------------------------------------------------
-- check_ins
-- ---------------------------------------------------------------------------
CREATE TABLE public.check_ins (
  entry_id    uuid PRIMARY KEY REFERENCES public.entries(id) ON DELETE CASCADE,   -- one per entry; OPEN QUESTION: check in per player instead?
  event_id    text NOT NULL REFERENCES public.events(id),
  status      public.check_in_status NOT NULL,
  checked_by  uuid NOT NULL REFERENCES auth.users(id),
  at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.check_ins IS
  'Day-of check-in per entry (checked in, or no-show). Written by TDs/admins of the event. Players do not see it.';
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;
CREATE INDEX check_ins_event_idx ON public.check_ins (event_id);

-- ---------------------------------------------------------------------------
-- audit_log  (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE public.audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  actor       uuid,                       -- NULL = system / webhook
  actor_role  text NOT NULL,              -- player | td | admin | system
  action      text NOT NULL,              -- e.g. entry.create, payment.mark_paid, withdrawal.approve
  event_id    text,
  entity_type text NOT NULL,
  entity_id   text NOT NULL,
  before      jsonb,
  after       jsonb
);
COMMENT ON TABLE public.audit_log IS
  'Who did what, to which record, before and after. Append-only (trigger blocks UPDATE and DELETE). Admins read all; a TD reads rows for their own events. No secrets or card data are ever written here.';
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX audit_log_entity_idx ON public.audit_log (entity_type, entity_id);
CREATE INDEX audit_log_event_idx ON public.audit_log (event_id, at DESC);

CREATE FUNCTION hub_private.forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END $$;
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION hub_private.forbid_change();

-- updated_at upkeep
CREATE FUNCTION hub_private.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER events_touch  BEFORE UPDATE ON public.events  FOR EACH ROW EXECUTE FUNCTION hub_private.touch_updated_at();
CREATE TRIGGER entries_touch BEFORE UPDATE ON public.entries FOR EACH ROW EXECUTE FUNCTION hub_private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Table privileges: start from nothing, grant only what policies will filter.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.hub_admins, public.events, public.tds, public.entries, public.entry_players,
              public.payments, public.withdrawals, public.check_ins, public.audit_log
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.events TO anon, authenticated;                    -- public sees published events (policy below)
GRANT UPDATE (title, start_date, club_name, fee_cents, fee_unit, entry_deadline, max_entries,
              pay_online, pay_check_cash, check_payable_to, check_mail_to, offline_hold_hours,
              td_contact_name, td_contact_email, td_contact_phone, refund_policy_text, withdrawal_rule)
  ON public.events TO authenticated;                                     -- TD/admin only (policy); status changes go through future lifecycle functions
GRANT SELECT ON public.tds, public.hub_admins TO authenticated;
GRANT SELECT ON public.entries, public.entry_players, public.withdrawals, public.check_ins, public.audit_log TO authenticated;
GRANT INSERT, UPDATE ON public.check_ins TO authenticated;               -- TD/admin only (policy)
-- payments: everything EXCEPT raw_provider_event
GRANT SELECT (id, entry_id, method, status, amount_cents, refunded_cents, currency, reference, note,
              recorded_by, received_at, created_at) ON public.payments TO authenticated;
-- admins may read the raw webhook via the service role / SQL editor only (deliberately not granted to API roles).

-- ---------------------------------------------------------------------------
-- ROW-LEVEL SECURITY POLICIES
-- ---------------------------------------------------------------------------
-- events: public reads anything past draft; TD/admin also see drafts they run.
CREATE POLICY events_public_read ON public.events FOR SELECT TO anon, authenticated
  USING (status <> 'draft' OR hub_private.can_run(id));
CREATE POLICY events_td_update ON public.events FOR UPDATE TO authenticated
  USING (hub_private.can_run(id)) WITH CHECK (hub_private.can_run(id));
CREATE POLICY events_admin_insert ON public.events FOR INSERT TO authenticated
  WITH CHECK (hub_private.is_admin());     -- note: INSERT grant omitted above on purpose; add GRANT INSERT when the admin screen exists

-- tds / hub_admins: you can see your own rows; admins see all. Writes: service role / SQL only.
CREATE POLICY tds_read ON public.tds FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR hub_private.is_admin());
CREATE POLICY hub_admins_read ON public.hub_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR hub_private.is_admin());

-- entries: player sees own (submitted, or listed as a verified-linked player); TD their events; admin all.
CREATE POLICY entries_read ON public.entries FOR SELECT TO authenticated
  USING (
    submitted_by = auth.uid()
    OR hub_private.can_run(event_id)
    OR hub_private.is_player_on(id)
  );
-- WARNING: this policy lets a listed partner (is_player_on) read the WHOLE entries row: the submitter's
-- contact_email and contact_phone, and notes_internal. That contradicts "contact details are visible to the
-- player, the TD and admins only" if "player" means the other players on the entry. Before this is applied:
-- move contact_* and notes_internal to a table readable only by the submitter, TDs and admins, or limit
-- partners to the public columns. Do not store anything sensitive in notes_internal until then.
-- OPEN QUESTION: move notes_internal to a separate table so RLS (not the UI) hides it from players.

CREATE POLICY entry_players_read ON public.entry_players FOR SELECT TO authenticated
  USING (hub_private.can_see_entry(entry_id));   -- same visibility as the parent entry

CREATE POLICY payments_read ON public.payments FOR SELECT TO authenticated
  USING (hub_private.can_see_entry(entry_id));

CREATE POLICY withdrawals_read ON public.withdrawals FOR SELECT TO authenticated
  USING (hub_private.can_see_entry(entry_id));

-- check_ins and audit: TD/admin only
CREATE POLICY check_ins_read ON public.check_ins FOR SELECT TO authenticated
  USING (hub_private.can_run(event_id));
CREATE POLICY check_ins_insert ON public.check_ins FOR INSERT TO authenticated
  WITH CHECK (hub_private.can_run(event_id) AND checked_by = auth.uid());
CREATE POLICY check_ins_update ON public.check_ins FOR UPDATE TO authenticated
  USING (hub_private.can_run(event_id)) WITH CHECK (hub_private.can_run(event_id) AND checked_by = auth.uid());

CREATE POLICY audit_read ON public.audit_log FOR SELECT TO authenticated
  USING (hub_private.is_admin() OR (event_id IS NOT NULL AND hub_private.is_td(event_id)));

-- ---------------------------------------------------------------------------
-- PUBLIC VIEWS  (safe: names and clubs only; no contact, no payment, no member ids)
-- ---------------------------------------------------------------------------
-- Views run with the owner's rights (security_invoker = false) so anon can read
-- them without any access to the underlying tables. Keep the column list tight.
CREATE VIEW public.public_entry_list WITH (security_invoker = false) AS
SELECT e.event_id,
       e.entry_no,
       e.team_name,
       e.status,                         -- 'confirmed' or 'waitlisted' only
       (SELECT jsonb_agg(jsonb_build_object('name', p.full_name, 'club', p.club_name, 'position', p.position)
                         ORDER BY p.seat)
          FROM public.entry_players p WHERE p.entry_id = e.id) AS players
  FROM public.entries e
  JOIN public.events ev ON ev.id = e.event_id AND ev.status <> 'draft'
 WHERE e.status IN ('confirmed', 'waitlisted');
COMMENT ON VIEW public.public_entry_list IS
  'The public entry list that replaces the Google Sheets widgets: confirmed and waitlisted entries, player names and clubs only. Pending-payment entries are hidden (OPEN QUESTION: show check/cash holds as "pending"?). No email, phone, payment or member id.';

CREATE VIEW public.public_event_counts WITH (security_invoker = false) AS
SELECT ev.id AS event_id,
       ev.max_entries,
       count(*) FILTER (WHERE e.status = 'confirmed')  AS confirmed,
       count(*) FILTER (WHERE e.status = 'waitlisted') AS waitlisted
  FROM public.events ev
  LEFT JOIN public.entries e ON e.event_id = ev.id
 WHERE ev.status <> 'draft'
 GROUP BY ev.id, ev.max_entries;
COMMENT ON VIEW public.public_event_counts IS 'Counts for the event page ("12 of 16 entries"). No personal data.';

REVOKE ALL ON public.public_entry_list, public.public_event_counts FROM PUBLIC;
GRANT SELECT ON public.public_entry_list, public.public_event_counts TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- internal helpers for the functions
-- ---------------------------------------------------------------------------
CREATE FUNCTION hub_private.log(p_action text, p_event text, p_type text, p_id text, p_before jsonb, p_after jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r text;
BEGIN
  r := CASE WHEN auth.uid() IS NULL THEN 'system'
            WHEN hub_private.is_admin() THEN 'admin'
            WHEN p_event IS NOT NULL AND hub_private.is_td(p_event) THEN 'td'
            ELSE 'player' END;
  INSERT INTO public.audit_log (actor, actor_role, action, event_id, entity_type, entity_id, before, after)
  VALUES (auth.uid(), r, p_action, p_event, p_type, p_id, p_before, p_after);
END $$;

-- slots that count against max_entries: confirmed + live holds
CREATE FUNCTION hub_private.slots_taken(p_event text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*)::int FROM public.entries e
   WHERE e.event_id = p_event
     AND (e.status = 'confirmed'
          OR (e.status = 'pending_payment' AND (e.hold_expires_at IS NULL OR e.hold_expires_at > now())))
$$;

-- refund suggestion from events.withdrawal_rule; NULL when no rule is configured (rule text TBD)
CREATE FUNCTION hub_private.suggested_refund(p_entry uuid) RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE rule jsonb; paid integer; pct integer; full_until timestamptz;
BEGIN
  SELECT ev.withdrawal_rule INTO rule FROM public.entries e JOIN public.events ev ON ev.id = e.event_id WHERE e.id = p_entry;
  SELECT coalesce(sum(amount_cents - refunded_cents), 0) INTO paid FROM public.payments
   WHERE entry_id = p_entry AND status IN ('paid', 'partially_refunded');
  IF rule ? 'full_refund_until' THEN
    full_until := (rule ->> 'full_refund_until')::timestamptz;
    IF now() <= full_until THEN RETURN paid; END IF;
    IF rule ? 'refund_percent_after' THEN
      pct := (rule ->> 'refund_percent_after')::int;
      RETURN (paid * pct / 100);
    END IF;
  END IF;
  RETURN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- FUNCTIONS the app calls
-- ---------------------------------------------------------------------------

-- create_entry: a signed-in player submits a team. Server-side rules:
--   event must be entries_open and before the deadline; player count must equal team_size;
--   amount is computed here (never trusted from the browser); capacity is checked under a row lock;
--   all entries start as pending_payment (or waitlisted when full). PayPal or check/cash is only the
--   player's stated choice; the entry is confirmed by mark_paid().
-- p_players: [{"member_id":"<uuid>|null","full_name":"...","club_name":"...","position":"skip"}]
-- Returns: entry id, status, amount due, warnings (e.g. player already in another entry). It does NOT
-- return any TD's email address: this function is callable by every signed-in player. The app server
-- looks up the TDs (and events.td_contact_email) with the service role to send the "check/cash entry
-- waiting" email. (The database sends no email.)
CREATE FUNCTION public.create_entry(
  p_event_id text, p_team_name text, p_contact_name text, p_contact_email text, p_contact_phone text,
  p_players jsonb, p_payment_choice public.payment_method, p_idempotency_key text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid := auth.uid(); ev public.events%ROWTYPE; existing public.entries%ROWTYPE;
  n int; due int; st public.entry_status; new_id uuid; eno int; hold timestamptz;
  pl jsonb; seat int := 0; mid uuid; nm text; cl text; warns jsonb := '[]'::jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'sign in first'; END IF;
  IF p_payment_choice NOT IN ('paypal', 'check', 'cash') THEN RAISE EXCEPTION 'choose PayPal, check or cash'; END IF;
  IF p_contact_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'that email does not look right'; END IF;
  IF coalesce(trim(p_contact_name), '') = '' THEN RAISE EXCEPTION 'contact name is required'; END IF;

  -- Idempotent retry: same key from the same user returns the earlier entry.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO existing FROM public.entries WHERE submitted_by = uid AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('entry_id', existing.id, 'status', existing.status,
                                'amount_due_cents', existing.amount_due_cents, 'repeat', true);
    END IF;
  END IF;

  SELECT * INTO ev FROM public.events WHERE id = p_event_id FOR UPDATE;      -- serializes capacity checks per event
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown event'; END IF;
  IF ev.status <> 'entries_open' THEN RAISE EXCEPTION 'entries are not open for this event'; END IF;
  IF ev.entry_deadline IS NOT NULL AND now() > ev.entry_deadline THEN RAISE EXCEPTION 'the entry deadline has passed'; END IF;
  IF ev.fee_cents IS NULL THEN RAISE EXCEPTION 'this event has no fee set yet; contact the TD'; END IF;
  IF p_payment_choice = 'paypal' AND NOT ev.pay_online THEN RAISE EXCEPTION 'online payment is not offered for this event'; END IF;
  IF p_payment_choice IN ('check', 'cash') AND NOT ev.pay_check_cash THEN RAISE EXCEPTION 'check or cash is not offered for this event'; END IF;

  n := coalesce(jsonb_array_length(p_players), 0);
  IF n <> ev.team_size THEN RAISE EXCEPTION 'this event needs % player(s)', ev.team_size; END IF;
  due := CASE ev.fee_unit WHEN 'per_player' THEN ev.fee_cents * n ELSE ev.fee_cents END;

  st := CASE WHEN ev.max_entries IS NOT NULL AND hub_private.slots_taken(ev.id) >= ev.max_entries
             THEN 'waitlisted' ELSE 'pending_payment' END;
  hold := CASE WHEN st <> 'pending_payment' THEN NULL
               WHEN p_payment_choice = 'paypal' THEN now() + make_interval(mins => ev.online_hold_minutes)
               WHEN ev.offline_hold_hours IS NOT NULL THEN now() + make_interval(hours => ev.offline_hold_hours)
               ELSE ev.entry_deadline END;      -- NULL deadline => no automatic expiry

  SELECT coalesce(max(entry_no), 0) + 1 INTO eno FROM public.entries WHERE event_id = ev.id;
  INSERT INTO public.entries (event_id, entry_no, status, submitted_by, team_name, contact_name, contact_email,
                              contact_phone, amount_due_cents, payment_choice, hold_expires_at, idempotency_key, notes_from_player)
  VALUES (ev.id, eno, st, uid, nullif(trim(p_team_name), ''), trim(p_contact_name), lower(trim(p_contact_email)),
          nullif(trim(p_contact_phone), ''), due, p_payment_choice, hold, p_idempotency_key, p_notes)
  RETURNING id INTO new_id;

  FOR pl IN SELECT * FROM jsonb_array_elements(p_players) LOOP
    seat := seat + 1;
    mid := nullif(pl ->> 'member_id', '')::uuid;
    nm := nullif(trim(pl ->> 'full_name'), '');
    cl := nullif(trim(pl ->> 'club_name'), '');
    IF mid IS NOT NULL THEN
      SELECT m.display_name INTO nm FROM private.members m WHERE m.id = mid AND m.deleted_at IS NULL;
      IF nm IS NULL THEN RAISE EXCEPTION 'player % is not a known member', seat; END IF;
      SELECT c.name INTO cl FROM private.member_clubs mc JOIN private.clubs c ON c.id = mc.club_id
       WHERE mc.member_id = mid AND mc.relationship = 'home' LIMIT 1;
      IF EXISTS (SELECT 1 FROM public.entry_players ep JOIN public.entries e2 ON e2.id = ep.entry_id
                  WHERE ep.member_id = mid AND e2.event_id = ev.id AND e2.id <> new_id
                    AND e2.status IN ('pending_payment', 'confirmed', 'waitlisted')) THEN
        warns := warns || jsonb_build_array(jsonb_build_object('seat', seat, 'warning', 'already_in_another_entry'));
      END IF;
    END IF;
    IF nm IS NULL THEN RAISE EXCEPTION 'player % needs a name', seat; END IF;
    INSERT INTO public.entry_players (entry_id, seat, member_id, full_name, club_name, position)
    VALUES (new_id, seat, mid, nm, cl, nullif(pl ->> 'position', '')::public.player_position);
  END LOOP;

  PERFORM hub_private.log('entry.create', ev.id, 'entries', new_id::text, NULL,
                          jsonb_build_object('status', st, 'amount_due_cents', due, 'payment_choice', p_payment_choice));
  RETURN jsonb_build_object('entry_id', new_id, 'entry_no', eno, 'status', st, 'amount_due_cents', due,
                            'payment_choice', p_payment_choice, 'hold_expires_at', hold, 'warnings', warns,
                            'repeat', false);
END $$;

-- mark_paid: record money received and confirm the entry.
--   * PayPal: only server code on the service role may call it (the verified webhook, or the reconcile job reading PayPal's API), with the capture id; the browser redirect never confirms.
--   * Check / cash / other: the event's TD or an admin.
--   * Safe to call twice with the same paypal capture id.
--   * Late payment (entry already expired/cancelled) is recorded but the entry is NOT revived: returns needs_review = true.
--   * Event filled up while the player was paying: payment recorded, entry becomes waitlisted, returns needs_review = true
--     so Anne or Bill can refund or promote.
CREATE FUNCTION public.mark_paid(
  p_entry_id uuid, p_method public.payment_method, p_amount_cents integer,
  p_reference text DEFAULT NULL, p_note text DEFAULT NULL,
  p_paypal_order_id text DEFAULT NULL, p_paypal_capture_id text DEFAULT NULL, p_raw jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  e public.entries%ROWTYPE; ev public.events%ROWTYPE; svc boolean := (auth.role() = 'service_role');
  pid uuid; review boolean := false; new_status public.entry_status; old_status public.entry_status;
BEGIN
  SELECT * INTO e FROM public.entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown entry'; END IF;
  SELECT * INTO ev FROM public.events WHERE id = e.event_id FOR UPDATE;

  IF p_method = 'paypal' THEN
    IF NOT svc THEN RAISE EXCEPTION 'PayPal payments are recorded by the server (verified webhook or reconcile job) only'; END IF;
    IF p_paypal_capture_id IS NULL OR p_paypal_order_id IS NULL THEN RAISE EXCEPTION 'PayPal order and capture ids are required'; END IF;
    SELECT id INTO pid FROM public.payments WHERE paypal_capture_id = p_paypal_capture_id;
    IF FOUND THEN RETURN jsonb_build_object('payment_id', pid, 'entry_status', e.status, 'repeat', true); END IF;
  ELSIF NOT (svc OR hub_private.can_run(e.event_id)) THEN
    RAISE EXCEPTION 'only the event''s TD or an admin can record a payment';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <> e.amount_due_cents THEN
    -- PayPal has already taken the money, so the webhook must never fail silently: record the payment,
    -- do NOT confirm the entry, and flag it for Anne or Bill.
    IF p_method = 'paypal' AND p_amount_cents IS NOT NULL THEN
      INSERT INTO public.payments (entry_id, method, status, amount_cents, paypal_order_id, paypal_capture_id,
                                   reference, note, recorded_by, received_at, raw_provider_event)
      VALUES (e.id, p_method, 'paid', p_amount_cents, p_paypal_order_id, p_paypal_capture_id,
              p_reference, coalesce(p_note, 'amount does not match amount due'), auth.uid(), now(), p_raw)
      RETURNING id INTO pid;
      PERFORM hub_private.log('payment.amount_mismatch', e.event_id, 'payments', pid::text, NULL,
                              jsonb_build_object('entry_status', e.status, 'amount_cents', p_amount_cents,
                                                 'amount_due_cents', e.amount_due_cents));
      RETURN jsonb_build_object('payment_id', pid, 'entry_status', e.status, 'needs_review', true,
                                'reason', 'amount_mismatch', 'repeat', false);
    END IF;
    -- Check / cash: the TD must enter the exact amount due (v1).
    -- OPEN QUESTION: partial payments, overpayments, and fee changes after entry.
    RAISE EXCEPTION 'amount % does not match the amount due %', p_amount_cents, e.amount_due_cents;
  END IF;

  INSERT INTO public.payments (entry_id, method, status, amount_cents, paypal_order_id, paypal_capture_id,
                               reference, note, recorded_by, received_at, raw_provider_event)
  VALUES (e.id, p_method, 'paid', p_amount_cents, p_paypal_order_id, p_paypal_capture_id,
          p_reference, p_note, auth.uid(), now(), p_raw)
  RETURNING id INTO pid;

  old_status := e.status;
  IF e.status = 'pending_payment' THEN
    IF ev.max_entries IS NOT NULL
       AND (SELECT count(*) FROM public.entries x WHERE x.event_id = e.event_id AND x.status = 'confirmed') >= ev.max_entries THEN
      new_status := 'waitlisted'; review := true;
    ELSE
      new_status := 'confirmed';
    END IF;
  ELSIF e.status = 'waitlisted' THEN
    new_status := 'waitlisted'; review := true;      -- paid while waitlisted: staff decide
  ELSIF e.status = 'confirmed' THEN
    new_status := 'confirmed'; review := true;       -- second payment for the same entry: probably a duplicate
  ELSE
    new_status := e.status; review := true;          -- expired / withdrawn / cancelled
  END IF;

  UPDATE public.entries
     SET status = new_status, hold_expires_at = NULL,
         confirmed_at = CASE WHEN new_status = 'confirmed' AND confirmed_at IS NULL THEN now() ELSE confirmed_at END
   WHERE id = e.id;

  PERFORM hub_private.log('payment.mark_paid', e.event_id, 'payments', pid::text,
                          jsonb_build_object('entry_status', old_status),
                          jsonb_build_object('entry_status', new_status, 'method', p_method,
                                             'amount_cents', p_amount_cents, 'needs_review', review));
  RETURN jsonb_build_object('payment_id', pid, 'entry_status', new_status, 'needs_review', review, 'repeat', false);
END $$;

-- request_withdrawal: not in the original list, but "player requests in the app" needs a door.
-- Allowed for the submitter or a verified-linked player on the entry. Never changes the entry by itself.
CREATE FUNCTION public.request_withdrawal(p_entry_id uuid, p_reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE e public.entries%ROWTYPE; wid uuid; sug integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in first'; END IF;
  SELECT * INTO e FROM public.entries WHERE id = p_entry_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown entry'; END IF;
  IF NOT (e.submitted_by = auth.uid()
          OR EXISTS (SELECT 1 FROM public.entry_players p WHERE p.entry_id = e.id AND p.member_id IN (SELECT hub_private.my_member_ids()))) THEN
    RAISE EXCEPTION 'not your entry';
  END IF;
  IF e.status NOT IN ('pending_payment', 'confirmed', 'waitlisted') THEN RAISE EXCEPTION 'this entry cannot be withdrawn'; END IF;
  IF EXISTS (SELECT 1 FROM public.withdrawals w WHERE w.entry_id = e.id AND w.status = 'requested') THEN
    RAISE EXCEPTION 'a withdrawal request is already waiting';
  END IF;
  sug := hub_private.suggested_refund(e.id);
  INSERT INTO public.withdrawals (entry_id, requested_by, reason, suggested_refund_cents)
  VALUES (e.id, auth.uid(), p_reason, sug) RETURNING id INTO wid;
  PERFORM hub_private.log('withdrawal.request', e.event_id, 'withdrawals', wid::text, NULL,
                          jsonb_build_object('suggested_refund_cents', sug));
  RETURN jsonb_build_object('withdrawal_id', wid, 'status', 'requested');
END $$;

-- approve_withdrawal: Anne or Bill (admin, or TD with can_refund) approve and choose the refund amount.
--   The entry becomes withdrawn and its slot is released. Waitlist promotion is NOT automatic (OPEN QUESTION).
--   If a refund is due, refund_status = 'due' until record_refund_issued() is called after the money is sent.
--   The money is sent in PayPal (or by check) by a person; this database never talks to PayPal.
CREATE FUNCTION public.approve_withdrawal(p_withdrawal_id uuid, p_refund_cents integer, p_note text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE w public.withdrawals%ROWTYPE; e public.entries%ROWTYPE; paid integer;
BEGIN
  SELECT * INTO w FROM public.withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown withdrawal'; END IF;
  SELECT * INTO e FROM public.entries WHERE id = w.entry_id FOR UPDATE;
  IF NOT hub_private.can_refund(e.event_id) THEN RAISE EXCEPTION 'only an admin or a TD allowed to refund (Anne or Bill) can approve a withdrawal'; END IF;
  IF w.status <> 'requested' THEN RAISE EXCEPTION 'this request was already decided'; END IF;
  IF p_refund_cents IS NULL OR p_refund_cents < 0 THEN RAISE EXCEPTION 'give a refund amount (0 for none)'; END IF;

  SELECT coalesce(sum(amount_cents - refunded_cents), 0) INTO paid FROM public.payments
   WHERE entry_id = e.id AND status IN ('paid', 'partially_refunded');
  IF p_refund_cents > paid THEN RAISE EXCEPTION 'refund % is more than the % received', p_refund_cents, paid; END IF;

  UPDATE public.withdrawals
     SET status = 'approved', refund_cents = p_refund_cents,
         refund_status = CASE WHEN p_refund_cents > 0 THEN 'due' ELSE 'none_due' END,
         decided_by = auth.uid(), decided_at = now(), decision_note = p_note
   WHERE id = w.id;
  UPDATE public.entries SET status = 'withdrawn', hold_expires_at = NULL WHERE id = e.id;

  PERFORM hub_private.log('withdrawal.approve', e.event_id, 'withdrawals', w.id::text,
                          jsonb_build_object('entry_status', e.status),
                          jsonb_build_object('refund_cents', p_refund_cents, 'note', p_note));
  RETURN jsonb_build_object('withdrawal_id', w.id, 'entry_status', 'withdrawn', 'refund_cents', p_refund_cents,
                            'refund_status', CASE WHEN p_refund_cents > 0 THEN 'due' ELSE 'none_due' END,
                            'refund_to', e.contact_email);
END $$;

CREATE FUNCTION public.reject_withdrawal(p_withdrawal_id uuid, p_note text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE w public.withdrawals%ROWTYPE; ev text;
BEGIN
  SELECT * INTO w FROM public.withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown withdrawal'; END IF;
  SELECT event_id INTO ev FROM public.entries WHERE id = w.entry_id;
  IF NOT hub_private.can_refund(ev) THEN RAISE EXCEPTION 'only an admin or a TD allowed to refund (Anne or Bill) can decide a withdrawal'; END IF;
  IF w.status <> 'requested' THEN RAISE EXCEPTION 'this request was already decided'; END IF;
  UPDATE public.withdrawals SET status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = p_note WHERE id = w.id;
  PERFORM hub_private.log('withdrawal.reject', ev, 'withdrawals', w.id::text, NULL, jsonb_build_object('note', p_note));
  RETURN jsonb_build_object('withdrawal_id', w.id, 'status', 'rejected');
END $$;

-- record_refund_issued: after Anne or Bill sent the refund (PayPal dashboard or check), record it.
CREATE FUNCTION public.record_refund_issued(p_withdrawal_id uuid, p_reference text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE w public.withdrawals%ROWTYPE; ev text; left_cents integer; pay record;
BEGIN
  SELECT * INTO w FROM public.withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown withdrawal'; END IF;
  SELECT event_id INTO ev FROM public.entries WHERE id = w.entry_id;
  IF NOT hub_private.can_refund(ev) THEN RAISE EXCEPTION 'only an admin or a TD allowed to refund (Anne or Bill) can record a refund'; END IF;
  IF w.status <> 'approved' OR w.refund_status <> 'due' THEN RAISE EXCEPTION 'no refund is due on this withdrawal'; END IF;

  left_cents := w.refund_cents;                       -- spread over the entry's payments, oldest first
  FOR pay IN SELECT * FROM public.payments
              WHERE entry_id = w.entry_id AND status IN ('paid', 'partially_refunded') ORDER BY created_at LOOP
    EXIT WHEN left_cents <= 0;
    DECLARE take int := least(left_cents, pay.amount_cents - pay.refunded_cents);
    BEGIN
      UPDATE public.payments
         SET refunded_cents = refunded_cents + take,
             status = CASE WHEN refunded_cents + take = amount_cents THEN 'refunded' ELSE 'partially_refunded' END
       WHERE id = pay.id;
      left_cents := left_cents - take;
    END;
  END LOOP;
  UPDATE public.withdrawals SET refund_status = 'issued', refund_reference = p_reference, refund_issued_at = now() WHERE id = w.id;
  PERFORM hub_private.log('refund.issued', ev, 'withdrawals', w.id::text, NULL,
                          jsonb_build_object('refund_cents', w.refund_cents, 'reference', p_reference));
  RETURN jsonb_build_object('withdrawal_id', w.id, 'refund_status', 'issued');
END $$;

-- Hold sweep (called by a scheduled job, service role only): release expired ONLINE (PayPal) holds only.
-- Check/cash entries are never released silently, because a mailed check can be in transit: after
-- hold_expires_at the app emails the TD, and the TD decides (a release function is still to be written;
-- see OPEN QUESTIONS 19).
CREATE FUNCTION public.expire_holds() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE k int;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'scheduler only'; END IF;
  WITH x AS (
    UPDATE public.entries SET status = 'expired'
     WHERE status = 'pending_payment' AND payment_choice = 'paypal'
       AND hold_expires_at IS NOT NULL AND hold_expires_at < now()
     RETURNING id, event_id)
  SELECT count(*) INTO k FROM x;
  RETURN k;
END $$;

-- Who may call what. Nobody calls the helpers.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hub_private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION hub_private.is_admin(), hub_private.is_td(text), hub_private.can_run(text),
                          hub_private.my_member_ids(), hub_private.is_player_on(uuid), hub_private.can_see_entry(uuid) TO anon, authenticated, service_role;   -- policies need these
GRANT EXECUTE ON FUNCTION hub_private.can_refund(text) TO authenticated, service_role;   -- called inside the refund functions

REVOKE ALL ON FUNCTION
  public.create_entry(text, text, text, text, text, jsonb, public.payment_method, text, text),
  public.mark_paid(uuid, public.payment_method, integer, text, text, text, text, jsonb),
  public.request_withdrawal(uuid, text),
  public.approve_withdrawal(uuid, integer, text),
  public.reject_withdrawal(uuid, text),
  public.record_refund_issued(uuid, text),
  public.expire_holds()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.create_entry(text, text, text, text, text, jsonb, public.payment_method, text, text),
  public.mark_paid(uuid, public.payment_method, integer, text, text, text, text, jsonb),
  public.request_withdrawal(uuid, text),
  public.approve_withdrawal(uuid, integer, text),
  public.reject_withdrawal(uuid, text),
  public.record_refund_issued(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expire_holds() TO service_role;

COMMIT;

-- ============================================================================
-- OPEN QUESTIONS (nothing below is decided; each needs a human answer)
-- ============================================================================
--  1. Withdrawal / refund rule text: TBD. Per event? Deadline-based? Percent? (events.withdrawal_rule is
--     empty until decided; Anne or Bill choose the amount by hand meanwhile.) Existing JSON says things like
--     "no refunds after" a date; each event's wording must be turned into a rule by hand.
--  2. Are Anne and Bill both admins (see everything) or is one a TD on every event? Who else is a TD,
--     and do assistants get fewer powers (e.g. no refunds)? Everyone listed needs a sign-in (magic link).
--  3. Check/cash: how long does an unpaid entry keep its slot (offline_hold_hours; default here = until
--     the entry deadline)? Payee and mailing address for checks (check_payable_to / check_mail_to)?
--     Are pay-at-the-green cash payments allowed, and may "other" (comped) exist?
--  4. Does a pending check/cash entry count toward max_entries? Draft says yes (slot held). Should
--     pending entries appear on the public list as "pending"? Draft says no.
--  5. Waitlist: promotion is manual in this draft. Should the first waitlisted entry be offered the slot
--     automatically when someone withdraws? Does a waitlisted player pay up front?
--  6. Partial payment, overpayment, fee changes after entry, per-player vs per-team fees (e.g. "$450 per
--     team ($150 per player)"): mark_paid() currently requires the exact amount due.
--  7. Non-members: rules say all players must be Bowls USA members. Is entry_players.member_id required,
--     or are free-text guests allowed (draft allows them)? Should dues-paid status be checked at entry?
--  8. Novice flag: compute from private.novice_until() or leave to the TD? (Needed for mix/match events.)
--  9. Duplicate players across entries in one event: draft only warns. Block instead?
-- 10. Player consent: entry lists publish player names and clubs. Is that acceptable for every member,
--     including those who opted out of the directory? Do guests get listed?
-- 11. Refunds: done by hand in the PayPal dashboard (draft). Later: call PayPal's refund API from the
--     server after approval? Apple Pay / Google Pay refunds follow PayPal's rules; confirm.
-- 12. Apple's in-app purchase rule for entry fees is unconfirmed (see the strategy notes); the schema is
--     neutral: it stores a payment either way.
-- 13. Check-in per entry (draft) or per player? No-show consequences (fee kept?)
-- 14. notes_internal on entries is only hidden from players by the app, not by RLS. Move to a TD-only table?
-- 15. Not in this file: draws/rounds/games/scores, results, news items, notifications/email outbox,
--     event lifecycle transition functions (publish, open_entries, close_entries, cancel), event cancellation
--     refunds for all entries, and the Google Sheets import. Each needs its own migration.
-- 16. Schema placement: tables are in "public" so the API can serve them under RLS, unlike the member
--     data in "private". Confirm this is the intended exposure model before applying.
-- 17. Link to clubs: events.club_name is free text; link to private.clubs?
-- 19. Functions the docs in docs/hub/ need that this file does not have yet: player cancels an unpaid
--     entry (01 T9), TD releases a check/cash hold (01 T8), TD removes a paid entry (01 T14), event
--     cancellation and its refund list, waitlist promotion/offer, switch payment choice, void a wrongly
--     recorded payment (bounced check, "mark not received"), TD override at cap or after the deadline
--     (late_override), refund-webhook recording. Until they exist, those actions are not available.
-- 20. Partner visibility: see the WARNING above the entries_read policy.
-- 18. Draft assumes private.members(id, display_name, deleted_at), private.member_clubs(member_id, club_id,
--     relationship), private.clubs(id, name) and private.account_member_links as in migrations 0001/0004.
--     Verify against the real database before applying.
-- ============================================================================

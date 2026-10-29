-- ============================================================================
-- 0013 (Supabase) -- phone alert tokens ("Tournament alerts" in More > App settings, store app only).
-- STATUS: written 2026-10-28, NOT YET APPLIED. Run by hand in the SQL Editor (Giulia). Nothing sends alerts yet.
--
-- What it adds:
--   private.devices: one row per phone that turned alerts on (the push token, the account, the platform).
--   register_device(token, platform) / unregister_device(token): a signed-in member can only add or remove
--   their OWN phone. The table is in the private schema, so the public API cannot read it.
--   delete_my_account() is replaced so deleting an account also deletes its phone tokens.
-- Run the whole file in one go. Afterwards the advisors should show no new warnings.
-- ============================================================================
CREATE TABLE IF NOT EXISTS private.devices (
  token        text PRIMARY KEY,
  auth_subject text NOT NULL,
  platform     text NOT NULL CHECK (platform IN ('android', 'ios')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.devices ADD COLUMN IF NOT EXISTS event_ids text[] NOT NULL DEFAULT '{}';   -- the events this phone wants alerts about
CREATE INDEX IF NOT EXISTS devices_auth_subject_idx ON private.devices (auth_subject);
ALTER TABLE private.devices ENABLE ROW LEVEL SECURITY;   -- no policies: only the functions below (run as the owner) touch it

CREATE OR REPLACE FUNCTION public.register_device(p_token text, p_platform text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF p_platform NOT IN ('android', 'ios') THEN RAISE EXCEPTION 'bad platform'; END IF;
  IF length(coalesce(p_token, '')) < 20 OR length(p_token) > 4096 THEN RAISE EXCEPTION 'bad token'; END IF;
  INSERT INTO private.devices (token, auth_subject, platform) VALUES (p_token, uid::text, p_platform)
  ON CONFLICT (token) DO UPDATE SET auth_subject = EXCLUDED.auth_subject, platform = EXCLUDED.platform, last_seen = now();
  -- keep at most 5 phones per account (the newest)
  DELETE FROM private.devices WHERE auth_subject = uid::text AND token NOT IN
    (SELECT token FROM private.devices WHERE auth_subject = uid::text ORDER BY last_seen DESC LIMIT 5);
END $$;

CREATE OR REPLACE FUNCTION public.unregister_device(p_token text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  DELETE FROM private.devices WHERE auth_subject = uid::text AND token = p_token;
END $$;

-- A phone gets alerts only for the events the member SAVED in the app (and entered, once in-app entries exist).
CREATE OR REPLACE FUNCTION public.set_device_events(p_token text, p_events text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF coalesce(array_length(p_events, 1), 0) > 200 THEN RAISE EXCEPTION 'too many events'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_events, '{}')) e WHERE e !~ '^[a-z0-9-]{3,80}$') THEN RAISE EXCEPTION 'bad event id'; END IF;
  UPDATE private.devices SET event_ids = coalesce(p_events, '{}'), last_seen = now()
   WHERE token = p_token AND auth_subject = uid::text;
END $$;

REVOKE ALL ON FUNCTION public.set_device_events(text, text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_device_events(text, text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.register_device(text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.unregister_device(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.register_device(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_device(text) TO authenticated;

-- Same function as 0005, plus one line: the account's phone tokens go too.
CREATE OR REPLACE FUNCTION public.delete_my_account() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  DELETE FROM private.devices                 WHERE auth_subject = uid::text;
  DELETE FROM private.contact_change_requests WHERE requested_by = uid::text;
  DELETE FROM private.account_member_links    WHERE auth_subject = uid::text;
  DELETE FROM auth.users WHERE id = uid;
END $$;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

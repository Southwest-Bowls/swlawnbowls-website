-- ============================================================================
-- 0014 (Supabase) -- which events each phone wants alerts about, and the two lookups the alert sender uses.
-- STATUS: written 2026-10-28, NOT YET APPLIED. Run by hand in the SQL Editor AFTER 0013_devices.sql.
--
-- A phone gets alerts only for events the member SAVED in the app (until in-app entries exist, then also entered events).
-- set_device_events(): a signed-in member sets the events for THEIR OWN phone.
-- devices_for_events() / forget_devices(): used only by the server-side sender (service role); no app user can call them.
-- ============================================================================
ALTER TABLE private.devices ADD COLUMN IF NOT EXISTS event_ids text[] NOT NULL DEFAULT '{}';

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

CREATE OR REPLACE FUNCTION public.devices_for_events(p_events text[]) RETURNS TABLE (token text, event_id text)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT d.token, e.event_id
    FROM private.devices d, LATERAL unnest(d.event_ids) AS e(event_id)
   WHERE e.event_id = ANY (p_events);
$$;

CREATE OR REPLACE FUNCTION public.forget_devices(p_tokens text[]) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM private.devices WHERE token = ANY (p_tokens);
$$;

REVOKE ALL ON FUNCTION public.set_device_events(text, text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_device_events(text, text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.devices_for_events(text[]) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.forget_devices(text[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.devices_for_events(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.forget_devices(text[]) TO service_role;

-- ============================================================================
-- 0015 (Supabase) -- the two lookups the alert sender uses, with alerts for followed players.
-- STATUS: written 2026-11-13, NOT YET APPLIED. Run by hand in the SQL Editor (Giulia), after 0013_devices.sql.
-- This REPLACES 0014 (0014 was never applied): run this file, not 0014.
--
-- A phone that turned alerts on lists, in private.devices.event_ids, 'all' (every tournament) and the players it
-- follows as "player--first-last", for example player--gary-belk. set_device_events (0013) already accepts those ids.
-- A phone subscribed to 'all' wants every tournament but NOT every player, so 'all' must not match a "player--" id.
-- Names are kept only for phones that turned alerts on, and go when alerts are turned off or the account is deleted.
-- devices_for_events() / forget_devices() are used only by the server-side sender (service role); no app user can call them.
-- ============================================================================
DROP FUNCTION IF EXISTS public.devices_for_events(text[]);
CREATE FUNCTION public.devices_for_events(p_events text[]) RETURNS TABLE (token text, event_id text, platform text)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT d.token, e.event_id, d.platform
    FROM private.devices d CROSS JOIN LATERAL unnest(p_events) AS e(event_id)
   WHERE e.event_id = ANY (d.event_ids)
      OR (e.event_id NOT LIKE 'player--%' AND 'all' = ANY (d.event_ids));
$$;

CREATE OR REPLACE FUNCTION public.forget_devices(p_tokens text[]) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM private.devices WHERE token = ANY (p_tokens);
$$;

REVOKE ALL ON FUNCTION public.devices_for_events(text[]) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.forget_devices(text[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.devices_for_events(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.forget_devices(text[]) TO service_role;

-- ============================================================================
-- 0014 (Supabase) -- the two lookups the alert sender uses.
-- STATUS: written 2026-10-28, NOT YET APPLIED. Run by hand in the SQL Editor AFTER 0013_devices.sql.
--
-- The per-phone event list (event_ids, set_device_events) is in 0013. A phone gets alerts only for events the member SAVED in the app.
-- devices_for_events() / forget_devices(): used only by the server-side sender (service role); no app user can call them.
-- ============================================================================
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

REVOKE ALL ON FUNCTION public.devices_for_events(text[]) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.forget_devices(text[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.devices_for_events(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.forget_devices(text[]) TO service_role;

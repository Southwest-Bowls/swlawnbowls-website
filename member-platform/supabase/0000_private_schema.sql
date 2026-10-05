-- 0000 (Supabase) — run first, then migrations/0001_member_core.sql with
-- search_path = private. The member database lives in the "private" schema,
-- which Supabase's public API does not expose; members only reach it
-- through the functions added later.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
SET search_path = private, extensions;

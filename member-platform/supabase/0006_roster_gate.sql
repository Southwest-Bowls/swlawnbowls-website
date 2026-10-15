-- 0006 (Supabase) — roster gate: only emails on the roster (or the test allowlist) can create an account.
--
-- WHY: sign-ups are closed, so a member who is not yet a Supabase user gets no code. Opening sign-ups
-- for everyone would let anyone create an account. This rule lets sign-ups be ON while still refusing
-- every email that is not a current member. Nothing is created or sent until a person asks for a code.
--
-- DO THESE IN THIS ORDER (Supabase dashboard, project azbluidsfrjtoeeesqwa):
--   1. SQL Editor: run the CHECK below first. It must return roughly 1,700+ (members with an email).
--      If it returns 0, STOP: the members table was never built (see 0002) and everyone would be refused.
--   2. SQL Editor: run this whole file.
--   3. Authentication > Hooks > "Before user created" > choose Postgres function public.hook_roster_gate > Save.
--   4. ONLY THEN: Authentication > Sign In / Providers > turn ON "Allow new users to sign up".
--      (Turning sign-ups on before step 3 would let anyone create an account.)
--   5. Test: an address that is NOT on the roster must get no code; one that is on it must get a code.
--
-- TO UNDO: turn "Allow new users to sign up" back OFF (instant). The function can stay.
--
-- CHECK (run alone first):
--   select count(distinct lower(c.value_normalized)) as roster_emails
--   from private.member_contacts c join private.members m on m.id = c.member_id
--   where c.kind = 'email' and m.deleted_at is null;

create or replace function public.hook_roster_gate(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  em text := lower(trim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if em <> '' and (
       exists (select 1
                 from private.member_contacts c
                 join private.members m on m.id = c.member_id
                where c.kind = 'email'
                  and lower(c.value_normalized) = em
                  and m.deleted_at is null)
    or exists (select 1 from private.signin_allowlist a where a.email = em)
  ) then
    return '{}'::jsonb;                       -- on the roster: allow the account to be created
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'message', 'Sign-in is for Southwest Division members.',
    'http_code', 403));
end;
$$;

-- Only Supabase Auth may run it (never the public API).
revoke execute on function public.hook_roster_gate(jsonb) from public, anon, authenticated;
grant  execute on function public.hook_roster_gate(jsonb) to supabase_auth_admin;

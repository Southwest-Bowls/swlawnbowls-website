-- ============================================================================
-- 0007 (Supabase) -- event_links: sheet links per tournament, editable without a deploy.
-- STATUS: APPLIED 2026-10-16 (admins: giulia@giuliagallo.com and giulia.arche@gmail.com only).
-- Anyone can READ event_links (they are public sheet links). Only people listed in link_admins can WRITE.
-- The app (assets/app/app.js) reads this table at startup and uses it over events-data.json.
-- ============================================================================
create table if not exists public.link_admins (email text primary key check (email = lower(email)));
alter table public.link_admins enable row level security;   -- no policy on purpose: only the function below reads it

create or replace function public.is_link_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.link_admins a where a.email = lower(coalesce(auth.jwt() ->> 'email', '')))
$$;
revoke all on function public.is_link_admin() from public, anon;
grant execute on function public.is_link_admin() to authenticated;

create table if not exists public.event_links (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,                                            -- events-data.json id, e.g. womens-ca-bears-2026
  kind text not null check (kind in ('entries','draw')),             -- 'draw' = the Draw tab (live scoring sheets)
  label text,
  url text not null check (url ~ '^https://docs\.google\.com/'),
  height integer not null default 1800 check (height between 200 and 4000),
  sort integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text
);
create unique index if not exists event_links_unique on public.event_links (event_id, kind, url);
alter table public.event_links enable row level security;
drop policy if exists "anyone reads event links" on public.event_links;
create policy "anyone reads event links" on public.event_links for select to anon, authenticated using (true);
drop policy if exists "admins manage event links" on public.event_links;
create policy "admins manage event links" on public.event_links for all to authenticated using (public.is_link_admin()) with check (public.is_link_admin());

-- Who may edit links (change here, not in the app):
insert into public.link_admins (email) values ('giulia@giuliagallo.com'), ('giulia.arche@gmail.com')
on conflict do nothing;   -- start with Giulia only; add Anne later: insert into public.link_admins values ('her-signin-email');

select (select count(*) from public.link_admins) as admins, (select count(*) from public.event_links) as links;

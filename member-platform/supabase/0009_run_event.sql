-- ============================================================================
-- 0009 (Supabase) -- "Run this event": team names, scores and standings, in the database instead of Google Sheets.
-- STATUS: APPLIED 2026-10-16 (teams 12, games 24). For the Women's Vet/Novice Pairs test. Admin-only (link_admins), read AND write.
-- Draw copied from the 2026 Vet Novice Pairs Scoresheet: 12 teams, 4 games. A green plays 4 games, B green 3 (edit games in the app).
-- Standings are computed in the app: win 3, tie 1, loss 0; plus points = points for minus points against.
-- ============================================================================
create table if not exists public.run_teams (event_id text not null, team_no integer not null check (team_no > 0), name text not null default '', green text check (green in ('A','B')), updated_at timestamptz not null default now(), primary key (event_id, team_no));
create table if not exists public.run_games (event_id text not null, round integer not null check (round > 0), rink integer not null, team_a integer not null, team_b integer not null, score_a integer check (score_a between 0 and 99), score_b integer check (score_b between 0 and 99), updated_at timestamptz not null default now(), updated_by text, primary key (event_id, round, rink));
alter table public.run_teams enable row level security;
alter table public.run_games enable row level security;
drop policy if exists "admins run teams" on public.run_teams;
create policy "admins run teams" on public.run_teams for all to authenticated using (public.is_link_admin()) with check (public.is_link_admin());
drop policy if exists "admins run games" on public.run_games;
create policy "admins run games" on public.run_games for all to authenticated using (public.is_link_admin()) with check (public.is_link_admin());
insert into public.run_teams (event_id, team_no) select 'womens-vet-novice-pairs-2026', g from generate_series(1,12) g on conflict do nothing;
insert into public.run_games (event_id, round, rink, team_a, team_b) values ('womens-vet-novice-pairs-2026',1,2,1,4),('womens-vet-novice-pairs-2026',1,3,11,12),('womens-vet-novice-pairs-2026',1,4,5,10),('womens-vet-novice-pairs-2026',1,5,6,9),('womens-vet-novice-pairs-2026',1,6,7,8),('womens-vet-novice-pairs-2026',1,7,2,3),('womens-vet-novice-pairs-2026',2,1,5,7),('womens-vet-novice-pairs-2026',2,2,9,11),('womens-vet-novice-pairs-2026',2,5,3,4),('womens-vet-novice-pairs-2026',2,6,2,10),('womens-vet-novice-pairs-2026',2,7,1,12),('womens-vet-novice-pairs-2026',2,8,6,8),('womens-vet-novice-pairs-2026',3,1,4,12),('womens-vet-novice-pairs-2026',3,2,8,10),('womens-vet-novice-pairs-2026',3,3,6,7),('womens-vet-novice-pairs-2026',3,4,2,11),('womens-vet-novice-pairs-2026',3,7,5,9),('womens-vet-novice-pairs-2026',3,8,1,3),('womens-vet-novice-pairs-2026',4,1,10,11),('womens-vet-novice-pairs-2026',4,4,3,12),('womens-vet-novice-pairs-2026',4,5,5,8),('womens-vet-novice-pairs-2026',4,6,1,6),('womens-vet-novice-pairs-2026',4,7,4,7),('womens-vet-novice-pairs-2026',4,8,2,9) on conflict do nothing;
select (select count(*) from public.run_teams) as teams, (select count(*) from public.run_games) as games;

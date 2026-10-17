-- 0011 (APPLIED 2026-10-16): certify results and forfeits for the "Run this event" tool.
alter table public.run_games add column if not exists certified_at timestamptz, add column if not exists certified_by text;
alter table public.run_games add column if not exists forfeit boolean not null default false;

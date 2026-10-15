# Player profiles: claimed-only (decided by Giulia, 2026-10-15)

A player profile exists only after the player claims it. Nobody gets a public page just because their name appears in published results.

## What a profile shows
Name, home division or country, home club, optional photo and short bio, then results pulled from published tournaments: podium finishes, events played, years. The membership card stays separate and private.

## Who can see it
- Default: visible to the player and to Division admins only.
- Opt-in "Show my profile in the app": other app users can open it from results and club pages.
- Players can hide it again at any time. Hiding removes the page, not the published results (those remain the Division's public record).

## How a profile is claimed
1. Player signs in (email code).
2. Searches "Find me in the results". Matches come from exact and close name matches in `results-data.json`.
3. Player picks the entries that are theirs. For a name shared by two people, or a spelling variant (Susie/Suzie), an admin confirms before the link goes live.
4. Admin queue (the existing review screen) lists pending claims. Nothing is merged automatically.

## Data
- Supabase table `player_profiles` (user id, display name, division, club, visibility, photo path) plus `profile_results` (profile id, tournament id, place) written only on an approved claim. Row-level security: owner read/write, admins read/approve, everyone else read only when visibility is public.
- Results stay in the JSON files; the app joins them at read time using `profile_results`.
- Photos in Supabase Storage, never in the app bundle. Delete account removes the profile, photo and links.

## Rules that follow from this
- Names in results are a permanent public record and are never edited because of a profile (see CLAUDE.md).
- No profile for minors.
- Deleting an account must work in the app and via a web page (both stores require it).

## Build order
1. Sign-in live (email code) and account deletion.
2. `player_profiles` + RLS; claim flow without public visibility.
3. Admin approval queue.
4. Opt-in public profile page and links from results and clubs.

# Audit status: website, Vercel and database (2026-10-28)

From the Oct 27-28 audit (code review of this repo plus a read-only look at the live Supabase project `azbluidsfrjtoeeesqwa`). Status as of 2026-10-28. Items marked "this PR" are in the pull requests that accompany this file; nothing is merged until Giulia says so.

| # | Severity | Finding | Status | Next step |
|---|---|---|---|---|
| 8.1 | High | The results-publisher login could write any file to `main` (no path checks, no login limit). | **Fixed.** The publisher was removed in PR #3. | Confirm the old publisher password and `SESSION_SECRET` are gone from Vercel. |
| 8.2 / 9.1 | High | `delete_my_account()` not applied. | **Fixed in the database 2026-10-28** (run by hand; `0005` header updated in PR #6). | End-to-end test with a spare roster address. Not done. |
| 8.3 | Medium | Old PayPal webhook still deployed, writing to a table that does not exist. | **Fixed.** Removed in PR #3. | In PayPal (Giulia): delete the old webhook in sandbox and live. |
| 8.4 | Medium | Sign-up could be open to anyone. | **Mostly closed.** The roster-gate hook is applied and ran on 27 Oct. | In Supabase Authentication: confirm sign-ups and the hook settings. Dashboard only. |
| 8.5 | Medium | No Content-Security-Policy or other basic security headers; sign-in tokens sit in browser storage. | **Partly addressed (hardening PR):** adds `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and a CSP in **report-only** mode. | Watch the browser console for CSP reports for a few weeks, then enforce. Do not add `frame-ancestors` without checking every site that embeds our pages (Squarespace pages iframe them). |
| 8.6 | Low | Google API key in the page. | **Open.** | In Google Cloud: restrict the key to the YouTube Data API and our site addresses. |
| 8.7 | Low | Doc says set `GITHUB_REPO_OWNER` and reissue the token. | **Moot.** The publisher that used them was removed. | Delete the leftover Vercel variable and any old GitHub token. |
| 8.8 | Low | `node_modules/` (4,836 files) committed to Git. | **Fixed (hardening PR).** | None. Vercel installs from `package-lock.json`. |
| 9.2 | Medium | Service-role key sat in Vercel. | **Fixed.** Env vars deleted 2026-10-27 (per Giulia/Duet). | Revoke the old key in Supabase > API Keys when convenient. Create a fresh one only when the entries backend goes live. |
| 9.3 | Medium | New tables in `public` are open to `anon` until row security is switched on. | **Open (process).** | Every new schema must enable RLS in the same migration, then run the Supabase advisors. Optional: revoke `anon` on `link_admins` and `run_*`. |
| 9.4 | Low | Migration records out of date (0006-0011 applied but unrecorded). | **Open.** | Record 0005-0011 in `private.schema_migrations`, or move to Supabase CLI migrations. |
| 9.5 | Low | One early test account not linked to a member. | **Open.** | Check Authentication > Users and delete it if it is yours. |
| 9.6 | Info | Advisor "RLS disabled" on `private` tables is a false alarm (no API role can reach that schema). | None. | Optional: enable RLS on them to silence the advisor. |

Not checkable from outside the dashboard: secure email change, password sign-in off, sign-in rate limits.

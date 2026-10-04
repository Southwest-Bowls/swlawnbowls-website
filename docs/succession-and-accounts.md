# Succession: what the division owns, and what it doesn't

The website's biggest continuity risk is not knowledge. It is that almost
everything below sits inside personal accounts. If the webmaster steps back —
or simply loses access — a document cannot recover any of it.

This file is the inventory and the order of work. Update it as each item moves.

## Progress

Started 2026-09-10.

- [x] Division Google organisation — `southwestbowls`
- [x] GitHub organisation **`Southwest-Bowls`** created 2026-09-11, with
      `gallogiulia` added as a member. (The earlier `southwestbowls` User
      account is not the org and is not used for the repo.)
- [x] Vercel team `SWBOWLS` created — `vercel.com/swbowls`,
      team ID `team_H15YXYFPZgHdqLRdPBThL4P1`, login `webmaster-4192`.
      **Still on Hobby**, which is single-member by design: there is no way to
      invite anyone until it is upgraded to Pro, so it does not yet solve the
      shared-login problem. Hobby also carries the 12-function limit that has
      already failed a deploy on this project once.
- [ ] Upgrade SWBOWLS to Pro, then invite `gallogiulia` as an Owner
- [ ] Turn off Data Preferences → "Improve models with my data" on the team
- [ ] Repo transferred to the GitHub organisation
- [ ] `GITHUB_REPO_OWNER` set in Vercel, publishing token reissued from the org
- [ ] Vercel project moved to the division team — **after the shirt campaign
      closes 2026-09-12**, never renaming the project
- [x] Sheets and Forms — **already division-owned.** Verified 2026-09-10: the
      entry and scoring sheets and all four member forms are owned by
      `sw.bowls@gmail.com`, not a personal account. Nothing to move.
- [ ] Domain registrar for swlawnbowls.org confirmed division-owned

Register the GitHub organisation and the Vercel team against a division
address in the Google org (e.g. webmaster@swlawnbowls.org), not a personal
mailbox — recovery mail, billing and 2FA resets all follow that address.

## Two Vercel projects serve this one repository

Found 2026-09-10, while repairing deploys after the GitHub transfer. This is
the single most surprising thing about the setup and the easiest way to break
the site without noticing.

| Vercel project | Serves | Notes |
|---|---|---|
| `swd-google-calendar` | `swd-google-calendar-pi.vercel.app` | not the public hostname |
| `swd-tournament-hub.vercel.app` | **`swlawnbowls-website.vercel.app`**, **`swd-google-calendar.vercel.app`** and `hub.swlawnbowls.org` | this is what members hit |

Both deploy from this same repository. The public hostname that is hardcoded
in 186 places is served by the project named `swd-tournament-hub.vercel.app`,
**not** by the project named `swd-google-calendar`, and `vercel link` in this
working copy points at the latter.

Consequences to remember:

- `npx vercel ls` in this repo reports the *wrong* project. A deployment can
  read "Ready" there while the live site has not moved at all.
- Any change to the Git connection, environment variables or plan limits has
  to be made on **both** projects.
- Verify a deploy by fetching a changed file from `swlawnbowls-website.vercel.app`,
  never by trusting the CLI's deployment list.

Consolidating onto one project would remove this trap, but it touches the
hardcoded hostname and must not be attempted casually.

**Do not delete the project called `swd-tournament-hub.vercel.app`.** The name
is vestigial - it dates from when the root served the tournament hub - but the
project is the live public website. A separate Vercel project called `swd-hub`
holds the abandoned operations-platform prototype and is the one that is safe
to remove. The similar names are a trap: deleting the wrong one takes the site
down and releases the hardcoded hostname.

## Where things live today

| What | Lives in | Owned by | Division-owned? |
|---|---|---|---|
| Website code & history | GitHub `gallogiulia/swlawnbowls-website` | personal | **No** |
| Hosting & deploys | Vercel `giulia-gallos-projects` | personal | **No** |
| Public hostname | `swlawnbowls-website.vercel.app` (old: `swd-google-calendar.vercel.app`, keep it) | Vercel project above | **No** |
| Domain `swlawnbowls.org` | registrar / Squarespace | to confirm | **To confirm** |
| Entry & scoring sheets | Google Sheets | `sw.bowls@gmail.com` | Yes |
| The four member forms | Google Forms | `sw.bowls@gmail.com` | Yes |
| Publisher login accounts | Vercel env var `USERS` | project above | follows Vercel |
| GitHub token the publisher commits with | Vercel env var `GITHUB_PAT` | personal token | **No** |
| Division PayPal | PayPal | division | assumed yes |

## Order of work

Sequence matters. Each step is safe on its own; done out of order they break
the publisher or the live site.

1. **Create the division identities.** A Google account for the division, a
   GitHub organisation, a Vercel team. Add the current webmaster as an admin.
   Nothing moves yet, so nothing can break.

2. **Transfer the GitHub repository to the organisation.** Then set
   `GITHUB_REPO_OWNER` in Vercel to the new organisation. The code reads that
   variable (see `api/results/commit.js`), so no code change is needed.
   GitHub redirects the old path for a while, which hides mistakes — set the
   variable anyway rather than relying on the redirect.

3. **Reissue the publishing token.** `GITHUB_PAT` is currently a personal
   token; it dies with the personal account. Issue one from the organisation
   and replace the Vercel variable.

4. **Move the Vercel project to the division team.** Do this in a quiet week.
   `swd-google-calendar.vercel.app` is hardcoded in 186 places, 83 of them
   inside Squarespace pages that cannot be edited programmatically, so the
   project name must survive the move. Confirm the hostname still resolves
   before considering it done, and never rename the project.

5. **Google — done, with one caveat.** The sheets and forms already sit in
   `sw.bowls@gmail.com`. That is a shared Gmail rather than Workspace on our
   own domain, so access is still a shared password rather than named people.
   It is not urgent, but Workspace on swlawnbowls.org would make Google match
   the model we are moving GitHub and Vercel to.

6. **Confirm the domain registrar** for swlawnbowls.org is division-owned, and
   that at least two people can reach it.

## What a successor should need

The target is a webmaster who needs **a browser and a password** — nothing else.
`/results-publisher-mobile` already meets that bar for results: it signs in,
loads the current data, takes photos and commits to the site with no local
tooling. Extending the same approach to tournaments and news is what makes the
job handoverable. VS Code and an AI assistant stay the faster path for whoever
wants them, but they must never be the *only* path.

## Environment variables

Set in the Vercel project. Moving accounts means recreating these, so keep the
list current.

    GITHUB_REPO_OWNER   GitHub owner (defaults to gallogiulia)
    GITHUB_REPO_NAME    repository  (defaults to swlawnbowls-website)
    GITHUB_BRANCH       branch      (defaults to main)
    GITHUB_PAT          token the publisher commits with
    SESSION_SECRET      signs publisher login sessions
    USERS               publisher logins
    GCAL_API_KEY        Google Calendar feed
    PAYPAL_*            entry payments

# 06 — Risks and test plan

Status: DRAFT for review by Giulia, Anne and Bill. Written 2026-10-14.
Scope: entry, payment, refund/withdrawal, check-in and results in the SWD Hub, replacing Google Sheets.

Decisions already made (not re-opened here): payments go to SWD's own PayPal account; card data never touches our code; Apple Pay / Google Pay come via the processor; a check-or-cash path emails the TD and holds the entry as `pending_payment`; Anne and Bill handle refunds; entries, results and records live in the database, not Sheets. No pilot event is chosen yet.

Note on source docs: `docs/SWD-Hub-PRD.md` still says "Stripe" in several places (roles table, pilot gate, F3 text). Decision is PayPal. Treat those lines as stale until the PRD is corrected.

## 1. Risk register

Likelihood (L) and impact (I): H / M / L. "Owner" is a proposed role, not an agreed assignment; every owner is an OPEN QUESTION until Giulia confirms.

| # | Risk | L | I | Mitigation | Owner (proposed) |
|---|---|---|---|---|---|
| R1 | **Money: entry marked paid but no money received** (fake or replayed webhook, client redirect trusted) | M | H | Entry becomes `confirmed` only from a signature-verified PayPal webhook, never from the browser redirect. Idempotent on `paypal_capture_id`. Server checks captured amount and currency equal the event fee. | Giulia (build) |
| R2 | **Money: paid but entry not confirmed** (webhook lost, delayed, or our site down when it fires) | M | H | Nightly and on-demand reconcile job compares PayPal transactions to `payments`. Admin screen "paid at PayPal, not confirmed". Player gets PayPal receipt regardless. | Giulia; Anne/Bill review list |
| R3 | **Money: wrong refund or double refund** | L | H | Refunds only by Anne or Bill (admin role). One refund per payment enforced in the database. Every refund writes an audit row (who, when, amount, reason). Refunds done in the PayPal account, recorded back via webhook. | Anne, Bill |
| R4 | **Money: check/cash never arrives**, or arrives and is not matched | H | M | Entry stays `pending_payment` with a hold that expires on a deadline (length is OPEN QUESTION). TD marks received with note and date. TD sees a "pending checks" list. Auto-expiry emails the player first. | TD per event |
| R5 | **Money: SWD vs LLC confusion** (SWD, not the LLC, collects fees) | M | H | Only SWD's PayPal credentials are ever configured. LLC has no credentials in the system. Written note in the SWD agreement that SWD owns the account and the data. | Giulia; OPEN QUESTION who signs |
| R6 | **PayPal account risk**: limits, holds, or freeze on SWD's account; account tied to one person | L | H | At least two named people can log in. Keep a small running balance rule (OPEN QUESTION). Check/cash path stays available as fallback. Listed in `docs/succession-and-accounts.md` ("Division PayPal", currently "assumed yes"; must be verified). | Anne/Bill (OPEN QUESTION who is account holder) |
| R7 | **Personal data leak** (names, emails, phones, addresses in the member tables) | M | H | Database stays in the `private` schema, not exposed by the public API. Public entry list shows names and club only (OPEN QUESTION: exactly which fields). Row-level security tests (section 2). No player data sent to PayPal, only `entry_id`. Service keys only in Vercel env vars, never in the repo. | Giulia |
| R8 | **Minors**: entrants under 18 (juniors) | M | H | OPEN QUESTION: does SWD have junior entrants, and what age and consent rules apply? Until answered: collect date of birth only if needed, no public display of minors' contact data, parent/guardian email as the contact, no minor's photo in results without consent. Legal review before launch. | Giulia, then SWD board |
| R9 | **Livestream and photo consent** (events carry a livestream notice) | M | M | Entry form shows the same consent text as the event page, and records the tick and time. | Giulia |
| R10 | **Duplicate entries** (double click, back button, same player in two teams, retry after timeout) | H | M | Idempotency key per submit. One active entry per player per event enforced in the database. A second attempt returns the existing entry. TD sees duplicate warnings. PayPal order created once per entry. | Giulia |
| R11 | **Wrong player/team data** (typos, wrong member match, truncated names) | M | M | Players chosen from the member list where possible. `entry_id` is the only thing PayPal carries, so the old 127-character loss is structurally gone. TD can edit with an audit row. | Giulia; TD |
| R12 | **TD mistakes** (wrong fee, wrong deadline, deleted entry, wrong "paid" click, wrong draw) | H | M | No hard delete; withdraw and void only. Undo window and audit log for every TD action. Confirm dialog on "mark paid" showing name and amount. Event can be reset to draft only by admin. Fee and deadline changes after entries exist need a warning. | Anne (training), Giulia |
| R13 | **Outage on tournament morning** (Vercel, Supabase, or our bug) | L | H | Printable check-in sheet and entry list exported the evening before (and again at 6 AM). TD can run the day on paper. Rollback plan (section 6). Status checked at go/no-go. | TD; Giulia on call (OPEN QUESTION availability) |
| R14 | **PayPal downtime or checkout error** | L | M | Page shows a clear message and offers the check/cash path. Entry stays `pending_payment`, no data lost. Retry button that reuses the same entry. | Giulia |
| R15 | **Offline players at the green** (no signal, older players, no smartphone) | H | M | Players never need the app on the day. TD console works from the printed list and can add or mark entries on a phone, with a plain-text fallback. Check-in is TD-side, not player-side. | TD |
| R16 | **Players who do not use the web at all** | H | M | Paper or email entry stays accepted; TD or admin enters it on their behalf (`paid_offline` or pending). | TD |
| R17 | **Apple review**: in-app purchase rule may apply to entry fees in a native app | M | H | Unconfirmed that event entry fees are exempt. Ship the web app first. If an iOS app is built, ask Apple's review team before relying on the exemption; fallback is opening the payment page in the browser. Do not submit an iOS build with in-app payments until answered. | Giulia |
| R18 | **Withdrawal and refund disputes** (rule text unknown) | M | M | Rules configurable per event; the rule text is TBD (OPEN QUESTION: Anne and Bill). App shows the event's rule text at entry and at withdrawal. Today some events say "no refunds after" a date; the Hub must display, not invent, rules. | Anne, Bill |
| R19 | **Bus factor**: only Giulia can fix it | H | H | Succession items in `docs/succession-and-accounts.md` (Vercel Pro, GitHub org, shared logins). Runbook for TDs. Rollback plan works without a developer. | Giulia |
| R20 | **Sheets data drift during migration** (about 30 inconsistent sheets, no source of truth map) | H | M | Source-of-truth map before importing. Dry-run import into a test database and reconcile counts against the sheet. | Giulia with Anne (OPEN QUESTION: session not yet held) |
| R21 | **Legal/tax**: SWD's status, sales tax, record keeping for fees | L | M | OPEN QUESTION for SWD's treasurer or accountant. Export of all payments per event for their books. | SWD treasurer (OPEN QUESTION: who) |

## 2. Test plan

### 2.1 Unit tests (automated, run on every change)

| Area | What is tested |
|---|---|
| Fee calculation | Per team vs per player, from the existing `fee` formats (`$45/team`, `$15/player`, bare `$20`); rounding in cents; zero-fee events. Unparseable fee strings fail loudly. |
| Entry validity | Team size by `format` (singles, pairs, triples, fours); required roles (Skip/Vice/Lead via `playerLabels`); event-specific rules (OPEN QUESTION: which are enforced vs shown as text). |
| Deadline and capacity | Entry rejected after deadline; `max_entries` fills to waitlist; boundary at the exact deadline time and time zone. |
| Duplicate prevention | Same idempotency key twice gives one entry; same player in two entries blocked. |
| Status machine | Only legal transitions: `pending_payment` to `confirmed`, `waitlisted`, `withdrawn`, `refunded`; no `confirmed` without a paid payment or `paid_offline` with note. |
| Webhook handling | Bad signature rejected; replay of same capture does nothing new; wrong amount or currency flagged, not confirmed; unknown `entry_id` logged. |
| Refund rules | Only admin role can refund; cannot refund more than captured; second refund blocked; rule text from event config is used. |
| Access (row-level security) | Anonymous user cannot read member tables or contacts; player sees only own entries; TD sees only assigned events; admin sees all. Tested against a test database, never production. |
| Public output | Public entry list contains only the approved fields (R7 OPEN QUESTION); minors' data excluded. |
| Pending-check hold | Expiry job expires after the hold period, sends the warning first, frees the capacity slot. |

### 2.2 End-to-end scripts (PayPal SANDBOX only)

Rules for all scripts: sandbox credentials only, in a separate Vercel preview environment; sandbox buyer and sandbox merchant accounts; no real card, no real PayPal login; a check at the start of each script that the app reports "sandbox" mode and refuses to run if it reports live. Each script ends by checking database rows and the audit log.

| ID | Path | Steps | Pass when |
|---|---|---|---|
| E1 | PayPal checkout, success | Open test event, enter a 2-player team, pay with sandbox buyer. | Entry `confirmed` only after webhook; one `payments` row; PayPal sees only `entry_id`; confirmation email sent; entry on public list. |
| E2 | PayPal, buyer cancels | Start payment, close the PayPal window. | Entry stays `pending_payment`; retry reuses same entry; no duplicate. |
| E3 | PayPal, payment declined/fails | Use a sandbox failure scenario. | Clear message; entry unconfirmed; no payment row marked paid; check/cash offered. |
| E4 | Apple Pay / Google Pay | If the processor exposes them in sandbox: pay from a supported device or sandbox wallet. OPEN QUESTION: PayPal sandbox support for these wallets is not confirmed; verify before promising. | Same outcome as E1. If not testable in sandbox, mark as NOT TESTED and block go-live of that button. |
| E5 | Webhook delayed | Pause webhook delivery, pay, then release. | Entry confirms on arrival; reconcile job also finds it if delivery never comes. |
| E6 | Webhook replay and forgery | Resend the same event; send one with a bad signature. | Replay: no change. Forgery: rejected, logged. |
| E7 | Double submit | Double click Pay; submit twice in two tabs. | One entry, one order. |
| E8 | Check/cash | Enter with "pay by check or cash". | Entry `pending_payment`; TD gets email; player gets instructions; TD marks received with note; entry `confirmed`, `paid_offline` true. |
| E9 | Check/cash expiry | Let the hold run out (shorten the hold in test). | Warning email, then expiry; slot freed. |
| E10 | Withdrawal and refund (PayPal) | Player requests withdrawal in app; Anne or Bill approves; refund issued in sandbox. | Status `withdrawn` then `refunded`; refund row with actor; refund webhook recorded; amount correct; player emailed. |
| E11 | Withdrawal denied | Request withdrawal where the event rule says no refund; admin denies. | Entry stays `confirmed`; reason recorded. |
| E12 | Withdrawal of check/cash entry | Withdraw a `pending_payment` and a paid-offline entry. | First: simply withdrawn. Second: flagged for manual refund by check (OPEN QUESTION: how those are returned). |
| E13 | Capacity and waitlist | Fill `max_entries`, add one more. | Waitlisted; promotion when someone withdraws (OPEN QUESTION: automatic or TD decision). |
| E14 | Deadline | Enter just after deadline. | Rejected for players; TD can add with a note. |
| E15 | Wrong amount | Alter the order amount in sandbox tooling. | Flagged, not confirmed. |
| E16 | Role boundaries | Log in as player, TD of another event, TD, admin and try each forbidden action. | All forbidden actions refused. |

### 2.3 Dry-run checklist for the first real event

Pilot event: OPEN QUESTION, not chosen. Use a low-stakes event with a single TD. Do this checklist at least two weeks before opening entries.

- [ ] Event created in the Hub by the TD (not by Giulia), fee, deadline, refund text, contact filled in.
- [ ] TD has signed in on their own phone and laptop.
- [ ] Three or more volunteers (not developers) complete a sandbox entry and a check/cash entry without help; note every point they get stuck.
- [ ] Email to TD and to player arrives and is not in spam (test with Gmail, Yahoo, an older provider).
- [ ] Public entry list matches the database; no private fields shown.
- [ ] Printable check-in sheet and entry export produced; TD confirms it is usable on paper.
- [ ] Anne and Bill each perform a sandbox refund end to end.
- [ ] Reconcile job run; zero unmatched items.
- [ ] Rollback rehearsed (section 3).
- [ ] The PayPal live credentials are NOT yet in the production environment until the "before real money" list below is complete.
- [ ] After opening entries: first live entry is a small controlled one by Anne or Giulia, refunded afterward; confirm the money appears in SWD's PayPal and the refund returns.
- [ ] Day before: export the list; day of: TD has paper copy and the admin phone numbers.
- [ ] Week after: compare Hub totals to PayPal statement and to checks received; record differences.

## 3. Rollback plan (back to Google Sheets)

Principle: during the pilot the old system keeps working in parallel, so rollback means "stop using the Hub", not "rebuild".

| Step | Detail |
|---|---|
| Keep the old path alive | Do not remove existing PayPal buttons, `registrationUrl`/`entries.pubUrl` Sheets links or the Sheets for the pilot event until the event is closed and reconciled. |
| Daily export | The Hub exports entries (CSV in the same column layout as the current sheet) each day and on demand, to a division-owned Drive folder. OPEN QUESTION: which sheet layout counts as "current", pending the source-of-truth session. |
| Trigger | Any "no-go" item below, a failed reconcile, a money mismatch not explained in 24 hours, or a TD request. Decision by Giulia, Anne or Bill (any one can call it). |
| Action | (1) Close entries in the Hub (status `closed`). (2) Switch event page back to the old PayPal button/Sheet link (a one-line edit in `events-data.json`, which is how the site works today). (3) Import Hub entries into the Sheet from the latest export. (4) Email already-entered players: their entries stand, no action needed. (5) Leave the database untouched for diagnosis. |
| Money in flight | Pending PayPal payments are left to complete; the reconcile list is worked by hand by Anne or Bill. No refunds are made to "fix" a rollback unless a player asks. |
| After | Short write-up of what happened; re-run the relevant test before trying again. |
| Limit | Rollback after results are entered is data copy only. Results stay in the database and are exported to `results-data.json` form. OPEN QUESTION: who maintains this export. |

## 4. Go / no-go criteria

Checked at three points: before opening entries, 24 hours before the event, and morning of the event. Any single "no-go" means do not proceed on the Hub for that stage.

| Criterion | Go | No-go |
|---|---|---|
| Sandbox scripts E1 to E3, E5 to E11, E14 to E16 | All pass on the exact build being released | Any failure, or build changed since the last pass |
| E4 (Apple/Google Pay) | Passed, or button hidden | Button shown but untested |
| Unit tests | All green; row-level security tests included | Any red or skipped |
| Dry-run checklist | All boxes done | Any open box |
| Reconcile | Zero unexplained differences | Any unexplained difference |
| Named people | TD, Anne, Bill and Giulia each reachable on event day (OPEN QUESTION: backup if Giulia is not) | A role with no person |
| Backup | Paper list and export produced | None |
| Service status | Vercel, Supabase and PayPal normal | Any degraded the morning of the event |
| Players' experience | Test volunteers finished entry unaided | More than one stuck at the same step |
| Pilot success after the event | Totals match PayPal and checks; no data repair needed; TD ran the day without Giulia | Money mismatch, or any manual data repair |

## 5. What must be true before ANY real money moves

All of these, in writing or demonstrably checked. Until every box is ticked, live PayPal credentials stay out of the production environment.

- [ ] SWD's PayPal account is confirmed as SWD's (not a personal or LLC account), with at least two authorized people, and its holder recorded in `docs/succession-and-accounts.md`.
- [ ] The SWD agreement is signed stating that SWD, not the LLC, collects entry fees and owns the player data (OPEN QUESTION: signatories and status).
- [ ] Refund and withdrawal rule text is written by Anne and Bill and entered per event (currently TBD). Without it, the app must not promise refunds.
- [ ] Anne and Bill have each performed a refund in sandbox and know where the PayPal refund button is.
- [ ] Verified in code review and tests: no card data in our code or logs; PayPal receives only `entry_id`; secrets only in environment variables; webhook signature checked.
- [ ] Webhook is the only thing that confirms a payment, with replay and amount checks tested.
- [ ] Reconcile job and "paid but not confirmed" screen exist and have been run.
- [ ] Duplicate-entry protection tested (E7).
- [ ] Row-level security tests pass; a person outside the division cannot read the member tables.
- [ ] Privacy notice and consent text (data use, livestream, public list) are on the entry form; minors policy decided (R8).
- [ ] Check/cash instructions written: payee name, address, hold period, what happens on expiry.
- [ ] The rollback plan was rehearsed once.
- [ ] A named person is on call during the first live entry window and on the event day.
- [ ] Treasurer or accountant is told how payments will be recorded and exported (R21).
- [ ] The first live payment is a small one by Anne or Giulia, then refunded, with both confirmed in PayPal.
- [ ] If any iOS app is involved: Apple's answer on entry fees obtained, or payment opens in the browser (R17).

## 6. Open questions collected

1. Who owns and logs in to SWD's PayPal account today, and who is the backup?
2. Which event is the pilot, and who is its TD?
3. Withdrawal and refund rule text, and whether it differs by event (Anne, Bill).
4. How long a check/cash hold lasts, and how check refunds are returned.
5. Does SWD allow minors, and under what consent rules?
6. Exactly which fields appear on the public entry list?
7. Who is on call on event days besides Giulia?
8. Does PayPal sandbox support Apple Pay and Google Pay for our setup?
9. Who is the SWD treasurer or accountant for records, and who signs the SWD agreement?
10. Source-of-truth map for the Sheets (needs the session with Anne), and which sheet layout is the rollback target.
11. Waitlist promotion: automatic or TD decision?
12. Which event rules (for example "at least 1 woman and 1 novice") are enforced in code versus shown as text?

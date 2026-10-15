# 04 - Tournament-director console

Status: design draft, nothing built or connected. Written 2026-10-14.
Sources: `docs/SWD-Hub-PRD.md` (sections 2, 4, 7, 8, 17, 18), `docs/SWD-Data-Findings.md`, `events-data.json`, `results-data.json`, `score-sheets/`, `docs/succession-and-accounts.md`.

## 1. Who, and on what device

| Item | Decision |
|---|---|
| Users | Anne Nunes and Bill (surname OPEN QUESTION: PRD names Bill Brault as men's playdowns director; confirm it is the same Bill) |
| Device | Phone first, one hand, outdoors in sun. Big tap targets, high contrast, works on weak signal. |
| Placement | A "Run event" area inside the app, reachable only after sign-in. Public pages never show it. |
| Payments | SWD's own PayPal account. Card data never touches our code. Apple Pay and Google Pay come through the processor. |
| Refunds | Done by Anne and Bill. The console shows what to refund and records that it was done. |
| Source of truth | The database, not Google Sheets. |

OPEN QUESTION: PRD role table says a TD "cannot issue refunds (can request)". Giulia says Anne and Bill do refunds. Are Anne and Bill both Division Admin, or are they TDs with a refund permission? Design below assumes a per-person `can_refund` flag so either answer works.

OPEN QUESTION: Does Bill run events on his own or only back up Anne? Which events is each assigned to?

## 2. Roles and permissions (applies to every screen)

| Role | Sees | Can change |
|---|---|---|
| Public | Names only, entry counts, draws, scores, results | Nothing |
| Member | Own entries | Request withdrawal on own entry |
| TD (Anne, Bill) | Assigned events only, including contact details and payment status | Everything on those events except where marked "refund" |
| Refund-capable (Anne, Bill) | Same, plus refund queue | Approve withdrawal, mark refund done |
| Division Admin | All events, audit log | Reassign TDs, edit anything after verification |

Rules that hold everywhere:
- Checked on the server, not just hidden in the page.
- Nothing is hard-deleted. Rows get a status or `deleted_at`. (This is the fix for the earlier sheet wipe.)
- Every change writes an audit row: who, when, before, after, reason where noted.
- Players' emails and phones are visible to TDs only.

## 3. Screen map

| # | Screen | When used |
|---|---|---|
| 1 | My events | Open the app |
| 2 | Entries | Before and during event |
| 3 | Add entry / record payment | Phone calls, checks, cash at the door |
| 4 | Withdrawals queue | Before and after deadline |
| 5 | Waitlist | When full |
| 6 | Check-in | Morning of event |
| 7 | Draw and rinks | After check-in closes |
| 8 | Score entry | During play |
| 9 | Standings and verify | Between and after rounds |
| 10 | Publish results | End of event |

Event status flow (from PRD section 6): `draft -> entries_open -> entries_closed -> in_progress -> finished -> results_published`. Screens 6 to 10 unlock at `in_progress`.

## 4. Screens

### 4.1 My events

| Field | Detail |
|---|---|
| Shows | Events assigned to me, newest first: title, date, club, status, `confirmed / max`, pending-payment count, open withdrawals count |
| Primary action | Tap an event to open it |
| Empty | "No events assigned to you. Ask a division admin." |
| Error | "Could not load events. Pull to retry." Cached list shown if offline. |
| Permissions | TD sees own events. Admin sees all. |

### 4.2 Entries

| Field | Detail |
|---|---|
| Row | Team name or lead name, player names with positions (skip/vice/lead etc.), club, fee, payment badge, entry status, checked-in dot |
| Payment badge | `Paid online` / `Pending: check or cash` / `Pending: online, not completed` / `Paid by check` / `Paid by cash` / `Refunded` |
| Filters | All, Pending payment, Confirmed, Waitlisted, Withdrawn |
| Search | By any player name |
| Primary action | Toggle paid/pending on a row (opens confirm sheet, section 4.3) |
| Secondary | Open entry, edit players, message entrant, export CSV |
| Empty | "No entries yet. Entries open [date]." or, if open, "No entries yet. Share the entry link." with a copy-link button |
| Error | Save failures keep the toggle in its old state and show "Not saved. Try again." No silent failures. |
| Permissions | TD on assigned events. Edits to player names after check-in are logged with a reason. |

Notes:
- Players are stored one row per player, so long names and four-player rinks are never truncated (the old PayPal 127-character problem).
- Names are shown exactly as typed. Never auto-correct spelling (CLAUDE.md "names are a permanent record").

### 4.3 Record payment (check or cash)

| Field | Detail |
|---|---|
| Inputs | Method (check / cash / other), amount (defaults to event fee), check number, date received, who received it (defaults to me), note |
| Primary action | "Mark received". Entry moves from `pending_payment` to `confirmed`. |
| Undo | "Mark not received" within the same screen, reason required, logged |
| Emails | Entrant gets a receipt email. (Wording OPEN QUESTION.) |
| Empty | n/a |
| Error | Amount differs from fee: warn, allow with note. Event already full: ask "Confirm anyway or move to waitlist?" |
| Permissions | TD on assigned events |

Pay-by-check flow, for context: player picks "Pay by check or cash" on the entry form, the entry is held as `pending_payment`, and the TD gets an email. The TD marks it received here.

OPEN QUESTIONS:
- Mailing address for checks: events-data.json has `contact.mailTo` per event (Anne's address on the sample). Keep per event?
- Does a pending check/cash entry hold a place, and for how long before it is released? (PayPal holds are 30 minutes in the PRD; a mailed check needs days.) Suggest: hold until entry deadline, TD can release early.
- Do entries paid at the door on the day need a separate flow?
- Fee formats in the data are free text (`"$45/team"`, `"$15"`). Per-person vs per-team must become a field. See section 8.

### 4.4 Withdrawals queue

Flow: player taps "Request withdrawal" in the app, states a reason, request lands here. Anne or Bill approves and refunds, or declines.

| Field | Detail |
|---|---|
| Row | Entry, who asked, when, reason, amount paid, method, deadline status (before/after), rule that applies |
| Rule text | Shown from the event's configurable refund rule. Current text lives in the `deadline` field, e.g. "Entry deadline: Friday, April 11, 2026 (no refunds after)". |
| Primary action | Approve, then choose: full refund / partial (amount) / no refund. Decline needs a reason. |
| After approve | Entry becomes `withdrawn`. Slot released. First waitlisted entry is offered the slot (section 4.5). Entrant is emailed. |
| Refund step | Paid online: console shows the PayPal transaction and a "Open in PayPal" link. Anne or Bill refunds in PayPal, then taps "Mark refunded". Paid by check: "Mark refund check sent" with check number. Paid by cash: "Mark cash returned". |
| Empty | "No withdrawal requests." |
| Error | If "Mark refunded" is tapped but PayPal shows no refund, we cannot tell. This stays a manual confirmation in v1. |
| Permissions | Approve and refund: Anne and Bill only (`can_refund`). Other TDs can view and recommend. |

Withdrawal rules: the rule text is TBD. Design is configurable per event:

| Setting | Values |
|---|---|
| `refund_policy_text` | Free text shown to players (to be supplied) |
| `refund_cutoff` | Date/time, defaults to entry deadline |
| `refund_before_cutoff` | full / minus fee / none |
| `refund_after_cutoff` | none / TD discretion |
| `auto_approve_before_cutoff` | on / off |

OPEN QUESTIONS:
- What is the actual refund and withdrawal rule? Does it differ by event (the sample says "no refunds after" the deadline)?
- Any processing fee kept on refunds?
- Can a team replace a player instead of withdrawing? Who approves substitutes, and until when?
- What happens if the TD withdraws a team (no-show, ineligible)?
- Does a no-show on the day get a refund? Assume no, TD discretion.

### 4.5 Waitlist

| Field | Detail |
|---|---|
| Row | Position, entry, date joined, payment state |
| Primary action | "Promote" (moves to confirmed or pending payment) |
| Auto behaviour | When a slot opens, next in line is notified and given a time window to pay. Window length is OPEN QUESTION. |
| Secondary | Reorder (TD override, logged), remove |
| Empty | "Nobody waiting." |
| Error | Promote when no slot is free: "Event is full. Raise the limit or withdraw someone first." |
| Permissions | TD |

Do waitlisted players pay up front, or only when promoted? OPEN QUESTION. Suggest: pay only when promoted, so there is nothing to refund.

### 4.6 Check-in (event day)

| Field | Detail |
|---|---|
| Header | `12 / 16 checked in`, no-shows count |
| Row | Team, players, paid badge, big check-in button |
| Primary action | One tap = checked in. Long-press = no-show. |
| Unpaid at check-in | Row shows red "Unpaid". Tap opens 4.3 so cash can be taken at the door. Check-in is allowed but flagged. |
| Late arrival | Team can be added at the door through 4.3 if space allows |
| Close check-in | Locks the list and enables the draw. Reopenable by TD with a note. |
| Empty | "No confirmed entries to check in." |
| Error | Offline: taps queue locally and sync later, with a visible "Not synced" badge. |
| Permissions | TD. Optional helper login with check-in only. (OPEN QUESTION: needed?) |

Also confirm on check-in: all players are Bowls USA members where the event requires it. OPEN QUESTION: is member status checked automatically from the member database, or by the TD's eye?

### 4.7 Draw and rinks (round-robin events)

How it works (PRD section 18): the draw is a fixed table, not computed. Source tables are in `score-sheets/draw-2-3-4-game-8-16-teams.zip` and `score-sheets/draw-5-6-game-10-16-teams.xlsx`, keyed by team count (8, 10, 12, 14, 16) and number of games. Each row gives, per game, the rink and opponent number.

| Step | Detail |
|---|---|
| 1 | App counts checked-in teams and picks the table for (team count, game count) |
| 2 | Teams get numbers 1..N by blind draw (shuffle, TD can redo) or by seed where the event uses seeding |
| 3 | App fills `games` rows: round, green, rink, team A, team B |
| 4 | TD reviews, swaps teams or rinks manually, then "Post draw" |
| 5 | Posted draw shows publicly and is printable |

| Field | Detail |
|---|---|
| Inputs | Team count (read-only), games, ends per game, greens used (A/B green split), rinks per green, livestream rinks, seeding mode |
| Livestream rink | Pin a game to a camera rink. App swaps with whichever game was there and warns on conflicts. Default rinks are club-specific (typically 1/2 or 6/7). |
| Odd counts | If team count is not in the table (not 8, 10, 12, 14, 16), show "No standard draw. Choose a number to add byes to, or build by hand." |
| Primary action | "Generate draw" then "Post draw" |
| Empty | "Check-in is not closed yet." |
| Error | A repeated opponent or rink conflict is highlighted, not blocked. Manual override always wins. |
| Permissions | TD. Reposting a draw after scores exist needs a reason and warns that scores will be orphaned. |

Not covered by fixed tables (PRD section 17, marked "custom"): men's singles playdowns (double elimination, Stars/Stripes), women's singles sets play, CA Bears multi-discipline, seeded pennant (Cary-MacDonald), qualify-then-cut events (Men's So Cal Rinks, top 8 to day 2). For these the console offers manual game creation only in v1.

OPEN QUESTIONS:
- The draw tables are in .xlsm files with macros. Who confirms my transcription against the originals? The 5/6-game file and the 2/3/4-game file may use different layouts.
- Some events use A green and B green with separate winners ("each green its own winners", per the Vet/Novice Triples rules). Treat each green as its own division with its own draw? Assume yes.
- Do events with more than 16 teams exist outside the playdowns? What draw do they use?
- Which events seed, and by what rule? (PRD section 16 leaves this to a human decision.)
- Livestream rinks per club: where is that list kept today?
- Men's playdowns structure: OPEN QUESTION, parked per PRD section 16. Bill Brault should be in that conversation.

### 4.8 Score entry

| Field | Detail |
|---|---|
| Layout | One card per game: rink, team A name, team B name, two large steppers |
| Inputs | Score A, score B, ends played (optional), notes |
| Primary action | "Submit score". Status moves `scheduled -> reported`. |
| Display | Rounds as tabs. Unfinished games first. Filter by my green. |
| Tie handling | Ties allowed in standard events (1 point each), blocked in playdowns (PRD section 17) |
| Plus cap | Warn when the margin exceeds the cap for that game length. The cap table is OPEN QUESTION (PRD says "see table", the values need confirming from the conditions of play). |
| Empty | "Draw not posted yet." |
| Error | Negative or blank score rejected inline. Offline entry queues. Two people editing the same game: second save shows "Changed by [name] at [time]. Review." |
| Permissions | TD. Optional marker path with per-event PIN (PRD section 8). OPEN QUESTION: wanted at all? |

Paper scorecards in `score-sheets/` (`scorecard-3game-12end`, `3game-21end`, `4game-10end`, `4game-21end`) stay as the backup record. Whether the TD keys from paper at the end or enters live is OPEN QUESTION.

### 4.9 Standings and verify

| Field | Detail |
|---|---|
| Table | Rank, team, played, wins, ties, losses, points (3/1/0), plus/minus, ends won where tracked |
| Tiebreak ladder | Head-to-head, fewest opponent points allowed, most ends won, one-end roll-off (PRD section 17). Ties that cannot be resolved by data are flagged for the TD to set manually. |
| Primary action | "Verify" each game against the paper card. `reported -> verified`. "Verify all" per round. |
| Edit after verify | Admin only, with reason, logged |
| Finish event | Blocked while any game is unverified (or voided with a reason) |
| Empty | "No scores yet." |
| Error | Standings recalc failure shows the last good version with a "may be out of date" label |
| Permissions | TD verifies. Admin edits after verification. |

OPEN QUESTION: Do divisions or flights get set before play (A/B greens, Stars/Stripes) or after, from standings (Championship Flight, Flight 2 as in the Southwest Open)? The data shows both styles.

### 4.10 Publish results

Output matches the current `results-data.json` tournament object, so every existing page keeps working. The database holds the data. A publish step produces the same shape.

| JSON field | Console field |
|---|---|
| `id` | Event id (must equal the `events-data.json` id) |
| `title`, `meta` ("October 11 · Coronado LBC"), `navLabel`, `eventUrl` | Filled from the event, TD can edit `meta` |
| `divisions[].label` | Division name, or blank for none |
| `divisions[].columns` | Display setting (1 or 2), default 2 |
| `divisions[].places[]` | Rank, display names, photo |
| `divisions[].flights[].label / places[]` | Flight name and placings (used instead of `places`, never both) |
| `divisions[].slug`, `venue`, `eventUrl` | Used by `/division` pages for flighted events |
| `places[].rankLabel` | e.g. "1st Place" |
| `places[].names` | Exact text, e.g. "Russ Kindorf, Terry Mar, Janice Bell" |
| `places[].photo` | Photo upload |
| `awards[]` | Title, names, photo, optional note (e.g. "Bowler of the Tournament . Women") |

| Aspect | Detail |
|---|---|
| Suggest placings | From standings, per division or flight. TD confirms or edits. Names pre-fill from entry players, exactly as entered. |
| Photos | Take or choose on phone, assign to a place or award, compressed before upload. Stored in the app's file storage and referenced by URL. Never hotlink Squarespace. Today's convention is `photos/<tournament-id>/`. |
| Awards | Free list. Each award has title, one or more names, optional photo, optional note. Names must match the player's name exactly (profiles match on exact text). |
| Preview | Shows the public results page and, for flighted events, the `/division` page, before going live |
| Primary action | "Publish results". Makes them public, creates a news item, and writes an audit row. |
| Unpublish | Admin or Anne/Bill, with note |
| Empty | "Finish the event and verify scores first." |
| Error | Missing photo: allowed, warns. Duplicate place numbers: blocked. Name with no match to an entry: warns, does not block (non-members and typos). |
| Permissions | TD publishes own events. Awards: TD and admin. |

Important from CLAUDE.md: "The results publishers do not edit `awards`, so check they keep it when you save." The database design removes that trap because awards are first-class rows, not part of a file rewrite. During the transition, anything still writing `results-data.json` through the existing publisher must preserve `awards`.

OPEN QUESTIONS:
- Transition: does the app write `results-data.json` (via commit) or do pages move to read the database? Readers of the file must be grepped before any shape change (CLAUDE.md).
- Who chooses "Bowler of the Tournament", and is it voted, or computed from a points rule?
- Season standings (`SWD 2026 Women's Standings.xlsx`) are a derived view, parked for a later phase per the PRD. Confirm.
- Photo rights and consent for livestream/photos: where is it recorded?
- Do Stars/Stripes playdowns publish through this screen or separately?

## 5. Cross-screen states

| State | Behaviour |
|---|---|
| Offline | Reads from cache, writes queue with a "Not synced" badge, retry on reconnect |
| Session expired | Return to the same screen after sign-in, no lost input |
| Double tap | Writes are idempotent per action, a second tap does not toggle back |
| Event not assigned | "You are not a director of this event" with a contact link |
| Frozen event | After `finished`, scores are read-only for TDs |

## 6. Emails sent from the console (wording OPEN QUESTION for all)

| Trigger | To |
|---|---|
| Check/cash entry submitted | TD (and entrant a confirmation of pending status) |
| Payment marked received | Entrant |
| Withdrawal requested | Anne and Bill |
| Withdrawal approved/declined, refund marked done | Entrant |
| Waitlist promotion | Entrant |
| Draw posted | All confirmed entrants |

OPEN QUESTION: Which address do these send from, and who owns it? `docs/succession-and-accounts.md` says a shared Gmail is in use today and Workspace on the domain is not yet set up.

## 7. Phase order for this console

| Step | Screens |
|---|---|
| A | 4.1, 4.2, 4.3 (check/cash and paid toggles) |
| B | 4.4, 4.5 |
| C | 4.6, 4.7, 4.8, 4.9 |
| D | 4.10 |

Matches PRD slices 1 to 6. Nothing here is wired to PayPal or email yet. No pilot event is chosen. OPEN QUESTION: which event runs first on this console.

## 8. Google Sheet to database mapping

Counts and structure are from `docs/SWD-Data-Findings.md`. I have not opened the sheets themselves, so anything not in that file is marked OPEN QUESTION.

| Sheet type today | Replaced by | Notes |
|---|---|---|
| Per-tournament workbook, one tab per year (e.g. "SWD Mumma Mixed Pairs"), about 40 workbooks and about 500 tabs | `events` (one row per event per year) plus `entries` and `entry_players` | Historical tabs stay in Drive, read-only. Not migrated in v1. |
| Bare `YYYY` tab: raw timestamped form collector (Team #, Timestamp, Skip, Lead, ..., Note/Green) | `entries` + `entry_players` created by the online entry form | `created_at` replaces Timestamp. Team # becomes the draw number, assigned at draw time. |
| `YYYY Entries` tab: hand-arranged roster, A/B green blocks, "ENTRIES CLOSED" marker | Entries screen (4.2) plus `games`/draw (4.7). "Entries closed" is event status. A/B green is a field on the entry or division. | OPEN QUESTION: is green assignment decided at entry, by the TD at draw, or by entry order? |
| Public embed of the entries sheet (`entries.pubUrl` in events-data.json, 15 of 52 events blank) | Public entry list page reading the `entries` table | Names only. `pubUrl` field retired per event as each switches over. |
| Southwest Open workbook: tabs by discipline x year (`2026Fours`, `2026Pairs`, `2026Singles`, `SyncLog`) | `events` per discipline, or one event with discipline field | OPEN QUESTION: one event with sub-events, or separate events? Results-data.json already splits the Open into divisions with flights. `SyncLog` is retired. |
| SW Open per-discipline entry sheets (`SW Open Men_s Singles` etc., one `2026 Entries` tab) | `entries` for those events | OPEN QUESTION: do they feed the main workbook by script today? Script behaviour unknown. |
| Results Sheets: end-by-end scoring per session and division (`Sat AM - Stars`, `Sun AM - Stars`, Nationals `Tues AM ... Scoresheet`) | `games` (per game score), optional `ends` detail | OPEN QUESTION: is end-by-end detail needed in the database, or only final game scores? Assume final scores only. |
| Draw master tables (`score-sheets/draw-*.xlsx/xlsm`) | `draw_templates` lookup keyed by team count and game count | Reference data, loaded once. Not per event. |
| Rink setup template (`rink-setup-template.xlsm`) | `clubs` green/rink inventory plus livestream rink flags | OPEN QUESTION: what does this template hold beyond rink counts? |
| Paper scorecards (`scorecard-*.xls`) | Stay as paper backup. Optionally a printable view from the app. | |
| Pairs scoresheets (`pairs-2day-4game`, `pairs-3day-6game`) | `games` + standings (4.9) | OPEN QUESTION: do these include formulas for tiebreaks we must reproduce? Unknown until opened. |
| Men's Singles Playdowns workbook (tab `Sheet1`, live-scoring) | `games` with bracket fields, manual in v1 | OPEN QUESTION: structure unknown. PRD section 16 says current practice may be wrong. |
| Season standings aggregator (`SWD 2026 Women's Standings.xlsx`: Detailed Standings, Results, SWD Members, Normalized, Criteria) | Derived view over `results` plus members (later phase) | Members tab is the best roster source. Points criteria are OPEN QUESTION. |
| `SWD Members` roster (about 30 inconsistent sheets) | `members` | Blocked on the sources-of-truth session (PRD section 15). OPEN QUESTION: which sheet is canonical? |
| Entry confirmation emails and Apps Script notifications | Emails from the app (section 6) | Apps Script retired from the write path. |
| PayPal custom_id data stuffing (player names inside the payment record) | `entry_players` rows plus `payments` row | Old payments are not migrated. Old sheets remain the record. |
| `results-data.json` | `results`, `result_places`, `result_flights`, `result_awards`, `result_photos`, generated back into the same JSON shape | See 4.10. |
| Google Forms (members, `docs/forms.md`) | Out of scope for this console | |

Event fields used as input to the console:

| `events-data.json` field | Use in console | Issue |
|---|---|---|
| `format` | Team size and draw table. Values seen: triples, pairs, singles, fours, 2+2, rinks, and 3 blank. | 3 events have no format. 2+2 and rinks need mapping. OPEN QUESTION. |
| `fee` | Entry fee | Free text ("$45/team"). Needs amount and unit (per team / per player). |
| `deadline` | Entry cutoff and refund rule | Free text mixes date and refund rule. Split into `entry_deadline` and `refund_policy_text`. |
| `paypal{system, price, playerLabels}` | `playerLabels` give position names for the entry form and console (Skip/Vice/Lead). `price` gives the amount. `system: modern/classic` and `hostedButtonId` are the existing buttons. | Existing buttons stay until the new payment flow replaces them. OPEN QUESTION: which events use which system. |
| `registrationUrl` | Link out to current entry method | Replaced by in-app entry link when an event moves over. |
| `contact{name, email, phone, mailTo}` | TD notifications, check mailing address | `mailTo` is a postal address string. |
| `entries.pubUrl` | Retired per event | See table above. |

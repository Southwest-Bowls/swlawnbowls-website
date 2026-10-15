# 01 - Entry flow (state machine)

Status: design draft, nothing built. Written 2026-10-14 for Giulia to review.
Names of states, columns and roles in this folder follow `02-schema.sql` (the other five files were reconciled to it). Where the PRD differs, the PRD is stale.
Anything marked **OPEN QUESTION** is not decided; do not build around a guess.

## Decisions this document relies on (from Giulia)

- Payments go to **SWD's own, existing PayPal account**. The old buttons stay on current events until an event moves to in-app entry; in-app-entry events use orders created by our server in that same account (see `03-payments.md`). Card data never touches our code.
- Apple Pay and Google Pay are offered through the processor (PayPal), not built by us.
- **Pay by check or cash** is a path of its own: the app emails the TD and holds the entry as pending payment.
- **Refunds are handled by Anne and Bill** (admins, or TDs with the `can_refund` flag). Other TDs and players cannot approve or issue refunds. The money itself is returned by hand in PayPal (or by check/cash) and then recorded in the app; the app does not call PayPal to refund in v1.
- **Withdrawal:** the player requests it in the app; Anne or Bill approve and refund. The rules are configurable per event. **The rule text is TBD** (see Open questions).
- No pilot event chosen yet. Nothing here is hardcoded to one tournament.
- Entries, results and records live in the database, not Google Sheets.

Note on the PRD (`docs/SWD-Hub-PRD.md`, not edited here): it still says "Stripe" (roles table, System row; pilot gate), says TDs "can request" refunds, has an entry status `refunded` and a payment status `expired`, expires unpaid online entries to `withdrawn`, and lets players withdraw themselves until the deadline. This folder instead uses `confirmed`, `expired`, payment status `voided`, Anne and Bill approving every withdrawal, and PayPal. The PRD should be updated to match once Giulia approves.

## 1. States

| State | Meaning | Takes a slot? | Public entry list? |
|---|---|---|---|
| `draft` | Player started the form, not submitted. Browser/app only, no database row (not an `entry_status` value), no money asked. | No | No |
| `pending_payment` | Submitted and saved in full. Waiting for money: either PayPal capture, or a check/cash arriving. | Yes (held until `hold_expires_at`) | No by default (schema); showing names as "payment pending" is an **OPEN QUESTION** |
| `confirmed` | Money received (verified PayPal capture, or TD marks check/cash received), or event is free. | Yes | Yes |
| `waitlisted` | Event is at its cap. Entry is saved, no payment taken yet. | No | Yes, on a separate waitlist |
| `withdrawn` | Entry ended by the player or TD: unpaid entry cancelled, or a withdrawal request approved by Anne/Bill. Any refund owed is tracked on the withdrawal (`refund_status`: `none_due` / `due` / `issued`), not as an entry state. | No | No |
| `expired` | Online checkout was not completed within the hold time (or a check/cash hold was released by the TD). Slot released. | No | No |
| `cancelled` | The event was cancelled, or a TD/admin removed the entry. Refund is still owed if it was paid. | No | No |

There is **no `refunded` entry state**. Whether and how much money came back lives on `withdrawals.refund_status` / `refund_cents` and on `payments.status` (`paid`, `partially_refunded`, `refunded`, `voided`). Screens that say "Refunded" derive it from those.

Fields that sit beside the state, not as extra states: `entries.payment_choice` and `payments.method` (`paypal` / `check` / `cash` / `other`; there is no `none`: a free event simply has no payment row), the `withdrawals` row (an open request has `status = requested`; the entry stays `confirmed` until decided), `withdrawals.refund_cents`, and `payments.reference` / `note` for the check number or "cash" note. `late_override` (a TD adding an entry after the deadline or over cap) has **no column yet**; it is a gap (see `02-schema.sql` open question 19).

Check-in is separate (the `check_ins` table: `checked_in` / `no_show`; no row means not checked in). It is day-of and not part of this flow.

## 2. Transitions

Triggers: **player**, **TD** (Anne, Bill, any assigned TD), **system** (timer/cron), **webhook** (PayPal, signature verified).

| # | From | To | Trigger | Who | Guard / what happens |
|---|---|---|---|---|---|
| T1 | (none) | `draft` | Player opens entry form | player | Kept in the browser/app so a dropped connection or magic-link sign-in restores it. No database row and no slot held (`02-schema.sql` has no draft status). |
| T2 | `draft` | `pending_payment` | Player submits, event has room, fee > 0 | player | Player data written to the database **first** (`create_entry`). Then PayPal order created server-side (PayPal gets the entry id, the amount and the event title, no player data), or check/cash chosen. Slot is counted inside one transaction so the cap can never be exceeded. |
| T3 | `draft` | `confirmed` | Player submits, event is free (fee = 0) | system | No payment step. Confirmation email sent. **Gap:** `create_entry` in `02-schema.sql` always creates `pending_payment`; a fee of 0 path needs a small change before free events work. |
| T4 | `draft` | `waitlisted` | Player submits, event at cap | system | No payment taken. Player told their waitlist position. |
| T5 | `pending_payment` | `confirmed` | PayPal capture completed | webhook | **Only server-side code confirms (`mark_paid`, service role), triggered by the signature-verified webhook or by the reconcile job reading PayPal's API. Never the browser, never the redirect.** Idempotent on replay. Closing the browser after paying still confirms. A wrong amount is recorded but does not confirm (section 5). |
| T6 | `pending_payment` | `confirmed` | Check or cash received | TD | TD marks received with a note (who, check number or "cash"); amount must equal the amount due. Audit-logged. |
| T7 | `pending_payment` (PayPal) | `expired` | No capture within the expiry window | system (`expire_holds`) | `online_hold_minutes`, default 30, swept by a scheduled job. Slot released; a TD may then offer it to the waitlist (T11). Late webhook after expiry: see section 5, "paid after expiry". |
| T8 | `pending_payment` (check/cash) | `expired` | Check/cash not received by its hold date | TD (confirm), system (reminder) | Hold date is **OPEN QUESTION** (schema default: the entry deadline). System emails a reminder to the TD; the TD decides to release. Never auto-released silently because mail can be slow (`expire_holds` skips check/cash). **Gap:** the release function does not exist yet. |
| T9 | `pending_payment` or `waitlisted` | `withdrawn` | Player cancels their own unpaid entry | player | Intended: immediate, no approval needed, nothing to refund. **Gap:** `02-schema.sql` has no such function; today `request_withdrawal` also covers unpaid entries and goes to Anne/Bill. OPEN QUESTION: add the self-cancel function, or keep approval for everything. |
| T10 | `confirmed` | `confirmed` (open `withdrawals` row, `status = requested`) | Player taps "Request withdrawal" | player | `request_withdrawal`. Entry stays `confirmed` and keeps its slot until decided. Anne or Bill are emailed. Player sees "Request received". |
| T10a | `confirmed` (request open) | `withdrawn` | Anne/Bill approve | Anne or Bill (`can_refund`) | `approve_withdrawal` with the refund amount they choose (the event's rule only suggests one; 0 is allowed). Slot is released. If an amount is due, `refund_status = due`; Anne/Bill issue it by hand in PayPal (deep link to the transaction) or by check, then record it with `record_refund_issued` (`issued`). The app does not call PayPal to refund in v1. |
| T10b | `confirmed` (request open) | `confirmed` | Anne/Bill decline | Anne or Bill (`can_refund`) | `reject_withdrawal`; request closed, player told why (required text). |
| T11 | `waitlisted` | `pending_payment` (or `confirmed` if free) | A slot opens | TD (manual in v1) | Offer emailed with a time limit **(OPEN QUESTION: how long)**. If the player does not respond, the next person is offered. The schema promotes nothing automatically; auto vs TD-approved promotion is **OPEN QUESTION**, and the promote function does not exist yet. |
| T12 | `waitlisted` | `withdrawn` | Player leaves list, or declines offer | player | |
| T13 | any active state | `cancelled` | Event cancelled | admin only | See section 5. **Gap:** no cancel function yet. |
| T14 | `confirmed` | `cancelled` | TD/admin removes a paid entry (e.g. ineligible, duplicate) | TD/admin | Reason required. A refund, if any, is decided and recorded by Anne or Bill as in T10a. **Gap:** no remove function yet. |
| T15 | `withdrawn`, `expired`, `cancelled` | `pending_payment` / `confirmed` | Player re-enters | player / TD | Creates a **new** entry row; the old one stays as history. Never reuse an ended row. |
| T16 | `withdrawn` (`refund_status = due`) | `withdrawn` (`issued`) | Anne/Bill send the refund in PayPal | Anne or Bill | They record it by hand with the PayPal refund id (`record_refund_issued`). Audit-logged. A refund webhook that cross-checks this is a later addition; until then the reconcile report flags refunds in PayPal that are not recorded. |

Not allowed: moving to `confirmed` from the browser redirect; deleting an entry (states only change, rows stay); reviving an `expired`, `withdrawn` or `cancelled` entry (a late payment is recorded and sent for review, section 5).

Every transition writes an audit row (who, when, before, after) per the PRD's append-only audit table.

### State diagram

```
 draft --submit, room, fee--> pending_payment --verified PayPal capture / TD marks check--> confirmed
   |                              |  \--online hold runs out--> expired                      |
   |                              |  \--player cancels (gap, T9)--> withdrawn               |--player asks, Anne/Bill approve--> withdrawn (refund tracked on the withdrawal)
   |--submit, free--> confirmed   |                                                         |--TD removes--> cancelled
   |--submit, full--> waitlisted --slot opens (TD)--> pending_payment (or confirmed if free)
                          \--leaves--> withdrawn

 any active state --event cancelled--> cancelled   (confirmed ones then owe a refund)
```

## 3. Screens per state

Player side is in the app and on the event page. TD side is the TD console.

| State | Player sees | TD sees | Actions available |
|---|---|---|---|
| `draft` | Entry form (section 4), "Save and finish later" | Nothing | Player: submit, discard |
| `pending_payment` (PayPal) | "Finish paying" screen with PayPal button (Apple Pay / Google Pay show where the device supports them); countdown to expiry | In entries list as "Payment pending" | Player: pay, cancel (gap, T9). TD: cancel entry |
| `pending_payment` (check/cash) | "We have your entry. Send $X to [payee, address] by [date]" with `check_payable_to` and `check_mail_to` from the event. Reference code to write on the check. **Privacy check:** today's `mailTo` is a private home address (Anne Nunes on most events); confirm she agrees, or use a division PO box | "Awaiting check/cash" queue with a one-tap "Mark received" and note field (amount must match) | Player: cancel (gap, T9), switch to PayPal (gap: no function yet). TD: mark received, release (gap) |
| `confirmed` | Confirmation, receipt, partner details, "Request withdrawal" | Normal entry row, payment method and amount | Player: request withdrawal, edit partner/names before deadline. TD: edit, remove, refund |
| `confirmed` with withdrawal requested | "Withdrawal requested, waiting for approval" | Approvals queue for Anne/Bill: player, amount, rule that applies, suggested refund | TD: approve (full/partial/none), decline with reason |
| `waitlisted` | "You are #N on the waitlist. You have not been charged." | Waitlist tab, ordered | Player: leave. TD: promote (gap: no function yet), reorder (OPEN QUESTION whether reorder is allowed) |
| `withdrawn` | "Your entry was cancelled" and "Enter again" if still open; if a refund is due, "Refund pending" | Greyed in history; refund-due list for Anne/Bill | Player: re-enter. Anne/Bill: record refund |
| `expired` | "Your payment was not finished, so we have not entered you. You have not been charged." and "Enter again" | Greyed in history | Player: re-enter |
| `withdrawn` with `refund_status = issued` | "Refunded $X on [date]" (no PayPal transaction number is shown to the player) | Row with refund amount and who approved | None |
| `cancelled` | "Event cancelled" banner; refund status line | Same banner, bulk refund list | Anne/Bill: work through refunds |

Public view (all visitors): player names and clubs (and position), count of confirmed entries, waitlist shown separately. No emails, phone numbers, member ids or payment data.

## 4. The entry form (the draft state)

| Step | What |
|---|---|
| 1 | Sign in by email link (restores draft). |
| 2 | Player slots from `format`: singles 1, pairs 2, triples 3, fours 4. Labels from `paypal.playerLabels` where present (Skip/Vice/Lead), else default position names. Formats `2+2` (Waterbury club entry: two teams) and `rinks` (blank in data for several events) need a hand-written rule: **OPEN QUESTION**. Blank `format` on 3 events: also OPEN QUESTION, TD must fill in before entries can open. |
| 3 | Each slot: search members (name + club), or free text for non-members. |
| 4 | Eligibility check using the event's rules (mixed pair, novice, vet). Failures block submit with plain wording. |
| 5 | Choose how to pay: PayPal / Apple Pay / Google Pay, or check or cash. Show the fee and what it covers (`$45/team` vs `$15/player`). |
| 6 | Review and submit. |

Fee is stored as a number plus a unit (per team / per player). Today's `fee` is free text ("$120 per team", "$30 per player", "TBD", empty), so migration must parse these and flag anything it cannot parse.

## 5. Edge cases

| Case | Behaviour |
|---|---|
| **No deadline** (11 of 51 events have none, mostly external-style) | Entries stay open until the TD closes them or the event starts. TD sees a warning when opening an event with no deadline. Withdrawal with no deadline: refund rule still applies as configured; with no rule configured, **OPEN QUESTION**: default to "ask Anne/Bill, no automatic promise". |
| **Deadline passed** | Entry form closes, shows "Entries closed on [date]" and the TD contact. Existing entries unchanged. Player withdrawal requests still go to Anne/Bill (rule text often reads "no refunds after" the deadline, so likely $0 back; Anne/Bill still decide). |
| **Cap reached, waitlist** | Cap is `max_entries`, counted on `confirmed` + live `pending_payment` holds. A held `pending_payment` slot counts (`slots_taken`), so abandoned online checkouts must expire (T7) or they block others; check/cash holds count until the TD releases them (T8). Waitlist is first come, first served by submit time (the schema has no waitlist position column yet). Events with a stated cap today: Cambria Open Pairs (16 teams); cap for others is not in the data, so default is no cap unless a TD sets one. |
| **Duplicate entries (same player)** | Warn, don't silently block: a member already in another active entry of the **same event** gets a warning ("Phil is already entered with Dee"). Hard block when it is the same person in the same position twice in one entry. Whether one person may legitimately be in two entries (e.g. different divisions of one event) is an **OPEN QUESTION**; default is warn plus require TD override. |
| **Partner already entered** | If the partner is in another active entry, show who with, and offer: choose a different partner, or message that entry's submitter. Do not move people between entries automatically. One entry per team, submitted by one person; the partner receives an email copy of the confirmation only when the partner is a linked member whose email the server can look up (the schema stores no email for a player; free-text players get none). Whether the partner must also accept is **OPEN QUESTION** (default: no, submitter is trusted, partner can object to a TD). |
| **Partner not yet a member / not in the roster** | Free-text name is allowed (member_id empty). Entry is accepted but flagged "unverified player" for the TD. |
| **Member vs non-member** | Two things differ: eligibility and fee. Whether non-members may enter at all, whether they pay a different fee, and whether Bowls USA dues are checked: **OPEN QUESTION** (not in events data). Member check uses the existing roster fields (`swDuesPaid`, `usaDuesPaid`, `noviceUntil`). Dues status is shown to the TD as a flag, not used to block, until the rule is confirmed. |
| **Other division or other country** | Players from another division/club are allowed to be entered if the event rules allow (several events say "SWD & Open"). Event gets an `open_to` setting: `swd_only` / `any_division` / `invitational`. Non-US players have no US roster record, so they enter as free-text non-members. Whether international entries pay the same fee and which Bowls rules apply: **OPEN QUESTION**. |
| **Free event (fee 0 or blank)** | Skips payment: T3 straight to `confirmed`. A blank `fee` in the data (5 events) is **not** treated as free; it is treated as "fee not set" and entries stay closed until the TD sets it. |
| **Event cancelled** | Event state moves to cancelled (PRD: admin only). All active entries become `cancelled`. Unpaid ones simply end. Paid ones appear on a refund list for Anne/Bill with PayPal transaction links. The amount is decided by Anne/Bill; a full refund is the proposed default but **not yet decided** (OPEN QUESTION). Players emailed. Rows stay for the record. |
| **TD late-entry override** | After the deadline or at cap, a TD can add an entry on behalf of a player: flag `late_override = true`, reason required, audit-logged. Can be added directly as `confirmed` (check/cash/waived) or as `pending_payment`. **Gap:** no function or column for this yet. Override at cap lets the event exceed `max_entries`; screen shows "over cap by N". |
| **Paid after expiry** | PayPal webhook arrives for an entry already `expired` by T7. `mark_paid` records the payment but does **not** revive the entry and returns `needs_review`. Anne/Bill then either restore the entry (if a slot is free; function still to be written) or refund, and the player is emailed. Money is never kept without a decision on the entry. |
| **Cap filled during checkout / amount does not match** | Payment is recorded. If the event filled while the player was paying, the entry becomes `waitlisted` with `needs_review`. If the captured amount differs from the amount due, the entry is **not** confirmed and is flagged. Either way Anne/Bill decide: confirm, promote or refund. |
| **Double-click / double payment** | One PayPal order per entry. A second capture for an already-paid entry is recorded (never dropped: the money moved), flagged `needs_review`, and goes to the refund list for Anne/Bill. |
| **Partial refunds** | Refund amount can be less than paid (e.g. keep a fee). `withdrawals.refund_cents` is stored and `payments.status` becomes `partially_refunded`; the entry is `withdrawn`. The rule that decides amounts is TBD. |
| **Fee changes after entries exist** | Existing entries keep the price they were charged. Only new entries use the new price. |
| **Cash/check goes missing** | T8 reminder to the TD, who can release the slot; entry history stays. A bounced check needs the payment set to `voided` and the entry returned to `pending_payment` (function still to be written). |
| **Edits after payment** | Swapping a partner before the deadline: allowed, no state change, audit-logged. After the deadline: TD only. Price-affecting edits (e.g. team to pair): TD only. |
| **Pending-payment player pays by a different route** | Intended: player switches PayPal to check/cash (or reverse) while `pending_payment`, and the old PayPal order is voided. **Gap:** no function to change `payment_choice` or void an order yet. |

## 6. Payment methods and how they touch the states

| Method | Created at | Becomes `confirmed` when | Needs from us | Open |
|---|---|---|---|---|
| PayPal (existing SWD account) | T2 | Webhook `PAYMENT.CAPTURE.COMPLETED` (or reconcile job) | Orders created server-side; PayPal gets only entry id, amount and event title; webhook signature checked | Need the PayPal developer app and webhook set up under SWD's account, not Giulia's. Who holds the login: **OPEN QUESTION** (ties to succession doc: "Division PayPal: assumed yes"). |
| Apple Pay / Google Pay | T2 | Same webhook | Offered through PayPal's checkout; no extra code from us | Whether PayPal shows them for SWD's account type and for the web checkout we use: needs checking in the PayPal dashboard. **OPEN QUESTION.** |
| Check | T2 | TD marks received (T6) | `check_payable_to` and `check_mail_to` per event | Today `payableTo` exists on 1 event and `mailTo` only on events that have a `contact` block. Privacy of a home `mailTo`: see section 3. |
| Cash | T2 | TD marks received (T6) | Where/when to hand it over | Often handed over at the venue; may mean the entry is held until check-in. **OPEN QUESTION.** |
| Free | T3 | Immediately | Nothing | |

Apple's in-app purchase rules may affect payment inside an iPhone app. Not resolved; fallback is to open payment in the browser. Does not change the states, only the screen that hosts the pay button.

## 7. Withdrawal and refund rules (placeholder)

The rule text is **TBD**. The system is built so that it can be filled in later without code changes.

| Setting (per event) | Meaning | Value today |
|---|---|---|
| `events.refund_policy_text` | Free text shown to the player | Many events say "no refunds after [deadline]" in the `deadline` field; others say nothing. |
| `events.withdrawal_rule.full_refund_until` | Date/time until which the suggestion is a full refund | **OPEN QUESTION** |
| `events.withdrawal_rule.refund_percent_after` | Percent suggested after that date (0 = none) | **OPEN QUESTION** (likely 0, per text above) |
| Fee kept (PayPal or admin fee) | Not a schema field yet; Anne/Bill type the amount | **OPEN QUESTION** |
| Who approves | Anne and Bill (`can_refund`) | Decided |
| Whether players may request withdrawal at all | Not a schema field; today every entry can request | **OPEN QUESTION** |
| Replacement partner | Withdrawing player finds a replacement instead of withdrawing | **OPEN QUESTION** |

The rule only ever **suggests** an amount to Anne or Bill. Nothing is refunded automatically and no one is promised a refund by the app until the rule text is filled in.

Until rules are set, every request goes to Anne/Bill with no suggested amount.

## 8. What the 5 registration styles in events-data.json become

Counts are from the 51 events in `events-data.json` (`paypal.system`, and `registrationUrl`).

| # | Style today | How to tell | Count | What the player does today | Becomes in the app |
|---|---|---|---|---|---|
| 1 | **Classic** hosted PayPal button | `paypal.system = classic`, has `hostedButtonId`, `price` | 2 | Click a PayPal button; names typed in a PayPal field (the 127-char limit) | Standard entry form + PayPal order. `hostedButtonId` kept only in `legacy_paypal_button`; price becomes `fee_cents`. |
| 2 | **Modern** generated PayPal button | `system = modern`, `buttonName`, `price`, `containerSuffix`, sometimes `playerLabels` (Skip/Vice/Lead) | 10 | Fill player fields on the page, pay in PayPal; data squeezed into `custom_id` | Same entry form. `playerLabels` become the player position labels. `price` becomes `fee_cents`. |
| 3 | **Embed** pasted PayPal HTML | `system = embed`, raw `html` with a `hosted_button_id` | 18 | Pay with a pasted form; one text box ("Player Name") | Same entry form. Raw HTML is discarded; fee is read from `fee` text (needs parsing and a human check, since the price is not in a field here). |
| 4 | **External link** | `system = none` plus `registrationUrl` (Google Form or a club's own site) | 3 | Leave our site, register elsewhere (Cambria Open Pairs, Eileen Morton Powerplay, Laguna Open Pairs) | Event keeps an "Enter on [site]" mode: no entry rows, no payment from us. Optionally later: TD brings the entries in by import. The event page says plainly the entry is handled elsewhere. Whether hosting clubs want to move onto in-app entry is **OPEN QUESTION**. |
| 5 | **Contact / mail-in only** | `system = none`, no `registrationUrl`; relies on `contact` (name, phone, email, `mailTo`, sometimes `payableTo`) and sometimes `registrationInstructions` | 18 | Phone/email the TD, send a check by mail | Pay-by-check-or-cash path: online form creates a `pending_payment` entry and emails the TD; TD marks received. Old contact details become the "send your check to" block. |

Counts add up to 51 (2 + 10 + 18 + 3 + 18). No event has both a PayPal system and a `registrationUrl`. A migration script must still report the exact assignment per event rather than trust these counts.

- `paypal-test-coronado` ($1.00 test event) is a test, not a style: delete from migration, but keep as a safe sandbox event for trying payments.
- 5 events have a blank `fee` and 11 have no `deadline` (12 counting the test event): they cannot open for entry until a TD fills them in (see section 5).

### What carries over, field by field

| events-data.json field | Becomes |
|---|---|
| `format` | team size + position labels (blank or `2+2`/`rinks`: manual) |
| `fee` (text) | `fee_cents` + `fee_unit` (parsed, human-checked) |
| `deadline` (text) | `entry_deadline` + `refund_policy_text` (e.g. "no refunds after") |
| `paypal.price` | `fee_cents` where present |
| `paypal.playerLabels` | position labels |
| `paypal.hostedButtonId` / `html` / `buttonName` / `containerSuffix` | not used by the entry system; kept in `events.legacy_paypal_button` for the transition, then archived |
| `registrationUrl` | external-entry mode or "More information" link |
| `registrationInstructions` / `registrationLabel` | player-facing instructions text |
| `contact` (name, email, phone) | `td_contact_*`: the contact shown to players and an address the check/cash entry email goes to, in addition to the TDs assigned in the `tds` table (see section 9) |
| `contact.mailTo`, `contact.payableTo` | `check_mail_to`, `check_payable_to` ("Send your check to" block; see the home-address privacy check in section 3) |
| `entries.pubUrl` | retired: replaced by the public list from the database. Old Google Sheet kept read-only as history. |

## 9. Emails (who gets what)

| Event | To | Content |
|---|---|---|
| Entry saved (check/cash) | TD (contact on event) and player | Entry details, amount owed, address |
| Paid | Player, partner(s) | Receipt and entry details |
| Waitlisted / offered a slot | Player | Position / offer with time limit |
| Withdrawal requested | Anne, Bill (`can_refund`) | Link to approvals queue |
| Withdrawal decided | Player | Approved with refund amount, or declined with reason |
| Event cancelled | All entrants | Cancellation and refund plan |

Which address sends these (an SWD address, not a personal one) and who is copied: **OPEN QUESTION**. Who counts as "the TD" for email: the schema keeps two things, the assigned TDs (`tds` table, people with a sign-in) and the display contact (`events.td_contact_*`, from `contact`). Check/cash and withdrawal-request emails go to **both**; the player-facing reply-to is the display contact. In `events-data.json` the `contact` name is Anne Nunes on 18 events and Bill Brault on 8, but also 8 other people on 10 events, a club name on 2, and blank or missing on 13. Those other contacts will receive emails and have no sign-in, so every event needs at least one assigned TD before entries open. OPEN QUESTION: confirm.

## 10. Open questions (summary)

1. Withdrawal and refund rules: allowed or not, amounts before/after deadline, fee kept, replacement partner. Per event or division-wide default?
2. Cash handling: at the venue only, or also by hand to a TD earlier?
3. Hold time for check/cash before the slot is released.
4. Waitlist: how long a promoted player has to respond; automatic or TD-approved promotion; may TDs reorder?
5. Non-members and other divisions or countries: allowed? same fee? roster/dues checks block or only flag?
6. May one person be in two entries of the same event (different divisions)?
7. Must a partner confirm the entry?
8. Format rules for `2+2` (club entry of two teams) and `rinks`; 3 events with blank format.
9. Cap sizes: only one event states a cap today.
10. (Resolved by the data: no event mixes PayPal and an external link today; if one does later, the in-app form wins.)
11. Do hosting clubs with their own sign-up pages want to move onto in-app entry?
12. PayPal: developer app and webhook under SWD's account; who holds the login; whether Apple Pay and Google Pay show for that account.
13. Sender address for entry emails and who is copied.
14. Which TDs besides Anne and Bill, and who may approve withdrawals for events they don't direct. Is Bill the same Bill Brault named in the PRD and on 8 events? Can Giulia (admin) also refund?
15. Home address in `contact.mailTo` shown to players: keep or replace with a division address.
16. Full refund on event cancellation: confirm.

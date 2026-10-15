# 03 - Payments (SWD PayPal)

Status: design draft. Nothing here is built or connected. No secrets or real ids appear in this file.
State, column and role names follow `02-schema.sql`.

## 1. Decisions already made

| Decision | Source |
|---|---|
| Money goes to SWD's own, existing PayPal account, not the LLC | Giulia |
| Keep PayPal; existing buttons keep working on current events until an event moves to in-app entry (in-app-entry events use server-created orders in the same account, not the hosted buttons) | Giulia, PRD sec. 7 |
| Card data never touches our servers or database | Giulia |
| Apple Pay and Google Pay are offered through the processor | Giulia |
| Pay by check or cash: emails the TD, entry held as `pending_payment` (`payment_choice` = check or cash) | Giulia |
| Refunds are done by Anne and Bill, by hand in PayPal (or by check/cash); the app records them. No automatic refunds, no refund API calls in v1 | Giulia |
| Withdrawal: player requests in app, Anne or Bill approve and refund; rules set per event | Giulia |
| Withdrawal rule text | **OPEN QUESTION: unknown, TBD** |
| Pilot event | None chosen yet |

## 2. Architecture in one paragraph

All player data is written to Postgres first, as an `entries` row in `pending_payment`. PayPal only ever sees the `entry_id` (in `custom_id` and `invoice_id`), the amount and the event title, and no player data. The server creates the order and the server captures it, but an entry becomes `confirmed` only when server-side code (`mark_paid`, service role) records a capture that was verified with PayPal: the signature-checked webhook, or the reconcile job reading PayPal's API. The capture request, the browser or the app never decides that someone has paid.

## 3. PayPal Orders v2 with Apple Pay and Google Pay

| Step | Who | What |
|---|---|---|
| 1 | Server | Re-read the event fee from the database (never from the client). Compute amount. Create order via `POST /v2/checkout/orders` with `intent=CAPTURE`, one purchase unit, `custom_id = entry_id`, `invoice_id = entry_id`, description with event title only. Send a `PayPal-Request-Id` header equal to a stable value (`entry_id` + attempt number) so retries return the same order. |
| 2 | Client | Render PayPal JS SDK components: PayPal button, Apple Pay button, Google Pay button, all pointed at the server-created order id. The client never sets amount. |
| 3 | Wallet/PayPal | Customer approves. Card and wallet data go to PayPal/Apple/Google only. |
| 4 | Client | On approval, call our `POST /api/payments/capture` with the order id only. |
| 5 | Server | Look up the order id in our `payments` table, confirm it belongs to that entry and that the signed-in user owns the entry, then `POST /v2/checkout/orders/{id}/capture`. Compare returned amount, currency, and `custom_id` with the database. Mismatch means: record the payment, do not confirm, flag it for Anne or Bill (this is what `mark_paid` does for PayPal payments). |
| 6 | Server | Return "We are checking your payment" to the client. Do **not** confirm here. |
| 7 | PayPal | Webhook `PAYMENT.CAPTURE.COMPLETED` (signature verified, then the capture is re-read from the PayPal API) triggers `mark_paid`: payment `paid`, entry `confirmed` (or `waitlisted` with `needs_review` if capacity was reached; checked inside one transaction), receipt sent. If the webhook never arrives, the reconcile job (section 10, and the status job in section 11) finds the completed capture and calls the same `mark_paid`. `mark_paid` is idempotent on `paypal_capture_id`, so whichever path lands first wins and the other is a no-op. |

Apple Pay and Google Pay notes:

| Item | Detail |
|---|---|
| Availability | Apple Pay and Google Pay through PayPal are part of PayPal's card-processing product. **OPEN QUESTION: does SWD's PayPal business account have it enabled, and is the account eligible? Must be checked in the PayPal dashboard by the account owner.** |
| Apple Pay setup | Requires the entry-system domain to be registered and verified with PayPal for Apple Pay. Done by the PayPal account owner. |
| In a native app | Wallet buttons inside an embedded web view may not work or may be restricted. **OPEN QUESTION: test on real devices before promising.** Fallback is section 10. |
| If not available | Standard PayPal button (PayPal balance, PayPal guest card checkout) still works with no extra setup. |

## 4. Server rules (non-negotiable)

| Rule | Why |
|---|---|
| Amount, currency, and fee come only from the database | Client values can be edited |
| Never mark paid or confirm on a client redirect, client callback or the capture request itself | Browser can lie or die |
| Verify webhooks with PayPal's verify-webhook-signature API (or local verification) using the webhook id stored in server environment variables | Anyone can POST to a public URL |
| Idempotency, layer 1: `PayPal-Request-Id` on create and capture calls | Safe retries |
| Idempotency, layer 2: unique constraint on `paypal_capture_id` (and `paypal_order_id`) | Webhook replays cannot double-record. A second, different capture for an entry that is already paid is recorded and flagged for refund, never dropped, because the money did move |
| Idempotency, layer 3: webhook events stored by PayPal event id; seen id means return 200 and stop | PayPal retries on non-2xx |
| Always return 200 quickly to webhooks once the event is stored; process after | Avoid retry storms |
| Fetch the order or capture from PayPal API on webhook receipt instead of trusting the payload body | Defense in depth |
| Secrets live only in server environment variables, never in the repo, logs, or `raw_webhook` | Rotation and leak safety |
| Store raw webhook payloads in `raw_webhook` with no card data (PayPal does not send any) | Audit |
| Payments table is written only by the server role, never by the client | Row-level security |
| Every status change writes an audit row (who, when, before, after) | Accountability |

## 5. Entry and payment states

| Entry status | Meaning | Moves to |
|---|---|---|
| `pending_payment` | Saved, not paid | `confirmed`, `expired` (online hold ran out), `withdrawn` |
| `confirmed` | Paid online, or TD marked check/cash received | `withdrawn` (approved withdrawal), `cancelled` (event cancelled or entry removed) |
| `waitlisted` | Event full. Normally no money taken. If the event filled while the player was paying, the payment is recorded and the entry waits here with `needs_review` | `pending_payment` / `confirmed` (promoted), `withdrawn` |
| `withdrawn` | Withdrawal approved (or unpaid entry cancelled). Refund, if any, is tracked on the withdrawal | end |
| `expired` | Online hold ran out, or a check/cash hold was released by the TD | end |
| `cancelled` | Event cancelled, or entry removed by a TD/admin | end |

There is no `refunded` entry status: refunds live on `withdrawals.refund_status` and `payments.status`. See `01-entry-flow.md` for the full transition table.

Payment status: `created`, `paid`, `failed`, `partially_refunded`, `refunded`, `voided` (a payment recorded in error, e.g. a bounced check; kept, never deleted). This follows `02-schema.sql`. An abandoned PayPal order stays `created`; there is no `expired` payment status (the PRD has one; the PRD is stale).

## 6. Check and cash path

| Step | Detail |
|---|---|
| Player choice | At payment step: "Pay online" or "Pay by check or cash". Show the event's `check_payable_to`, `check_mail_to` and the deadline. Privacy check: today's `mailTo` is often a private home address; confirm with its owner or use a division address. |
| On submit | Entry saved as `pending_payment` with `payment_choice` = `check` or `cash` (the player picks one). No `payments` row is created until the TD records money received. |
| Emails | To the TD (the assigned TDs and the event's display contact `td_contact_email`): player names, amount due, entry id. To the player: instructions, amount, payee, deadline, and the line "Your spot is not confirmed until payment is received." |
| TD action | TD opens the entry, marks "Payment received", picks check or cash, enters check number or note (required), then the entry becomes `confirmed` (`mark_paid`; the amount must equal the amount due) and a receipt is emailed. Audit row written. |
| Hold rule | Draft default (`slots_taken`): a pending check/cash entry holds a spot and counts toward `max_entries` until the entry deadline (`offline_hold_hours` can shorten it). Whether that is right is an **OPEN QUESTION**. It never expires silently: the TD is reminded and decides to release it (release function not written yet). |
| Bounced check | Needs the payment set to `voided` and the entry returned to `pending_payment` with a note; **no function for this exists yet** (`02-schema.sql` open question 19). Policy on bounced checks: **OPEN QUESTION.** |
| Day-of cash | TD can add or mark an entry paid on site. Same screen. |

## 7. Fees and who bears them

| Item | Status |
|---|---|
| PayPal processing fee on each online entry (a percentage plus a fixed amount, rates set by PayPal and SWD's account type) | Not stated here; check SWD's actual rate and any nonprofit rate. **OPEN QUESTION** |
| Does SWD absorb the fee, or add a surcharge for online payment? | **OPEN QUESTION: Giulia / SWD board** |
| If a surcharge: is it allowed on the PayPal and card rules, and is it shown before payment? | **OPEN QUESTION** |
| Are fees refunded to the player on a refund? (PayPal may not return its original fee on refunds, in which case SWD would bear it; unverified.) | **OPEN QUESTION: confirm against current PayPal fee terms** |
| Currency | USD assumed. |

## 8. Receipts

| Item | Design |
|---|---|
| Sent when | Payment captured (online) or TD marks received (check/cash) |
| Contents | Event title and date, all player names, amount paid, method, date, entry id, refund rule text for the event, SWD contact |
| Sender | entry email service, from an SWD address. **OPEN QUESTION: which sending address and domain.** |
| Also | PayPal sends its own receipt to online payers; ours is the one that lists players |
| Tax wording | Entry fees are not described as donations. **OPEN QUESTION: whether SWD wants any tax statement on receipts.** |
| Resend | Player can re-view receipt in "My entries"; admin can resend |

## 9. Withdrawals and refunds

### Player withdrawal request (in app)
Player opens "My entries", taps "Ask to withdraw", sees the event's rule text, confirms. Entry shows "Withdrawal requested". Anne or Bill are notified. The app shows the rule text but does not promise a refund: until the rule is filled in it says the director will decide.

### Rules, configurable per event
Stored on the event; the app displays and applies them. Nothing is hardcoded.

| Field (`events` column) | Meaning |
|---|---|
| `refund_policy_text` | Shown to the player verbatim |
| `withdrawal_rule.full_refund_until` | Date/time until which the suggested refund is the full amount paid |
| `withdrawal_rule.refund_percent_after` | Percent suggested after that date; 0 = none |
| Current examples from the site | Mix/Match Triples: "no refunds after" the Friday deadline. Other events: not yet reviewed. |

The rule only suggests an amount to Anne or Bill; they type the final amount. There is no automatic approval or refund. (The PRD's "self-service until the deadline" is not used.)

**The actual SWD withdrawal and refund rules are unknown. OPEN QUESTION: Anne and Bill to supply, per event or as a default.** Until then the app shows "rule text to be added by the director" as a hard stop and Anne or Bill decide each case.

### Refund screen (Anne or Bill only)

| Capability | Detail |
|---|---|
| Who | A division admin, or a TD whose `tds.can_refund` flag is set. Anne and Bill hold this; other TDs can view and recommend but not approve or record refunds. **OPEN QUESTION: are Anne and Bill admins, or TDs with `can_refund`? Can Giulia (admin) refund too? The PRD still says TDs request and admins issue.** |
| Queue | List of withdrawal requests and TD-requested refunds, oldest first |
| Action | Approve with an amount (full, partial, or 0; max = received minus already refunded), reason or note required (`approve_withdrawal`), or reject (`reject_withdrawal`) |
| Online payments | **v1: by hand.** The screen shows the PayPal transaction and an "Open in PayPal" link; Anne or Bill press Refund in SWD's PayPal account, then record the PayPal refund id with `record_refund_issued`. Our server holds no refund permission and calls no refund endpoint. A later version may call `POST /v2/payments/captures/{capture_id}/refund` after approval (**OPEN QUESTION**, needs a separate decision because the app would then move money); the `PAYMENT.CAPTURE.REFUNDED` webhook would then cross-check the record. |
| Check/cash payments | Admin records "refunded by check/cash", method, reference. No API call. |
| Safeguards | Confirm dialog showing player, amount, and payment method. Two clicks max. Cannot refund more than remaining (checked in the database). One open withdrawal request per entry. Each decision and each recorded refund writes an audit row. The reconcile report (section 10) flags a refund made in PayPal that was not recorded, and one recorded here that PayPal does not show. |
| Window | PayPal refunds are limited in time after capture (commonly 180 days). **OPEN QUESTION: confirm current limit.** After it, refund by check. |
| Separation | The same person may approve and record a refund for now (two people, small org). **OPEN QUESTION: need a second approver for large amounts?** |
| Event cancelled by SWD | Bulk refund list for the event: Anne or Bill work through it one entry at a time in PayPal, recording each (no bulk automatic refund). The amount (full by default?) is an **OPEN QUESTION**. |

## 10. Reconciliation

| Check | How often | What it does |
|---|---|---|
| Daily job: list PayPal transactions for the day (Transaction Search API) and match on `custom_id` to our `payments` | Daily, plus a button on the admin screen | Reports: paid at PayPal but not in our system; in entry system but not at PayPal; amount mismatch; refunded at PayPal but not in our system |
| Event close-out report | On demand | Entries, collected online, collected check/cash, refunded, net, outstanding pending |
| Export | CSV for the treasurer | Date, entry id, event, payer name, method, gross, refund, net |
| Money in transit | None; PayPal pays out to SWD's bank on its own schedule | Bank link stays in PayPal, not in our system |
| Who sees it | Anne, Bill, and treasurer (**OPEN QUESTION: who is the treasurer and do they get a login?**) |

Transaction Search API may need to be enabled for the PayPal app and has a delay before transactions appear. **OPEN QUESTION: confirm availability on SWD's account.**

## 11. Failure cases

| Case | Behavior |
|---|---|
| Payment succeeded, webhook late or missing | The player sees "We are checking your payment" and an email follows. A "payment status" job re-reads the order from PayPal every few minutes for up to an hour and, if the capture completed, calls the same `mark_paid`; otherwise it raises an alert for Anne/Bill. |
| Player closed the browser after paying | Webhook confirms the entry; player gets the receipt email. My entries shows Confirmed. |
| Double click or two tabs | Same entry id gives the same order (request id) and a unique `payments` constraint. Second capture returns the existing result. |
| Player pays twice anyway (two orders) | Second capture is recorded as a duplicate for an already-paid entry (`needs_review`); flagged for Anne/Bill to refund; entry not duplicated. |
| Abandoned checkout | Entry stays `pending_payment` for the hold time (`online_hold_minutes`, default 30; **OPEN QUESTION: hold time**), then `expire_holds` marks it `expired` and releases the spot. No reminder email in v1 (none is written in `05`). The order is left unpaid and the server rejects a capture on an expired entry (and voids the order); if money still arrives it is recorded and reviewed (`01`, "paid after expiry"). |
| Capacity filled during checkout | Capture happens, then entry becomes `waitlisted` with `needs_review`; Anne/Bill see it and can refund or promote. **OPEN QUESTION: waitlist rule.** |
| Payment declined | Show PayPal's message, entry stays `pending_payment`, player can retry or choose check/cash. |
| Dispute or chargeback | Webhook `CUSTOMER.DISPUTE.CREATED` creates an alert for Anne/Bill; the entry's state does not change automatically; handled in PayPal's resolution center by the account owner. |
| Amount mismatch on capture | Payment recorded, entry not confirmed, flagged; Anne/Bill decide. |
| Webhook signature invalid | Reject with 400, log, no state change. |
| PayPal outage | Entry stays saved; player is offered check/cash; retry later. |
| Event fee changed after an order was made | Server compares order amount to the current fee and creates a new order if different. |

## 12. App Store and Google Play

### Apple (guideline 3.1.3(e), "Goods and Services Outside of the App")
The guideline says apps that sell physical goods or services consumed outside the app must use payment methods other than in-app purchase. A real-world tournament entry plausibly fits, but **it is unconfirmed that Apple treats event entry fees as such. Do not rely on this until Apple confirms.** The text of the current guidelines must be re-read at submission time. **OPEN QUESTION: Giulia or app owner to send the question below.**

(Describe the organization's legal status, for example non-profit, only after it is confirmed. Do not assert it here.)

Exact question to ask Apple App Review (via App Store Connect "Contact Us" or a pre-submission review note):

> Our app lets members of a sporting organization (the Southwest Division of Bowls USA, lawn bowls) enter in-person tournaments held at physical bowling greens, and pay the entry fee by PayPal, Apple Pay or Google Pay. The fee is paid to the sports organization for participation in a live, in-person event. No digital content, features, or subscriptions are unlocked in the app by the payment. Does this fall under App Review Guideline 3.1.3(e), Goods and Services Outside of the App, so that the in-app purchase is not required for these entry fees? If not, what would you require?

### Fallback if Apple says no, or until answered
Open the hosted PayPal checkout page in the system browser (Safari View Controller / external browser) from the app, which is how PayPal works on the website today. The server flow is unchanged; only where the buttons render changes. The return link brings the player back to "My entries" and the webhook confirms the entry. Apple Pay inside that browser page is a web Apple Pay, not an app one.

### Google Play
Play's payments policy has a similar exemption for physical goods and services consumed outside the app. **OPEN QUESTION: confirm in the current Play Payments policy and the Data safety form before submitting.**

### Not decided
| Item | Status |
|---|---|
| Whether the first release has payment in the app at all, or only check/cash plus a link to the web checkout | **OPEN QUESTION** (lowest risk for review) |
| Who owns the developer accounts (SWD or LLC) | **OPEN QUESTION**, see `docs/succession-and-accounts.md` |

## 13. Transition from the current PayPal buttons

| Item | Detail |
|---|---|
| Existing events | `events-data.json` has `paypal.system` of `modern` (10 events), `classic` (2), `embed` (18, pasted PayPal HTML) or `none` (21). These stay as-is for current events. |
| In-app-entry events | An in-app-entry event with `fee_cents` replaces `paypal` in the page; the old block is hidden for it and kept in `events.legacy_paypal_button` so it can be switched back (rollback in `06`). |
| Old data | No migration of past payments; PayPal history and old sheets remain the record. |
| Fee strings | Today fees are text like "$45/team"; the entry system needs integer cents plus unit (team or player). |
| Per-event options | Some events have more than one price or add-on. **OPEN QUESTION: list them (lunches, banquet, side events).** |

## 14. Open questions summary

| # | Question | Owner |
|---|---|---|
| 1 | Is Apple Pay / Google Pay enabled on SWD's PayPal account? | PayPal account owner |
| 2 | Who bears the PayPal fee; surcharge or not? | Giulia / SWD board |
| 3 | Withdrawal and refund rules (default and per event) | Anne, Bill |
| 4 | Does a pending check/cash entry hold a spot; how long | Anne, Bill |
| 5 | Are Anne and Bill admins or TDs with `can_refund`; second approver for refunds; may Giulia refund | Anne, Bill, Giulia |
| 6 | Who is the treasurer and what access | Giulia |
| 7 | Apple 3.1.3(e) answer; Google Play equivalent | App owner |
| 8 | PayPal refund time limit, Transaction Search availability | PayPal docs / account owner |
| 9 | Add-ons and multiple prices per event | Anne |
| 10 | Receipt sender address; any tax wording | Giulia |
| 11 | Checkout hold time and waitlist rule | Anne, Bill |
| 12 | Bounced check policy | Anne, Bill |
| 13 | Should the server ever issue refunds through PayPal's API (not in v1) | Giulia |
| 14 | Home address in `check_mail_to`: keep or replace | Anne |

# 03 - Payments (SWD PayPal)

Status: design draft. Nothing here is built or connected. No secrets or real ids appear in this file.

## 1. Decisions already made

| Decision | Source |
|---|---|
| Money goes to SWD's own PayPal account, not the LLC | Giulia |
| Keep PayPal; existing buttons keep working until the Hub replaces them | Giulia, PRD sec. 7 |
| Card data never touches our servers or database | Giulia |
| Apple Pay and Google Pay are offered through the processor | Giulia |
| Pay by check or cash: emails the TD, entry held as `pending_payment` | Giulia |
| Refunds are done by Anne and Bill | Giulia |
| Withdrawal: player requests in app, Anne or Bill approve and refund; rules set per event | Giulia |
| Withdrawal rule text | **OPEN QUESTION: unknown, TBD** |
| Pilot event | None chosen yet |

## 2. Architecture in one paragraph

All player data is written to Postgres first, as an `entries` row in `pending_payment`. PayPal only ever sees the `entry_id` (in `custom_id` and `invoice_id`) and the amount. The server creates the order, the server captures it, and an entry becomes `confirmed` only from server-verified PayPal state. The browser or app never decides that someone has paid.

## 3. PayPal Orders v2 with Apple Pay and Google Pay

| Step | Who | What |
|---|---|---|
| 1 | Server | Re-read the event fee from the database (never from the client). Compute amount. Create order via `POST /v2/checkout/orders` with `intent=CAPTURE`, one purchase unit, `custom_id = entry_id`, `invoice_id = entry_id`, description with event title only. Send a `PayPal-Request-Id` header equal to a stable value (`entry_id` + attempt number) so retries return the same order. |
| 2 | Client | Render PayPal JS SDK components: PayPal button, Apple Pay button, Google Pay button, all pointed at the server-created order id. The client never sets amount. |
| 3 | Wallet/PayPal | Customer approves. Card and wallet data go to PayPal/Apple/Google only. |
| 4 | Client | On approval, call our `POST /api/payments/capture` with the order id only. |
| 5 | Server | Look up the order id in our `payments` table, confirm it belongs to that entry and that the signed-in user owns the entry, then `POST /v2/checkout/orders/{id}/capture`. Compare returned amount, currency, and `custom_id` with the database. Mismatch means flag for admin, do not confirm. |
| 6 | Server | Mark payment `paid`, entry `confirmed` (or `waitlisted` if capacity was reached; checked inside one transaction), send receipt. |
| 7 | PayPal | Webhook `PAYMENT.CAPTURE.COMPLETED` arrives as the second, independent path to step 6. Whichever lands first wins; the other is a no-op. |

Apple Pay and Google Pay notes:

| Item | Detail |
|---|---|
| Availability | Apple Pay and Google Pay through PayPal are part of PayPal's card-processing product. **OPEN QUESTION: does SWD's PayPal business account have it enabled, and is the account eligible? Must be checked in the PayPal dashboard by the account owner.** |
| Apple Pay setup | Requires the Hub domain to be registered and verified with PayPal for Apple Pay. Done by the PayPal account owner. |
| In a native app | Wallet buttons inside an embedded web view may not work or may be restricted. **OPEN QUESTION: test on real devices before promising.** Fallback is section 10. |
| If not available | Standard PayPal button (PayPal balance, PayPal guest card checkout) still works with no extra setup. |

## 4. Server rules (non-negotiable)

| Rule | Why |
|---|---|
| Amount, currency, and fee come only from the database | Client values can be edited |
| Never mark paid on a client redirect or client callback | Browser can lie or die |
| Verify webhooks with PayPal's verify-webhook-signature API (or local verification) using the webhook id stored in server environment variables | Anyone can POST to a public URL |
| Idempotency, layer 1: `PayPal-Request-Id` on create and capture calls | Safe retries |
| Idempotency, layer 2: unique constraint on `paypal_capture_id`; one active payment per `entry_id` | Webhook replays and double clicks cannot double-confirm |
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
| `pending_payment` | Saved, not paid | `confirmed`, `withdrawn` (expired or cancelled) |
| `confirmed` | Paid online, or TD marked check/cash received | `withdrawn`, `refunded` |
| `waitlisted` | Paid or held, event full | `confirmed`, `refunded` |
| `withdrawn` | Player left; money not yet returned or none taken | `refunded` |
| `refunded` | Money returned in full | end |

Payment status: `created`, `paid`, `failed`, `partially_refunded`, `refunded`, `expired`. (`partially_refunded` is new vs. the PRD list; **OPEN QUESTION: confirm schema change when the database layout file is written.**)

## 6. Check and cash path

| Step | Detail |
|---|---|
| Player choice | At payment step: "Pay online" or "Pay by check or cash". Show the event's payee name, mailing address (event `contact.mailTo`), and the deadline. |
| On submit | Entry saved as `pending_payment`, `payment_method = check_or_cash`. A `payments` row with `provider = offline`, status `created`. |
| Emails | To the TD (event `contact.email`): player names, amount due, entry id. To the player: instructions, amount, payee, deadline, and the line "Your spot is not confirmed until payment is received." |
| TD action | TD opens the entry, marks "Payment received", picks check or cash, enters check number or note (required), then the entry becomes `confirmed` and a receipt is emailed. Audit row written. |
| Hold rule | Does a pending check/cash entry hold a spot or count toward `max_entries`? **OPEN QUESTION.** Does it auto-expire, and after how many days? **OPEN QUESTION.** |
| Bounced check | TD or admin changes entry back to `pending_payment` with a note. Policy on bounced checks: **OPEN QUESTION.** |
| Day-of cash | TD can add or mark an entry paid on site. Same screen. |

## 7. Fees and who bears them

| Item | Status |
|---|---|
| PayPal processing fee on each online entry (a percentage plus a fixed amount, rates set by PayPal and SWD's account type) | Not stated here; check SWD's actual rate and any nonprofit rate. **OPEN QUESTION** |
| Does SWD absorb the fee, or add a surcharge for online payment? | **OPEN QUESTION: Giulia / SWD board** |
| If a surcharge: is it allowed on the PayPal and card rules, and is it shown before payment? | **OPEN QUESTION** |
| Are fees refunded to the player on a refund? (PayPal does not return its original fee on refunds for most account types; SWD would bear it.) | **OPEN QUESTION: confirm against current PayPal fee terms** |
| Currency | USD assumed. |

## 8. Receipts

| Item | Design |
|---|---|
| Sent when | Payment captured (online) or TD marks received (check/cash) |
| Contents | Event title and date, all player names, amount paid, method, date, entry id, refund rule text for the event, SWD contact |
| Sender | Hub email service, from an SWD address. **OPEN QUESTION: which sending address and domain.** |
| Also | PayPal sends its own receipt to online payers; ours is the one that lists players |
| Tax wording | Entry fees are not described as donations. **OPEN QUESTION: whether SWD wants any tax statement on receipts.** |
| Resend | Player can re-view receipt in "My entries"; admin can resend |

## 9. Withdrawals and refunds

### Player withdrawal request (in app)
Player opens "My entries", taps Withdraw, sees the event's rule text and the refund they should expect, confirms. Entry shows "Withdrawal requested". Anne or Bill are notified.

### Rules, configurable per event
Stored on the event; the app displays and applies them. Nothing is hardcoded.

| Field | Example values |
|---|---|
| `withdraw_until` | date/time or "deadline" |
| `refund_before` | full / partial % / none |
| `refund_after` | full / partial % / none, or admin discretion |
| `rule_text` | Shown to the player verbatim |
| Current examples from the site | Mix/Match Triples: "no refunds after" the Friday deadline. Other events: not yet reviewed. |

**The actual SWD withdrawal and refund rules are unknown. OPEN QUESTION: Anne and Bill to supply, per event or as a default.** Until then the app has a placeholder default of "admin decides each case".

### Refund screen (admin: Anne or Bill only)

| Capability | Detail |
|---|---|
| Who | Role `refund_admin`. **OPEN QUESTION: is Anne also a TD of every event, and may TDs request but not approve? PRD currently says TDs request, division admins issue.** Anne and Bill both hold this role. |
| Queue | List of withdrawal requests and TD-requested refunds, oldest first |
| Action | Full refund or partial (amount field, max = captured minus already refunded), reason required |
| Online payments | Server calls `POST /v2/payments/captures/{capture_id}/refund` with `amount` for partial (omit for full) and a `PayPal-Request-Id`. Returns refund id; status stored. Final state is set by webhook `PAYMENT.CAPTURE.REFUNDED`. |
| Check/cash payments | Admin records "refunded by check/cash", method, reference. No API call. |
| Safeguards | Confirm dialog showing player, amount, and payment method. Two clicks max. Cannot refund more than remaining. Each refund writes an audit row. Same-click double submit is blocked by the request id and a unique constraint. |
| Window | PayPal refunds are limited in time after capture (commonly 180 days). **OPEN QUESTION: confirm current limit.** After it, refund by check. |
| Separation | Can the same person withdraw-approve and refund? Allowed for now (two people, small org). **OPEN QUESTION: need a second approver for large amounts?** |
| Event cancelled by SWD | Bulk "refund all" action for an event, run one entry at a time with progress and retry |

## 10. Reconciliation

| Check | How often | What it does |
|---|---|---|
| Daily job: list PayPal transactions for the day (Transaction Search API) and match on `custom_id` to our `payments` | Daily, plus a button on the admin screen | Reports: paid at PayPal but not in Hub; in Hub but not at PayPal; amount mismatch; refunded at PayPal but not in Hub |
| Event close-out report | On demand | Entries, collected online, collected check/cash, refunded, net, outstanding pending |
| Export | CSV for the treasurer | Date, entry id, event, payer name, method, gross, refund, net |
| Money in transit | None; PayPal pays out to SWD's bank on its own schedule | Bank link stays in PayPal, not in Hub |
| Who sees it | Anne, Bill, and treasurer (**OPEN QUESTION: who is the treasurer and do they get a login?**) |

Transaction Search API may need to be enabled for the PayPal app and has a delay before transactions appear. **OPEN QUESTION: confirm availability on SWD's account.**

## 11. Failure cases

| Case | Behavior |
|---|---|
| Payment succeeded, webhook late or missing | Capture response already confirms the entry in step 6. If the capture call itself timed out, a "payment status" job re-reads the order from PayPal every few minutes for up to an hour, then raises an admin alert. |
| Player closed the browser after paying | Webhook confirms the entry; player gets the receipt email. My entries shows Confirmed. |
| Double click or two tabs | Same entry id gives the same order (request id) and a unique `payments` constraint. Second capture returns the existing result. |
| Player pays twice anyway (two orders) | Second capture detected as a duplicate for an already-paid entry; flagged for admin to refund; entry not duplicated. |
| Abandoned checkout | Entry stays `pending_payment`; reminder email at 30 minutes; expires after the hold time (PRD says 30 min plus hourly sweep, **OPEN QUESTION: hold time**); spot released; order is left unpaid and cannot be captured after expiry (server rejects capture on an expired entry and voids). |
| Capacity filled during checkout | Capture happens, then entry becomes `waitlisted`; admin sees it and can refund or promote. **OPEN QUESTION: waitlist rule.** |
| Payment declined | Show PayPal's message, entry stays `pending_payment`, player can retry or choose check/cash. |
| Dispute or chargeback | Webhook `CUSTOMER.DISPUTE.CREATED` creates an admin alert; entry marked "disputed"; handled in PayPal's resolution center by the account owner. |
| Amount mismatch on capture | Do not confirm; flag; admin decides. |
| Webhook signature invalid | Reject with 400, log, no state change. |
| PayPal outage | Entry stays saved; player is offered check/cash; retry later. |
| Event fee changed after an order was made | Server compares order amount to the current fee and creates a new order if different. |

## 12. App Store and Google Play

### Apple (guideline 3.1.3(e), "Goods and Services Outside of the App")
The guideline says apps that sell physical goods or services consumed outside the app must use payment methods other than in-app purchase. A real-world tournament entry plausibly fits, but **it is unconfirmed that Apple treats event entry fees as such. Do not rely on this until Apple confirms.** The text of the current guidelines must be re-read at submission time. **OPEN QUESTION: Giulia or app owner to send the question below.**

Exact question to ask Apple App Review (via App Store Connect "Contact Us" or a pre-submission review note):

> Our app lets members of a non-profit sporting body (the Southwest Division of Bowls USA, lawn bowls) enter in-person tournaments held at physical bowling greens, and pay the entry fee by PayPal, Apple Pay or Google Pay. The fee is paid to the sports organization for participation in a live, in-person event. No digital content, features, or subscriptions are unlocked in the app by the payment. Does this fall under App Review Guideline 3.1.3(e), Goods and Services Outside of the App, so that the in-app purchase is not required for these entry fees? If not, what would you require?

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
| Existing events | `events-data.json` has `paypal.system` of `modern`, `classic` (hosted button id), or `none`. These stay as-is for current events. |
| Hub events | A Hub event with `fee_cents` replaces `paypal` in the page; the old block is hidden for it. |
| Old data | No migration of past payments; PayPal history and old sheets remain the record. |
| Fee strings | Today fees are text like "$45/team"; Hub needs integer cents plus unit (team or player). |
| Per-event options | Some events have more than one price or add-on. **OPEN QUESTION: list them (lunches, banquet, side events).** |

## 14. Open questions summary

| # | Question | Owner |
|---|---|---|
| 1 | Is Apple Pay / Google Pay enabled on SWD's PayPal account? | PayPal account owner |
| 2 | Who bears the PayPal fee; surcharge or not? | Giulia / SWD board |
| 3 | Withdrawal and refund rules (default and per event) | Anne, Bill |
| 4 | Does a pending check/cash entry hold a spot; how long | Anne, Bill |
| 5 | Roles: can TDs request-only; second approver for refunds | Anne, Bill |
| 6 | Who is the treasurer and what access | Giulia |
| 7 | Apple 3.1.3(e) answer; Google Play equivalent | App owner |
| 8 | PayPal refund time limit, Transaction Search availability | PayPal docs / account owner |
| 9 | Add-ons and multiple prices per event | Anne |
| 10 | Receipt sender address; any tax wording | Giulia |
| 11 | Checkout hold time and waitlist rule | Anne, Bill |
| 12 | Bounced check policy | Anne, Bill |

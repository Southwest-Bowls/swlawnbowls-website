# 05 - Notifications and copy

Status: draft for Giulia and Anne to read. Nothing here is built or sent.
Every email below is plain text first. Each body is under 120 words.
State, column and role names follow `02-schema.sql`.

## 1. Writing rules (for older readers)

- Short sentences. One request per message. The first sentence says what happened.
- No exclamation marks, no emoji, no "Oops", no "Awesome". Say "your entry", not "your registration".
- Always name the event, the date, and the club. Always say what the reader must do next, or "You do not need to do anything."
- Money: write "$45", never "45.00 USD". Dates: "Saturday, April 18, 2026".
- Every email ends with a real person to contact (the TD) and a plain phone number.
- Never put a card number, a full check image, or a password in any message.
- Email is the source of truth. In-app messages repeat it but never replace it.

## 2. Sender and footer

| Item | Value |
|---|---|
| Sender name | Southwest Bowls Division |
| From address | OPEN QUESTION: which division address? (webmaster@swlawnbowls.org is proposed in docs/succession-and-accounts.md but not confirmed as existing) |
| Reply-to | The event's display contact, `events.td_contact_email` (from `contact.email` in events-data.json). Falls back to the division address. |
| Email service | OPEN QUESTION: not chosen. Sender domain must be verified before launch or messages land in spam. |
| Subject prefix | None. Event name goes in the subject so it sorts in the inbox. |

Footer, on every email:

> Southwest Bowls Division, a division of Bowls USA.
> Questions about this entry: {td_name}, {td_phone}, {td_email}.
> You are receiving this because you entered or were entered in {event_title}.
> Your email and phone are kept private. Your name and club appear on the public entry list. We never see your card number.
> {division_mailing_address} (OPEN QUESTION: which postal address)

Reminder and digest emails add one line: "To stop these reminders, open the app, choose Settings, then Email, or reply STOP."

## 3. Merge fields

`{first_name}` `{event_title}` `{event_date}` `{club_name}` `{club_address}` `{players}` (one per line, with position) `{fee}` `{entry_id_short}` `{payee_name}` `{payee_address}` `{td_name}` `{td_phone}` `{td_email}` `{deadline_date}` `{refund_amount}` `{refund_rule_text}` `{waitlist_position}` `{change_summary}`

## 4. Player emails

### E1. Entry received, pay by check or cash

Subject: `Entry received for {event_title}: payment still needed`

> Hello {first_name},
>
> We have your entry for {event_title} on {event_date} at {club_name}. Your place is held, but it is not confirmed until we receive your payment.
>
> Entry: {players}
> Amount due: {fee}
>
> Please make your check payable to {payee_name} and mail it to:
> {payee_address}
> Write "{event_title}" on the check. Cash: {cash_instructions}.
>
> Please send payment by {payment_hold_date}. After that date we may release your place.
>
> Questions: {td_name}, {td_phone}.

Open items: `{payee_name}`, `{payee_address}`, `{cash_instructions}` (where and to whom cash is handed over) and `{payment_hold_date}` (how long a place is held) are all OPEN QUESTION. Do not send E1 until they are filled in per event.

### E2. Payment confirmed (online, or check/cash marked received)

Subject: `You are entered: {event_title}`

> Hello {first_name},
>
> Your entry for {event_title} is confirmed. We received {fee}.
>
> Date: {event_date}
> Place: {club_name}, {club_address}
> Entry: {players}
>
> Check-in and start times are on the event page. You do not need to do anything else.
>
> If you need to withdraw, open the app and choose your entry. Refund rules: {refund_rule_text}
>
> Questions: {td_name}, {td_phone}.

Note: sent only after the database says `confirmed`. For online payment that is the verified PayPal capture recorded by the server (webhook or reconcile job), not the browser return page (PRD acceptance criterion). For check/cash it is when the TD marks the entry paid.

### E3. Waitlisted

Subject: `You are on the waiting list: {event_title}`

> Hello {first_name},
>
> {event_title} is full, so your entry is on the waiting list. You are number {waitlist_position}.
>
> This is not a confirmed place. If a place opens, we will email you straight away and you will have until {waitlist_offer_hours} hours to accept.
>
> You have not been charged. {waitlist_payment_note}
>
> Entry: {players}
>
> Questions: {td_name}, {td_phone}.

OPEN QUESTION: does a waitlisted player pay up front (and get refunded if no place opens) or pay only when offered a place? `{waitlist_payment_note}` and `{waitlist_offer_hours}` depend on the answer. Default wording above assumes pay-only-when-offered. Waitlist order rule (first come, first served) is also unconfirmed.

### E4. Withdrawal requested (to player)

Subject: `We received your withdrawal request: {event_title}`

> Hello {first_name},
>
> We received your request to withdraw from {event_title}. Your entry stays in place until it is approved.
>
> {approver_names} will review it. We will email you with the answer. Please allow {review_days} days.
>
> Refund rules for this event: {refund_rule_text}
>
> You do not need to do anything. If you change your mind, call {td_name} on {td_phone}.

OPEN QUESTION: the refund rule text is TBD. It is configurable per event (`events.refund_policy_text` and `events.withdrawal_rule`). `{approver_names}` comes from the people with refund permission (`can_refund`), not hardcoded; today that is expected to be Anne Nunes and Bill (surname unconfirmed). Existing flyers say things like "no refunds after" the deadline; no general rule has been stated. `{review_days}` is also TBD. Reviewers: confirm Anne and Bill are the only approvers.

### E5. Withdrawal approved

Subject: `Your withdrawal is approved: {event_title}`

> Hello {first_name},
>
> Your withdrawal from {event_title} on {event_date} is approved. Your place has been released.
>
> Refund: {refund_amount}. {refund_line}
>
> Entry withdrawn: {players}
>
> Questions: {td_name}, {td_phone}.

`{refund_line}` is one of: "We will send it to your original payment method and will email you when it is done." (online), "We will contact you to arrange it." (check/cash; OPEN QUESTION whether SWD refunds by check, and we hold no postal address for the player) or "No refund is due under the rules for this event." (then show `{refund_rule_text}`).

### E6. Refund sent

Subject: `Your refund has been sent: {event_title}`

> Hello {first_name},
>
> We have refunded {refund_amount} for your entry in {event_title}.
>
> Paid by PayPal: it can take up to 5 business days to show in your account. (OPEN QUESTION: confirm PayPal timing wording.)
> Paid by check: a check is in the mail to you.
>
> You do not need to do anything. Please keep this email for your records.
>
> Questions: {td_name}, {td_phone}.

Send only the line that applies. Never include the PayPal transaction number in the body.

### E7. Event changed

Subject: `A change to {event_title}`

> Hello {first_name},
>
> There is a change to {event_title}, which you are entered in.
>
> What changed: {change_summary}
> Date: {event_date}
> Place: {club_name}
>
> Your entry is still in place. If this change means you cannot play, you may ask to withdraw. Open the app and choose your entry. {refund_rule_text}
>
> Questions: {td_name}, {td_phone}.

Sent only for changes to date, time, place, format or fee. Not for typo fixes. A promise of a full refund after an event change was removed from the wording because no refund rule is decided; a director may add it per event through `{refund_rule_text}`. OPEN QUESTION: should an event change entitle a player to a full refund? Anne and Bill must decide before launch.

### E8. Event cancelled

Subject: `{event_title} is cancelled`

> Hello {first_name},
>
> We are sorry to tell you that {event_title} on {event_date} is cancelled. Reason: {cancel_reason}.
>
> Refund: {cancel_refund_line} You do not need to do anything.
>
> Entry cancelled: {players}
>
> Questions: {td_name}, {td_phone}.

Cancelling an event is admin-only (PRD). `{cancel_refund_line}` is filled per event once the cancellation refund amount is decided (OPEN QUESTION; full refund is proposed, not decided), for example "{refund_amount}, returned to the way you paid. We will email you when it is sent." Unpaid entrants get "You have not been charged." The refunds are queued for Anne or Bill; each sends E6 when done.

### E9. Deadline reminder

Subject: `Entries close {deadline_date}: {event_title}`

Two versions, by who receives it.

Version A, to a player who started an entry but has not paid or finished:

> Hello {first_name},
>
> Your entry for {event_title} is not finished. Entries close on {deadline_date}.
>
> {unfinished_line}
>
> After that date we cannot accept your entry.
>
> Questions: {td_name}, {td_phone}.

`{unfinished_line}`: "Open the app and choose Pay now." or "We have not yet received your check. Please mail it to {payee_address}."

Version B, to a confirmed player who might want to withdraw: not sent. Withdrawal rules are TBD; do not prompt people to withdraw.

Rules: one reminder only, 3 days before the deadline (OPEN QUESTION: confirm). Never sent to anyone already confirmed. Never sent after the deadline. Not sent for events with no database deadline.

### E10. Sign-in link (supporting email)

Subject: `Your sign-in link for Southwest Bowls`

> Hello,
>
> Use this link to sign in to Southwest Bowls: {link}
>
> The link works once and lasts {link_minutes} minutes. If it has stopped working, ask for a new one in the app.
>
> If you did not ask to sign in, you can ignore this email. Nobody can sign in without this link.
>
> Questions: {division_email}.

This one has no event TD in the footer; use the division address. Not in your list but the PRD uses magic-link sign-in only, so this email is the front door. Note: Supabase sends its own template unless replaced; this text replaces it.

## 5. Tournament director emails

### T1. New pay-by-check/cash entry (immediate)

Subject: `New entry, payment pending: {event_title}`

> Hello {td_name},
>
> {submitter_name} entered {event_title} and chose to pay by check or cash. Amount due: {fee}.
>
> Entry: {players}
>
> The place is held as "pending payment". When the check or cash arrives, open the entry and choose Mark as paid. The player is then emailed a confirmation.
>
> Open the entry: {admin_link}

Satisfies the decision that the pay-by-check path "emails the TD". Goes to the event's assigned TDs and its display contact (`td_contact_email`) only.

### T2. Daily digest of new entries

Subject: `{event_title}: {new_count} new entries since yesterday`

> Hello {td_name},
>
> Since yesterday for {event_title}:
>
> New entries: {new_count} ({confirmed_count} confirmed, {pending_count} waiting for a check or cash)
> Withdrawal requests to review: {withdrawal_count}
> Waiting list: {waitlist_count}
> Total confirmed: {total_confirmed} of {max_entries}
> Entries close: {deadline_date}
>
> New names are listed in the app: {admin_link}
>
> To stop this email, open Settings in the app.

Sent at {digest_time} (OPEN QUESTION: time; proposed 7:00 AM Pacific). Not sent on days with no change. Contains counts only, no player emails or phones, so a forwarded digest leaks nothing.

### T3. Withdrawal request waiting (to Anne and Bill)

Subject: `Withdrawal request to review: {event_title}`

> Hello,
>
> {player_name} has asked to withdraw from {event_title}.
>
> Paid: {fee_paid} by {pay_method}
> Rule for this event: {refund_rule_text}
> Suggested refund: {refund_amount}
>
> Please approve or decline in the app: {admin_link}
> Refunds are made in PayPal. The app will link you to the payment.

Goes to everyone who can refund for that event (Anne and Bill, `can_refund`), plus the event's display contact for information (OPEN QUESTION: do both always get it, or only the TD of that event? Does either one alone approve? Today either one alone can approve).

## 6. In-app messages

| Where | Text |
|---|---|
| After submitting, check/cash chosen | "Your entry is saved and your place is held. It is confirmed when we receive your payment. We have emailed you the details." |
| After submitting, online payment, success | "Payment received. You are entered. We have emailed you a confirmation." |
| Online payment, window closed before finishing | "Your payment was not finished, so we have not entered you. You have not been charged. Please try again, or choose check or cash." |
| Online payment, taken but entry not yet confirmed | "We are checking your payment. This can take a minute. You can close this page; we will email you." |
| Entry status chips | "Pending payment", "Confirmed", "On the waiting list", "Withdrawal requested" (an open request on a confirmed entry), "Withdrawn", "Not completed" (expired), "Cancelled", "Refunded" (derived from the refund fields, not an entry state) |
| Withdraw button | "Ask to withdraw" |
| Withdraw confirm box | "Ask to withdraw from {event_title}? Refund rules: {refund_rule_text} Your entry stays in place until it is approved." Buttons: "Ask to withdraw" and "Keep my entry". |
| Withdrawal sent | "Request sent. {approvers} will review it. We will email you." |
| Deadline passed | "Entries for this event have closed. Please call {td_name} on {td_phone}." |
| Event full | "This event is full. You can join the waiting list. You will not be charged until a place is offered." (depends on the E3 OPEN QUESTION) |
| Event cancelled banner | "This event is cancelled. If you were entered, we will email you about your entry and any refund." |
| Event changed banner | "Changed {change_date}: {change_summary}" |
| Error, saving | "We could not save your entry. Nothing has been charged. Please try again, or call {td_name} on {td_phone}." |
| Error, no connection | "No internet connection. Your entry has not been sent. Please try again when you are connected." |
| Player name rule broken | Plain statement of the rule, e.g. "This event needs at least one woman and one novice on each team." (Taken from the event's rules.) |
| TD, Mark as paid | Button "Mark as paid". Confirm: "Mark {player_name}'s entry as paid by {method}? We will email them a confirmation." |

Push notifications: none in the first version (PRD excludes them). Email only.

## 7. Required vs optional

| Message | Required? | Why |
|---|---|---|
| E1 Entry received (check/cash) | Required | Only record the player has of what to pay, to whom, and where |
| E2 Payment confirmed | Required | Receipt for money paid; proof of entry |
| E3 Waitlisted | Required | Player must know they are not confirmed |
| E4 Withdrawal requested | Required | Acknowledges a money-affecting request |
| E5 Withdrawal approved | Required | Records the decision |
| E6 Refund sent | Required | Record of money returned |
| E7 Event changed | Required | Date, place or fee changes affect travel |
| E8 Event cancelled | Required | Same, plus refund |
| E9 Deadline reminder | Optional | Courtesy; can be switched off |
| E10 Sign-in link | Required | No password exists |
| T1 New check/cash entry | Required | Without it the TD does not know to watch for the check |
| T2 Daily digest | Optional | Convenience; TD can switch off |
| T3 Withdrawal waiting | Required | Otherwise requests sit unseen |

"Required" means transactional: sent regardless of any preference, because it is about the player's own entry and money. Optional messages carry the stop line in section 2.

## 8. Store review notes and privacy

For the app store submission (OPEN QUESTION: stores not yet chosen; assume Apple App Store first):

| Item | What to write or provide | Source in this file |
|---|---|---|
| Demo account | The reviewer cannot receive a magic link at an email we do not control. Provide a review account and a way to sign in without a mailbox, or a mailbox the reviewer can open. OPEN QUESTION: how (PRD says magic link only). | E10 |
| Payments note | "Entry fees are paid to the Southwest Bowls Division's own PayPal account, or by check or cash. Card details are handled by PayPal and are never seen or stored by the app." | E1, E2 |
| In-app purchase question | Whether tournament entry fees need Apple in-app purchase is unconfirmed (see earlier discussion). Do not assert an exemption in the notes until Apple answers. | OPEN QUESTION |
| Emails sent | List E1 to E10 and T1 to T3, stating all are sent to the person who entered, or to the event's director. No marketing email, no third-party sharing. | Section 7 |
| Account deletion | Apple requires in-app account deletion if accounts can be created. Needs an in-app "Delete my account" that keeps payment records the division must retain. OPEN QUESTION: retention period; who handles requests. | not covered by any email yet |
| Contact for support | Support page URL and email. Use the TD contact plus a division address. OPEN QUESTION: the division address. | Section 2 |

Privacy policy must state:

- What we collect: name, email, phone (optional), club, Bowls USA number, entry details, payment status and amounts.
- What we do not collect: card numbers or bank details. PayPal handles them.
- Who sees what: the public entry list shows player names, clubs and positions only. Emails and phones are visible only to the person who submitted the entry, the event's director, and division admins. (`02-schema.sql` currently also lets the other listed players on an entry read the submitter's contact row; that must be fixed before this sentence is true. See the WARNING in that file.)
- Emails sent: the list in section 7 and no marketing email.
- Livestream: events with a livestream notice say entering means consent to be filmed (existing wording in `events-data.json`). Repeat it in the entry flow, not only in the policy.
- Who it is shared with: PayPal (payment), the email service, the database host. Name each when chosen. OPEN QUESTION: email service and hosting region not yet chosen.
- How long we keep it, and how to ask for deletion: OPEN QUESTION.
- Who runs it: the Southwest Bowls Division, not the LLC. OPEN QUESTION: legal entity name and address for the policy.

## 9. Checks before this copy goes live

- Giulia and Anne read E1, E2, E4, E5 aloud. Change anything that sounds unlike a member of the division.
- Send each email to a real older relative's Gmail and a free Outlook mailbox. Check it is not in spam and reads well on a phone at large text size.
- Fill every OPEN QUESTION placeholder or the email must not send. The sending code should refuse to send a message that still contains an unfilled `{...}`.
- Withdrawal and refund wording (E4 to E8) must be read by Anne and Bill after the rule text is decided. Until then the app must show "rule text to be added by the director" as a hard stop, not an empty string.

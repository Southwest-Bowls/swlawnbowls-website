# Decisions log: entries, payments and scoring (Oct 27-28 2026)

Source: planning with Claude Duet and Giulia, 27-28 Oct 2026. **Where these disagree with the other files in this folder, this file wins**, until the other files are reconciled (list at the bottom). Planning only: none of this is built.

## Teams and entries
- Anyone on a team can enter the whole team. **Whoever enters pays the whole fee** (one payment per entry, which keeps automatic matching reliable). A team can settle up among themselves.
- Every teammate entered by someone else gets a notification (in the app, or email with a confirm page if they have no app). **"Accept" means acknowledge**: the entry stands either way, there is no decline button, and a player who thinks it is wrong uses "Something wrong? Tell the TD". Unaccepted players get one reminder at entry close and an amber marker on the TD's list. Revisit if a wrong entry ever happens.
- One team per player per event, enforced by the database. Overlapping teams are blocked with a plain message.
- A team may enter with **TBD** players. At entry close the entrant and the TD get a gentle flag; the entry stays confirmed. Anyone on the team can fill a TBD until the TD locks the team.
- **Only members with current dues can enter.** Guests (other divisions, international players): **undecided**, to be worked out.
- Club tournaments link out to the club's own site; the app takes no entries or fees for them (`entry_mode = external_link`).

## Notifications
- The person who enters gets an email from the app, plus PayPal's own official receipt. The TD gets an email and an in-app notification for each new entry. Everyone on the team gets an in-app notification. A new entry, an accepted entry, a withdrawal and a payment problem each trigger one.

## Payments
- Division event fees go to the SWD PayPal business account, through a "Pay with PayPal" button tied to the entry (never the account email). Matching is automatic; the TD handles exceptions only.
- Unpaid entries hold their place until the tournament starts. Pay at the desk (cash or cheque) is allowed; the TD marks it paid once, picking who paid.
- Withdrawal: full refund to whoever paid. Anne refunds in PayPal herself; the app only keeps a "refunds due" list and matches PayPal's refund notice. Per-event refund cut-off date: **to agree with Anne**.
- The Division absorbs PayPal fees (payments and refunds). Players pay the flat entry fee. The fee report shows gross, fees and net. Apply for PayPal's charity rate.
- Outside payment is the correct route for the stores: Apple 3.1.3(e) (physical services must not use in-app purchase) and Google Play (billing not required for physical services). Run PayPal in an in-app browser tab and test it.

## Wallet passes
- A player's pass is issued only when **(1)** they have accepted the entry (the entrant counts as accepted) **and (2)** the full team fee is paid (PayPal captured, or the TD marked a desk payment). Cash teams get theirs when the TD marks them paid. A refund or dispute voids the pass. Payment status is never printed on the pass. Players without the app get "Add to Apple Wallet" / "Save to Google Wallet" buttons on the accept page.

## Scores
- The **skip** of each team enters the final score. The app compares the two. Agree: the TD approves (or "approve all agreed"). Differ: flagged to the TD at once, with both scores side by side.
- **The paper card always wins.** The card is still handed in. If the card disagrees with the approved app score, the TD fixes the result with a reason, it is logged, and the TD is alerted immediately.
- **Optional photo of the card**, taken by the TD only (not the skips), stored privately, **deleted 90 days after the tournament**. The paper card stays the official record. Needs a private storage area with its own access rules (none exists today). Open for the lawyer: whether an unresolved dispute should hold a photo longer.
- Keep the Google Sheets live scoring during the transition: **undecided**.

## Names, juniors and privacy
- Full names are public in entries, draws and results, as always. Never email, phone or payment status. Junior players are shown by initials only, from a junior flag on the roster set by an admin. Undecided: "shown" vs "may be shown", the age cut-off for junior, and whether juniors may hold their own app account. Needs the lawyer (see `docs/legal-review-checklist.md`).

## Still open
Couples sharing one email (separate emails, or households); whether pre-draw withdrawals need approval; who creates the PayPal REST app on the SWD account; whether SWD is fine with passes issued under the app publisher's Apple account.

## Files in this folder to reconcile with this log
`01-entry-flow.md` (acceptance, TBD, dues), `03-payments.md` (who pays, refund list, fees), `04-td-console.md` (card photo, mismatch alerts, exceptions), `05-notifications-and-copy.md` (who gets which message), `09-wallet-pass.md` (when a pass is issued), `10-notifications-and-live-activities.md`, `02-schema.sql` (junior flag, card photo table, entry_mode, refund cut-off; still DRAFT, not applied).

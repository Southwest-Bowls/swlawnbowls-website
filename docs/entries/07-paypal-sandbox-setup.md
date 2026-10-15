# PayPal: sandbox app and what the first real build needs

Status (2026-10-15): the sandbox app "SWD Entries" (type Merchant) exists in SWD's PayPal developer account. Features saved: Expanded checkout, Advanced Credit and Debit Card Payments, Apple Pay, Google Pay, Transaction search on. Off on purpose: PayPal and Venmo (saved methods), Save payment methods, Payouts, Subscriptions, Invoicing, Fastlane, IC++, Log in with PayPal. The existing website PayPal buttons are separate and untouched.

## Secrets: where they go and where they never go
| Value | Where it lives | Never |
|---|---|---|
| Client ID (sandbox) | Vercel environment variable `HUB_PAYPAL_CLIENT_ID` (safe to expose to the browser, it identifies the app) | in this chat |
| Secret (sandbox) | Vercel environment variable `HUB_PAYPAL_CLIENT_SECRET`, server only | in git, in chat, in screenshots, in the app code |
| Webhook ID | Vercel environment variable `HUB_PAYPAL_WEBHOOK_ID` | |
| Live Client ID and Secret | separate Vercel variables, added only at go-live | the sandbox ones reused |

Giulia or Anne add the values in the Vercel dashboard (project settings, Environment Variables), choosing **Preview/Development** for sandbox and **Production** only for live. The code reads them; nobody pastes them into a file.

## What the build needs from PayPal
1. **Server creates the order** with the entry id in `custom_id` and `invoice_id` (amount comes from our database, never from the browser).
2. **Browser shows the pay button** (PayPal JS SDK v6), including card, Apple Pay and Google Pay.
3. **Server captures** the approved order, then waits for the signed **webhook** before confirming the entry (docs/entries/03-payments.md).
4. **Webhook**: a public HTTPS address on our server, subscribed to the capture-completed, capture-denied and refund events, verified by PayPal's signature check. Add it under the sandbox app, Sandbox Webhooks, Add Webhook, once the server address exists.
5. **Transaction search** is on, so a nightly job can compare PayPal's list to our payments.

## Apple Pay and Google Pay: extra steps (later, live only)
- Apple Pay: PayPal's **Manage** link asks for the website domain and a verification file served from `/.well-known/`. The domain must be the one players pay on.
- Google Pay: merchant and domain registration under Manage.
- Both only matter for live. Sandbox testing of these may be limited; test the card and PayPal paths first.

## Test plan with fake money
- Use the sandbox **personal (buyer)** test account PayPal created. Its login is shown in the developer dashboard under Sandbox, Accounts. It is a test login, not a real one.
- Paths to test: pay success, pay then close the window, cancel, declined card, double click, webhook arriving late, amount mismatch.
- Nothing here touches the live SWD account.

## Go-live gate (do not skip)
Real money only after: all sandbox paths pass, Anne has done a full dry run, the refund-by-hand step has been practised, the Apple review question is answered, and Giulia says go. Live credentials are then created in PayPal's **Live** tab and added to Vercel Production only.

## Why the variables are named HUB_PAYPAL_*
The older website entry code (`api/_lib/paypal.js`, `api/webhook.js`) reads `PAYPAL_CLIENT_ID` and friends. The entry system uses its own `HUB_PAYPAL_*` names so the two can never overwrite each other, and the existing buttons keep working untouched.

## One-time setup, no secrets in chat
Run in Terminal, in the website repo folder: `bash scripts/set-paypal-sandbox.sh`. It asks you to paste the sandbox Client ID and Secret (the Secret is hidden), saves them to Vercel for Preview and Development only, and prints nothing sensitive. Then `scripts/paypal-sandbox-smoke.mjs` proves the keys work against fake money.

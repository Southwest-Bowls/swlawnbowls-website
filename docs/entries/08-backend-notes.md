# 08 Backend notes (entries API)

Status: code written and unit-tested with fakes. Nothing deployed, no database applied, no real email, no webhook registered.

## Endpoints (api/entries/, Vercel Node functions)
| Path | Method | What it does |
|---|---|---|
| `/api/entries/create` | POST | Validates the entry, computes the amount on the server from event data (browser amount ignored), creates the entry as `pending_payment`. For check/cash also sends the player and director notices (to the test recipient only). Returns id and receipt token. Rate limited per IP (in memory). |
| `/api/entries/order` | POST | PayPal only. Creates (or reuses) the PayPal order for the entry, re-pricing from our data. |
| `/api/entries/capture` | POST | Captures the approved order and records the payment. It never confirms the entry by itself. |
| `/api/entries/webhook` | POST | PayPal webhook. Signature verified through PayPal, de-duplicated by transmission id. Confirms only on a completed capture with exact amount and currency. |
| `/api/entries/status` | GET `?id=` plus header `X-Receipt-Token` (preferred) or `?token=` | Safe status for the receipt page. For a pending PayPal order it re-reads the order from PayPal (server side) and confirms if paid. Wrong token reveals nothing. |

Confirmation rule: an entry becomes `confirmed` only in server code, after a signature-verified webhook or a server-side read of PayPal's order API. Mismatched amount, currency, or order is recorded and flagged, never confirmed. Check/cash entries stay `pending_payment` until the TD marks them paid (TD console not built here).

Shared code is in `api/entries/_lib/`: `service.js` (logic), `store.js` (memory store plus a draft Supabase store), `paypal.js`, `mailer.js`, `fee.js`, `config.js`, `templates/`.

## Environment variables
| Name | Purpose |
|---|---|
| `HUB_PAYPAL_ENV` | Must be exactly `sandbox` for any PayPal call. Anything else disables PayPal (there is no live switch in the code). |
| `HUB_PAYPAL_CLIENT_ID`, `HUB_PAYPAL_CLIENT_SECRET` | SWD's own PayPal app credentials. Server only. |
| `HUB_PAYPAL_WEBHOOK_ID` | Id of the registered webhook, needed for signature checks. |
| `ENTRIES_TEST_RECIPIENT` | During testing every email goes only here, never to directors or players. |
| `ENTRIES_MAIL_MODE` | `dryrun` (default) writes `.outbox/mail.jsonl`. `live` currently throws "live mail not configured". |
| `ENTRIES_PUBLIC_URL` | Defaults to `https://swlawnbowls-website.vercel.app`. Used for PayPal return links and email links. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | If both are set the Supabase store is used (needs `@supabase/supabase-js` installed). |
| `ENTRIES_ALLOW_MEMORY_STORE` | Set to exactly `1` to allow the per-instance in-memory store in a deployment. Without Supabase config, and with `VERCEL` or `NODE_ENV=production` set, every endpoint answers `503 store_unavailable` (fail closed). Locally (neither variable set) the memory store is used with no opt-in. Only for throwaway previews: entries vanish between invocations. |

## Behaviour added after review (findings 1-14)
- **Events**: handlers read `events-data.json` (static source, normalized against the clock on every lookup, so "open" is never stale). The Supabase store prefers this source and falls back to the `events` table.
- **Open rule**: an event is open only if upcoming, not cancelled, deadline not passed, fee parsed (or explicit free entry), and it has known roles. Blank, `2+2` and `rinks` formats have no roles, so they are closed to online entry (`createEntry` also rejects them).
- **Deadline**: parsed with the same rules as `assets/app/app.js` (`deadlineDate`). The event closes at the end of the deadline day, California time (UTC-8 is assumed, so in summer it closes up to one hour late). Blank or "opens ..." text means no deadline. Like the app, `entriesStatus: "open"` on the event keeps it open past the deadline. The service re-checks `deadlineAt` against its own clock in `createEntry` and `startPayment`.
- **Free events**: `freeEntry: true` on the event plus a fee of 0 creates a `confirmed` entry with no payment and sends the confirmation. Without the flag a free event stays closed.
- **Double submit**: same event, method, contact email and player names, still unpaid, within 30 minutes returns the existing entry (`duplicate: true`, same id and receipt token) instead of making another. Trade-off: someone who knows the email and all names could get that receipt token back, so the window is short and the match is exact. No `Idempotency-Key` header yet.
- **PayPal-Request-Id** is `<entry id>-<amountCents>` for orders, so a re-priced order is a new order.
- **PayPal errors**: every call times out after 8s (`AbortSignal.timeout(8000)` plus a timer race). Timeout -> `504 paypal_timeout`; any other PayPal or network failure -> `502 paypal_error`; `INSTRUMENT_DECLINED` on capture -> `422 payment_declined`; `ORDER_ALREADY_CAPTURED` on capture -> `checking` (no confirmation there; the receipt page's status check reads the order from PayPal and confirms).
- **Confirm once**: `pending_payment -> confirmed` is a conditional update (`transitionEntry`); only the caller whose update changed the row sends the paid email. Notes are appended atomically and an identical note is never added twice. Payments are idempotent on the capture id, and the capture request's row is promoted to `paid` (or `flagged`) by the verified path.
- **Orphan payments**: a signature-verified COMPLETED capture that matches no entry is stored as an orphan record and the webhook answers `500` without marking the delivery processed, so PayPal retries. Someone has to look at `entry_orphan_payments` (memory store: `listOrphanPayments`). A second different capture on an order that already has one is also kept as an orphan record.
- **Receipt token**: send it in the `X-Receipt-Token` header (preferred). `?token=` still works for the receipt page. URLs with the token (`?token=` here, and `?t=` on the receipt page and in PayPal's return URL) can end up in server logs, browser history and Referer headers; move the receipt page to the header when convenient.

## Supabase store: tables the draft needs (not applied)
Beyond `02-schema.sql` the draft store assumes (see the comment block in `store.js`):
- `entries.public_ref text UNIQUE`, `receipt_token`, `paid_at`, `paypal_order_id`, `currency`
- `entry_notes(id bigserial primary key, entry_id uuid references entries(id), note text not null, created_at timestamptz default now(), unique (entry_id, note))`: holds the `capture:<id>` markers and `needs_review` flags; the unique constraint is the dedupe.
- `entry_orphan_payments(paypal_capture_id text unique, paypal_order_id text, custom_id text, amount_cents int, currency text, raw jsonb, created_at timestamptz default now())`
- `entry_webhook_events(event_id text primary key, processed_at timestamptz default now())`
- `payments.paypal_capture_id` and `paypal_order_id` are already UNIQUE; a capture fills in the order's existing `created` row instead of inserting a second one. The payments enum has no `captured`/`flagged`: they map to `created`/`paid` and the service status is kept in `payments.note` as `svc:<status>`.
- Player roles: `entry_players.position` is a lowercase enum, so roles are stored lowercase and mapped back to the event's own labels when read. A role label outside the enum (custom `playerLabels`) is stored as null and reads back empty; extend the enum before enabling such events.
- Conditional update and the note insert in `transitionEntry` are two statements; the stronger fix is a SQL function that does both in one transaction (not written).

## Run the tests
```
node --test tests/entries-*.test.js
```
No network, no secrets, no database. The PayPal client takes an injected `fetch`.

Manual sandbox run (fake money, you approve in a browser):
```
node --env-file=.env.local scripts/entries-sandbox-e2e.mjs
```
It refuses to run unless `HUB_PAYPAL_ENV=sandbox`, prints the sandbox approval URL, waits for Enter, captures, reads the order back from PayPal and prints the final status. It does not print secrets.

## Intentionally NOT done
- Database not applied. `02-schema.sql` has not been run; the Supabase store is a draft mapping, never executed.
- The in-memory store forgets everything between serverless invocations. Deployed without Supabase the endpoints now refuse (503) unless `ENTRIES_ALLOW_MEMORY_STORE=1`. Do not deploy for real use until the database is connected.
- Live mail not configured. Only the dry-run outbox exists. No email provider chosen.
- Refunds are done by hand in PayPal by Anne or Bill. The app never issues refunds and never asks for payout permissions.
- Webhook not registered with PayPal.
- No live PayPal. No deploy, no commit.
- Withdrawal rule text is TBD. The withdrawal request flow and TD console are not part of this backend.
- Rate limiting is per function instance only.
- Old code (`api/_lib/paypal.js`, `api/webhook.js`, `assets/app/*`) untouched.

## Steps Giulia must do later
1. Create a Supabase project (or confirm the existing one) and run `docs/entries/02-schema.sql` yourself in the SQL editor. Review it first.
2. Add `@supabase/supabase-js` to `package.json`, and set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel (server only).
3. Put the sandbox credentials in `.env.local` and in Vercel (Preview) as `HUB_PAYPAL_ENV=sandbox`, `HUB_PAYPAL_CLIENT_ID`, `HUB_PAYPAL_CLIENT_SECRET`. See `07-paypal-sandbox-setup.md`.
4. Run the manual sandbox script above and approve with the sandbox buyer account.
5. After a preview deploy, register the webhook in the PayPal developer dashboard (sandbox) pointing to `<preview url>/api/entries/webhook` with events for completed/denied captures, then set `HUB_PAYPAL_WEBHOOK_ID`.
6. Set `ENTRIES_TEST_RECIPIENT` to your own address. Choose and configure a mail provider, implement live mode in `mailer.js`, and only then consider real recipients.
7. Decide the withdrawal rule text and the optional director note for emails.
8. For going live (separate decision): create live credentials, register a live webhook, and add an explicit, reviewed live switch. The code has none today.
9. Review the Supabase store mapping against the real tables before trusting it.

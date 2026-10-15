// MANUAL sandbox end-to-end for the entries system (fake money). Not part of the tests.
// Usage: node --env-file=.env.local scripts/entries-sandbox-e2e.mjs
// Memory store only: no database, no real email (dry-run outbox), PayPal SANDBOX only.
import readline from 'node:readline/promises';
import crypto from 'node:crypto';
import { createMemoryStore } from '../api/entries/_lib/store.js';
import { createPayPalClient } from '../api/entries/_lib/paypal.js';
import { feeToCents } from '../api/entries/_lib/fee.js';
import { renderConfirmation, renderTdNewEntry, sendMail } from '../api/entries/_lib/mailer.js';
import { createEntry, startPayment, captureAndRecord, reconcileOrder } from '../api/entries/_lib/service.js';

if (process.env.HUB_PAYPAL_ENV !== 'sandbox') { console.error('Refusing: HUB_PAYPAL_ENV must be exactly "sandbox".'); process.exit(1); }
for (const k of ['HUB_PAYPAL_CLIENT_ID', 'HUB_PAYPAL_CLIENT_SECRET']) {
  if (!process.env[k]) { console.error(`Missing ${k} in env (.env.local).`); process.exit(1); }
}
process.env.ENTRIES_MAIL_MODE = 'dryrun';

const store = createMemoryStore({ events: [{
  id: 'practice-sandbox', title: 'Practice Event (sandbox)', date: 'Test date', venue: 'Test venue',
  feeText: '$10/person', amountCents: 1000, unit: 'person', format: 'Singles', roles: [], open: true, status: 'open',
}] });
const client = createPayPalClient({ env: process.env, fetch: globalThis.fetch });
let approveUrl = null;
const paypal = {
  createOrder: async ({ entryId, amountCents, currency }, ctx) => {
    const o = await client.createOrder({ entry: { ...ctx.entry, id: entryId, amountCents, currency }, event: ctx.event });
    approveUrl = (o.links || []).find((l) => ['payer-action', 'approve'].includes(l.rel))?.href || null;
    return o;
  },
  captureOrder: (id) => client.captureOrder(id),
  getOrder: (id) => client.getOrder(id),
  verifyWebhook: async () => ({ ok: false }), // no webhook in this script
};
const deps = {
  store, paypal, feeToCents, renderConfirmation, renderTdNewEntry,
  mailer: { sendMail }, testRecipient: process.env.ENTRIES_TEST_RECIPIENT || '',
  now: () => Date.now(), random: (n) => crypto.randomBytes(n),
};

try {
  const made = await createEntry(deps, {
    eventId: 'practice-sandbox', method: 'paypal',
    players: [{ role: '', name: 'Test Player', club: 'Test Club' }],
    contact: { name: 'Test Player', email: 'test@example.com', phone: '' },
  });
  console.log('Entry created:', made.id, `status=${made.status}`, `amount=${(made.amountCents / 100).toFixed(2)} ${made.currency}`);
  const pay = await startPayment(deps, { entryId: made.id, receiptToken: made.receiptToken });
  console.log('PayPal sandbox order:', pay.orderId);
  console.log('Approve it here, logged in as the sandbox BUYER test account:\n  ' + (approveUrl || '(no approval link returned)'));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question('\nPress Enter after approving in the browser... ');
  rl.close();
  const cap = await captureAndRecord(deps, { entryId: made.id, receiptToken: made.receiptToken, orderId: pay.orderId });
  console.log('Capture step result:', JSON.stringify(cap));
  const final = await reconcileOrder(deps, made.id);
  console.log('FINAL status:', final.status, '| paidAt:', final.paidAt || null);
  console.log(final.status === 'confirmed' ? 'PASS: confirmed by the server-side order read.' : 'NOT confirmed. Check the approval step and the notes below.');
  if (final.status !== 'confirmed') console.log('Notes:', JSON.stringify(final.notes));
} catch (e) {
  console.error('Failed:', e.message, e.paypal ? JSON.stringify(e.paypal) : '');
  process.exit(1);
}

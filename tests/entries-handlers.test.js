import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createMemoryStore } from '../api/entries/_lib/store.js';
import {
  createEntry, startPayment, captureAndRecord, handleWebhook, getStatus, reconcileOrder,
  createRateLimiter, ServiceError, valueToCents,
} from '../api/entries/_lib/service.js';

const EVENT = { id: 'spring-open', title: 'Spring <Open>', date: 'May 1', venue: 'Club', feeText: '$60/team', amountCents: 6000, unit: 'team', format: 'pairs', roles: ['Lead', 'Skip'], open: true, status: 'entries_open' };
const body = (o = {}) => ({
  eventId: 'spring-open', method: 'paypal',
  players: [{ role: 'Lead', name: 'Ann Lee', club: 'A' }, { role: 'Skip', name: 'Bo Kim', club: 'B' }],
  contact: { name: 'Ann Lee', email: 'ann@example.com', phone: '555' }, ...o,
});

function setup(eventOver = {}) {
  let t = Date.parse('2026-05-01T12:00:00Z');
  const store = createMemoryStore({ events: [{ ...EVENT, ...eventOver }] });
  const mails = [];
  const calls = { create: [], capture: [], get: 0, verify: 0 };
  const orders = {};
  const paypal = {
    verifyOk: true,
    async createOrder(o) { calls.create.push(o); const id = `ORD${calls.create.length}`; orders[id] = o; return { id, status: 'CREATED' }; },
    async captureOrder(id) { calls.capture.push(id); return paypal.orderJson(id); },
    async getOrder(id) { calls.get++; return paypal.orderJson(id); },
    async verifyWebhook() { calls.verify++; return { ok: paypal.verifyOk }; },
    captureResult: null, // set to override
    orderJson(id) {
      const o = orders[id];
      const cap = paypal.captureResult;
      return { id, purchase_units: [{ custom_id: o?.entryId, payments: cap ? { captures: [cap] } : undefined }] };
    },
  };
  const deps = {
    store, paypal, calls, mails,
    mailer: { async sendMail(m) { mails.push(m); return { dryRun: true }; } },
    testRecipient: 'test@example.com',
    now: () => (t += 1000),
    random: (n) => crypto.randomBytes(n),
    feeToCents: () => null,
  };
  return deps;
}
const cap = (entry, over = {}) => ({ id: 'CAP1', status: 'COMPLETED', amount: { value: (entry.amountCents / 100).toFixed(2), currency_code: 'USD' }, custom_id: entry.id, ...over });
const hook = (entry, over = {}, evId = 'WH1', orderId = 'ORD1') => ({
  headers: { 'paypal-transmission-id': evId },
  body: { id: evId, event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { ...cap(entry), supplementary_data: { related_ids: { order_id: orderId } }, ...over } },
});
async function paypalEntry(deps) {
  const r = await createEntry(deps, body());
  const o = await startPayment(deps, { entryId: r.id, receiptToken: r.receiptToken });
  return { r, o, entry: await deps.store.getEntry(r.id) };
}
const rejects = (p, status, code) => assert.rejects(p, (e) => e instanceof ServiceError && e.status === status && (!code || e.code === code));
const review = (e) => e.notes.some((n) => String(n).startsWith('needs_review'));

test('createEntry derives amount on the server and ignores client amount', async () => {
  const d = setup();
  const r = await createEntry(d, body({ amountCents: 1, amount: '0.01', fee: 1 }));
  const e = await d.store.getEntry(r.id);
  assert.equal(e.amountCents, 6000);
  assert.equal(e.currency, 'USD');
  assert.match(r.id, /^SWD-2026-SPRINGOPEN-\d{4}$/);
  assert.equal(e.status, 'pending_payment');
  assert.equal(r.receiptToken.length, 48);
  assert.equal(d.mails.length, 0); // paypal: no mail until paid
});

test('createEntry validation: names, email, roles, method', async () => {
  const d = setup();
  await rejects(createEntry(d, body({ players: [{ role: 'Lead', name: 'A' }, { role: 'Skip', name: 'Bo Kim' }] })), 422, 'bad_name');
  await rejects(createEntry(d, body({ contact: { name: 'Ann', email: 'nope' } })), 422, 'bad_email');
  await rejects(createEntry(d, body({ players: [{ role: 'Lead', name: 'Ann Lee' }, { role: 'Lead', name: 'Bo Kim' }] })), 422, 'bad_roles');
  await rejects(createEntry(d, body({ players: [{ role: 'Lead', name: 'Ann Lee' }] })), 422, 'bad_roles');
  await rejects(createEntry(d, body({ method: 'bitcoin' })), 422, 'bad_method');
  await rejects(createEntry(d, body({ eventId: 'nope' })), 404, 'event_not_found');
});

test('createEntry rejects a closed event and an event without a fee', async () => {
  await rejects(createEntry(setup({ open: false }), body()), 409, 'event_closed');
  await rejects(createEntry(setup({ status: 'cancelled' }), body()), 409, 'event_closed');
  await rejects(createEntry(setup({ amountCents: null, feeText: 'TBD' }), body()), 422, 'fee_unavailable');
});

test('createEntry rate limit', async () => {
  const d = setup();
  d.rateLimiter = createRateLimiter({ limit: 2 });
  await createEntry(d, body(), { ip: '1.1.1.1' });
  await createEntry(d, body(), { ip: '1.1.1.1' });
  await assert.rejects(createEntry(d, body(), { ip: '1.1.1.1' }), (e) => e.status === 429 && e.retryAfterSec > 0);
  await createEntry(d, body(), { ip: '2.2.2.2' });
});

test('check and cash: pending_payment, emails go only to the test recipient, escaped', async () => {
  for (const method of ['check', 'cash']) {
    const d = setup();
    const r = await createEntry(d, body({ method, players: [{ role: 'Lead', name: 'Ann <b>Lee</b>' }, { role: 'Skip', name: 'Bo Kim' }] }));
    assert.equal((await d.store.getEntry(r.id)).status, 'pending_payment');
    assert.equal(d.mails.length, 2);
    assert.ok(d.mails.every((m) => m.to === 'test@example.com'));
    assert.ok(d.mails.every((m) => !String(m.html).includes('<b>Lee')));
    assert.equal(d.calls.create.length, 0);
  }
});

test('no test recipient configured: nothing is sent, nobody else is emailed', async () => {
  const d = setup();
  d.testRecipient = '';
  await createEntry(d, body({ method: 'check' }));
  assert.equal(d.mails.length, 0);
});

test('mail failure does not fail the entry', async () => {
  const d = setup();
  d.mailer = { async sendMail() { throw new Error('boom'); } };
  const r = await createEntry(d, body({ method: 'cash' }));
  assert.ok(await d.store.getEntry(r.id));
});

test('startPayment: token required, idempotent, uses server amount', async () => {
  const d = setup();
  const r = await createEntry(d, body());
  await rejects(startPayment(d, { entryId: r.id, receiptToken: 'wrong' }), 404, 'not_found');
  await rejects(startPayment(d, { entryId: 'SWD-2026-X-0000', receiptToken: r.receiptToken }), 404);
  const a = await startPayment(d, { entryId: r.id, receiptToken: r.receiptToken });
  const b = await startPayment(d, { entryId: r.id, receiptToken: r.receiptToken });
  assert.equal(a.orderId, b.orderId);
  assert.equal(d.calls.create.length, 1);
  assert.equal(d.calls.create[0].amountCents, 6000);
  assert.equal((await d.store.listPayments(r.id)).length, 1);
});

test('startPayment: fee change creates a new order; closed event and non-paypal entries rejected', async () => {
  const d = setup();
  const r = await createEntry(d, body());
  await startPayment(d, { entryId: r.id, receiptToken: r.receiptToken });
  d.store = createMemoryStore({ events: [{ ...EVENT, amountCents: 7000 }], entries: [await d.store.getEntry(r.id)] });
  const o2 = await startPayment(d, { entryId: r.id, receiptToken: r.receiptToken });
  assert.equal(o2.amountCents, 7000);
  assert.equal(d.calls.create.length, 2);

  const c = setup();
  const ch = await createEntry(c, body({ method: 'check' }));
  await rejects(startPayment(c, { entryId: ch.id, receiptToken: ch.receiptToken }), 409, 'not_paypal');

  const z = setup();
  const zr = await createEntry(z, body());
  z.store = createMemoryStore({ events: [{ ...EVENT, open: false }], entries: [await z.store.getEntry(zr.id)] });
  await rejects(startPayment(z, { entryId: zr.id, receiptToken: zr.receiptToken }), 409, 'event_closed');
});

test('capture records the payment but NEVER confirms', async () => {
  const d = setup();
  const { r, o, entry } = await paypalEntry(d);
  d.paypal.captureResult = cap(entry);
  const out = await captureAndRecord(d, { entryId: r.id, receiptToken: r.receiptToken, orderId: o.orderId });
  assert.equal(out.status, 'checking');
  const e = await d.store.getEntry(r.id);
  assert.equal(e.status, 'pending_payment');
  assert.equal(e.paidAt, null);
  assert.equal((await d.store.listPayments(r.id)).filter((p) => p.paypalCaptureId).length, 1);
  assert.equal(d.mails.length, 0);
});

test('capture: wrong token, wrong order id, expired entry', async () => {
  const d = setup();
  const { r, o } = await paypalEntry(d);
  await rejects(captureAndRecord(d, { entryId: r.id, receiptToken: 'x', orderId: o.orderId }), 404);
  await rejects(captureAndRecord(d, { entryId: r.id, receiptToken: r.receiptToken, orderId: 'OTHER' }), 409, 'order_mismatch');
  await d.store.updateEntry(r.id, { status: 'expired' });
  await rejects(captureAndRecord(d, { entryId: r.id, receiptToken: r.receiptToken, orderId: o.orderId }), 409, 'entry_expired');
  assert.equal(d.calls.capture.length, 0);
});

test('webhook: bad signature rejected, nothing changes', async () => {
  const d = setup();
  const { entry } = await paypalEntry(d);
  d.paypal.verifyOk = false;
  const out = await handleWebhook(d, hook(entry));
  assert.equal(out.httpStatus, 400);
  assert.equal((await d.store.getEntry(entry.id)).status, 'pending_payment');
});

test('webhook confirms on CAPTURE.COMPLETED with exact amount, emails once, dedupes', async () => {
  const d = setup();
  const { entry } = await paypalEntry(d);
  const out = await handleWebhook(d, hook(entry));
  assert.equal(out.httpStatus, 200);
  const e = await d.store.getEntry(entry.id);
  assert.equal(e.status, 'confirmed');
  assert.ok(e.paidAt);
  assert.equal(d.mails.length, 1);
  assert.equal(d.mails[0].to, 'test@example.com');
  const again = await handleWebhook(d, hook(entry));
  assert.equal(again.body.duplicate, true);
  // same capture under a different transmission id: still no second email or payment
  await handleWebhook(d, hook(entry, {}, 'WH2'));
  assert.equal(d.mails.length, 1);
  assert.equal((await d.store.listPayments(entry.id)).filter((p) => p.paypalCaptureId).length, 1);
});

test('webhook before capture request, then capture request: confirmed once, one capture row', async () => {
  const d = setup();
  const { r, o, entry } = await paypalEntry(d);
  await handleWebhook(d, hook(entry));
  assert.equal((await d.store.getEntry(r.id)).status, 'confirmed');
  d.paypal.captureResult = cap(entry);
  const out = await captureAndRecord(d, { entryId: r.id, receiptToken: r.receiptToken, orderId: o.orderId });
  assert.equal(out.status, 'confirmed');
  assert.equal(d.mails.length, 1);
  assert.equal(d.calls.capture.length, 0);
});

test('capture request before webhook: webhook then confirms without a duplicate payment row', async () => {
  const d = setup();
  const { r, o, entry } = await paypalEntry(d);
  d.paypal.captureResult = cap(entry);
  await captureAndRecord(d, { entryId: r.id, receiptToken: r.receiptToken, orderId: o.orderId });
  await handleWebhook(d, hook(entry));
  assert.equal((await d.store.getEntry(r.id)).status, 'confirmed');
  assert.equal((await d.store.listPayments(r.id)).filter((p) => p.paypalCaptureId).length, 1);
});

test('amount tampering: wrong amount or currency is flagged, not confirmed', async () => {
  for (const over of [{ amount: { value: '1.00', currency_code: 'USD' } }, { amount: { value: '60.00', currency_code: 'EUR' } }, { amount: { value: 'abc', currency_code: 'USD' } }]) {
    const d = setup();
    const { entry } = await paypalEntry(d);
    await handleWebhook(d, hook(entry, over));
    const e = await d.store.getEntry(entry.id);
    assert.equal(e.status, 'pending_payment');
    assert.ok(review(e));
    assert.equal(d.mails.length, 0);
    assert.equal((await d.store.listPayments(entry.id)).filter((p) => p.paypalCaptureId).length, 1);
  }
});

test('capture request with tampered order amount is flagged and not confirmed', async () => {
  const d = setup();
  const { r, o, entry } = await paypalEntry(d);
  d.paypal.captureResult = cap(entry, { amount: { value: '1.00', currency_code: 'USD' } });
  await captureAndRecord(d, { entryId: r.id, receiptToken: r.receiptToken, orderId: o.orderId });
  const e = await d.store.getEntry(r.id);
  assert.equal(e.status, 'pending_payment');
  assert.ok(review(e));
});

test('payment after expiry: recorded and flagged, entry stays expired', async () => {
  const d = setup();
  const { entry } = await paypalEntry(d);
  await d.store.updateEntry(entry.id, { status: 'expired' });
  await handleWebhook(d, hook(entry));
  const e = await d.store.getEntry(entry.id);
  assert.equal(e.status, 'expired');
  assert.ok(review(e));
  assert.equal(d.mails.length, 0);
  assert.equal((await d.store.listPayments(entry.id)).filter((p) => p.paypalCaptureId).length, 1);
});

test('second different capture on a confirmed entry is flagged, no second email', async () => {
  const d = setup();
  const { entry } = await paypalEntry(d);
  await handleWebhook(d, hook(entry));
  await handleWebhook(d, hook(entry, { id: 'CAP2' }, 'WH9'));
  const e = await d.store.getEntry(entry.id);
  assert.equal(e.status, 'confirmed');
  assert.ok(review(e));
  assert.equal(d.mails.length, 1);
});

test('webhook ignores other events, unknown entries; failure is not marked processed', async () => {
  const d = setup();
  const { entry } = await paypalEntry(d);
  const other = { headers: { 'paypal-transmission-id': 'WHX' }, body: { id: 'WHX', event_type: 'PAYMENT.CAPTURE.DENIED', resource: cap(entry) } };
  assert.equal((await handleWebhook(d, other)).httpStatus, 200);
  assert.equal((await d.store.getEntry(entry.id)).status, 'pending_payment');
  const unknown = hook({ id: 'SWD-2026-NOPE-0001', amountCents: 6000 }, {}, 'WHU');
  // an unmatched COMPLETED capture is recorded as an orphan and answered 500 (not marked processed): see the orphan test
  assert.equal((await handleWebhook(d, unknown)).httpStatus, 500);
  assert.equal(await d.store.hasProcessedWebhook('WHU'), false);
  d.store.getEntry = async () => { throw new Error('db down'); };
  assert.equal((await handleWebhook(d, hook(entry, {}, 'WHF'))).httpStatus, 500);
  assert.equal(await d.store.hasProcessedWebhook('WHF'), false);
});

test('status: wrong token reveals nothing; safe fields only; no contact details', async () => {
  const d = setup();
  const r = await createEntry(d, body());
  await rejects(getStatus(d, { entryId: r.id, receiptToken: 'nope' }), 404, 'not_found');
  await rejects(getStatus(d, { entryId: r.id, receiptToken: '' }), 404);
  const s = await getStatus(d, { entryId: r.id, receiptToken: r.receiptToken });
  assert.equal(s.status, 'pending_payment');
  const json = JSON.stringify(s);
  assert.ok(!json.includes('ann@example.com') && !json.includes('555') && !json.includes(r.receiptToken) && !json.includes('notes'));
  assert.deepEqual(Object.keys(s.players[0]).sort(), ['club', 'name', 'role']);
});

test('status reconciles a pending PayPal order from the server-side order read', async () => {
  const d = setup();
  const { r, entry } = await paypalEntry(d);
  d.paypal.captureResult = cap(entry);
  const s = await getStatus(d, { entryId: r.id, receiptToken: r.receiptToken });
  assert.equal(s.status, 'confirmed');
  assert.equal(d.calls.get, 1);
  assert.equal(d.mails.length, 1);
  await getStatus(d, { entryId: r.id, receiptToken: r.receiptToken }); // confirmed: no further read
  assert.equal(d.calls.get, 1);
});

test('status survives a PayPal outage; reconcile ignores an order whose custom_id is another entry', async () => {
  const d = setup();
  const { r, entry } = await paypalEntry(d);
  d.paypal.getOrder = async () => { throw new Error('down'); };
  assert.equal((await getStatus(d, { entryId: r.id, receiptToken: r.receiptToken })).status, 'pending_payment');
  d.paypal.getOrder = async (id) => ({ id, purchase_units: [{ custom_id: 'SWD-2026-OTHER-0001', payments: { captures: [cap(entry)] } }] });
  await reconcileOrder(d, entry.id);
  assert.equal((await d.store.getEntry(entry.id)).status, 'pending_payment');
});

test('check/cash entry is never confirmed by a PayPal capture', async () => {
  const d = setup();
  const r = await createEntry(d, body({ method: 'check' }));
  const e = await d.store.getEntry(r.id);
  await handleWebhook(d, hook(e));
  assert.equal((await d.store.getEntry(r.id)).status, 'pending_payment');
});

test('valueToCents', () => {
  assert.equal(valueToCents('60.00'), 6000);
  assert.equal(valueToCents('60.5'), 6050);
  assert.equal(valueToCents('-1'), null);
  assert.equal(valueToCents(undefined), null);
});

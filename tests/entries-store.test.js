import test from 'node:test';
import assert from 'node:assert/strict';
import { feeToCents } from '../api/entries/_lib/fee.js';
import { isSandbox, mailMode, publicUrl, testRecipient, DEFAULT_PUBLIC_URL } from '../api/entries/_lib/config.js';
import { createMemoryStore, loadEvents, parseEventEndDate, normalizeEvent, createSupabaseStore } from '../api/entries/_lib/store.js';

test('fee: every pattern in events-data.json', () => {
  assert.equal(feeToCents('$60/team', null, 2), 6000);
  assert.equal(feeToCents('$45 per team', null, 3), 4500);
  assert.equal(feeToCents('$15/player', null, 1), 1500);
  assert.equal(feeToCents('$30 per player', null, 1), 3000);
  assert.equal(feeToCents('$30 per person', null, 4), 12000);
  assert.equal(feeToCents('$450 per team ($150 per player)', null, 3), 45000);
  assert.equal(feeToCents('$120 per team ($40 per player)', null, 3), 12000);
  assert.equal(feeToCents('$120 per team · 100% paid out in prizes ($1,000 to the winning team, assuming 14 teams register)', null, 3), 12000);
  assert.equal(feeToCents('$20', null, 1), 2000); // bare, singles
  assert.equal(feeToCents('$1.00 test payment', 'team', 3), 100);
});
test('fee: bare amount is ambiguous without a unit', () => {
  assert.equal(feeToCents('$60', null, 2), null);
  assert.equal(feeToCents('$60', 'team', 2), 6000);
  assert.equal(feeToCents('$30', 'per_player', 4), 12000);
  assert.equal(feeToCents('$30', 'player', null), null);
});
test('fee: blank, TBD, junk are null; free is 0; decimals and commas', () => {
  for (const t of ['', '   ', 'TBD — check back soon', 'call us', null, undefined, 42]) assert.equal(feeToCents(t, 'team', 2), null);
  assert.equal(feeToCents('Free', null, 2), 0);
  assert.equal(feeToCents('$12.50/team', null, 2), 1250);
  assert.equal(feeToCents('$1,200 per team', null, 4), 120000);
  assert.equal(feeToCents('$0.5/team', null, 2), 50);
});

test('config helpers', () => {
  assert.equal(isSandbox({ HUB_PAYPAL_ENV: 'sandbox' }), true);
  for (const v of ['live', 'Sandbox', 'sandbox ', '', undefined]) assert.equal(isSandbox({ HUB_PAYPAL_ENV: v }), false);
  assert.equal(mailMode({}), 'dryrun');
  assert.equal(mailMode({ ENTRIES_MAIL_MODE: 'live' }), 'live');
  assert.equal(mailMode({ ENTRIES_MAIL_MODE: 'LIVE' }), 'dryrun');
  assert.equal(publicUrl({}), DEFAULT_PUBLIC_URL);
  assert.equal(publicUrl({ ENTRIES_PUBLIC_URL: 'https://x.test/' }), 'https://x.test');
  assert.equal(testRecipient({}), null);
  assert.equal(testRecipient({ ENTRIES_TEST_RECIPIENT: ' a@b.test ' }), 'a@b.test');
});

test('event date parsing', () => {
  const d = (s) => parseEventEndDate(s)?.toISOString().slice(0, 10);
  assert.equal(d('Saturday, April 18, 2026'), '2026-04-18');
  assert.equal(d('Saturday, May 23 – Monday, May 25, 2026'), '2026-05-25');
  assert.equal(d('April 25-26, 2026'), '2026-04-26');
  assert.equal(d('Sat-Sun March 14-15, 2026'), '2026-03-15');
  assert.equal(d('Saturday–Sunday, July 18–19, 2026'), '2026-07-19');
  assert.equal(d('Saturday, August 15 (Women) & Sunday, August 16, 2026 (Men)'), '2026-08-16');
  assert.equal(parseEventEndDate('Test page'), null);
});

test('events-data.json loads; open only when upcoming, not cancelled, fee known', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  const evs = loadEvents({ now });
  assert.equal(evs.length, 51);
  const by = Object.fromEntries(evs.map((e) => [e.id, e]));
  assert.equal(by['vet-novice-mix-match-triples-2026'].open, false); // April, past
  const g = by['groves-mixed-triples-2026'];
  assert.equal(g.open, true);
  assert.equal(g.amountCents, 9000);
  assert.deepEqual(g.roles, ['Skip', 'Vice', 'Lead']);
  assert.equal(by['laguna-open-pairs-2026'].open, false); // TBD fee and past
  assert.equal(by['paypal-test-coronado'].open, false); // no date
  assert.deepEqual(by['mumma-mixed-pairs-2026'].roles.length, 2);
  assert.deepEqual(by['waterbury-2026'].roles, ['Skip', 'Vice', 'Lead']); // flyer: three-person triples teams
});

test('cancelled and no-fee events stay closed', () => {
  const now = new Date('2026-01-01');
  const base = { id: 'x', title: 'X', date: 'Saturday, June 6, 2026', fee: '$60/team', format: 'pairs', club: { name: 'C' } };
  assert.equal(normalizeEvent(base, now).open, true);
  assert.equal(normalizeEvent({ ...base, alertLabel: 'Event Cancelled' }, now).open, false);
  assert.equal(normalizeEvent({ ...base, alertLabel: 'Event Cancelled' }, now).status, 'cancelled');
  assert.equal(normalizeEvent({ ...base, fee: '' }, now).open, false);
  assert.equal(normalizeEvent({ ...base, paypal: { playerLabels: ['A', 'B', 'C', 'D'] }, fee: '$10 per person' }, now).amountCents, 4000);
});

const entry = (id, over = {}) => ({
  id, eventId: 'ev1', status: 'pending_payment', method: 'paypal',
  players: [{ role: 'Skip', name: 'A', club: 'C' }], contact: { name: 'A', email: 'a@x.test', phone: '' },
  amountCents: 6000, currency: 'USD', receiptToken: 'tok', ...over,
});

test('memory store CRUD', async () => {
  const s = createMemoryStore({ events: [{ id: 'ev1', title: 'E', open: true }] });
  assert.equal((await s.getEvent('ev1')).title, 'E');
  assert.equal(await s.getEvent('nope'), null);
  const c = await s.createEntry(entry('SWD-2026-EV1-0001'));
  assert.equal(c.paidAt, null);
  assert.ok(c.createdAt && c.updatedAt);
  await assert.rejects(() => s.createEntry(entry('SWD-2026-EV1-0001')));
  c.status = 'hacked'; // returned objects are copies
  assert.equal((await s.getEntry('SWD-2026-EV1-0001')).status, 'pending_payment');
  await s.createEntry(entry('SWD-2026-EV1-0002', { eventId: 'ev2' }));
  const u = await s.updateEntry('SWD-2026-EV1-0001', { status: 'confirmed', paypalOrderId: 'ORD1', paidAt: 'now', id: 'evil' });
  assert.equal(u.status, 'confirmed');
  assert.equal(u.id, 'SWD-2026-EV1-0001');
  assert.equal((await s.findEntryByOrderId('ORD1')).id, 'SWD-2026-EV1-0001');
  assert.equal(await s.findEntryByOrderId('ORD2'), null);
  assert.equal((await s.listEntries('ev1')).length, 1);
  await assert.rejects(() => s.updateEntry('missing', {}));
  const p = await s.addPayment({ entryId: 'SWD-2026-EV1-0001', method: 'paypal', amountCents: 6000, paypalCaptureId: 'CAP1' });
  assert.ok(p.id);
  assert.equal((await s.addPayment({ entryId: 'SWD-2026-EV1-0001', paypalCaptureId: 'CAP1' })).id, p.id); // idempotent on capture id
  assert.equal((await s.listPayments()).length, 1);
});

test('webhook de-duplication', async () => {
  const s = createMemoryStore();
  assert.equal(await s.hasProcessedWebhook('WH-1'), false);
  assert.equal(await s.markWebhookProcessed('WH-1'), true);
  assert.equal(await s.hasProcessedWebhook('WH-1'), true);
  assert.equal(await s.markWebhookProcessed('WH-1'), false);
  assert.equal(await s.hasProcessedWebhook('WH-2'), false);
});

test('supabase draft store maps rows with a fake client (no network)', async () => {
  const calls = [];
  const q = (data) => {
    const o = { select: () => o, eq: () => o, order: () => o, insert: (v) => (calls.push(v), o), update: () => o,
      single: async () => ({ data, error: null }), maybeSingle: async () => ({ data, error: null }),
      then: (r) => r({ data: Array.isArray(data) ? data : [], error: null }) };
    return o;
  };
  const row = { id: 'u1', public_ref: 'R1', event_id: 'ev1', status: 'confirmed', payment_choice: 'paypal',
    contact_name: 'A', contact_email: 'a@x.test', amount_due_cents: 6000, created_at: 't', updated_at: 't' };
  const s = createSupabaseStore({ from: (t) => q(t === 'entry_players' ? [{ position: 'skip', full_name: 'A', club_name: 'C' }] : row) });
  const e = await s.getEntry('R1');
  assert.equal(e.id, 'R1');
  assert.equal(e.method, 'paypal');
});

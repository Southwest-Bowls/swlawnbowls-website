// Regression tests for the review findings (numbered in the test names). No network, no secrets.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  createMemoryStore, createSupabaseStore, createStaticEvents, loadEvents, normalizeEvent, deadlineDate,
} from '../api/entries/_lib/store.js';
import {
  createEntry, startPayment, captureAndRecord, handleWebhook, getStatus, reconcileOrder,
  ServiceError, buildDeps, resetSharedForTests, makePayPalAdapter, receiptTokenFrom, memoryStoreAllowed,
} from '../api/entries/_lib/service.js';
import { createPayPalClient } from '../api/entries/_lib/paypal.js';

const EVENT = { id: 'spring-open', title: 'Spring Open', date: 'May 1', venue: 'Club', feeText: '$60/team', amountCents: 6000, unit: 'team', format: 'pairs', roles: ['Skip', 'Lead'], open: true, status: 'entries_open' };
const body = (o = {}) => ({
  eventId: 'spring-open', method: 'paypal',
  players: [{ role: 'Lead', name: 'Ann Lee', club: 'A' }, { role: 'Skip', name: 'Bo Kim', club: 'B' }],
  contact: { name: 'Ann Lee', email: 'ann@example.com', phone: '555' }, ...o,
});
const rejects = (p, status, code) => assert.rejects(p, (e) => e instanceof ServiceError && e.status === status && (!code || e.code === code));

function setup({ store, eventOver = {} } = {}) {
  let t = Date.parse('2026-05-01T12:00:00Z');
  const mails = [];
  const orders = {};
  const calls = { create: [], capture: [], get: 0 };
  const paypal = {
    verifyOk: true,
    captureResult: null,
    async createOrder(o) { calls.create.push(o); const id = `ORD${calls.create.length}`; orders[id] = o; return { id }; },
    async captureOrder(id) { calls.capture.push(id); return paypal.orderJson(id); },
    async getOrder(id) { calls.get++; return paypal.orderJson(id); },
    async verifyWebhook() { return { ok: paypal.verifyOk }; },
    orderJson(id) {
      const o = orders[id];
      return { id, purchase_units: [{ custom_id: o?.entryId, payments: paypal.captureResult ? { captures: [paypal.captureResult] } : undefined }] };
    },
  };
  return {
    store: store || createMemoryStore({ events: [{ ...EVENT, ...eventOver }] }),
    paypal, calls, mails,
    mailer: { async sendMail(m) { mails.push(m); return {}; } },
    testRecipient: 'test@example.com',
    now: () => (t += 1000),
    random: (n) => crypto.randomBytes(n),
    feeToCents: () => null,
  };
}
const cap = (entry, over = {}) => ({ id: 'CAP1', status: 'COMPLETED', amount: { value: (entry.amountCents / 100).toFixed(2), currency_code: 'USD' }, custom_id: entry.id, ...over });
const hook = (entry, over = {}, evId = 'WH1', orderId = 'ORD1') => ({
  headers: { 'paypal-transmission-id': evId },
  body: { id: evId, event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { ...cap(entry), supplementary_data: { related_ids: { order_id: orderId } }, ...over } },
});
async function paypalEntry(d, over = {}) {
  const r = await createEntry(d, body(over));
  const o = await startPayment(d, { entryId: r.id, receiptToken: r.receiptToken });
  return { r, o, entry: await d.store.getEntry(r.id) };
}

// ------------------------------------------------------------ 1. events-data.json reaches the handlers
const NOW = new Date('2026-10-15T12:00:00Z');
const rawFor = (e) => ({ id: 'x', title: 'X', date: 'Saturday, November 7, 2026', fee: '$60/team', format: 'pairs', club: { name: 'C' }, ...e });

test('1. createEntry works against real loadEvents() output through the static event source', async () => {
  const open = loadEvents({ now: NOW }).filter((e) => e.open);
  assert.ok(open.length > 0, 'expect at least one open event in events-data.json at the test date');
  const ev = open[0];
  const d = setup({ store: createMemoryStore({}, { eventSource: createStaticEvents({ now: () => NOW.getTime() }) }) });
  d.now = () => NOW.getTime();
  const players = ev.roles.map((role, i) => ({ role, name: `Player Number${i}`, club: 'C' }));
  const r = await createEntry(d, { eventId: ev.id, method: 'check', players, contact: { name: 'Ann Lee', email: 'a@example.com' } });
  assert.equal((await d.store.getEntry(r.id)).amountCents, ev.amountCents);
  assert.equal(r.status, 'pending_payment');
});

test('1. buildDeps (memory opt-in) finds events from events-data.json and fixes the clock per lookup', async () => {
  resetSharedForTests();
  const ev = loadEvents({ now: NOW }).find((e) => e.open);
  const deps = await buildDeps({ ENTRIES_ALLOW_MEMORY_STORE: '1' }, { now: () => NOW.getTime() });
  const got = await deps.store.getEvent(ev.id);
  assert.equal(got.id, ev.id);
  assert.equal(got.open, true);
  const players = ev.roles.map((role, i) => ({ role, name: `Player Number${i}`, club: 'C' }));
  const r = await createEntry(deps, { eventId: ev.id, method: 'cash', players, contact: { name: 'Ann Lee', email: 'a@example.com' } });
  assert.match(r.id, /^SWD-/);
  resetSharedForTests();
});

// ------------------------------------------------------------ 7. fail closed
test('7. buildDeps refuses a memory store when deployed unless explicitly allowed', async () => {
  for (const env of [{ VERCEL: '1' }, { NODE_ENV: 'production' }, { VERCEL: '1', ENTRIES_ALLOW_MEMORY_STORE: '0' }]) {
    resetSharedForTests();
    await rejects(buildDeps(env), 503, 'store_unavailable');
  }
  resetSharedForTests();
  assert.ok(await buildDeps({ VERCEL: '1', ENTRIES_ALLOW_MEMORY_STORE: '1' }));
  resetSharedForTests();
  assert.ok(await buildDeps({})); // local dev: fine
  assert.equal(memoryStoreAllowed({ NODE_ENV: 'production' }), false);
  assert.equal(memoryStoreAllowed({ NODE_ENV: 'development' }), true);
  resetSharedForTests();
});

// ------------------------------------------------------------ 2. request id follows the amount
test('2. a re-priced order is not replayed: fake PayPal dedupes on PayPal-Request-Id', async () => {
  const seen = new Map();
  const headersSeen = [];
  const fetch = async (url, opts) => {
    const j = (o) => ({ ok: true, status: 200, json: async () => o });
    if (url.endsWith('/v1/oauth2/token')) return j({ access_token: 'T', expires_in: 3600 });
    const rid = opts.headers['PayPal-Request-Id'];
    headersSeen.push(rid);
    if (!seen.has(rid)) seen.set(rid, { id: `ORDER${seen.size + 1}`, amount: JSON.parse(opts.body).purchase_units[0].amount.value });
    return j({ id: seen.get(rid).id });
  };
  const env = { HUB_PAYPAL_ENV: 'sandbox', HUB_PAYPAL_CLIENT_ID: 'i', HUB_PAYPAL_CLIENT_SECRET: 's' };
  const adapter = makePayPalAdapter(createPayPalClient({ fetch, env }));
  const d = setup();
  d.paypal = adapter;
  const r = await createEntry(d, body());
  const a = await startPayment(d, { entryId: r.id, receiptToken: r.receiptToken });
  d.store = createMemoryStore({ events: [{ ...EVENT, amountCents: 7000 }], entries: [await d.store.getEntry(r.id)] });
  const b = await startPayment(d, { entryId: r.id, receiptToken: r.receiptToken });
  assert.notEqual(a.orderId, b.orderId);
  assert.deepEqual(headersSeen, [`${r.id}-6000`, `${r.id}-7000`]);
  assert.equal(seen.get(`${r.id}-7000`).amount, '70.00');
});

// ------------------------------------------------------------ 3. orphan payments
test('3. webhook for an unmatched entry: orphan recorded, 500, not marked processed, retry stays safe', async () => {
  const d = setup();
  await paypalEntry(d);
  const ghost = hook({ id: 'SWD-2026-NOPE-0001', amountCents: 6000 }, { id: 'CAPX' }, 'WHG', 'ORDX');
  const out = await handleWebhook(d, ghost);
  assert.equal(out.httpStatus, 500);
  assert.equal(await d.store.hasProcessedWebhook('WHG'), false);
  assert.deepEqual((await d.store.listOrphanPayments()).map((o) => o.paypalCaptureId), ['CAPX']);
  assert.equal((await handleWebhook(d, ghost)).httpStatus, 500); // PayPal retries
  assert.equal((await d.store.listOrphanPayments()).length, 1); // still one record
});

// ------------------------------------------------------------ 4 + 14. store contract on both stores
function fakeSupabase() {
  const tables = { entries: [], entry_players: [], entry_notes: [], payments: [], entry_webhook_events: [], entry_orphan_payments: [] };
  const unique = {
    entries: [['public_ref']], payments: [['paypal_capture_id'], ['paypal_order_id']], entry_notes: [['entry_id', 'note']],
    entry_webhook_events: [['event_id']], entry_orphan_payments: [['paypal_capture_id']], entry_players: [['entry_id', 'seat']],
  };
  const enums = {
    entry_players: { position: ['skip', 'vice', 'lead', 'second', 'player', null] },
    payments: { status: ['created', 'paid', 'failed', 'partially_refunded', 'refunded', 'voided'] },
  };
  let seq = 0;
  const from = (table) => {
    const rows = tables[table];
    let filters = [], op = 'select', payload = null, orderBy = null;
    const match = (r) => filters.every(([c, v]) => r[c] === v);
    const run = () => {
      if (op === 'insert') {
        const list = Array.isArray(payload) ? payload : [payload];
        const out = [];
        for (const p of list) {
          for (const [col, allowed] of Object.entries(enums[table] || {})) {
            if (col in p && !allowed.includes(p[col])) return { data: null, error: { code: '22P02', message: `bad enum ${col}=${p[col]}` } };
          }
          for (const cols of unique[table] || []) {
            if (cols.every((c) => p[c] != null) && rows.some((r) => cols.every((c) => r[c] === p[c]))) {
              return { data: null, error: { code: '23505', message: `duplicate ${cols}` } };
            }
          }
          const row = { id: table === 'entry_notes' ? ++seq : `u${++seq}`, created_at: new Date(1e12 + seq).toISOString(), ...p };
          if (table === 'entries') row.updated_at = row.created_at;
          rows.push(row);
          out.push(row);
        }
        return { data: out.map((r) => ({ ...r })), error: null };
      }
      if (op === 'update') {
        const hit = rows.filter(match);
        for (const r of hit) {
          for (const [col, allowed] of Object.entries(enums[table] || {})) {
            if (col in payload && !allowed.includes(payload[col])) return { data: null, error: { code: '22P02', message: 'bad enum' } };
          }
          Object.assign(r, payload);
        }
        return { data: hit.map((r) => ({ ...r })), error: null };
      }
      let hit = rows.filter(match).map((r) => ({ ...r }));
      if (orderBy) hit.sort((a, b) => (a[orderBy] > b[orderBy] ? 1 : a[orderBy] < b[orderBy] ? -1 : 0));
      return { data: hit, error: null };
    };
    const one = (strict) => {
      const r = run();
      if (r.error) return r;
      if (r.data.length > 1 || (strict && r.data.length !== 1)) return { data: null, error: { code: 'PGRST116', message: 'rows != 1' } };
      return { data: r.data[0] || null, error: null };
    };
    const b = {
      select: () => b,
      insert: (p) => { op = 'insert'; payload = p; return b; },
      update: (p) => { op = 'update'; payload = p; return b; },
      eq: (c, v) => { filters.push([c, v]); return b; },
      order: (c) => { orderBy = c; return b; },
      single: async () => one(true),
      maybeSingle: async () => one(false),
      then: (res, rej) => Promise.resolve(run()).then(res, rej),
    };
    return b;
  };
  return { from, tables };
}

const SEED_ENTRY = (over = {}) => ({
  id: 'SWD-2026-SPRING-0001', eventId: 'spring-open', status: 'pending_payment', method: 'paypal',
  players: [{ role: 'Skip', name: 'Bo Kim', club: 'B' }, { role: 'Lead', name: 'Ann Lee', club: 'A' }],
  contact: { name: 'Ann Lee', email: 'a@x.test', phone: '' }, amountCents: 6000, currency: 'USD', receiptToken: 'tok',
  submittedBy: 'u-sub', entryNo: 1, notes: [], ...over,
});
const stores = {
  memory: () => createMemoryStore({ events: [EVENT] }),
  supabase: () => createSupabaseStore(fakeSupabase(), { eventSource: { getEvent: async (id) => (id === EVENT.id ? { ...EVENT } : null) } }),
};
for (const [name, make] of Object.entries(stores)) {
  test(`4/5/14. store contract (${name}): notes, roles, conditional transition, idempotent payments, orphans`, async () => {
    const s = make();
    const e = await s.createEntry(SEED_ENTRY());
    // 14: roles come back exactly as the event labels them
    assert.deepEqual(e.players.map((p) => p.role), ['Skip', 'Lead']);
    assert.deepEqual((await s.getEntry(e.id)).players.map((p) => p.role), ['Skip', 'Lead']);
    // 4: notes persist, and an identical note is not added twice
    assert.equal((await s.appendNote(e.id, 'capture:C1')).added, true);
    assert.equal((await s.appendNote(e.id, 'capture:C1')).added, false);
    await s.appendNote(e.id, 'needs_review: x');
    assert.deepEqual((await s.getEntry(e.id)).notes, ['capture:C1', 'needs_review: x']);
    // 5: conditional transition changes the row once
    const won = await s.transitionEntry(e.id, 'pending_payment', { status: 'confirmed', paidAt: '2026-05-01T00:00:00.000Z' }, { note: 'capture:C2' });
    assert.equal(won.status, 'confirmed');
    assert.ok(won.notes.includes('capture:C2'));
    assert.equal(await s.transitionEntry(e.id, 'pending_payment', { status: 'confirmed' }, { note: 'capture:C3' }), null);
    assert.ok(!(await s.getEntry(e.id)).notes.includes('capture:C3'));
    // 5/6: payments are idempotent on capture id and the created row is promoted
    const created = await s.addPayment({ entryId: e.id, paypalOrderId: 'ORD1', status: 'created', amountCents: 6000, currency: 'USD', method: 'paypal' });
    assert.equal(created.status, 'created');
    const p1 = await s.addPayment({ entryId: e.id, paypalOrderId: 'ORD1', paypalCaptureId: 'CAP1', status: 'captured', amountCents: 6000, currency: 'USD', method: 'paypal' });
    const p2 = await s.addPayment({ entryId: e.id, paypalOrderId: 'ORD1', paypalCaptureId: 'CAP1', status: 'captured', amountCents: 6000, currency: 'USD', method: 'paypal' });
    assert.equal(p1.paypalCaptureId, 'CAP1');
    assert.equal(p2.paypalCaptureId, 'CAP1');
    assert.equal((await s.listPayments(e.id)).length, 1);
    await s.updatePayment('CAP1', { status: 'paid' });
    assert.equal((await s.listPayments(e.id))[0].status, 'paid');
    await s.updatePayment('CAP1', { status: 'flagged' });
    assert.equal((await s.listPayments(e.id))[0].status, 'flagged');
    // a different capture on the same order never throws; it is kept as an orphan
    const p3 = await s.addPayment({ entryId: e.id, paypalOrderId: 'ORD1', paypalCaptureId: 'CAP9', status: 'flagged', amountCents: 6000, currency: 'USD', method: 'paypal' });
    assert.equal(p3.orphan, true);
    assert.deepEqual((await s.listOrphanPayments()).map((o) => o.paypalCaptureId), ['CAP9']);
    // orphans are idempotent
    assert.equal((await s.recordOrphanPayment({ paypalCaptureId: 'CAPZ' })).recorded, true);
    assert.equal((await s.recordOrphanPayment({ paypalCaptureId: 'CAPZ' })).recorded, false);
    // webhook dedupe
    assert.equal(await s.markWebhookProcessed('W1'), true);
    assert.equal(await s.markWebhookProcessed('W1'), false);
    assert.equal(await s.hasProcessedWebhook('W1'), true);
  });
}

test('14. supabase: a role outside the enum is stored as null, never crashes; case round trip uses the event label', async () => {
  const s = stores.supabase();
  const e = await s.createEntry(SEED_ENTRY({ players: [{ role: 'SKIP', name: 'Bo Kim' }, { role: 'Pitcher', name: 'Al Lee' }] }));
  assert.deepEqual(e.players.map((p) => p.role), ['Skip', '']);
});

test('4. full service flow runs on the supabase store (fake client): confirmed once, markers persist', async () => {
  const d = setup({ store: stores.supabase() });
  const { r, entry } = await paypalEntry(d);
  await handleWebhook(d, hook(entry));
  const e = await d.store.getEntry(r.id);
  assert.equal(e.status, 'confirmed');
  assert.ok(e.notes.includes(`capture:CAP1`));
  await handleWebhook(d, hook(entry, {}, 'WH2')); // same capture, new delivery: no second mail, no second row
  assert.equal(d.mails.length, 1);
  const pays = await d.store.listPayments(r.id);
  assert.equal(pays.length, 1);
  assert.equal(pays[0].status, 'paid');
});

// ------------------------------------------------------------ 5 + 6. atomicity and promotion
test('6. the payment row written by capture is promoted to paid by the verified path (and to flagged on mismatch)', async () => {
  const d = setup();
  const { r, o, entry } = await paypalEntry(d);
  d.paypal.captureResult = cap(entry);
  await captureAndRecord(d, { entryId: r.id, receiptToken: r.receiptToken, orderId: o.orderId });
  assert.equal((await d.store.listPayments(r.id))[0].status, 'captured');
  await handleWebhook(d, hook(entry));
  const rows = await d.store.listPayments(r.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'paid');

  const m = setup();
  const x = await paypalEntry(m);
  m.paypal.captureResult = cap(x.entry, { amount: { value: '1.00', currency_code: 'USD' } });
  await captureAndRecord(m, { entryId: x.r.id, receiptToken: x.r.receiptToken, orderId: x.o.orderId });
  await handleWebhook(m, hook(x.entry, { amount: { value: '1.00', currency_code: 'USD' } }));
  assert.equal((await m.store.listPayments(x.r.id))[0].status, 'flagged');
});

test('5. interleaved webhook + reconcile + capture on stale reads: one confirmation, one email, one payment row', async () => {
  for (const kind of ['memory', 'supabase']) {
    const d = setup({ store: stores[kind]() });
    const { r, o, entry } = await paypalEntry(d);
    d.paypal.captureResult = cap(entry);
    // Yield between every store call so the three flows genuinely interleave.
    const slow = (store) => new Proxy(store, {
      get: (t, k) => (typeof t[k] === 'function' ? async (...a) => { await new Promise((res) => setImmediate(res)); return t[k](...a); } : t[k]),
    });
    d.store = slow(d.store);
    const stale = await d.store.getEntry(r.id); // everyone starts from a pending read
    await Promise.all([
      handleWebhook(d, hook(entry)),
      reconcileOrder(d, stale),
      captureAndRecord(d, { entryId: r.id, receiptToken: r.receiptToken, orderId: o.orderId }),
      handleWebhook(d, hook(entry, {}, 'WH-b')),
    ]);
    const e = await d.store.getEntry(r.id);
    assert.equal(e.status, 'confirmed', kind);
    assert.equal(d.mails.length, 1, `${kind}: exactly one paid email`);
    const pays = (await d.store.listPayments(r.id)).filter((p) => p.paypalCaptureId);
    assert.equal(pays.length, 1, kind);
    assert.equal(pays[0].status, 'paid', kind);
    assert.ok(!e.notes.some((n) => n.startsWith('needs_review')), `${kind}: no false flag: ${e.notes}`);
  }
});

test('5. two different captures racing: exactly one confirms, the other is flagged', async () => {
  const d = setup();
  const { entry } = await paypalEntry(d);
  const real = d.store;
  d.store = new Proxy(real, {
    get: (t, k) => (typeof t[k] === 'function' ? async (...a) => { await new Promise((res) => setImmediate(res)); return t[k](...a); } : t[k]),
  });
  await Promise.all([handleWebhook(d, hook(entry, { id: 'CAPA' }, 'WA')), handleWebhook(d, hook(entry, { id: 'CAPB' }, 'WB'))]);
  const e = await real.getEntry(entry.id);
  assert.equal(e.status, 'confirmed');
  assert.equal(d.mails.length, 1);
  assert.equal(e.notes.filter((n) => n.startsWith('needs_review: duplicate_payment')).length, 1);
});

// ------------------------------------------------------------ 8. receipt token header
test('8. receipt token: header preferred, query still works', () => {
  assert.equal(receiptTokenFrom({ headers: { 'x-receipt-token': 'H' } }, { token: 'Q' }), 'H');
  assert.equal(receiptTokenFrom({ headers: {} }, { token: 'Q' }), 'Q');
  assert.equal(receiptTokenFrom({ headers: { 'x-receipt-token': ' ' } }, { token: 'Q' }), 'Q');
  assert.equal(receiptTokenFrom(undefined, { token: 'Q' }), 'Q');
  assert.equal(receiptTokenFrom({ headers: {} }, {}), undefined);
});

// ------------------------------------------------------------ 9. roles
test('9. events with blank, 2+2 or rinks format are not open; validate rejects a no-roles event', async () => {
  for (const format of ['', '2+2', 'rinks', undefined]) {
    assert.equal(normalizeEvent(rawFor({ format }), NOW).open, false, `format ${format}`);
  }
  assert.equal(normalizeEvent(rawFor({ format: 'pairs' }), NOW).open, true);
  const d = setup({ eventOver: { roles: [], open: true } });
  await rejects(createEntry(d, body()), 409, 'event_closed');
  const real = loadEvents({ now: NOW });
  assert.ok(real.filter((e) => e.open).every((e) => e.roles.length > 0));
});

// ------------------------------------------------------------ 10. deadline
test('10. entry deadline closes the event once passed; blank stays open (real rows)', () => {
  const r = rawFor({ date: 'Saturday, November 7, 2026', deadline: 'Entry deadline: October 10, 2026 (no refunds after this date)' });
  assert.equal(deadlineDate(r), '2026-10-10');
  assert.equal(normalizeEvent(r, new Date('2026-10-10T20:00:00Z')).open, true); // still the deadline day in California
  const after = normalizeEvent(r, new Date('2026-10-12T12:00:00Z'));
  assert.equal(after.open, false);
  assert.equal(after.status, 'closed');
  assert.equal(normalizeEvent(rawFor({ deadline: '' }), new Date('2026-11-06')).open, true);
  assert.equal(normalizeEvent(rawFor({ deadline: 'Aug 1' }), new Date('2026-10-01')).open, false); // year taken from the event date
  assert.equal(deadlineDate(rawFor({ deadline: 'Entries open Wednesday, August 26, 2026 · capped at 16 teams' })), null);
  assert.equal(deadlineDate(rawFor({ deadline: 'Registration opens July 1 at 9:00 AM · Entry deadline Saturday, August 1, 2026 · Capped' })), '2026-08-01');
  // the app keeps showing "Entries open" when the event says entriesStatus: open
  assert.equal(normalizeEvent(rawFor({ deadline: 'Aug 1', entriesStatus: 'open' }), new Date('2026-10-01')).open, true);
  // every real row with a stated deadline: closed after it, and all rows parse without throwing
  const all = loadEvents({ now: new Date('2026-12-31') });
  assert.ok(all.every((e) => e.open === false));
});

test('10. service enforces the deadline using its own clock', async () => {
  const d = setup({ eventOver: { deadlineAt: '2026-05-02T00:00:00.000Z' } });
  const r = await createEntry(d, body()); // now is 2026-05-01
  d.now = () => Date.parse('2026-05-03T00:00:00Z');
  await rejects(startPayment(d, { entryId: r.id, receiptToken: r.receiptToken }), 409, 'event_closed');
  await rejects(createEntry(d, body()), 409, 'event_closed');
});

// ------------------------------------------------------------ 11. PayPal errors
const httpErr = (status, name, issue) => Object.assign(new Error('x'), { status, code: 'paypal_http', paypal: { name, issues: issue ? [issue] : [] } });

test('11. PayPal failures become ServiceErrors; ORDER_ALREADY_CAPTURED reconciles later; INSTRUMENT_DECLINED is clear', async () => {
  const d = setup();
  const { r, o, entry } = await paypalEntry(d);
  const call = () => captureAndRecord(d, { entryId: r.id, receiptToken: r.receiptToken, orderId: o.orderId });

  d.paypal.captureOrder = async () => { throw httpErr(500, 'INTERNAL_SERVER_ERROR'); };
  await rejects(call(), 502, 'paypal_error');
  d.paypal.captureOrder = async () => { throw new TypeError('fetch failed'); };
  await rejects(call(), 502, 'paypal_error');
  d.paypal.captureOrder = async () => { throw httpErr(422, 'UNPROCESSABLE_ENTITY', 'INSTRUMENT_DECLINED'); };
  await rejects(call(), 422, 'payment_declined');

  d.paypal.captureOrder = async () => { throw httpErr(422, 'UNPROCESSABLE_ENTITY', 'ORDER_ALREADY_CAPTURED'); };
  const out = await call();
  assert.equal(out.status, 'checking');
  assert.equal((await d.store.getEntry(r.id)).status, 'pending_payment'); // the capture endpoint never confirms
  d.paypal.captureResult = cap(entry); // PayPal's order read shows the capture
  const s = await getStatus(d, { entryId: r.id, receiptToken: r.receiptToken });
  assert.equal(s.status, 'confirmed'); // confirmed by the server-side reconcile
  assert.equal(d.mails.length, 1);
});

test('11. startPayment and reconcile wrap PayPal errors too', async () => {
  const d = setup();
  const r = await createEntry(d, body());
  d.paypal.createOrder = async () => { throw httpErr(400, 'INVALID_REQUEST'); };
  await rejects(startPayment(d, { entryId: r.id, receiptToken: r.receiptToken }), 502, 'paypal_error');
  d.paypal.createOrder = async () => { throw Object.assign(new Error('t'), { code: 'paypal_timeout' }); };
  await rejects(startPayment(d, { entryId: r.id, receiptToken: r.receiptToken }), 504, 'paypal_timeout');
});

// ------------------------------------------------------------ 12. timeouts
test('12. every PayPal fetch carries a timeout signal; a never-resolving fetch ends as a 504', async () => {
  const env = { HUB_PAYPAL_ENV: 'sandbox', HUB_PAYPAL_CLIENT_ID: 'i', HUB_PAYPAL_CLIENT_SECRET: 's' };
  const signals = [];
  const fine = async (url, opts) => {
    signals.push(opts.signal);
    return { ok: true, status: 200, json: async () => (url.endsWith('/token') ? { access_token: 'T', expires_in: 3600 } : { id: 'O1' }) };
  };
  const ok = createPayPalClient({ fetch: fine, env });
  await ok.getOrder('ORD1234567890');
  assert.equal(signals.length, 2); // token + order
  assert.ok(signals.every((s) => s instanceof AbortSignal));

  // never resolves and ignores the signal
  const hang = () => new Promise(() => {});
  const c = createPayPalClient({ fetch: hang, env, timeoutMs: 20 });
  await assert.rejects(c.getAccessToken(), (e) => e.code === 'paypal_timeout' && e.status === 504);

  // through the service: a ServiceError(504)
  const d = setup();
  const r = await createEntry(d, body());
  d.paypal = makePayPalAdapter(createPayPalClient({ fetch: hang, env, timeoutMs: 20 }));
  await rejects(startPayment(d, { entryId: r.id, receiptToken: r.receiptToken }), 504, 'paypal_timeout');
});

// ------------------------------------------------------------ 13. double submit and free events
test('13. a double submit returns the existing pending entry; different people or methods do not collide', async () => {
  const d = setup();
  const a = await createEntry(d, body());
  const b = await createEntry(d, body({ contact: { name: 'Ann Lee', email: 'ANN@example.com' } }));
  assert.equal(b.id, a.id);
  assert.equal(b.duplicate, true);
  assert.equal(b.receiptToken, a.receiptToken);
  assert.equal((await d.store.listEntries('spring-open')).length, 1);
  const other = await createEntry(d, body({ method: 'cash' }));
  assert.notEqual(other.id, a.id);
  const diff = await createEntry(d, body({ players: [{ role: 'Lead', name: 'Cy Day' }, { role: 'Skip', name: 'Bo Kim' }] }));
  assert.notEqual(diff.id, a.id);
  // a duplicate check/cash submit does not send the notices again
  const m = setup();
  await createEntry(m, body({ method: 'check' }));
  await createEntry(m, body({ method: 'check' }));
  assert.equal(m.mails.length, 2);
  // old pending entries do not count
  const late = setup();
  const first = await createEntry(late, body());
  const t0 = late.now();
  late.now = () => t0 + 31 * 60 * 1000;
  assert.notEqual((await createEntry(late, body())).id, first.id);
});

test('13. free event: confirmed with no payment only when the event explicitly allows it', async () => {
  const raw = rawFor({ fee: 'Free' });
  assert.equal(normalizeEvent(raw, NOW).open, false); // not explicit: stays closed
  const free = normalizeEvent({ ...raw, freeEntry: true }, NOW);
  assert.equal(free.open, true);
  assert.equal(free.free, true);
  const d = setup({ store: createMemoryStore({ events: [{ ...free, id: 'spring-open' }] }) });
  const r = await createEntry(d, body({ method: 'check', players: free.roles.map((role, i) => ({ role, name: `Person Num${i}` })) }));
  const e = await d.store.getEntry(r.id);
  assert.equal(r.status, 'confirmed');
  assert.equal(e.amountCents, 0);
  assert.equal((await d.store.listPayments(r.id)).length, 0);
  assert.equal(d.mails.length, 1); // the confirmation, nothing about paying
  assert.equal((await createEntry(d, body({ method: 'check', players: free.roles.map((role, i) => ({ role, name: `Person Num${i}` })) }))).duplicate, true);
  // a non-free event with amount 0 is not enterable
  const bad = setup({ eventOver: { amountCents: 0, feeText: 'Free', free: false } });
  await rejects(createEntry(bad, body()), 422, 'fee_unavailable');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createPayPalClient, formatCents, softDescriptor, resolveBase } from '../api/entries/_lib/paypal.js';

const ENV = { HUB_PAYPAL_CLIENT_ID: 'id', HUB_PAYPAL_CLIENT_SECRET: 'sec', HUB_PAYPAL_ENV: 'sandbox', HUB_PAYPAL_WEBHOOK_ID: 'WH1' };
const entry = { id: 'SWD-2026-WATERBURY-1234', amountCents: 6000, currency: 'USD', receiptToken: 'tok en' };
const event = { id: 'waterbury-2026', title: '2026 SWD Waterbury', date: 'Sunday, October 25, 2026', venue: 'Laguna Woods' };

function fake(handler) {
  const calls = [];
  const f = async (url, opts) => {
    calls.push({ url, opts, body: opts.body && opts.headers['Content-Type'] === 'application/json' ? JSON.parse(opts.body) : opts.body });
    const r = handler(url, opts, calls.length) || {};
    return { ok: r.ok !== false, status: r.status || 200, json: async () => r.json ?? {} };
  };
  f.calls = calls;
  return f;
}
const tokenOr = (other) => (url, o, n) => url.endsWith('/v1/oauth2/token') ? { json: { access_token: 'T', expires_in: 3600 } } : other(url, o, n);

test('guard blocks live and unset, allows sandbox only', () => {
  assert.throws(() => resolveBase({ HUB_PAYPAL_ENV: 'live' }));
  assert.throws(() => resolveBase({}));
  assert.throws(() => resolveBase({ HUB_PAYPAL_ENV: 'live', ENTRIES_ALLOW_LIVE: 'no' }));
  assert.equal(resolveBase({ HUB_PAYPAL_ENV: 'sandbox' }), 'https://api-m.sandbox.paypal.com');
  assert.throws(() => resolveBase({ HUB_PAYPAL_ENV: 'live', ENTRIES_ALLOW_LIVE: 'yes' }));
});

test('blocked env makes no network call', async () => {
  const f = fake(() => ({}));
  const c = createPayPalClient({ fetch: f, env: { ...ENV, HUB_PAYPAL_ENV: 'live' } });
  await assert.rejects(c.getAccessToken());
  assert.equal(f.calls.length, 0);
});

test('token cached until expiry', async () => {
  let t = 0;
  const f = fake(tokenOr(() => ({})));
  const c = createPayPalClient({ fetch: f, env: ENV, now: () => t });
  assert.equal(await c.getAccessToken(), 'T');
  await c.getAccessToken();
  assert.equal(f.calls.length, 1);
  assert.match(f.calls[0].opts.headers.Authorization, /^Basic /);
  t = 3600 * 1000;
  await c.getAccessToken();
  assert.equal(f.calls.length, 2);
});

test('token HTTP error does not leak secrets', async () => {
  const f = fake(() => ({ ok: false, status: 401, json: { name: 'AUTH' } }));
  const c = createPayPalClient({ fetch: f, env: ENV });
  await assert.rejects(c.getAccessToken(), (e) => e.status === 401 && !/sec/.test(e.message));
});

test('createOrder body', async () => {
  const f = fake(tokenOr(() => ({ json: { id: 'ORD1', status: 'PAYER_ACTION_REQUIRED' } })));
  const c = createPayPalClient({ fetch: f, env: { ...ENV, ENTRIES_PUBLIC_URL: 'https://x.test/' } });
  const o = await c.createOrder({ entry, event });
  assert.equal(o.id, 'ORD1');
  const call = f.calls[1];
  assert.equal(call.url, 'https://api-m.sandbox.paypal.com/v2/checkout/orders');
  assert.equal(call.opts.headers['PayPal-Request-Id'], `${entry.id}-${entry.amountCents}`);
  const b = call.body, pu = b.purchase_units[0];
  assert.equal(b.intent, 'CAPTURE');
  assert.equal(pu.amount.value, '60.00');
  assert.equal(pu.items[0].unit_amount.value, '60.00');
  assert.equal(pu.amount.breakdown.item_total.value, '60.00');
  assert.equal(pu.amount.currency_code, 'USD');
  assert.deepEqual([pu.reference_id, pu.custom_id, pu.invoice_id], [entry.id, entry.id, entry.id]);
  assert.equal(pu.soft_descriptor, 'SWD WATERBURY');
  assert.equal(pu.items.length, 1);
  assert.equal(pu.items[0].url, 'https://x.test/app/events/waterbury-2026');
  assert.equal(pu.items[0].image_url, 'https://x.test/assets/icons/icon-512.png');
  const ctx = b.payment_source.paypal.experience_context;
  assert.equal(ctx.brand_name, 'Southwest Bowls Division');
  assert.equal(ctx.return_url, 'https://x.test/app/receipt/SWD-2026-WATERBURY-1234?t=tok%20en');
  assert.equal(ctx.cancel_url, ctx.return_url);
});

test('createOrder rejects bad amount and surfaces HTTP errors', async () => {
  const f = fake(tokenOr(() => ({ ok: false, status: 422, json: { name: 'UNPROCESSABLE', debug_id: 'd1' } })));
  const c = createPayPalClient({ fetch: f, env: ENV });
  await assert.rejects(c.createOrder({ entry: { ...entry, amountCents: 0 }, event }));
  await assert.rejects(c.createOrder({ entry: { ...entry, amountCents: 12.5 }, event }));
  await assert.rejects(c.createOrder({ entry, event }), (e) => e.status === 422 && e.paypal.debug_id === 'd1');
});

test('getOrder and captureOrder', async () => {
  const f = fake(tokenOr((u) => ({ json: { id: 'ORD1', status: u.endsWith('capture') ? 'COMPLETED' : 'APPROVED' } })));
  const c = createPayPalClient({ fetch: f, env: ENV });
  assert.equal((await c.getOrder('ORD1')).status, 'APPROVED');
  assert.equal(f.calls[1].opts.method, 'GET');
  assert.equal((await c.captureOrder('ORD1')).status, 'COMPLETED');
  const cap = f.calls[2];
  assert.equal(cap.url, 'https://api-m.sandbox.paypal.com/v2/checkout/orders/ORD1/capture');
  assert.equal(cap.opts.method, 'POST');
  assert.ok(cap.opts.headers['PayPal-Request-Id']);
});

test('verifyWebhookSignature', async () => {
  const headers = { 'PayPal-Auth-Algo': 'a', 'paypal-cert-url': 'https://c', 'paypal-transmission-id': 'tid', 'paypal-transmission-sig': 's', 'paypal-transmission-time': 'tm' };
  const body = JSON.stringify({ id: 'EV1', event_type: 'PAYMENT.CAPTURE.COMPLETED' });
  let status = 'SUCCESS';
  const f = fake(tokenOr(() => ({ json: { verification_status: status } })));
  const c = createPayPalClient({ fetch: f, env: ENV });
  assert.equal(await c.verifyWebhookSignature({ headers, body }), true);
  const sent = f.calls[1].body;
  assert.equal(sent.webhook_id, 'WH1');
  assert.equal(sent.transmission_id, 'tid');
  assert.deepEqual(sent.webhook_event, JSON.parse(body));
  status = 'FAILURE';
  assert.equal(await c.verifyWebhookSignature({ headers, body }), false);
  const n = f.calls.length;
  assert.equal(await c.verifyWebhookSignature({ headers: {}, body }), false);
  assert.equal(f.calls.length, n);
  await assert.rejects(createPayPalClient({ fetch: f, env: { ...ENV, HUB_PAYPAL_WEBHOOK_ID: '' } }).verifyWebhookSignature({ headers, body }));
});

test('helpers', () => {
  assert.equal(formatCents(3050), '30.50');
  assert.ok(softDescriptor({ title: 'A very long tournament name' }).length <= 22);
  assert.equal(softDescriptor({ title: '2026 SWD Waterbury' }), 'SWD WATERBURY');
});

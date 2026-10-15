// Smoke test against PayPal SANDBOX only (fake money). Reads keys from the environment; never prints them.
// Run:  vercel env pull .env.local --environment=development --yes && node --env-file=.env.local scripts/paypal-sandbox-smoke.mjs
const id = process.env.HUB_PAYPAL_CLIENT_ID, secret = process.env.HUB_PAYPAL_CLIENT_SECRET, env = process.env.HUB_PAYPAL_ENV || 'sandbox';
if (env !== 'sandbox') { console.error('Refusing to run: HUB_PAYPAL_ENV is not sandbox.'); process.exit(1); }
if (!id || !secret) { console.error('Missing HUB_PAYPAL_CLIENT_ID or HUB_PAYPAL_CLIENT_SECRET.'); process.exit(1); }
const base = 'https://api-m.sandbox.paypal.com';
const tok = await fetch(base + '/v1/oauth2/token', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
console.log('1. Token request:', tok.status, tok.ok ? 'OK' : 'FAILED');
if (!tok.ok) { console.error(await tok.text()); process.exit(1); }
const { access_token, scope } = await tok.json();
console.log('   Scopes granted:', String(scope || '').split(' ').filter(s => /payments|orders|vault|payouts/i.test(s)).map(s => s.replace('https://uri.paypal.com/services/', '')).join(', ') || '(none listed)');
const entryId = 'SMOKE-' + Date.now();
const ord = await fetch(base + '/v2/checkout/orders', { method: 'POST', headers: { Authorization: 'Bearer ' + access_token, 'Content-Type': 'application/json', 'PayPal-Request-Id': entryId },
  body: JSON.stringify({ intent: 'CAPTURE', purchase_units: [{ reference_id: entryId, custom_id: entryId, invoice_id: entryId, description: 'SWD sandbox smoke test', amount: { currency_code: 'USD', value: '1.00' } }] }) });
const o = await ord.json();
console.log('2. Create order:', ord.status, o.status || '', o.id || '');
const approve = (o.links || []).find(l => l.rel === 'payer-action' || l.rel === 'approve');
if (approve) console.log('3. Open this link, log in with the SANDBOX BUYER test account, and approve:\n   ' + approve.href + '\n   Then run:  node --env-file=.env.local scripts/paypal-sandbox-capture.mjs ' + o.id);

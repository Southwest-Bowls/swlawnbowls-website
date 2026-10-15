// Captures an approved SANDBOX order and prints the result (fake money). Usage: node --env-file=.env.local scripts/paypal-sandbox-capture.mjs <ORDER_ID>
const id = process.env.HUB_PAYPAL_CLIENT_ID, secret = process.env.HUB_PAYPAL_CLIENT_SECRET;
if ((process.env.HUB_PAYPAL_ENV || 'sandbox') !== 'sandbox') { console.error('Refusing: not sandbox.'); process.exit(1); }
const order = process.argv[2]; if (!order) { console.error('Give the order id.'); process.exit(1); }
const base = 'https://api-m.sandbox.paypal.com';
const t = await (await fetch(base + '/v1/oauth2/token', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' })).json();
const r = await fetch(base + '/v2/checkout/orders/' + order + '/capture', { method: 'POST', headers: { Authorization: 'Bearer ' + t.access_token, 'Content-Type': 'application/json' }, body: '{}' });
const j = await r.json();
const cap = j.purchase_units?.[0]?.payments?.captures?.[0];
console.log('Capture:', r.status, j.status || j.name || '', cap ? `${cap.amount.value} ${cap.amount.currency_code} ${cap.status} id=${cap.id}` : '');

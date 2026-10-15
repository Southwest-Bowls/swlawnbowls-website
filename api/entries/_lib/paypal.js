// PayPal Orders v2 client for the entries system. Injectable fetch/env; no network in tests.
// Sandbox only: there is no live switch in this code. Never issues refunds or payout calls.
const SANDBOX = 'https://api-m.sandbox.paypal.com';
const DEFAULT_PUBLIC_URL = 'https://swlawnbowls-website.vercel.app';

export function resolveBase(env = process.env) {
  const mode = env.HUB_PAYPAL_ENV;
  if (mode === 'sandbox') return SANDBOX;
  throw new Error('PayPal blocked: HUB_PAYPAL_ENV must be "sandbox"');
}

export function formatCents(cents) {
  if (!Number.isInteger(cents) || cents <= 0) throw new Error('amountCents must be a positive integer');
  return (cents / 100).toFixed(2);
}

export function softDescriptor(event) {
  const src = String((event && (event.slug || event.title)) || 'ENTRY');
  const word = src.replace(/^\s*\d{4}\s+/, '').replace(/^SWD\s+/i, '').replace(/[^A-Za-z0-9 ]/g, '').trim().split(/\s+/)[0] || 'ENTRY';
  return ('SWD ' + word).toUpperCase().slice(0, 22);
}

const DEFAULT_TIMEOUT_MS = 8000;

export function createPayPalClient({ fetch: f = globalThis.fetch, env = process.env, now = () => Date.now(), timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let cache = null;
  const base = () => resolveBase(env);
  const publicUrl = () => (env.ENTRIES_PUBLIC_URL || DEFAULT_PUBLIC_URL).replace(/\/+$/, '');

  // Every PayPal call is bounded by timeoutMs (default 8s): AbortSignal.timeout on the request, plus a
  // timer race so a fetch that ignores the signal still ends. Timeouts carry code 'paypal_timeout', status 504.
  async function send(url, opts, what) {
    const signal = AbortSignal.timeout(timeoutMs);
    const timeoutErr = () => {
      const e = new Error(`PayPal ${what} timed out after ${timeoutMs}ms`);
      e.name = 'TimeoutError';
      e.code = 'paypal_timeout';
      e.status = 504;
      return e;
    };
    let timer;
    let onAbort;
    const timed = new Promise((_, reject) => {
      timer = setTimeout(() => reject(timeoutErr()), timeoutMs);
      onAbort = () => reject(timeoutErr());
      signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      return await Promise.race([f(url, { ...opts, signal }), timed]);
    } catch (e) {
      if (e && e.code === 'paypal_timeout') throw e;
      if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw timeoutErr();
      const n = new Error(`PayPal ${what} network error`);
      n.code = 'paypal_network';
      throw n;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    }
  }

  async function parse(res, what) {
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
      const err = new Error(`PayPal ${what} failed (HTTP ${res.status})`);
      err.status = res.status;
      err.code = 'paypal_http';
      err.paypal = data && {
        name: data.name, message: data.message, debug_id: data.debug_id,
        issues: Array.isArray(data.details) ? data.details.map((d) => d && d.issue).filter(Boolean) : [],
      };
      throw err;
    }
    return data;
  }

  async function getAccessToken() {
    const b = base();
    if (cache && cache.base === b && cache.expiresAt > now()) return cache.token;
    const id = env.HUB_PAYPAL_CLIENT_ID, secret = env.HUB_PAYPAL_CLIENT_SECRET;
    if (!id || !secret) throw new Error('Missing HUB_PAYPAL_CLIENT_ID or HUB_PAYPAL_CLIENT_SECRET');
    const res = await send(b + '/v1/oauth2/token', {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    }, 'token request');
    const d = await parse(res, 'token request');
    if (!d || !d.access_token) throw new Error('PayPal token response missing access_token');
    cache = { base: b, token: d.access_token, expiresAt: now() + Math.max(0, ((d.expires_in || 300) - 60)) * 1000 };
    return cache.token;
  }

  async function call(method, path, body, extraHeaders = {}) {
    const b = base();
    const token = await getAccessToken();
    const what = `${method} ${path.split('?')[0].replace(/\/[A-Z0-9]{10,}/g, '/:id')}`;
    const res = await send(b + path, {
      method,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
    }, what);
    return parse(res, what);
  }

  // requestId: PayPal-Request-Id. Default is entry id + amount, so re-pricing an entry never replays the old order.
  async function createOrder({ entry, event, requestId }) {
    const value = formatCents(entry.amountCents);
    const currency = entry.currency || 'USD';
    const pub = publicUrl();
    const back = `${pub}/app/receipt/${encodeURIComponent(entry.id)}?t=${encodeURIComponent(entry.receiptToken)}`;
    const title = event.title || 'SWD event';
    const desc = [event.date, event.venue].filter(Boolean).join(' · ');
    const body = {
      intent: 'CAPTURE',
      payment_source: { paypal: { experience_context: {
        brand_name: 'Southwest Bowls Division', locale: 'en-US', shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW', landing_page: 'LOGIN', return_url: back, cancel_url: back,
      } } },
      purchase_units: [{
        reference_id: entry.id, custom_id: entry.id, invoice_id: entry.id,
        soft_descriptor: softDescriptor(event),
        description: `Tournament entry: ${title}`.slice(0, 127),
        items: [{
          name: `${title} (entry)`.slice(0, 127), description: (desc || title).slice(0, 127), quantity: '1', category: 'DIGITAL_GOODS',
          url: `${pub}/app/events/${encodeURIComponent(event.id)}`, image_url: `${pub}/assets/icons/icon-512.png`,
          unit_amount: { currency_code: currency, value },
        }],
        amount: { currency_code: currency, value, breakdown: { item_total: { currency_code: currency, value } } },
      }],
    };
    return call('POST', '/v2/checkout/orders', body, { 'PayPal-Request-Id': requestId || `${entry.id}-${entry.amountCents}` });
  }

  const getOrder = (id) => call('GET', `/v2/checkout/orders/${encodeURIComponent(id)}`);
  const captureOrder = (id) => call('POST', `/v2/checkout/orders/${encodeURIComponent(id)}/capture`, {}, { 'PayPal-Request-Id': `capture-${id}` });

  async function verifyWebhookSignature({ headers, body }) {
    const webhookId = env.HUB_PAYPAL_WEBHOOK_ID;
    if (!webhookId) throw new Error('Missing HUB_PAYPAL_WEBHOOK_ID');
    const h = {};
    for (const k of Object.keys(headers || {})) h[k.toLowerCase()] = headers[k];
    const event = typeof body === 'string' ? JSON.parse(body) : body;
    const req = {
      auth_algo: h['paypal-auth-algo'], cert_url: h['paypal-cert-url'], transmission_id: h['paypal-transmission-id'],
      transmission_sig: h['paypal-transmission-sig'], transmission_time: h['paypal-transmission-time'],
      webhook_id: webhookId, webhook_event: event,
    };
    if (!req.auth_algo || !req.cert_url || !req.transmission_id || !req.transmission_sig || !req.transmission_time) return false;
    const d = await call('POST', '/v1/notifications/verify-webhook-signature', req);
    return !!d && d.verification_status === 'SUCCESS';
  }

  return { getAccessToken, createOrder, getOrder, captureOrder, verifyWebhookSignature };
}

// Sends alerts to iPhones and iPads through Apple's push service (APNs). The app registers an Apple token on
// those devices, which Firebase does not accept, so they are sent to Apple directly.
// Needs APNS_KEY_P8 (the .p8 file's text), APNS_KEY_ID and APNS_TEAM_ID. APNS_TOPIC defaults to the app's id.
// TestFlight and App Store builds use the production service, which is the default.
import crypto from 'node:crypto';
import http2 from 'node:http2';

export function apnsConfig(env) {
  const key = String(env.APNS_KEY_P8 || '').replace(/\\n/g, '\n').trim();
  const keyId = env.APNS_KEY_ID, teamId = env.APNS_TEAM_ID;
  if (!key || !keyId || !teamId) return null;
  return { key, keyId, teamId, topic: env.APNS_TOPIC || 'org.swlawnbowls.app', host: env.APNS_HOST || 'https://api.push.apple.com' };
}

export function apnsJwt(cfg, nowSeconds) {
  const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const input = `${part({ alg: 'ES256', kid: cfg.keyId })}.${part({ iss: cfg.teamId, iat: nowSeconds })}`;
  const sig = crypto.sign('sha256', Buffer.from(input), { key: cfg.key, dsaEncoding: 'ieee-p1363' });
  return `${input}.${sig.toString('base64url')}`;
}

// messages: [{ token, title, body, url, collapseId, ttlSeconds }]
// Returns one { token, ok, gone, reason } per message and never throws, so an Apple problem cannot stop Android alerts.
// "gone" means Apple says the app was removed from that device, so its token can be forgotten.
export async function sendApns(messages, cfg, deps = {}) {
  const connect = deps.connect || http2.connect;
  const now = Math.floor((deps.now ? deps.now() : Date.now()) / 1000);
  const timeoutMs = deps.timeoutMs || 10000;
  const failAll = (reason) => messages.map((m) => ({ token: m.token, ok: false, gone: false, reason }));
  if (!messages.length) return [];
  let jwt, session;
  try { jwt = apnsJwt(cfg, now); } catch { return failAll('bad signing key'); }
  try { session = connect(cfg.host); } catch { return failAll('could not connect'); }
  session.on('error', () => {});   // each request reports its own failure

  const one = (m) => new Promise((resolve) => {
    let status = 0, text = '', done = false;
    const finish = (ok, gone, reason) => { if (done) return; done = true; clearTimeout(timer); resolve({ token: m.token, ok, gone, reason }); };
    let req;
    const timer = setTimeout(() => { finish(false, false, 'timed out'); if (req) req.close(); }, timeoutMs);
    if (!/^[0-9a-fA-F]{32,200}$/.test(m.token)) { finish(false, false, 'not an Apple token'); return; }
    try {
      req = session.request({
        ':method': 'POST', ':path': `/3/device/${m.token}`,
        authorization: `bearer ${jwt}`, 'apns-topic': cfg.topic, 'apns-push-type': 'alert', 'apns-priority': '10',
        'apns-expiration': String(now + (m.ttlSeconds || 86400)),
        ...(m.collapseId ? { 'apns-collapse-id': m.collapseId.slice(0, 64) } : {}),
      });
      req.setEncoding('utf8');
      req.on('response', (h) => { status = Number(h[':status']); });
      req.on('data', (d) => { text += d; });
      req.on('error', () => finish(false, false, 'connection failed'));
      req.on('end', () => {
        let reason = '';
        try { reason = JSON.parse(text).reason || ''; } catch { /* empty body on success */ }
        finish(status === 200, status === 410, status === 200 ? '' : reason || `HTTP ${status}`);
      });
      req.end(JSON.stringify({ aps: { alert: { title: m.title, body: m.body }, sound: 'default' }, url: m.url }));
    } catch { finish(false, false, 'connection failed'); }
  });

  const out = [];
  for (let i = 0; i < messages.length; i += 20) out.push(...await Promise.all(messages.slice(i, i + 20).map(one)));
  try { session.close(); } catch { /* already closed */ }
  return out;
}

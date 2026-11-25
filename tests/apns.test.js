import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http2 from 'node:http2';
import { apnsConfig, apnsJwt, sendApns } from '../api/push/_lib/apns.js';
import { notify } from '../api/push/_lib/notify.js';

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const appleEnv = { APNS_KEY_P8: pem, APNS_KEY_ID: 'KEY123', APNS_TEAM_ID: 'TEAM123' };
const tok = (c) => c.repeat(64);

test('apns config: all three values are needed; escaped line breaks are accepted', () => {
  assert.equal(apnsConfig({}), null);
  assert.equal(apnsConfig({ ...appleEnv, APNS_TEAM_ID: '' }), null);
  const cfg = apnsConfig({ ...appleEnv, APNS_KEY_P8: pem.replace(/\n/g, '\\n') });
  assert.equal(cfg.key, pem.trim());
  assert.equal(cfg.topic, 'org.swlawnbowls.app');
  assert.equal(cfg.host, 'https://api.push.apple.com');
});

test('apns token is signed with the key and names the key and team', () => {
  const [h, p, s] = apnsJwt(apnsConfig(appleEnv), 1000).split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'ES256', kid: 'KEY123' });
  assert.deepEqual(JSON.parse(Buffer.from(p, 'base64url')), { iss: 'TEAM123', iat: 1000 });
  assert.equal(crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')), true);
});

// A stand-in for Apple's server on this computer (HTTP/2 without TLS).
async function fakeApple(t, answer) {
  const seen = [];
  const server = http2.createServer();
  server.on('stream', (stream, headers) => {
    let body = '';
    stream.setEncoding('utf8');
    stream.on('data', (d) => { body += d; });
    stream.on('end', () => {
      seen.push({ headers, body: JSON.parse(body) });
      const [status, reason] = answer(headers[':path']);
      stream.respond({ ':status': status });
      stream.end(reason ? JSON.stringify({ reason }) : '');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  return { seen, host: `http://127.0.0.1:${server.address().port}` };
}

test('apns send: payload, headers, success, removed app and refused token', async (t) => {
  const apple = await fakeApple(t, (path) => (path.endsWith(tok('b')) ? [410, 'Unregistered'] : path.endsWith(tok('c')) ? [400, 'BadDeviceToken'] : [200]));
  const cfg = apnsConfig({ ...appleEnv, APNS_HOST: apple.host });
  const msg = (token) => ({ token, title: 'T', body: 'B', url: '/app/events/a-2026', collapseId: 'changed-a-2026', ttlSeconds: 60 });
  const out = await sendApns([msg(tok('a')), msg(tok('b')), msg(tok('c')), msg('not/a/token')], cfg, { now: () => 5000 * 1000 });
  assert.deepEqual(out.map((r) => [r.ok, r.gone, r.reason]), [[true, false, ''], [false, true, 'Unregistered'], [false, false, 'BadDeviceToken'], [false, false, 'not an Apple token']]);
  assert.equal(apple.seen.length, 3);
  const first = apple.seen.find((s) => s.headers[':path'] === `/3/device/${tok('a')}`);
  assert.equal(first.headers['apns-topic'], 'org.swlawnbowls.app');
  assert.equal(first.headers['apns-push-type'], 'alert');
  assert.equal(first.headers['apns-expiration'], '5060');
  assert.deepEqual(first.body, { aps: { alert: { title: 'T', body: 'B' }, sound: 'default' }, url: '/app/events/a-2026' });
});

test('apns send never throws: unreachable server and unusable key report failures', async () => {
  const msg = { token: tok('a'), title: 'T', body: 'B', url: '/app' };
  const down = await sendApns([msg], apnsConfig({ ...appleEnv, APNS_HOST: 'http://127.0.0.1:1' }), { timeoutMs: 2000 });
  assert.equal(down[0].ok, false);
  const bad = await sendApns([msg], apnsConfig({ ...appleEnv, APNS_KEY_P8: 'nonsense' }));
  assert.equal(bad[0].reason, 'bad signing key');
});

const rows = [{ token: 'a1', event_id: 'a-2026', platform: 'android' }, { token: tok('a'), event_id: 'a-2026', platform: 'ios' }, { token: tok('b'), event_id: 'a-2026', platform: 'ios' }];
const one = [{ eventId: 'a-2026', kind: 'changed', title: 'Tournament update', body: 'Alpha has a new date.' }];
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', FIREBASE_PROJECT_ID: 'sw-bowls', NOTIFY_LIVE: 'true', ...appleEnv };
function fakeFetch(fcmOk = true) {
  const calls = [];
  const f = async (url, opt) => {
    calls.push({ url, body: opt && opt.body ? JSON.parse(opt.body) : null });
    if (url.endsWith('/devices_for_events')) return { ok: true, status: 200, json: async () => rows };
    if (url.endsWith('/forget_devices')) return { ok: true, status: 200, json: async () => ({}) };
    return { ok: fcmOk, status: fcmOk ? 200 : 500, text: async () => '' };
  };
  return { f, calls };
}

test('notify: iPhones go to Apple, Android to Firebase, removed apps are forgotten', async () => {
  const { f, calls } = fakeFetch();
  let queued;
  const apns = async (list) => { queued = list; return [{ token: tok('a'), ok: true }, { token: tok('b'), ok: false, gone: true }]; };
  const out = await notify(one, { env, fetch: f, accessToken: async () => 't', apns });
  assert.equal(queued.length, 2); assert.equal(queued[0].url, '/app/events/a-2026');
  assert.equal(calls.filter((c) => c.url.includes('fcm.googleapis')).length, 1);
  assert.deepEqual([out.sent, out.iosSent, out.failed, out.removed, out.skippedIos], [2, 1, 0, 1, 0]);
  assert.deepEqual(calls.find((c) => c.url.endsWith('/forget_devices')).body, { p_tokens: [tok('b')] });
});

test('notify: an Apple failure does not mark a delivered alert for another try; a total failure does', async () => {
  const apns = async (list) => list.map((m) => ({ token: m.token, ok: false, gone: false, reason: 'InvalidProviderToken' }));
  const some = await notify(one, { env, fetch: fakeFetch(true).f, accessToken: async () => 't', apns });
  assert.deepEqual([some.sent, some.failed, some.iosFailed, some.iosError], [1, 0, 2, 'InvalidProviderToken']);
  const none = await notify(one, { env, fetch: fakeFetch(false).f, accessToken: async () => 't', apns });
  assert.deepEqual([none.sent, none.failed], [0, 3]);
});

test('notify: dry run counts iPhones once Apple is configured and sends nothing', async () => {
  const out = await notify(one, { env: { ...env, NOTIFY_LIVE: '' }, fetch: fakeFetch().f, accessToken: async () => { throw new Error('no'); }, apns: async () => { throw new Error('no'); } });
  assert.equal(out.alerts[0].devices, 3); assert.equal(out.sent, 0);
});

test('notify: iPhones are sent even when Google sign-in fails; Google is not asked when there is no Android phone', async () => {
  const apns = async (list) => list.map((m) => ({ token: m.token, ok: true }));
  const { f, calls } = fakeFetch();
  const out = await notify(one, { env, fetch: f, accessToken: async () => { throw new Error('google down'); }, apns });
  assert.deepEqual([out.iosSent, out.sent, out.failed, out.googleError], [2, 2, 1, 'Google sign-in failed']);
  assert.equal(calls.filter((c) => c.url.includes('fcm.googleapis')).length, 0);
  const iosOnly = async (url) => ({ ok: true, status: 200, json: async () => (url.endsWith('/devices_for_events') ? rows.filter((r) => r.platform === 'ios') : {}) });
  const only = await notify(one, { env, fetch: iosOnly, accessToken: async () => { throw new Error('must not be asked'); }, apns });
  assert.deepEqual([only.iosSent, only.failed, only.googleError], [2, 0, undefined]);
});

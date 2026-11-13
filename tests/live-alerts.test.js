const test = require('node:test');
const assert = require('node:assert');

test('livestream alert: only 5 to 15 minutes before the Pacific start, once', async () => {
  const { liveAlerts, streamKey } = await import('../scripts/live-alerts.mjs');
  const s = [{ date: '2026-11-22', start: '09:00', title: '2026 SWD Five Man All-Star', venue: 'Newport Harbor' }];
  const at = (iso) => new Date(iso);              // 09:00 Pacific on Nov 22 is 17:00 UTC (standard time)
  assert.equal(liveAlerts(s, at('2026-11-22T16:44:00Z')).length, 0);   // 16 minutes away: too early
  const hit = liveAlerts(s, at('2026-11-22T16:47:00Z'));               // 13 minutes away
  assert.equal(hit.length, 1);
  assert.equal(hit[0].notification.kind, 'live');
  assert.match(hit[0].notification.body, /Five Man All-Star at Newport Harbor goes live in about 15 minutes/);
  assert.equal(liveAlerts(s, at('2026-11-22T16:56:00Z')).length, 0);   // 4 minutes away: too late
  assert.equal(liveAlerts(s, at('2026-11-22T16:47:00Z'), new Set([streamKey(s[0])])).length, 0);   // already sent
  assert.equal(liveAlerts(s, at('2026-11-21T16:47:00Z')).length, 0);   // wrong day
  assert.equal(liveAlerts([{ date: '2026-11-22', title: 'No start time' }], at('2026-11-22T16:47:00Z')).length, 0);
});

test('the sender accepts live alerts and opens the Watch page', async () => {
  const { cleanNotifications, notify } = await import('../api/push/_lib/notify.js');
  const c = cleanNotifications([{ eventId: 'live-stream', kind: 'live', title: 'Livestream starting soon', body: 'x goes live' }]);
  assert.equal(c[0].kind, 'live');
  const calls = [];
  const f = async (u, o) => { calls.push([u, o && o.body]); if (/devices_for_events/.test(u)) return { ok: true, json: async () => [{ token: 't1', event_id: 'live-stream', platform: 'android' }] }; return { ok: true, text: async () => '' }; };
  const out = await notify(c, { env: { NOTIFY_LIVE: 'true', SUPABASE_URL: 'https://x', SUPABASE_SERVICE_ROLE_KEY: 'k', FIREBASE_PROJECT_ID: 'p' }, fetch: f, accessToken: async () => 'tok' });
  assert.equal(out.sent, 1);
  assert.match(calls.find((x) => /fcm/.test(x[0]))[1], /"url":"\/app\/watch"/);
});

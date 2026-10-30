import test from 'node:test';
import assert from 'node:assert/strict';
import { diffNotifications, eventChanges } from '../scripts/diff-notifications.mjs';
import { notify, secretOk, cleanNotifications } from '../api/push/_lib/notify.js';

const ev = (o) => ({ id: 'a-2026', title: '2026 Alpha Pairs', date: 'Saturday, May 2, 2026', time: '9:00 AM start', ...o });

test('diff: new date, new time, postponed, cancelled are alerts; typos in other fields are not', () => {
  assert.deepEqual(eventChanges(ev({}), ev({ date: 'Sunday, May 3, 2026' })), ['has a new date']);
  assert.deepEqual(eventChanges(ev({}), ev({ time: '10:00 AM start' })), ['has a new start time']);
  assert.deepEqual(eventChanges(ev({}), ev({ status: 'postponed', date: 'TBD' })), ['was postponed']);
  assert.deepEqual(eventChanges(ev({}), ev({ status: 'cancelled' })), ['was cancelled']);
  assert.deepEqual(eventChanges(ev({}), ev({ title: '2026 Alpha Pairs!', fee: '$50' })), []);
  assert.deepEqual(eventChanges(ev({}), ev({ date: '  Saturday,   May 2, 2026 ' })), []);
});

test('diff: results alerts only for results that were not there before; new events are silent', () => {
  const out = diffNotifications([ev({})], [ev({}), ev({ id: 'b-2026' })], [{ id: 'old' }], [{ id: 'old' }, { id: 'a-2026' }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'results'); assert.equal(out[0].eventId, 'a-2026');
  assert.match(out[0].body, /Alpha Pairs: results have been posted/);
});

test('diff: never more than 10 alerts from one change', () => {
  const olds = Array.from({ length: 30 }, (_, i) => ev({ id: 'e' + i }));
  const news = olds.map((e) => ({ ...e, time: 'later' }));
  assert.equal(diffNotifications(olds, news, [], []).length, 10);
});

test('secretOk: exact match only', () => {
  assert.equal(secretOk('abc', 'abc'), true);
  assert.equal(secretOk('abd', 'abc'), false);
  assert.equal(secretOk('', 'abc'), false);
  assert.equal(secretOk('abc', ''), false);
});

test('cleanNotifications drops bad ids, trims lengths, caps at 10', () => {
  const out = cleanNotifications([{ eventId: 'Bad Id!', kind: 'changed', title: 't', body: 'b' }, { eventId: 'ok-2026', kind: 'x', title: 't'.repeat(100), body: 'b' }]);
  assert.equal(out.length, 1); assert.equal(out[0].title.length, 60); assert.equal(out[0].kind, 'changed');
});

function fakeFetch(rows, fcmStatus = () => 200) {
  const calls = [];
  const f = async (url, opt) => {
    calls.push({ url, body: opt && opt.body ? JSON.parse(opt.body) : null });
    if (url.endsWith('/devices_for_events')) return { ok: true, status: 200, json: async () => rows };
    if (url.endsWith('/forget_devices')) return { ok: true, status: 200, json: async () => ({}) };
    const s = fcmStatus(calls[calls.length - 1].body.message.token);
    return { ok: s === 200, status: s, text: async () => (s === 200 ? '' : '{"error":{"status":"UNREGISTERED"}}') };
  };
  return { f, calls };
}
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', FIREBASE_PROJECT_ID: 'sw-bowls' };
const one = [{ eventId: 'a-2026', kind: 'changed', title: 'Tournament update', body: 'Alpha has a new date.' }];

test('dry run (default): counts devices, sends nothing', async () => {
  const { f, calls } = fakeFetch([{ token: 't1', event_id: 'a-2026', platform: 'android' }, { token: 't2', event_id: 'a-2026', platform: 'android' }]);
  const out = await notify(one, { env, fetch: f, accessToken: async () => { throw new Error('must not be called'); } });
  assert.equal(out.live, false); assert.equal(out.sent, 0); assert.equal(out.alerts[0].devices, 2);
  assert.equal(calls.filter((c) => new URL(c.url).hostname === 'fcm.googleapis.com').length, 0);
});

test('live: sends one message per device to that event only, and forgets dead tokens', async () => {
  const { f, calls } = fakeFetch([{ token: 't1', event_id: 'a-2026', platform: 'android' }, { token: 'dead', event_id: 'a-2026', platform: 'android' }, { token: 't9', event_id: 'other', platform: 'android' }, { token: 'apple', event_id: 'a-2026', platform: 'ios' }], (t) => (t === 'dead' ? 404 : 200));
  const out = await notify(one, { env: { ...env, NOTIFY_LIVE: 'true' }, fetch: f, accessToken: async () => 'bearer' });
  assert.equal(out.sent, 1); assert.equal(out.failed, 1); assert.equal(out.removed, 1);
  const sends = calls.filter((c) => new URL(c.url).hostname === 'fcm.googleapis.com');
  assert.equal(sends.length, 2);
  assert.equal(sends[0].body.message.data.url, '/app/events/a-2026');
  assert.deepEqual(calls.find((c) => c.url.endsWith('/forget_devices')).body, { p_tokens: ['dead'] });
});

test('nothing to send means no lookups at all', async () => {
  const { f, calls } = fakeFetch([]);
  const out = await notify([], { env, fetch: f, accessToken: async () => 'x' });
  assert.equal(out.alerts.length, 0); assert.equal(calls.length, 0);
});

test('iPhone tokens are never sent to Firebase or deleted (they are Apple tokens)', async () => {
  const { f, calls } = fakeFetch([{ token: 'apple', event_id: 'a-2026', platform: 'ios' }, { token: 'a1', event_id: 'a-2026', platform: 'android' }]);
  const out = await notify(one, { env: { ...env, NOTIFY_LIVE: 'true' }, fetch: f, accessToken: async () => 'bearer' });
  assert.equal(out.sent, 1); assert.equal(out.skippedIos, 1);
  assert.ok(!calls.some((c) => c.body && c.body.message && c.body.message.token === 'apple'));
});

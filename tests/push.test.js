import test from 'node:test';
import assert from 'node:assert/strict';
import { diffNotifications, eventChanges } from '../scripts/diff-notifications.mjs';
import { notify, secretOk, cleanNotifications } from '../api/push/_lib/notify.js';
import { keylessAccessToken, keylessConfig } from '../api/push/_lib/googleToken.js';

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

test('diff: never more than 60 alerts from one change', () => {
  const olds = Array.from({ length: 100 }, (_, i) => ev({ id: 'e' + i }));
  const news = olds.map((e) => ({ ...e, time: 'later' }));
  assert.equal(diffNotifications(olds, news, [], []).length, 60);
});

test('secretOk: exact match only', () => {
  assert.equal(secretOk('abc', 'abc'), true);
  assert.equal(secretOk('abd', 'abc'), false);
  assert.equal(secretOk('', 'abc'), false);
  assert.equal(secretOk('abc', ''), false);
});

test('cleanNotifications drops bad ids, trims lengths, caps at 60', () => {
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

test('0014 lookup returns phones subscribed to the event or to all', async () => {
  const fs = await import('node:fs');
  const sql = fs.readFileSync(new URL('../member-platform/supabase/0014_device_events.sql', import.meta.url), 'utf8');
  assert.match(sql, /'all' = ANY \(d\.event_ids\)/);
  assert.match(sql, /e\.event_id = ANY \(d\.event_ids\)/);
});

test('keyless sign-in: Vercel token is swapped at Google STS, then the service account token is requested', async () => {
  const calls = [];
  const f = async (url, opt) => {
    calls.push({ url, auth: opt.headers.authorization, body: JSON.parse(opt.body) });
    return { ok: true, status: 200, json: async () => (url.startsWith('https://sts.googleapis.com/') ? { access_token: 'fed' } : { accessToken: 'send-token' }) };
  };
  const env = { GCP_PROJECT_NUMBER: '123', GCP_WIF_POOL: 'vercel', GCP_WIF_PROVIDER: 'vercel', GCP_SERVICE_ACCOUNT_EMAIL: 'fcm@sw-bowls.iam.gserviceaccount.com' };
  assert.equal(await keylessAccessToken('vercel-jwt', env, { fetch: f }), 'send-token');
  assert.equal(calls[0].body.subjectToken, 'vercel-jwt');
  assert.equal(calls[0].body.audience, '//iam.googleapis.com/projects/123/locations/global/workloadIdentityPools/vercel/providers/vercel');
  assert.equal(calls[1].auth, 'Bearer fed');
  assert.deepEqual(calls[1].body.scope, ['https://www.googleapis.com/auth/firebase.messaging']);
  assert.equal(new URL(calls[1].url).hostname, 'iamcredentials.googleapis.com');
});

test('keyless sign-in: refuses to run without configuration or a Vercel token', async () => {
  assert.equal(keylessConfig({}), null);
  await assert.rejects(() => keylessAccessToken('x', {}, { fetch: async () => ({}) }), /not configured/);
  const env = { GCP_PROJECT_NUMBER: '1', GCP_WIF_POOL: 'p', GCP_WIF_PROVIDER: 'q', GCP_SERVICE_ACCOUNT_EMAIL: 'a@b' };
  await assert.rejects(() => keylessAccessToken('', env, { fetch: async () => ({}) }), /no Vercel identity token/);
});

test('diff: a result that points at an event with another id alerts under the event id', () => {
  const out = diffNotifications([ev({ id: 'mens-mix-2026' })], [ev({ id: 'mens-mix-2026' })], [], [{ id: 'mens-vet-pairs-2026', title: '2026 Pairs', eventUrl: '/event?id=mens-mix-2026' }]);
  assert.equal(out.length, 1); assert.equal(out[0].eventId, 'mens-mix-2026');
});

import { displayNames, playerKey, podiumPlayers } from '../scripts/player-names.mjs';

test('player names: shared surname, first names alone dropped, key is a safe id', () => {
  assert.deepEqual(displayNames('Joanne & Wilf Steckler'), ['Joanne Steckler', 'Wilf Steckler']);
  assert.deepEqual(displayNames('Gary Belk, Curt Mueller, Jane Blair'), ['Gary Belk', 'Curt Mueller', 'Jane Blair']);
  assert.deepEqual(displayNames('Madonna'), []);
  assert.deepEqual(displayNames('Santa Monica Lawn Bowling Club'), []);
  assert.deepEqual(displayNames('1st Kevin Lacey \u00b7 2nd Esther Lee \u00b7 3rd Mark De Dubovy'), []);
  assert.deepEqual(displayNames('Consolation Joann Steckler'), ['Joann Steckler']);
  assert.equal(playerKey('Gary Belk'), 'player--gary-belk');
  assert.equal(playerKey('Mar\u00eda O\u2019Brien'), 'player--maria-o-brien');
  assert.match(playerKey('x'.repeat(200)), /^player--[a-z0-9-]{3,72}$/);
});

const tourn = { id: 'groves-2026', title: '2026 Groves Mixed Triples', divisions: [{ label: 'Open', places: [{ rank: 1, names: 'Gary Belk, Curt Mueller, Jane Blair' }, { rank: 2, names: 'Giulia Gallo, Sadri Jazayeri' }, { rank: 4, names: 'Janice Walter' }] }], awards: [{ title: 'Best', names: 'Ann Lee' }] };

test('podium players: top three only, each once, awards ignored', () => {
  const p = podiumPlayers(tourn);
  assert.deepEqual(p.map((x) => x.name + ':' + x.rank), ['Gary Belk:1', 'Curt Mueller:1', 'Jane Blair:1', 'Giulia Gallo:2', 'Sadri Jazayeri:2']);
});

test('diff: a new result also makes one alert per podium player, under the player id', () => {
  const out = diffNotifications([ev({ id: 'groves-2026', title: '2026 Groves Mixed Triples' })], [ev({ id: 'groves-2026', title: '2026 Groves Mixed Triples' })], [], [tourn]);
  const players = out.filter((n) => n.kind === 'player');
  assert.equal(players.length, 5);
  assert.equal(players[0].eventId, 'player--gary-belk'); assert.equal(players[0].resultId, 'groves-2026'); assert.equal(players[0].forEvent, 'groves-2026');
  assert.equal(players[0].title, 'Gary Belk placed 1st');
  assert.match(players[0].body, /Gary Belk placed 1st in Groves Mixed Triples\. Tap to see the results\./);
});

test('notify: a follower gets the player alert, not also "Results are in"; two followed teammates get one alert; tap opens the results', async () => {
  const rows = [{ token: 't1', event_id: 'player--gary-belk', platform: 'android' }, { token: 't1', event_id: 'player--curt-mueller', platform: 'android' },
    { token: 't1', event_id: 'groves-2026', platform: 'android' }, { token: 't2', event_id: 'groves-2026', platform: 'android' }];
  const { f, calls } = fakeFetch(rows);
  const list = [{ eventId: 'groves-2026', kind: 'results', title: 'Results are in', body: 'x' },
    { eventId: 'player--gary-belk', kind: 'player', resultId: 'groves-2026', forEvent: 'groves-2026', title: 'Gary Belk placed 1st', body: 'y' },
    { eventId: 'player--curt-mueller', kind: 'player', resultId: 'groves-2026', forEvent: 'groves-2026', title: 'Curt Mueller placed 1st', body: 'z' }];
  const out = await notify(list, { env: { ...env, NOTIFY_LIVE: 'true' }, fetch: f, accessToken: async () => 'tok' });
  const sent = calls.filter((c) => c.body && c.body.message).map((c) => [c.body.message.token, c.body.message.notification.title, c.body.message.data.url]);
  assert.deepEqual(sent.sort(), [['t1', 'Gary Belk placed 1st', '/app/results/groves-2026'], ['t2', 'Results are in', '/app/events/groves-2026']].sort());
  assert.equal(out.sent, 2);
});

test('0015 lookup: "all" subscribers never match a player id', async () => {
  const fs = await import('node:fs');
  const sql = fs.readFileSync(new URL('../member-platform/supabase/0015_player_alerts.sql', import.meta.url), 'utf8');
  assert.match(sql, /NOT LIKE 'player--%'/);
  assert.match(sql, /'all' = ANY \(d\.event_ids\)/);
});

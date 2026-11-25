// Sends tournament alerts to the phones that asked for them.
// POST /api/push/notify   header: x-notify-secret   body: { notifications: [{ eventId, kind, title, body }] }
// Safe by default: unless NOTIFY_LIVE is exactly "true" it only counts who WOULD get each alert.
import crypto from 'node:crypto';

const FCM = (project) => `https://fcm.googleapis.com/v1/projects/${project}/messages:send`;

export function secretOk(given, expected) {
  if (!expected || !given) return false;
  const a = Buffer.from(String(given)), b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function cleanNotifications(list) {
  if (!Array.isArray(list)) return [];
  const id = (v) => (/^[a-z0-9-]{3,80}$/.test(String(v || '')) ? String(v) : '');
  return list.slice(0, 60).map((n) => ({
    eventId: String((n && n.eventId) || '').slice(0, 80),
    kind: n && (n.kind === 'results' || n.kind === 'live' || n.kind === 'player') ? n.kind : 'changed',
    resultId: id(n && n.resultId), forEvent: id(n && n.forEvent),
    title: String((n && n.title) || '').slice(0, 60),
    body: String((n && n.body) || '').slice(0, 200),
  })).filter((n) => /^[a-z0-9-]{3,80}$/.test(n.eventId) && n.title && n.body && (n.kind !== 'player' || (n.resultId && n.eventId.startsWith('player--'))));
}

// deps: { env, fetch, accessToken() }
export async function notify(list, deps) {
  const { env, fetch: f } = deps;
  const items = cleanNotifications(list);
  const live = env.NOTIFY_LIVE === 'true';
  const summary = { live, alerts: [], sent: 0, failed: 0, removed: 0, skippedIos: 0 };
  if (!items.length) return summary;
  const sb = `${env.SUPABASE_URL}/rest/v1/rpc`, hdr = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json' };
  const r = await f(`${sb}/devices_for_events`, { method: 'POST', headers: hdr, body: JSON.stringify({ p_events: items.map((n) => n.eventId) }) });
  if (!r.ok) throw new Error('device lookup failed: HTTP ' + r.status);
  const all = await r.json();   // [{ token, event_id, platform }]
  // Android tokens are Firebase tokens. iPhone tokens from the app are Apple tokens, which Firebase rejects: skip them until iPhone push is set up.
  const rows = all.filter((x) => x.platform === 'android');
  summary.skippedIos = new Set(all.filter((x) => x.platform !== 'android').map((x) => x.token)).size;
  const dead = [];
  const project = env.FIREBASE_PROJECT_ID;
  const bearer = live ? await deps.accessToken() : null;
  // Player alerts go first. A phone that gets "X placed 1st" does not also get "Results are in" for the same event,
  // and a phone that follows two players from one result gets one alert.
  items.sort((a, b) => (b.kind === 'player') - (a.kind === 'player'));
  const gotPlayer = new Set(), gotResult = new Set();
  for (const n of items) {
    let tokens = [...new Set(rows.filter((x) => x.event_id === n.eventId).map((x) => x.token))];
    if (n.kind === 'player') tokens = tokens.filter((t) => !gotResult.has(t + '|' + n.resultId));
    if (n.kind === 'results') tokens = tokens.filter((t) => !gotPlayer.has(t + '|' + n.eventId));
    if (n.kind === 'player') tokens.forEach((t) => { gotResult.add(t + '|' + n.resultId); gotPlayer.add(t + '|' + n.forEvent); });
    const entry = { eventId: n.eventId, kind: n.kind, devices: tokens.length };
    summary.alerts.push(entry);
    if (!live) continue;
    for (const token of tokens) {
      const res = await f(FCM(project), {
        method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: { token, notification: { title: n.title, body: n.body }, data: { url: n.kind === 'live' ? '/app/watch' : n.kind === 'player' ? `/app/results/${n.resultId}` : `/app/events/${n.eventId}` } } }),
      });
      if (res.ok) summary.sent++;
      else {
        summary.failed++;
        const txt = await res.text().catch(() => '');
        if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(txt)) dead.push(token);
      }
    }
  }
  if (dead.length) {
    const fr = await f(`${sb}/forget_devices`, { method: 'POST', headers: hdr, body: JSON.stringify({ p_tokens: dead }) });
    if (fr.ok) summary.removed = dead.length;
  }
  return summary;
}

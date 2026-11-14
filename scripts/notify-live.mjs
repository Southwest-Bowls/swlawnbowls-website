// Run every 5 minutes by .github/workflows/notify-live.yml. Sends "livestream starting soon" alerts and remembers
// what it already sent in .live-sent.json (kept between runs by the workflow cache) so nobody gets it twice.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { liveAlerts } from './live-alerts.mjs';

const SENT = '.live-sent.json';
const sent = existsSync(SENT) ? JSON.parse(readFileSync(SENT, 'utf8')) : {};
const list = liveAlerts(JSON.parse(readFileSync('streams-data.json', 'utf8')).streams, new Date(), new Set(Object.keys(sent)));
console.log(`Livestream alerts due: ${list.length}`);
if (!list.length) process.exit(0);
const url = process.env.NOTIFY_URL, secret = process.env.NOTIFY_SECRET;
if (!url || !secret) { console.log('NOTIFY_URL / NOTIFY_SECRET not set: not sending.'); process.exit(0); }
const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-notify-secret': secret }, body: JSON.stringify({ notifications: list.map((x) => x.notification) }) });
const text = await r.text();
console.log('Site answered', r.status, text);
if (!r.ok) process.exit(1);
// Count the stream as sent only when the site really sent it (not a dry run, and not every delivery failing),
// so a failed delivery is tried again on the next run.
let out = {}; try { out = JSON.parse(text); } catch { /* not JSON: do not record */ }
if (!(out.live === true && out.failed === 0)) { console.log('Not recorded as sent (dry run or some deliveries failed): it will be tried again.'); process.exit(0); }
const today = new Date().toISOString().slice(0, 10);
list.forEach((x) => { sent[x.key] = today; });
for (const k of Object.keys(sent)) if (sent[k] < new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10)) delete sent[k];   // forget old ones
writeFileSync(SENT, JSON.stringify(sent));

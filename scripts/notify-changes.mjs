// Run by .github/workflows/notify.yml after a change reaches main. Compares the previous and current
// events and results files and asks the site to send the alerts. Does nothing if not configured.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { diffNotifications } from './diff-notifications.mjs';

const prev = (f) => { try { return JSON.parse(execSync(`git show HEAD~1:${f}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString()); } catch { return null; } };
const cur = (f) => JSON.parse(readFileSync(f, 'utf8'));

const oldE = prev('events-data.json'), oldR = prev('results-data.json');
if (!oldE || !oldR) { console.log('No earlier version to compare with; nothing to send.'); process.exit(0); }
const list = diffNotifications(oldE.events, cur('events-data.json').events, oldR.tournaments, cur('results-data.json').tournaments);
console.log(`Alerts from this change: ${list.length}`);
list.forEach((n) => console.log(` - ${n.kind} ${n.eventId}: ${n.body}`));
if (!list.length) process.exit(0);
const url = process.env.NOTIFY_URL, secret = process.env.NOTIFY_SECRET;
if (!url || !secret) { console.log('NOTIFY_URL / NOTIFY_SECRET not set: not sending.'); process.exit(0); }
const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-notify-secret': secret }, body: JSON.stringify({ notifications: list }) });
console.log('Site answered', r.status, await r.text());
if (!r.ok) process.exit(1);

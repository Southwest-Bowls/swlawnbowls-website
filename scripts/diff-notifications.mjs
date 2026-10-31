// Works out which alerts a change to events-data.json / results-data.json should send.
// Pure functions, no network: the workflow feeds them the old and new file.
const MAX = 10;   // never more than this many alerts from one change

const nice = (e) => String((e && (e.title || e.id)) || 'A tournament').replace(/^20\d\d\s+/, '');
const norm = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

// What changed for an event that already existed: only things a player must act on.
export function eventChanges(oldE, newE) {
  const out = [];
  const st = (e) => norm(e.status).toLowerCase();
  if (st(newE) && st(newE) !== st(oldE)) {
    if (/cancel/.test(st(newE))) out.push('was cancelled');
    else if (/postpon/.test(st(newE))) out.push('was postponed');
  }
  if (norm(newE.date) !== norm(oldE.date) && !/postpon|cancel/.test(st(newE))) out.push('has a new date');
  if (norm(newE.time) !== norm(oldE.time)) out.push('has a new start time');
  return out;
}

export function diffNotifications(oldEvents, newEvents, oldResults, newResults) {
  const list = [];
  const oldById = new Map((oldEvents || []).map((e) => [e.id, e]));
  for (const e of newEvents || []) {
    const before = oldById.get(e.id);
    if (!before) continue;                       // a brand-new event is not an alert (nobody has saved it)
    const ch = eventChanges(before, e);
    if (ch.length) list.push({ eventId: e.id, kind: 'changed', title: 'Tournament update', body: `${nice(e)} ${ch.join(' and ')}. Tap to see the details.` });
  }
  const seen = new Set((oldResults || []).map((r) => r.id));
  const titleOf = new Map((newEvents || []).map((e) => [e.id, nice(e)]));
  // A result can have its own id while pointing at an event with a different one (eventUrl: /event?id=...).
  const eventIdOf = (r) => { const m = /^\/event\?id=([a-z0-9-]{3,80})$/.exec(String(r.eventUrl || '')); return m ? m[1] : r.id; };
  for (const r of newResults || []) {
    if (seen.has(r.id)) continue;
    const eventId = eventIdOf(r);
    list.push({ eventId, kind: 'results', title: 'Results are in', body: `${titleOf.get(eventId) || nice(r)}: results have been posted.` });
  }
  return list.slice(0, MAX);
}

// Serves a one-event calendar file (.ics) so "Add to calendar" works in Apple Calendar (webcal://),
// and as a downloadable file in browsers. The app passes the event's own details in the address;
// nothing is stored. Dates must look like YYYY-MM-DD.
const esc = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n').slice(0, 900);
const fold = (line) => { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); } out.push(s); return out.join('\r\n'); };
const nextDay = (iso) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10).replace(/-/g, ''); };
export default function handler(req, res) {
  const q = req.query || {};
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(q.s || '') || !iso.test(q.e || '')) { res.status(400).send('Missing or invalid dates'); return; }
  const id = String(q.id || 'event').replace(/[^a-z0-9-]/gi, '').slice(0, 80) || 'event';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Southwest Bowls//App//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    'UID:' + id + '@swlawnbowls.org', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + q.s.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + nextDay(q.e),
    'SUMMARY:' + esc(q.t || 'Southwest Bowls tournament'), 'LOCATION:' + esc(q.l), 'DESCRIPTION:' + esc(q.d)];
  if (/^https:\/\/(www\.)?swlawnbowls[a-z.-]*\//i.test(q.u || '') || /^https:\/\/swlawnbowls-website\.vercel\.app\//i.test(q.u || '')) lines.push('URL:' + q.u);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="' + id + '.ics"');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(lines.map(fold).join('\r\n') + '\r\n');
}

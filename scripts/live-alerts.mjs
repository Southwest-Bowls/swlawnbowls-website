// Works out which livestreams are about to begin. A stream with a "start" ("HH:MM", Pacific time) on today's
// date gets one alert when it is between 5 and 15 minutes away. Run every 5 minutes by .github/workflows/notify-live.yml.
const TZ = 'America/Los_Angeles';

function pacificNow(now) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const g = (t) => parts.find((p) => p.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, minutes: Number(g('hour')) * 60 + Number(g('minute')) };
}

export function streamKey(s) { return `${s.date}|${s.start}|${s.title}`; }

// streams: streams-data.json "streams"; alreadySent: Set of streamKey values. Returns [{ key, notification }].
export function liveAlerts(streams, now, alreadySent = new Set()) {
  const t = pacificNow(now), out = [];
  for (const s of streams || []) {
    if (!s || s.date !== t.date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.start || '') || !s.title) continue;
    const key = streamKey(s);
    if (alreadySent.has(key)) continue;
    const [h, m] = s.start.split(':').map(Number), away = h * 60 + m - t.minutes;
    if (away <= 5 || away > 15) continue;
    out.push({ key, notification: {
      eventId: 'live-stream', kind: 'live', title: 'Livestream starting soon',
      body: `${String(s.title).replace(/^20\d\d\s+/, '')}${s.venue ? ' at ' + s.venue : ''} goes live in about 15 minutes. Tap to watch.`,
    } });
  }
  return out;
}

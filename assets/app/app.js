/* ============================================================
   app.js — the Southwest Bowls phone app (served at /app).

   One small single-page app with no framework and no build step.
   Every screen is drawn from the website's own data files, so there
   is nothing extra to maintain: publish to events-data.json or
   results-data.json and the app shows it the next time it opens.

   Screens (all under /app):
     /app                     Home
     /app/events              Event list   (?q= &month= &cat= &club= &show=)
     /app/events/<id>         Event detail (?tab=overview|entry|entries|draw|results)
     /app/results             Results list (?q= &cat= &year=)
     /app/results/<id>        Results for one tournament
     /app/watch               Live, scheduled and recent video
     /app/more                Appearance, division information, clubs
     /app/more/clubs[/<slug>] Club directory
     /app/more/news           News
     /app/more/settings       Saved events, offline copies
     /app/page/<id>           An information page from content/<id>.json

   Rules this file keeps:
   - Dates are worked out in California time (America/Los_Angeles).
   - Entry status comes only from a real deadline. A future event is
     never assumed to be open.
   - A day-level date says "Today". "Live" is shown only when YouTube
     itself says a stream is live.
   - Saved copies used offline are labelled with when they were saved.
   - Saving an event is a bookmark on this phone, never an entry.
   ============================================================ */
(function () {
  'use strict';

  var TZ = 'America/Los_Angeles';
  var YT_KEY = 'AIzaSyC2ROynkUrYmW2IgIyQ0SJ0XxA6hStX0I8';   // same key the website uses
  var YT_UPLOADS = 'UUWaKJ7fKIfneziSig6qminQ';               // SW TV channel uploads
  var YT_CHANNEL_URL = 'https://www.youtube.com/@SouthwestLawnBowls';
  var FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=61574126130618';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];
  var CATS = ["Women's", "Men's", 'Mixed', 'Open'];

  var Logic = window.SWDLogic;
  var view = document.getElementById('view');
  var netbar = document.getElementById('netbar');
  var dlg = document.getElementById('dlg');

  /* ---------------------------------------------------------------
     Small helpers
     --------------------------------------------------------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function safeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^(https?:|mailto:|tel:)/i.test(u) || u.charAt(0) === '/') return u;
    return '';
  }
  function slugify(s) {
    return String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem('swd:' + key));
      localStorage.setItem('swd:' + key, JSON.stringify(val));
    } catch (e) { return null; }
  }
  function isExternal(u) { return /^https?:/i.test(u) && u.indexOf(location.origin) !== 0; }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function tel(p) { return 'tel:' + String(p).replace(/[^0-9+]/g, ''); }

  // Line icons: one stroke style everywhere (from the design handoff)
  var PATHS = {
    chev: '<path d="m9 5 7 7-7 7"/>',
    back: '<path d="m15 5-7 7 7 7"/>',
    ext: '<path d="M14 3h7v7m0-7L10 14M9 3H3v18h18v-6"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18"/>',
    pin: '<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.2A5 5 0 0 1 21 19"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
    bell: '<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5Zm5 3h4"/>',
    check: '<path d="m5 12 4.5 4.5L19 7"/>',
    hourglass: '<path d="M6 3h12M6 21h12M7 3c0 5 10 6 10 9s-10 4-10 9M17 3c0 5-10 6-10 9"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4Z"/>',
    map: '<path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7z"/><path d="M9 4v13M15 7v13"/>',
    doc: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M8.5 13h7M8.5 17h7"/>',
    person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6 8.5 7 8.5-7"/>',
    phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    trophy: '<path d="M8 3h8v6a4 4 0 0 1-8 0ZM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4M12 13v6m-4 2h8"/>',
    tv: '<rect x="3" y="4" width="18" height="14" rx="3"/><path d="m10 8 5 3-5 3Zm-3 8h10"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    sliders: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="9" cy="18" r="2"/>',
    news: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    medal: '<circle cx="12" cy="15" r="5"/><path d="M8.5 11 6 3h4l2 5 2-5h4l-2.5 8"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>'
  };
  // Facebook's official mark, from Simple Icons (CC0) — filled, not redrawn
  var FACEBOOK_PATH = '<path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/>';
  function icon(name, cls) {
    if (name === 'facebook') return '<svg class="i i--brand' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + FACEBOOK_PATH + '</svg>';
    return '<svg class="i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (PATHS[name] || '') + '</svg>';
  }
  var CHEV = icon('chev', 'chev i--sm');
  function extLabel(text) { return '<span class="ext">' + icon('ext', 'i--sm') + esc(text || 'Website') + '</span>'; }
  function playSvg() { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>'; }

  /* ---------------------------------------------------------------
     Appearance — Light / Dark / System. Defaults to System; an
     explicit choice is remembered. The page's <head> applies it
     before first paint; this keeps it up to date afterwards.
     --------------------------------------------------------------- */
  var darkMQ = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function themePref() { var p = store('theme'); return p === 'light' || p === 'dark' ? p : 'system'; }
  function applyTheme() {
    var p = themePref();
    var dark = p === 'dark' || (p === 'system' && darkMQ && darkMQ.matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#231120' : '#ffffff');
    markChecked('data-theme-choice', p);
  }
  if (darkMQ) {
    var onSystem = function () { if (themePref() === 'system') applyTheme(); };
    if (darkMQ.addEventListener) darkMQ.addEventListener('change', onSystem); else if (darkMQ.addListener) darkMQ.addListener(onSystem);
  }
  // Light/Dark/System and the text sizes are each one choice from several,
  // so they are radio groups: one checked, arrow keys move between them.
  function radioGroup(label, attr, options, current) {
    return '<div class="choices" role="radiogroup" aria-label="' + esc(label) + '">' + options.map(function (o) {
      var on = o[0] === current;
      return '<button type="button" role="radio" ' + attr + '="' + o[0] + '" aria-checked="' + on + '" tabindex="' + (on ? 0 : -1) + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  function markChecked(attr, value) {
    document.querySelectorAll('[' + attr + ']').forEach(function (b) {
      var on = b.getAttribute(attr) === value;
      b.setAttribute('aria-checked', on); b.setAttribute('tabindex', on ? 0 : -1);
    });
  }
  function themeChoices() {
    return radioGroup('Appearance', 'data-theme-choice', [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']], themePref());
  }
  function textChoices() {
    return radioGroup('Text size', 'data-size', [['standard', 'Standard'], ['large', 'Large'], ['xlarge', 'Extra large']], store('text') || 'standard');
  }
  function applyTextSize() {
    var v = store('text');
    if (v === 'large' || v === 'xlarge') document.documentElement.setAttribute('data-text', v);
    else document.documentElement.removeAttribute('data-text');
  }

  /* ---------------------------------------------------------------
     Dialog (tournament updates, appearance)
     --------------------------------------------------------------- */
  function openDialog(title, html) {
    document.getElementById('dlg-body').innerHTML = '<h2 id="dlg-title">' + esc(title) + '</h2>' + html;
    if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
  }
  function closeDialog() { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }
  document.getElementById('dlg-close').addEventListener('click', closeDialog);
  dlg.addEventListener('click', function (ev) { if (ev.target === dlg) closeDialog(); });
  document.addEventListener('click', function (ev) {
    if (ev.target.closest('[data-theme-open]')) openDialog('Appearance', '<p>Light, dark, or match your phone’s setting.</p>' + themeChoices());
  });

  /* ---------------------------------------------------------------
     Dates — always California time
     --------------------------------------------------------------- */
  function isoInTZ(d) {
    // en-CA formats as YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  }
  function todayISO() { return isoInTZ(new Date()); }
  function iso(y, m, d) { return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }
  function dateFromISO(s) { var p = s.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12)); }
  function fmt(isoStr, opts) {
    return new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: 'UTC' }, opts)).format(dateFromISO(isoStr));
  }
  function addDays(isoStr, n) { var d = dateFromISO(isoStr); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((dateFromISO(b) - dateFromISO(a)) / 86400000); }

  // Event dates are written for people ("Saturday–Sunday, July 18–19, 2026").
  // Pull out the first and last month/day, and the year.
  var MONTH_RE = new RegExp('(' + MONTHS.join('|') + '|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\\.?\\s+(\\d{1,2})(?:\\s*[\\u2013\\u2014-]\\s*(\\d{1,2})\\b(?!\\s*:))?', 'g');
  function monthIndex(name) {
    var n = name.slice(0, 3).toLowerCase();
    for (var i = 0; i < 12; i++) if (MONTHS[i].slice(0, 3).toLowerCase() === n) return i;
    return -1;
  }
  function parseDates(text) {
    var s = String(text || '');
    var y = s.match(/\b(20\d{2})\b/);
    if (!y) return null;
    var year = +y[1], hits = [], m;
    MONTH_RE.lastIndex = 0;
    while ((m = MONTH_RE.exec(s))) {
      var mi = monthIndex(m[1]);
      if (mi < 0) continue;
      hits.push(iso(year, mi, +m[2]));
      if (m[3]) hits.push(iso(year, mi, +m[3]));
    }
    if (!hits.length) return null;
    hits.sort();
    return { start: hits[0], end: hits[hits.length - 1] };
  }
  function dateRangeLabel(d, long) {
    if (!d) return '';
    var o = long ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' };
    if (d.start === d.end) return fmt(d.start, Object.assign({ year: long ? 'numeric' : undefined }, o));
    var a = fmt(d.start, o), b;
    if (d.start.slice(0, 7) === d.end.slice(0, 7) && !long) b = fmt(d.end, { day: 'numeric' });
    else b = fmt(d.end, o);
    return a + ' – ' + b + (long ? ', ' + d.end.slice(0, 4) : '');
  }

  // The entry deadline, only when the text really states one.
  // "Registration opens July 1 · Entry deadline Saturday, August 1, 2026"
  // must give August 1, and "Entries open August 26" gives nothing.
  function deadlineDate(x) {
    var t = String(x.e.deadline || '');
    if (!t || !x.dates) return null;
    var key = /(deadline|last date|received by|close[sd]?\b|no later than|\bby\b)/i.exec(t);
    if (key) t = t.slice(key.index);
    else if (/\b(open|opens|limited|capped)\b/i.test(t)) return null;
    if (!/\b20\d{2}\b/.test(t)) t += ' ' + x.dates.start.slice(0, 4);
    var d = parseDates(t);
    return d ? d.start : null;
  }

  /* ---------------------------------------------------------------
     Data — the website's own files
     --------------------------------------------------------------- */
  var cache = {};
  var stale = {};   // url -> Date the saved copy was made, when we are offline
  function getJSON(url) {
    if (cache[url]) return cache[url];
    cache[url] = fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      if (r.headers.get('x-swd-offline')) {
        var d = r.headers.get('date');
        stale[url] = d ? new Date(d) : null;
        showNetbar();
      }
      return r.json();
    }).catch(function (e) { delete cache[url]; throw e; });
    return cache[url];
  }
  function showNetbar() {
    var dates = Object.keys(stale).map(function (k) { return stale[k]; }).filter(Boolean);
    var when = dates.length ? new Date(Math.min.apply(null, dates)) : null;
    netbar.hidden = false;
    netbar.textContent = 'You’re offline. Showing information saved ' +
      (when ? new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(when) : 'earlier') +
      '. Entries, draws and scores may have changed.';
  }
  window.addEventListener('online', function () {
    stale = {}; cache = {}; netbar.hidden = true; render();
  });
  window.addEventListener('offline', function () {
    netbar.hidden = false;
    netbar.textContent = 'You’re offline. Saved information is still available; entries, draws and scores may have changed.';
  });

  // Clubs are written several ways ("Laguna Beach LBC", "Laguna Beach Lawn
  // Bowling Club"). Group the spellings of one club under one id, but never
  // merge different venues ("Laguna Beach / MacKenzie Park" stays separate).
  var CLUB_SUFFIX = /\s+(lawn\s+bowl(?:ing|s)?\s+clubs?|lbc)$/i;
  function clubKey(name) {
    var n = String(name || '').trim().replace(/\s+/g, ' ');
    return slugify(n.replace(CLUB_SUFFIX, ''));
  }
  function clubLabel(name) {
    var n = String(name || '').trim().replace(/\s+/g, ' ');
    if (/\//.test(n) || !CLUB_SUFFIX.test(n)) return n;
    return n.replace(CLUB_SUFFIX, '') + ' LBC';
  }
  function categoryOf(text) {
    text = String(text || '').toLowerCase();
    return /women/.test(text) ? "Women's" : /\bmen['’]?s?\b/.test(text) ? "Men's" : /mixed|mix\/match|mix-match/.test(text) ? 'Mixed' : 'Open';
  }
  // Shorter display title for lists; the official name stays in full on details.
  function shortTitle(t) {
    return String(t || '').replace(/^20\d{2}\s+/, '').replace(/^SWD\s+/, '').replace(/^\d+(st|nd|rd|th)\s+Annual\s+/i, '');
  }

  var EVENTS = null;
  var CLUB_ALIASES = {};
  function loadEvents() {
    return Promise.all([getJSON('/events-data.json'), getJSON('/clubs-data.json').catch(function () { return { clubs: [] }; })]).then(function (all) {
      var d = all[0];
      if (EVENTS && EVENTS.src === d) return EVENTS.list;
      CLUB_ALIASES = Logic.aliasMapFrom(all[1].clubs);
      var list = (d.events || []).filter(function (e) { return e.id && e.title && !/^paypal-test/.test(e.id); })
        .map(decorateEvent);
      list.sort(function (a, b) { return (a.dates ? a.dates.start : '9') < (b.dates ? b.dates.start : '9') ? -1 : 1; });
      EVENTS = { src: d, list: list };
      return list;
    });
  }
  function decorateEvent(e) {
    var club = (e.club && e.club.name) || '';
    var x = { e: e, id: e.id, dates: parseDates(e.date), cat: categoryOf(e.title + ' ' + (e.subtitle || '')),
      club: club, clubId: club ? clubKey(club) : '', clubLabel: club ? clubLabel(club) : '', short: shortTitle(e.title) };
    x.deadline = deadlineDate(x);
    x.clubIds = Logic.clubIdsForVenue(club, CLUB_ALIASES);
    return x;
  }
  function eventPhase(x, today) {
    if (!x.dates) return 'unknown';
    if (x.dates.end < today) return 'past';
    if (x.dates.start <= today) return 'now';
    return 'upcoming';
  }
  // The start time from "9:00 AM announcements · 9:15 AM start"
  function startTime(t) {
    var parts = String(t || '').split(/\s*·\s*/).filter(Boolean);
    var s = parts.filter(function (p) { return /start|trial ends/i.test(p); })[0] || parts[parts.length - 1] || '';
    return s;
  }
  // Status words come only from real data: explicit organizer state first
  // ('status': 'cancelled', 'entriesStatus': 'open' | 'closed'), then the
  // published dates. A passed deadline doesn't mean the event was played.
  var RESULT_EVENTS = {};   // event id -> true when results are published
  function entryStatus(x, today) {
    var e = x.e, phase = eventPhase(x, today);
    if (e.status === 'cancelled' || (e.alert && /cancel/i.test(e.alertLabel || ''))) return { kind: 'cancelled', label: 'Cancelled', icon: 'alert' };
    if (phase === 'past') return RESULT_EVENTS[x.id] ? { kind: 'results', label: 'Results available', icon: 'trophy' } : { kind: 'done', label: 'Completed', icon: 'check' };
    if (phase === 'now') {
      var st = startTime(e.time);
      return { kind: 'today', label: x.dates.start === today && st ? 'Today · ' + st : 'Today', icon: 'flag' };
    }
    if (e.entriesStatus === 'closed') return { kind: 'closed', label: 'Entries closed', icon: 'lock' };
    if (!x.deadline) return e.entriesStatus === 'open' ? { kind: 'openish', label: 'Entries open', icon: 'hourglass' } : { kind: 'upcoming', label: 'Upcoming', icon: 'cal' };
    if (today > x.deadline && e.entriesStatus !== 'open') return { kind: 'closed', label: 'Entries closed', icon: 'lock' };
    if (today > x.deadline) return { kind: 'openish', label: 'Entries open', icon: 'hourglass' };
    var left = daysBetween(today, x.deadline);
    var label = left === 0 ? 'Entries open · close today' : left === 1 ? 'Entries open · close tomorrow'
      : 'Entries open · close ' + fmt(x.deadline, { month: 'short', day: 'numeric' });
    return { kind: 'open', label: label, icon: 'hourglass', close: x.deadline };
  }
  function statusLine(st) {
    if (!st) return '';
    var cls = st.kind === 'open' || st.kind === 'openish' ? ' status--open' : st.kind === 'cancelled' ? ' status--cancelled' : '';
    return '<span class="status' + cls + '">' + icon(st.icon) + esc(st.label) + '</span>';
  }

  var RESULTS = null;
  function loadResults() {
    return getJSON('/results-data.json').then(function (d) {
      if (RESULTS && RESULTS.src === d) return RESULTS.list;
      var list = (d.tournaments || []).map(function (t, i) {
        // Which event these results belong to: an explicit eventId (one id,
        // or a list when one result covers several events), else the
        // eventUrl's ?id=, else a result id that is itself an event id
        var m = /[?&]id=([^&#]+)/.exec(t.eventUrl || '');
        var eids = [].concat(t.eventId || (m ? decodeURIComponent(m[1]) : []), t.id);
        var year = (/\b(20\d{2})\b/.exec(t.title + ' ' + t.id) || [])[1] || '';
        return {
          t: t, id: t.id, order: i, eventId: eids[0] !== t.id ? eids[0] : (m ? decodeURIComponent(m[1]) : t.id), eventIds: eids, year: year,
          cat: categoryOf(t.title), names: (t.divisions || []).map(divisionNames).join(' ')
        };
      });
      RESULTS = { src: d, list: list };
      RESULT_EVENTS = {};
      list.forEach(function (r) { r.eventIds.forEach(function (k) { RESULT_EVENTS[k] = true; }); });
      return list;
    });
  }
  function divisionPlaces(dv) {
    if (dv.places) return [{ label: '', places: dv.places }];
    return (dv.flights || []).map(function (f) { return { label: f.label || '', places: f.places || [] }; });
  }
  function divisionNames(dv) {
    return divisionPlaces(dv).map(function (g) { return g.places.map(function (p) { return p.names || ''; }).join(' '); }).join(' ');
  }
  // First place in each division (top flight). Several divisions mean several
  // winners — they are never presented as one event champion.
  function firsts(r) {
    var out = [];
    (r.t.divisions || []).forEach(function (dv) {
      var g = divisionPlaces(dv)[0];
      var p = g && g.places.filter(function (x) { return +x.rank === 1; })[0];
      if (p) out.push({ who: p.names, where: dv.label || '', photo: safeUrl(p.photo) });
    });
    return out;
  }

  /* ---------------------------------------------------------------
     Saved events (no account — kept on this phone)
     --------------------------------------------------------------- */
  function saved() { return store('saved') || []; }
  function isSaved(id) { return saved().indexOf(id) >= 0; }
  // Followed clubs: kept on this phone only. Following never turns on
  // notifications; it only puts the club's events first.
  function followed() { return store('followedClubs') || []; }
  function isFollowing(id) { return followed().indexOf(id) >= 0; }
  function setFollowing(id, on, name) {
    var f = followed().filter(function (x) { return x !== id; });
    if (on) f.push(id);
    store('followedClubs', f);
    document.querySelectorAll('[data-follow="' + id + '"]').forEach(function (b) {
      b.setAttribute('aria-pressed', on);
      var t = b.querySelector('span'); if (t) t.textContent = on ? 'Following' : 'Follow club';
    });
    view.dispatchEvent(new CustomEvent('follow-change', { detail: { id: id, on: on } }));
    if (on) {
      var first = !store('followExplained'); store('followExplained', true);
      toast('Following ' + name, first ? 'See this club’s events first. Following doesn’t turn on notifications.' : '',
        function () { setFollowing(id, false, name); });
    } else {
      toast('Stopped following ' + name, '', function () { setFollowing(id, true, name); });
    }
  }
  function followBtn(id, name) {
    var on = isFollowing(id);
    return '<button class="btn btn--ghost btn--follow" type="button" data-follow="' + esc(id) + '" data-name="' + esc(name) + '" aria-pressed="' + on + '">' +
      icon('star') + '<span>' + (on ? 'Following' : 'Follow club') + '</span></button>';
  }

  // One place changes saved state, so Home, Events and event details
  // always agree. Saving is a bookmark: it never registers anyone or
  // turns on reminders.
  function setSaved(id, on, title) {
    var s = saved().filter(function (x) { return x !== id; });
    if (on) s.push(id);
    store('saved', s);
    document.querySelectorAll('[data-save="' + id + '"]').forEach(function (b) {
      b.setAttribute('data-on', on);
      var span = b.querySelector('span');
      if (span) span.textContent = on ? 'Saved' : 'Save';
      b.setAttribute('aria-label', saveLabel(on, b.getAttribute('data-title') || title));
    });
    view.dispatchEvent(new CustomEvent('saved-change', { detail: { id: id, on: on } }));
    var name = title ? ' ' + title : '';
    if (on) {
      var first = !store('savedExplained');
      store('savedExplained', true);
      toast('Saved to Home', first ? 'Saving keeps this event handy. It doesn’t register you or turn on reminders.' : '',
        function () { setSaved(id, false, title); }, 'Saved to Home:' + name + '.');
    } else {
      toast('Removed from Home', '', function () { setSaved(id, true, title); }, 'Removed from Home:' + name + '.');
    }
  }
  function saveLabel(on, title) { return (on ? 'Unsave ' : 'Save ') + title; }
  function saveBtn(id, title) {
    var on = isSaved(id);
    return '<button class="iconbtn" type="button" data-save="' + esc(id) + '" data-title="' + esc(title) + '" data-on="' + on + '" aria-label="' +
      esc(saveLabel(on, title)) + '">' + icon('bookmark') + '</button>';
  }

  // Visual confirmation with an optional Undo; the words are announced
  // through a separate polite live region that is always present.
  var toastTimer;
  function toast(msg, detail, undo, spoken) {
    var t = document.getElementById('toast');
    var live = document.getElementById('announce');
    if (!t) {
      t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.hidden = true;
      document.body.appendChild(t);
    }
    t.innerHTML = '<span class="toast__text"><b>' + esc(msg) + '</b>' + (detail ? '<span>' + esc(detail) + '</span>' : '') + '</span>' +
      (undo ? '<button type="button" class="toast__undo">Undo</button>' : '');
    if (undo) t.querySelector('.toast__undo').addEventListener('click', function () { t.hidden = true; undo(); });
    t.hidden = false;
    if (live) { live.textContent = ''; setTimeout(function () { live.textContent = (spoken || msg) + (detail ? ' ' + detail : ''); }, 50); }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, detail ? 7000 : undo ? 5000 : 3200);
  }

  /* ---------------------------------------------------------------
     Shared pieces of markup
     --------------------------------------------------------------- */
  // Colour tells the kind of event: women's pink, men's blue, mixed yellow, open grey
  function catClass(x) { return x && x.cat === "Women's" ? 'cat--w' : x && x.cat === "Men's" ? 'cat--m' : x && x.cat === 'Mixed' ? 'cat--x' : 'cat--o'; }
  function dateBlock(x, accent, onTint) {
    var cls = 'dateblock ' + catClass(x) + (accent ? ' dateblock--accent' : '') + (onTint ? ' dateblock--ontint' : '');
    if (!x.dates) return '<span class="' + cls + '" aria-hidden="true"><small>TBA</small><b>–</b></span>';
    return '<span class="' + cls + '" aria-hidden="true"><small>' +
      fmt(x.dates.start, { month: 'short' }) + '</small><b>' + fmt(x.dates.start, { day: 'numeric' }) + '</b></span>';
  }
  // Calendar view: a month grid with tournament days marked; tap a day to see what is on.
  function addMonths(ym, n) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + String(m + 1).padStart(2, '0');
  }
  function calendarHtml(list, ym, selDay, today) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1;
    var first = ym + '-01', lead = dateFromISO(first).getUTCDay();
    var n = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    function on(iso) { return list.filter(function (x) { return x.dates && x.dates.start <= iso && iso <= x.dates.end; }); }
    var anyThisMonth = false, firstDay = '', nextDay = '';
    for (var d0 = 1; d0 <= n; d0++) {
      var iso0 = ym + '-' + String(d0).padStart(2, '0');
      if (on(iso0).length) { anyThisMonth = true; if (!firstDay) firstDay = iso0; if (!nextDay && iso0 >= today) nextDay = iso0; }
    }
    var showDay = selDay && selDay.slice(0, 7) === ym ? selDay : (nextDay || firstDay);
    var cells = '';
    for (var i = 0; i < lead; i++) cells += '<span class="cal__blank"></span>';
    for (var d = 1; d <= n; d++) {
      var iso = ym + '-' + String(d).padStart(2, '0'), ev = on(iso);
      var kinds = {}; ev.forEach(function (e0) { kinds[catClass(e0)] = 1; });
      var kc = Object.keys(kinds).length === 1 ? ' ' + Object.keys(kinds)[0] : '';
      cells += ev.length
        ? '<button type="button" class="cal__day cal__day--has' + kc + (iso === today ? ' cal__day--today' : '') + (iso === showDay ? ' cal__day--sel' : '') + '" data-cal-day="' + iso + '" aria-pressed="' + (iso === showDay) +
          '" aria-label="' + esc(fmt(iso, { weekday: 'long', month: 'long', day: 'numeric' }) + ', ' + ev.length + (ev.length === 1 ? ' event' : ' events')) + '">' + d + '</button>'
        : '<span class="cal__day' + (iso === today ? ' cal__day--today' : '') + '">' + d + '</span>';
    }
    var dayEv = showDay ? on(showDay) : [];
    var html = '<div class="cal"><div class="cal__head"><button class="circbtn" type="button" data-cal-nav="-1" aria-label="Previous month">' + icon('back') + '</button>' +
      '<h2 class="cal__title" aria-live="polite">' + esc(fmt(first, { month: 'long', year: 'numeric' })) + '</h2>' +
      '<button class="circbtn" type="button" data-cal-nav="1" aria-label="Next month">' + icon('chev') + '</button></div>' +
      '<div class="cal__grid" role="group" aria-label="Days with events"><span class="cal__dow" aria-hidden="true">Sun</span><span class="cal__dow" aria-hidden="true">Mon</span><span class="cal__dow" aria-hidden="true">Tue</span><span class="cal__dow" aria-hidden="true">Wed</span><span class="cal__dow" aria-hidden="true">Thu</span><span class="cal__dow" aria-hidden="true">Fri</span><span class="cal__dow" aria-hidden="true">Sat</span>' + cells + '</div><ul class="legend" aria-label="Colours"><li><span class="legend__dot cat--w"></span>Women’s</li><li><span class="legend__dot cat--m"></span>Men’s</li><li><span class="legend__dot cat--x"></span>Mixed</li><li><span class="legend__dot cat--o"></span>Open</li></ul></div>';
    html += '<div id="cal-day-list" tabindex="-1">' + (!anyThisMonth ? state('empty', 'No events this month', 'Use the arrows to look at another month.')
      : '<h2 class="section__title list-title">' + esc(fmt(showDay, { weekday: 'long', month: 'long', day: 'numeric' })) + '</h2>' +
        (dayEv.length ? '<ul class="list list--cards">' + dayEv.map(function (x) { return eventRow(x, today); }).join('') + '</ul>' : '<p class="muted">Nothing scheduled this day.</p>')) + '</div>';
    return html;
  }
  function eventRow(x, today) {
    var e = x.e, phase = eventPhase(x, today);
    var meta = [x.clubLabel, e.format && cap(e.format)].filter(Boolean).join(' · ');
    var update = e.alert && phase !== 'past'
      ? '<span class="status status--update">' + icon('bell') + esc(e.alertLabel || 'Update') + '</span>' : '';
    return '<li class="evrow">' + dateBlock(x) +
      '<a class="evrow__main" href="/app/events/' + encodeURIComponent(x.id) + '">' +
      '<span class="evrow__title">' + esc(x.short) + '</span>' +
      '<span class="sr-only">' + esc(dateRangeLabel(x.dates, true)) + '. </span>' +
      '<span class="evrow__meta">' + esc(meta) + (x.dates && x.dates.start !== x.dates.end ? ' · ' + esc(dateRangeLabel(x.dates)) : '') + '</span>' +
      statusLine(entryStatus(x, today)) + update + '</a>' + saveBtn(x.id, x.short) + '</li>';
  }
  function sectionHead(id, title, href, label) {
    return '<div class="section__head"><h2 class="section__title" id="' + id + '">' + esc(title) + '</h2>' +
      (href ? '<a class="section__more" href="' + href + '">' + esc(label || 'View all') + '<span class="sr-only"> ' + esc(title) + '</span>' + icon('chev', 'i--sm') + '</a>' : '') + '</div>';
  }
  // Back names the screen you actually came from when it is a known one
  // (e.g. an event opened from My SWD goes back to My SWD); otherwise the
  // screen's usual parent.
  var BACK_NAMES = [[/^\/app\/?$/, 'Home'], [/^\/app\/(my|more\/membership)\/?$/, 'My SWD'], [/^\/app\/search\/?$/, 'Search'],
    [/^\/app\/more\/?$/, 'More'], [/^\/app\/more\/news\/?$/, 'News'], [/^\/app\/more\/clubs\/[^/]+\/?$/, 'Club'],
    [/^\/app\/watch\/?$/, 'Southwest TV'], [/^\/app\/standings\/?$/, 'Standings']];
  function backLink(href, label) {
    var from = history.state && history.state.from;
    if (from && from.split('?')[0] !== href.split('?')[0]) {
      var hit = BACK_NAMES.filter(function (b) { return b[0].test(from.split('?')[0]); })[0];
      if (hit) { href = from; label = hit[1]; }
    }
    return '<a class="back" href="' + esc(href) + '" data-back>' + icon('back', 'i--sm') + esc(label) + '</a>';
  }
  function linkRow(href, iconName, title, meta, opts) {
    opts = opts || {};
    var ext = opts.ext;
    return '<li><a class="row" href="' + esc(href) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + (opts.attrs || '') + '>' +
      (iconName ? icon(iconName) : '') + '<span class="row__main"><span class="row__title">' + esc(title) + '</span>' +
      (meta ? '<span class="row__meta">' + esc(meta) + '</span>' : '') + '</span>' + (ext ? extLabel(opts.extText) : CHEV) + '</a></li>';
  }

  // When a result was played: the month and day in its meta line, in its year
  function resultDate(r) { var d = parseDates((r.t.meta || '') + ' ' + (r.year || '')); return d ? d.start : ''; }
  function resultBlock(r) {
    var d = resultDate(r);
    var cc = catClass(r.cat ? r : { cat: categoryOf(r.t.title) });
    return d ? '<span class="dateblock ' + cc + '" aria-hidden="true"><small>' + fmt(d, { month: 'short' }) + '</small><b>' + fmt(d, { day: 'numeric' }) + '</b></span>'
      : '<span class="dateblock ' + cc + '" aria-hidden="true">' + icon('trophy') + '</span>';
  }
  // The latest champions: warm orange card; a photo only when it is of these winners
  // Latest champions: three small cards you swipe, instead of one tall panel
  function champStrip(list) {
    var items = list.filter(function (r) { return firsts(r).length; }).slice(0, 4);
    if (!items.length) return '';
    return '<section class="hsec" aria-labelledby="h-champ"><div class="section__head"><h2 class="section__title" id="h-champ">Latest champions</h2></div><ul class="hscroll">' +
      items.map(function (r, i) {
        var w = firsts(r)[0];
        return '<li><a class="mini ' + catClass(r.cat ? r : { cat: categoryOf(r.t.title) }) + '" href="/app/results/' + encodeURIComponent(r.id) + '"><span class="mini__date">' + icon('trophy', 'i--sm') + esc(shortTitle(r.t.title)) + '</span>' +
          '<span class="mini__title">' + esc(w.who) + '</span><span class="mini__meta">' + esc(r.t.meta || '') + '</span></a></li>';
      }).join('') + '</ul></section>';
  }
  function championPanel(r) {
    var f = firsts(r);
    if (!f.length) return '';
    var w = f[0];
    var kicker = f.length === 1 ? 'Latest champions' : 'Latest result · ' + w.where + ' winners';
    return '<a class="champ tint tint--orange" href="/app/results/' + encodeURIComponent(r.id) + '">' +
      (w.photo ? '<img class="champ__img" src="' + esc(w.photo) + '" alt="' + esc(w.who) + '" width="96" height="120" loading="lazy" data-hide-on-error>' : '') +
      '<span class="champ__body"><span class="champ__kicker">' + icon('trophy') + esc(kicker) + '</span>' +
      '<span class="champ__who">' + esc(w.who) + '</span>' +
      '<span class="champ__meta">' + esc([shortTitle(r.t.title), r.t.meta].filter(Boolean).join(' · ')) + '</span>' +
      (f.length > 1 ? '<span class="champ__meta">+ ' + (f.length - 1) + ' more division winner' + (f.length > 2 ? 's' : '') + '</span>' : '') +
      '<span class="textlink">View result' + icon('chev', 'i--sm') + '</span></span></a>';
  }
  function resultRow(r) {
    var f = firsts(r);
    var who = !f.length ? 'Published result' : f.length === 1 ? f[0].who : f[0].where + ' winners: ' + f[0].who;
    return '<li><a class="rcard" href="/app/results/' + encodeURIComponent(r.id) + '">' + resultBlock(r) +
      '<span class="rcard__body"><span class="rcard__title">' + esc(shortTitle(r.t.title)) + '</span>' +
      '<span class="rcard__meta">' + esc(who) + '</span></span>' + CHEV + '</a></li>';
  }

  function state(kind, title, body, action) {
    return '<div class="' + kind + '" role="status"><b>' + esc(title) + '</b>' + (body ? '<p>' + esc(body) + '</p>' : '') + (action || '') + '</div>';
  }
  function errorState() {
    return state('error', navigator.onLine ? 'This didn’t load' : 'You’re offline',
      navigator.onLine ? 'Check your connection and try again.' : 'This hasn’t been saved on your phone yet. Try again when you have a signal.',
      '<button class="btn" type="button" data-retry>Try again</button>');
  }
  // While a screen loads: still placeholder blocks the size of real content
  // (no endless shimmer), announced once to screen readers.
  function loading() {
    return '<div class="skel" role="status"><span class="sr-only">Loading…</span><span class="skel__h"></span><span class="skel__l"></span>' +
      '<span class="skel__b"></span><span class="skel__b"></span></div>';
  }
  // Every main screen opens with the same compact header: a short heading,
  // the section name, and one restrained decorative graphic.
  function pageHead(title, label) {
    return '<header class="phead"><div class="phead__text"><h1>' + esc(title) + '</h1>' + (label ? '<p class="phead__label">' + esc(label) + '</p>' : '') + '</div></header>';
  }
  function setTitle(t) { document.title = (t ? t + ' · ' : '') + 'Southwest Bowls'; }

  // Tournament updates (events-data "alert"), shown in a dialog
  // Tournament updates come from events-data.json ('alert'). Each has a
  // version (event + wording); a reworded update is unread again. Only
  // opening this list marks updates as read — never just visiting Home.
  function updVersion(x) { return Logic.updateVersion(x.id, x.e.alertLabel, x.e.alert); }
  function readUpdates() { return store('updatesRead') || []; }
  function unreadCount(list) { var r = readUpdates(); return list.filter(function (x) { return r.indexOf(updVersion(x)) < 0; }).length; }
  function updatesLabel(list) {
    var n = list.length, u = unreadCount(list);
    return n + ' tournament update' + (n === 1 ? '' : 's') + (u ? ' · ' + u + ' new' : '');
  }
  function updatesShort(list) { var u = unreadCount(list); return list.length + ' current' + (u ? ' · ' + u + ' new' : ''); }
  function noticesDialog(list) {
    if (!list.length) { openDialog('Tournament updates', '<p>There are no tournament updates right now.</p>'); return; }
    var ids = saved(), read = readUpdates();
    var mine = list.filter(function (x) { return ids.indexOf(x.id) >= 0; });
    var rest = list.filter(function (x) { return ids.indexOf(x.id) < 0; });
    function item(x) {
      var isNew = read.indexOf(updVersion(x)) < 0;
      return '<article class="upd">' +
        '<p class="upd__meta">' + (isNew ? '<span class="tag-new">New</span>' : '') + esc(x.e.alertLabel || 'Update') +
          (x.e.alertDate ? ' · ' + esc(fmt(x.e.alertDate, { month: 'short', day: 'numeric' })) : '') + '</p>' +
        '<h3>' + esc(x.short) + '</h3>' +
        (x.dates ? '<p class="muted">' + esc(dateRangeLabel(x.dates, true)) + (x.clubLabel ? ' · ' + esc(x.clubLabel) : '') + '</p>' : '') +
        '<p>' + esc(x.e.alert) + '</p>' +
        '<a class="textlink" href="/app/events/' + encodeURIComponent(x.id) + '">View event<span class="sr-only">: ' + esc(x.short) + '</span>' + icon('chev', 'i--sm') + '</a></article>';
    }
    openDialog('Tournament updates',
      (mine.length ? '<h3 class="upd__group">Your saved events</h3>' + mine.map(item).join('') : '') +
      (rest.length ? (mine.length ? '<h3 class="upd__group">Other updates</h3>' : '') + rest.map(item).join('') : ''));
    // They have now been seen
    var now = read.slice();
    list.forEach(function (x) { var v = updVersion(x); if (now.indexOf(v) < 0) now.push(v); });
    store('updatesRead', now.slice(-200));
    document.querySelectorAll('[data-notices] [data-upd-label]').forEach(function (el) {
      el.textContent = el.getAttribute('data-upd-label') === 'short' ? updatesShort(list) : updatesLabel(list);
    });
    document.querySelectorAll('.circbtn[data-notices]').forEach(function (b) {   // Home bell: clear the dot once seen
      var d = b.querySelector('.circbtn__dot'); if (d) d.remove();
      b.setAttribute('aria-label', 'Tournament updates');
    });
  }

  // Share: the phone's share sheet when there is one, otherwise copy the
  // public link. Cancelling is quiet; a real failure says so.
  function shareBtn(title, path) {
    return '<button class="btn btn--ghost" type="button" data-share="' + esc(path) + '" data-share-title="' + esc(title) + '">' + icon('share') + 'Share</button>';
  }
  function share(title, path) {
    var url = Logic.canonicalUrl(path);
    function copied() { toast('Link copied.'); }
    function failed() { openDialog('Share this link', '<p>Copy this link to share it:</p><p class="copylink"><input type="text" readonly value="' + esc(url) + '" aria-label="Link to share" onfocus="this.select()"></p>'); }
    function copy() {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(copied, failed);
      else failed();
    }
    if (navigator.share) {
      navigator.share({ title: title, url: url }).catch(function (err) { if (!err || err.name !== 'AbortError') copy(); });
    } else copy();
  }

  var currentNotices = [];

  /* ---------------------------------------------------------------
     HOME
     --------------------------------------------------------------- */
  // Home is a compact overview, not a feed: identity, real search, four
  // section tiles, your next saved game, and one community story. Longer
  // lists live in Events, Results, Watch and News.
  var CRITICAL = /cancel|postpon|venue|reschedul|new date|moved/i;
  function isCritical(x) { return !!x.e.alert && CRITICAL.test((x.e.alertLabel || '') + ' ' + x.e.alert); }

  function home() {
    setTitle('');
    var today = todayISO();
    return Promise.all([
      loadEvents(),
      getJSON('/app-home-data.json').catch(function () { return {}; })
    ]).then(function (all) {
      var data = { events: all[0], story: all[1].feature || null, today: today };
      drawHome(data);
      // Saving or unsaving on Home redraws it straight away
      view.addEventListener('saved-change', function (ev) {
        var y = window.scrollY;
        drawHome(data);
        window.scrollTo(0, y);
        if (ev.detail && !ev.detail.on) { var h = document.getElementById('h-next'); if (h) h.focus({ preventScroll: true }); }
      });
      if (sessionStorage.getItem('swd:refocusSearch')) {
        sessionStorage.removeItem('swd:refocusSearch');
        var hq = document.getElementById('hq'); if (hq) hq.focus();
      }
    });
  }

  function drawHome(d) {
    var today = d.today;
    var live = d.events.filter(function (x) { var p = eventPhase(x, today); return p === 'upcoming' || p === 'now'; });
    var ids = saved();
    var mine = d.events.filter(function (x) { return ids.indexOf(x.id) >= 0; });
    var mineNext = mine.filter(function (x) { return live.indexOf(x) >= 0; });   // already in date order

    // 1. Greeting bar: date and hello on the left; search, updates and profile as small round buttons
    var prof = store('profile') || {}, first = String(prof.name || '').trim().split(/\s+/)[0];
    currentNotices = live.filter(function (x) { return x.e.alert; });
    var unread = unreadCount(currentNotices);
    var html = '<header class="hbar"><div class="hbar__text"><span class="hbar__date">' + esc(fmt(today, { weekday: 'short', month: 'short', day: 'numeric' })) + '</span>' +
      '<h1 class="hbar__hello">' + (first ? 'Hi, ' + esc(first) : 'Southwest Bowls') + '</h1></div>' +
      '<a class="circbtn" id="hq" href="/app/search" aria-label="Search events, clubs and results">' + icon('search') + '</a>' +
      '<button class="circbtn" type="button" data-notices aria-haspopup="dialog" aria-label="Tournament updates' + (unread ? ', ' + unread + ' new' : '') + '">' + icon('bell') + (unread ? '<span class="circbtn__dot" aria-hidden="true"></span>' : '') + '</button>' +
      '<a class="circbtn" href="/app/more/settings" aria-label="App settings">' + icon('sliders') + '</a>' +
      '<a class="circbtn circbtn--me" href="/app/my" aria-label="My SWD">' + (initials(prof.name) ? esc(initials(prof.name)) : icon('person')) + '</a></header>';

    // Urgent: a change to a saved event
    var myAlerts = mineNext.filter(isCritical);
    html += myAlerts.map(function (x) {
      return '<a class="alert" href="/app/events/' + encodeURIComponent(x.id) + '">' + icon('alert') +
        '<span><b>' + esc(x.e.alertLabel || 'Update') + ' · ' + esc(x.short) + '</b><span class="alert__text">' + esc(x.e.alert) + '</span></span></a>';
    }).join('');

    // 2. Next up: every event on the next date (men's and women's, club and Division events can overlap),
    //    plus anything already under way. Saving never enters anyone.
    var underway = live.filter(function (x) { return eventPhase(x, today) === 'now'; });
    var future = live.filter(function (x) { return eventPhase(x, today) !== 'now'; });
    var nextStart = future.length ? future[0].dates.start : '';
    var sameDay = nextStart ? future.filter(function (x) { return x.dates && x.dates.start === nextStart; }) : [];
    var heroEvs = underway.concat(sameDay).slice(0, 4);
    var shownIds = {}; heroEvs.forEach(function (x) { shownIds[x.id] = true; });
    if (heroEvs.length) {
      var headLabel = underway.length && !sameDay.length ? 'On now' : underway.length ? 'On now and next' : (heroEvs.length > 1 ? 'Next up · ' + fmt(nextStart, { weekday: 'long', month: 'long', day: 'numeric' }) : 'Next event');
      html += '<section aria-labelledby="h-next"><h2 class="hero-label" id="h-next" tabindex="-1">' + esc(headLabel) + '</h2><div class="herostack">' +
        heroEvs.map(function (heroEv) {
          var hst = entryStatus(heroEv, today), isMine = ids.indexOf(heroEv.id) >= 0;
          return '<a class="herocard ' + catClass(heroEv) + '" href="/app/events/' + encodeURIComponent(heroEv.id) + '">' + dateBlock(heroEv, false, true) +
            '<span class="herocard__main">' + (isMine ? '<span class="herocard__kicker">Saved</span>' : '') +
            '<span class="herocard__title">' + esc(heroEv.short) + '</span>' +
            '<span class="herocard__meta">' + esc([dateRangeLabel(heroEv.dates), heroEv.clubLabel].filter(Boolean).join(' · ')) + '</span>' +
            (hst ? statusLine(hst) : '') + '</span>' + CHEV + '</a>';
        }).join('') + '</div>' +
        (future.length > sameDay.length && sameDay.length >= 4 ? '' : '') + '</section>';
    }

    // 3. Four quick links as round shortcuts
    html += '<nav class="shortcuts" aria-label="Sections">' + [
      ['/app/events?show=calendar', 'cal', 'Calendar', 'blue'], ['/app/results', 'trophy', 'Results', 'orange'],
      ['/app/more/clubs', 'pin', 'Clubs', 'blush'], ['/app/watch', 'tv', 'Watch', 'ink']
    ].map(function (t) {
      return '<a class="shortcut shortcut--' + t[3] + '" href="' + t[0] + '"><span class="shortcut__dot">' + icon(t[1]) + '</span><span class="shortcut__label">' + t[2] + '</span></a>';
    }).join('') + '</nav>';

    // 4. Upcoming events: a row of cards you swipe sideways
    var more = live.filter(function (x) { return !shownIds[x.id]; }).slice(0, 8);
    if (more.length) {
      html += '<section class="hsec" aria-labelledby="h-up"><div class="section__head"><h2 class="section__title" id="h-up">Coming up</h2>' +
        '<a class="section__more" href="/app/events">See all' + icon('chev', 'i--sm') + '</a></div><ul class="hscroll">' +
        more.map(function (x, i) {
          var st = entryStatus(x, today);
          return '<li><a class="mini ' + catClass(x) + '" href="/app/events/' + encodeURIComponent(x.id) + '"><span class="mini__date">' + esc(dateRangeLabel(x.dates, true)) + '</span>' +
            '<span class="mini__title">' + esc(x.short) + '</span><span class="mini__meta">' + esc(x.clubLabel || '') + '</span>' + (st ? statusLine(st) : '') + '</a></li>';
        }).join('') + '</ul></section>';
    }

    // 5. Around the greens — one real community story; the full feed is News
    var sto = d.story;
    if (sto && sto.headline) {
      var ph = sto.photo || {};
      html += '<section class="hsec" aria-labelledby="h-greens"><div class="section__head"><h2 class="section__title" id="h-greens">Around the greens</h2>' +
        '<a class="section__more" href="/app/more/news">News' + icon('chev', 'i--sm') + '</a></div>' +
        '<div class="gcard gcard--feature">' + (safeUrl(ph.src) ? '<img class="gcard__img" src="' + esc(ph.src) + '" alt="' + esc(ph.alt || '') + '" width="72" height="72" loading="lazy" data-hide-on-error>' : '') +
        '<div class="gcard__body"><p class="gcard__title">' + esc(sto.cardTitle || sto.headline) + '</p>' +
        (sto.cardLine ? '<p class="gcard__meta">' + esc(sto.cardLine) + '</p>' : '') +
        (sto.champions && sto.champions.length
          ? '<button class="textlink" type="button" data-story aria-haspopup="dialog">' + esc(sto.actionLabel || 'Read more') + icon('chev', 'i--sm') + '</button>'
          : sto.source && safeUrl(sto.source.url) ? '<a class="textlink" href="' + esc(sto.source.url) + '" target="_blank" rel="noopener">' + esc(sto.actionLabel || 'Read more') + icon('ext', 'i--sm') + '</a>' : '') +
        '</div></div></section>';
    }

    html += '<a class="minorlink" href="/app/page/about-us#partners">' + icon('people') + '<span>Partners &amp; affiliations</span>' + CHEV + '</a>';

    view.innerHTML = html;
    view.querySelectorAll('img[data-hide-on-error]').forEach(function (img) {
      img.addEventListener('error', function () { img.hidden = true; });
    });
    var sb = view.querySelector('[data-story]');
    if (sb) sb.addEventListener('click', function () { storyDialog(d.story); });
  }
  // Typing on Home moves to the full search screen, keeping the caret.
  var searchFocus = false;
  function openSearch(q) {
    searchFocus = true;
    // Focus again once the screen has finished loading (go() focuses the page)
    go('/app/search' + (q ? '?q=' + encodeURIComponent(q) : '')).then(function () {
      var sq = document.getElementById('sq');
      if (sq) { sq.focus(); var n = sq.value.length; try { sq.setSelectionRange(n, n); } catch (e) {} }
    });
  }

  // SEARCH — events, clubs and results from the site's own data files
  function fold(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function searchScreen(params) {
    setTitle('Search');
    var today = todayISO();
    // The field appears at once (so typing carries on); results follow the data
    view.innerHTML = '<div class="searchbar"><a class="iconbtn" href="/app" data-back data-close-search aria-label="Close search">' + icon('back') + '</a>' +
      '<form class="search search--page" role="search">' + icon('search') + '<label class="sr-only" for="sq">Search events, clubs, results</label>' +
      '<input id="sq" type="search" placeholder="Events, clubs, results" value="' + esc(params.get('q') || '') + '" autocomplete="off" enterkeyhint="search"></form></div>' +
      '<div id="s-out">' + loading() + '</div>';
    if (searchFocus) { searchFocus = false; var f0 = document.getElementById('sq'); f0.focus(); var n0 = f0.value.length; try { f0.setSelectionRange(n0, n0); } catch (e) {} }
    return Promise.all([loadEvents(), getJSON('/clubs-data.json').catch(function () { return { clubs: [] }; }), loadResults().catch(function () { return []; })]).then(function (all) {
      var EV = all[0].map(function (x) { return { x: x, t: fold([x.e.title, x.e.subtitle, x.club, x.clubLabel, x.e.format, x.e.date, x.cat].join(' ')) }; });
      var CL = (all[1].clubs || []).map(function (c) { return { c: c, t: fold([c.name, c.city, c.summary].join(' ')) }; });
      var RS = all[2].map(function (r) { return { r: r, t: fold([r.t.title, r.t.meta, r.names].join(' ')) }; });
      var expand = params.get('all') || '';
      var input = document.getElementById('sq');
      function group(key, title, items, row) {
        if (!items.length) return '';
        var shown = expand === key ? items : items.slice(0, 5);
        return '<section class="sgroup" aria-labelledby="sg-' + key + '"><h2 class="group-title" id="sg-' + key + '">' + title + ' <span class="muted">(' + items.length + ')</span></h2>' +
          '<ul class="rows rows--menu">' + shown.map(row).join('') + '</ul>' +
          (items.length > shown.length ? '<button class="textlink" type="button" data-expand="' + key + '">Show all ' + items.length + ' ' + title.toLowerCase() + icon('chev', 'i--sm') + '</button>' : '') + '</section>';
      }
      function apply() {
        var raw = input.value.trim(), q = fold(raw), terms = q.split(/\s+/).filter(Boolean);
        var out = document.getElementById('s-out');
        var u = new URLSearchParams(); if (raw) u.set('q', raw); if (raw && expand) u.set('all', expand);
        history.replaceState(history.state, '', '/app/search' + (u.toString() ? '?' + u : ''));
        if (!terms.length) {
          out.innerHTML = '<p class="muted" style="margin-top:16px">Search tournament names, clubs, cities and player names.</p>' +
            '<ul class="rows rows--menu" style="margin-top:12px">' + menuRow('/app/events', 'cal', 'Browse events') + menuRow('/app/more/clubs', 'pin', 'Browse clubs') + menuRow('/app/results', 'trophy', 'Browse results') + '</ul>';
          return;
        }
        var hit = function (o) { return terms.every(function (w) { return o.t.indexOf(w) >= 0; }); };
        var ev = EV.filter(hit).map(function (o) { return o.x; });
        var up = ev.filter(function (x) { return eventPhase(x, today) !== 'past'; });
        var past = ev.filter(function (x) { return eventPhase(x, today) === 'past'; }).reverse();
        ev = up.concat(past);
        var cl = CL.filter(hit).map(function (o) { return o.c; });
        var rs = RS.filter(hit).map(function (o) { return o.r; });
        if (!ev.length && !cl.length && !rs.length) {
          out.innerHTML = state('empty', 'No matches for “' + raw + '”', 'Try a different spelling or fewer words.', '<button class="btn btn--ghost" type="button" data-clear-search>Clear search</button>');
          return;
        }
        out.innerHTML = '<p class="sr-only" aria-live="polite">' + (ev.length + cl.length + rs.length) + ' matches</p>' +
          group('events', 'Events', ev, function (x) {
            var ph = eventPhase(x, today);
            return menuRow('/app/events/' + encodeURIComponent(x.id), 'cal', x.short,
              (ph === 'past' ? 'Completed' : ph === 'now' ? 'Today' : 'Upcoming') + ' · ' + [dateRangeLabel(x.dates, true), x.clubLabel].filter(Boolean).join(' · '));
          }) +
          group('clubs', 'Clubs', cl, function (c) { return menuRow('/app/more/clubs/' + encodeURIComponent(c.id || slugify(c.name)), 'pin', c.name, c.city); }) +
          group('results', 'Results', rs, function (r) { return menuRow('/app/results/' + encodeURIComponent(r.id), 'trophy', shortTitle(r.t.title), r.t.meta || ''); });
      }
      var tmr;
      input.addEventListener('input', function () { expand = ''; clearTimeout(tmr); tmr = setTimeout(apply, 120); });
      view.querySelector('form').addEventListener('submit', function (ev) { ev.preventDefault(); apply(); input.blur(); });
      view.addEventListener('click', function (ev) {
        var x = ev.target.closest('[data-expand]'); if (x) { expand = x.getAttribute('data-expand'); apply(); }
        if (ev.target.closest('[data-clear-search]')) { input.value = ''; apply(); input.focus(); }
        if (ev.target.closest('[data-close-search]')) { try { sessionStorage.setItem('swd:refocusSearch', '1'); } catch (e) {} }
      });
      apply();
    });
  }

  function storyDialog(st) {
    openDialog(st.headline, (st.summary ? '<p>' + esc(st.summary) + '</p>' : '') +
      '<ul class="champs">' + (st.champions || []).map(function (c) {
        return '<li>' + (safeUrl(c.photo) ? '<img src="' + esc(c.photo) + '" alt="' + esc(c.alt || c.names) + '" loading="lazy">' : '') +
          '<span><span class="eyebrow">' + esc(c.title) + '</span><b>' + esc(c.names) + '</b></span></li>';
      }).join('') + '</ul>' +
      (st.note ? '<p class="muted">' + esc(st.note) + '</p>' : '') +
      (st.source && safeUrl(st.source.url) ? '<a class="btn btn--ghost btn--block" href="' + esc(st.source.url) + '" target="_blank" rel="noopener">' + icon('ext') + esc(st.source.label || 'Read more') + '</a>' : ''));
  }

  // Turn a website link into the matching app screen where there is one.
  function appLink(u) {
    u = safeUrl(u);
    if (!u) return null;
    var path = u.replace(/^https?:\/\/(www\.swlawnbowls\.org|swlawnbowls-website\.vercel\.app|swd-google-calendar\.vercel\.app|hub\.swlawnbowls\.org)/i, '');
    var m;
    if ((m = /^\/event(?:\.html)?\?id=([^&#]+)/.exec(path))) return { href: '/app/events/' + m[1], label: 'View the event' };
    if (/^\/(results|2026-tournament-results|results_new)\b/.test(path)) return { href: '/app/results', label: 'See the results' };
    if (/^\/(2026-tournaments-events|tournaments-2026)\b/.test(path)) return { href: '/app/events', label: 'See the events' };
    if (path.charAt(0) === '/') return { href: path, label: /\.pdf$/i.test(path) ? 'Open the PDF' : 'Open on the website', ext: true };
    return { href: u, label: 'Open link', ext: true };
  }

  /* ---------------------------------------------------------------
     EVENTS — list
     --------------------------------------------------------------- */
  function eventsList(params) {
    setTitle('Events');
    var today = todayISO();
    return Promise.all([loadEvents(), loadResults().catch(function () { return []; })]).then(function (all) {
      var events = all[0];
      var hasPast = events.some(function (x) { return eventPhase(x, today) === 'past'; });
      var show = params.get('show') || 'upcoming';
      if (show === 'past' && !hasPast) show = 'upcoming';
      var months = {}, clubs = {};
      events.forEach(function (x) {
        if (x.dates) months[x.dates.start.slice(0, 7)] = fmt(x.dates.start, { month: 'long', year: 'numeric' });
        if (x.clubId && !clubs[x.clubId]) clubs[x.clubId] = x.clubLabel;
      });
      var f = { q: params.get('q') || '', month: params.get('month') || '', cat: params.get('cat') || '', club: clubKey(params.get('club') || '') };
      function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>'; }
      var segs = [['upcoming', 'Upcoming'], ['calendar', 'Calendar'], ['saved', 'Saved']].concat(hasPast ? [['past', 'Completed']] : []);
      var calMonth = (f.month || today.slice(0, 7)), calDay = '';
      var nSet = f.club ? 1 : 0;
      view.innerHTML = pageHead('Events', '') +
        '<label class="search">' + icon('search') + '<span class="sr-only">Search events or clubs</span>' +
        '<input type="search" id="q" placeholder="Search events" value="' + esc(f.q) + '" autocomplete="off" enterkeyhint="search"></label>' +
        '<div class="segmented" role="group" aria-label="Which events">' + segs.map(function (k) {
          return '<button type="button" data-show="' + k[0] + '" aria-pressed="' + (k[0] === show) + '">' + k[1] + '</button>';
        }).join('') + '</div>' +
        '<div class="chips" role="group" aria-label="Filter by category">' + [['', 'All']].concat(CATS.map(function (c) { return [c, c]; })).map(function (c) {
          return '<button type="button" class="chip" data-ecat="' + esc(c[0]) + '" aria-pressed="' + (c[0] === f.cat) + '">' + esc(c[1]) + '</button>'; }).join('') + '</div>' +
        '<div class="monthbar tint tint--blue">' + icon('cal') +
        '<label class="monthbar__month"><span class="sr-only">Month</span><select id="f-month">' + opt('', 'Any month', f.month) +
        Object.keys(months).sort().map(function (k) { return opt(k, months[k], f.month); }).join('') + '</select></label>' +
        '<button class="monthbar__filters" type="button" data-filters aria-expanded="' + (nSet > 0) + '" aria-controls="filters-panel">Filters<span class="monthbar__n" id="f-n">' + (nSet ? ' (' + nSet + ')' : '') + '</span></button></div>' +
        '<div class="filters" id="filters-panel"' + (nSet ? '' : ' hidden') + '>' +
        '<input type="hidden" id="f-cat" value="' + esc(f.cat) + '">' +
        '<label><span class="sr-only">Club</span><select id="f-club">' + opt('', 'All clubs', f.club) + opt('followed', 'Followed clubs', f.club) +
        Object.keys(clubs).sort(function (a, b) { return clubs[a] < clubs[b] ? -1 : 1; }).map(function (k) { return opt(k, clubs[k], f.club); }).join('') + '</select></label>' +
        '</div><div id="ev-results"></div>';

      function apply() {
        var qRaw = document.getElementById('q').value.trim(), q = qRaw.toLowerCase();
        var month = document.getElementById('f-month').value;
        var cat = document.getElementById('f-cat').value;
        var club = document.getElementById('f-club').value;
        ['f-month', 'f-club'].forEach(function (id) { var el = document.getElementById(id); el.classList.toggle('is-set', !!el.value); });
        view.querySelectorAll('[data-ecat]').forEach(function (c) { c.setAttribute('aria-pressed', c.getAttribute('data-ecat') === cat); });
        var nF = club ? 1 : 0;
        document.getElementById('f-n').textContent = nF ? ' (' + nF + ')' : '';
        var sv = saved();
        var list = events.filter(function (x) {
          var p = eventPhase(x, today);
          if (show === 'upcoming' && !(p === 'upcoming' || p === 'now')) return false;
          if (show === 'past' && p !== 'past') return false;
          if (show === 'saved' && sv.indexOf(x.id) < 0) return false;
          if (month && show !== 'calendar' && !(x.dates && x.dates.start.slice(0, 7) === month)) return false;
          if (cat && x.cat !== cat) return false;
          if (club === 'followed') { var fol = followed(); if (!x.clubIds.some(function (c) { return fol.indexOf(c) >= 0; })) return false; }
          else if (club && x.clubId !== club) return false;
          if (q && (x.e.title + ' ' + (x.e.subtitle || '') + ' ' + x.club + ' ' + x.clubLabel + ' ' + (x.e.format || '') + ' ' + (x.e.club && x.e.club.address || '')).toLowerCase().indexOf(q) < 0) return false;
          return true;
        });
        if (show === 'past') list = list.slice().reverse();
        var filtered = q || month || cat || club;
        var out = document.getElementById('ev-results');
        var mb = view.querySelector('.monthbar__month'); if (mb) mb.hidden = show === 'calendar';
        if (show === 'calendar') {
          out.innerHTML = calendarHtml(list, calMonth, calDay, today);
          var cu = new URLSearchParams(); cu.set('show', 'calendar');
          if (q) cu.set('q', qRaw); if (cat) cu.set('cat', cat); if (club) cu.set('club', club);
          history.replaceState(history.state, '', '/app/events?' + cu.toString());
          return;
        }
        if (!list.length) {
          var onlyFollowed = club === 'followed' && !q && !month && !cat;
          out.innerHTML = club === 'followed' && !followed().length
            ? state('empty', 'You’re not following any clubs yet', 'Follow a club to see its events here first.', '<a class="btn" href="/app/more/clubs">Find a club</a> <button class="btn btn--ghost" type="button" data-all-clubs>Browse all events</button>')
            : onlyFollowed
            ? state('empty', show === 'past' ? 'No completed events from your followed clubs' : show === 'saved' ? 'No saved events from your followed clubs' : 'No upcoming events from your followed clubs', '', '<button class="btn" type="button" data-all-clubs>Browse all events</button>')
            : show === 'saved' && !filtered
            ? state('empty', 'No saved events yet', 'Tap the bookmark on any event to keep it here. Saving doesn’t enter you in the event.')
            : state('empty', 'No events match', filtered ? 'Try a different search or clear the filters.' : '',
                filtered ? '<button class="btn btn--ghost" type="button" data-clear>Clear filters</button>' : '');
        } else {
          var head = '<p class="count" aria-live="polite">' + list.length + (show === 'saved' ? ' saved event' : ' event') + (list.length === 1 ? '' : 's') +
            (filtered ? ' <button class="clear" type="button" data-clear>Clear filters</button>' : '') + '</p>';
          if (show === 'saved') {
            // Upcoming saves first; played ones stay available under Past
            var up = list.filter(function (x) { return eventPhase(x, today) !== 'past'; });
            var past = list.filter(function (x) { return eventPhase(x, today) === 'past'; }).reverse();
            out.innerHTML = head +
              (up.length ? '<ul class="list list--cards">' + up.map(function (x) { return eventRow(x, today); }).join('') + '</ul>'
                : '<p class="muted" style="margin:12px 0">No upcoming saved events.</p>') +
              (past.length ? '<h2 class="group-title" id="h-past">Past</h2><ul class="list list--cards" aria-labelledby="h-past">' + past.map(function (x) { return eventRow(x, today); }).join('') + '</ul>' : '');
          } else {
            out.innerHTML = head +
              '<ul class="list list--cards">' + list.map(function (x) { return eventRow(x, today); }).join('') + '</ul>';
          }
        }
        var u = new URLSearchParams();
        if (show !== 'upcoming') u.set('show', show);
        if (q) u.set('q', qRaw);
        if (month) u.set('month', month); if (cat) u.set('cat', cat); if (club) u.set('club', club);
        var qs = u.toString();
        history.replaceState(history.state, '', '/app/events' + (qs ? '?' + qs : ''));
      }
      var t;
      document.getElementById('q').addEventListener('input', function () { clearTimeout(t); t = setTimeout(apply, 150); });
      ['f-month', 'f-club'].forEach(function (id) { document.getElementById(id).addEventListener('change', apply); });
      view.addEventListener('click', function (ev) {
        var ec = ev.target.closest('[data-ecat]');
        if (ec) { document.getElementById('f-cat').value = ec.getAttribute('data-ecat'); apply(); return; }
        var cn = ev.target.closest('[data-cal-nav]');
        if (cn) { var dirN = cn.getAttribute('data-cal-nav'); calMonth = addMonths(calMonth, +dirN); calDay = ''; apply(); var nb = view.querySelector('[data-cal-nav="' + dirN + '"]'); if (nb) nb.focus({ preventScroll: true }); return; }
        var cd = ev.target.closest('[data-cal-day]');
        if (cd) { calDay = cd.getAttribute('data-cal-day'); apply(); var dl = document.getElementById('cal-day-list'); if (dl) dl.focus({ preventScroll: true }); return; }
        var b = ev.target.closest('[data-show]');
        if (b) {
          show = b.getAttribute('data-show');
          view.querySelectorAll('[data-show]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
          apply();
        }
        if (ev.target.closest('[data-clear]')) {
          document.getElementById('q').value = '';
          ['f-month', 'f-cat', 'f-club'].forEach(function (id) { document.getElementById(id).value = ''; });
          apply();
        }
      });
      // Unsaving on the Saved list takes the row away
      view.addEventListener('saved-change', function () { if (show === 'saved') apply(); });
      view.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-all-clubs]')) { document.getElementById('f-club').value = ''; apply(); }
        var fb = ev.target.closest('[data-filters]');
        if (fb) {
          var panel = document.getElementById('filters-panel'), open = panel.hidden;
          panel.hidden = !open; fb.setAttribute('aria-expanded', open);
          if (open) document.getElementById('f-club').focus();
        }
      });
      apply();
    });
  }

  /* ---------------------------------------------------------------
     EVENTS — detail
     --------------------------------------------------------------- */
  function eventDetail(params, id) {
    setTitle('Event');
    var today = todayISO();
    return Promise.all([loadEvents(), loadResults().catch(function () { return []; }), getJSON('/clubs-data.json').catch(function () { return {}; })]).then(function (all) {
      var x = all[0].filter(function (y) { return y.id === id; })[0];
      if (!x) {
        view.innerHTML = backLink('/app/events', 'Events') + state('empty', 'We couldn’t find that event', 'It may have been renamed or removed.',
          '<a class="btn" href="/app/events">See all events</a>');
        return;
      }
      var e = x.e, phase = eventPhase(x, today), st = entryStatus(x, today);
      var result = all[1].filter(function (r) { return r.eventIds.indexOf(id) >= 0; })[0];
      setTitle(x.short);

      var flyer = safeUrl(e.flyer && (e.flyer.localPath || e.flyer.externalUrl));
      var cops = safeUrl(e.cops && (e.cops.localPath || e.cops.externalUrl));
      var hasEntries = e.entries && safeUrl(e.entries.pubUrl);
      var ls = e.liveScoring || {};
      var hasDraw = safeUrl(ls.pubUrl) || (ls.sheets && ls.sheets.length) || ls.gated;
      var tabs = [['overview', 'Overview']];
      if (phase !== 'past') tabs.push(['entry', 'Entry details']);
      if (hasEntries) tabs.push(['entries', 'Entries']);
      if (hasDraw) tabs.push(['draw', 'Draw & scores']);
      if (result) tabs.push(['results', 'Results']);
      var tab = params.get('tab');
      if (!tabs.some(function (t) { return t[0] === tab; })) tab = 'overview';

      var season = x.dates ? x.dates.start.slice(0, 4) + ' Southwest season' : '';
      // Photo header: the host club's own photo, when we have one
      var hostClub = (all[2].clubs || []).filter(function (c) { return (x.clubIds || []).indexOf(c.id) >= 0; })[0];
      var hostPhoto = hostClub && hostClub.image && /^\/photos\//.test(hostClub.image) && !hostClub.imageNeedsReview ? hostClub.image : '';
      var entryOpen = phase !== 'past' && st && st.kind !== 'closed' && st.kind !== 'cancelled';
      var primaryBar = entryOpen ? '<a class="btn btn--wide" href="?tab=entry" data-goto-tab="entry">Enter this tournament</a>'
        : phase === 'past' && result ? '<a class="btn btn--wide" href="?tab=results" data-goto-tab="results">See the results</a>'
        : phase !== 'past' && st && st.kind === 'closed' ? '<a class="btn btn--wide" href="?tab=entry" data-goto-tab="entry">Entry details</a>' : '';
      var onNow = isSaved(x.id);
      var html = backLink('/app/events', 'Events') +
        (hostPhoto ? '<div class="chero"><img class="chero__img chero__img--wide" src="' + esc(hostPhoto) + '" alt="" loading="lazy" data-hide-on-error>' + (st ? '<span class="chero__tag ' + catClass(x) + '">' + esc(st.label) + '</span>' : '') + '</div>' : '') +
        '<div class="eband ' + catClass(x) + '"><p class="eyebrow">' + esc(String(e.subtitle || '').toLowerCase().indexOf(String(x.cat || '').toLowerCase().replace(/'s$/, '')) === 0 ? e.subtitle : (x.cat || 'Open') + ' · ' + (e.subtitle || season)) + '</p>' +
        '<h1 class="detail-title">' + esc(e.title) + '</h1>' +
        (x.club ? '<p>' + esc(x.club) + '</p>' : '') + '</div>' +
        '<div class="detail-date">' + dateBlock(x, true) + '<div><b>' + esc(e.date || 'Date to be announced') + '</b>' + statusLine(st) + '</div></div>';
      if (e.alert) html += '<div class="note" role="note"><b>' + esc(e.alertLabel || 'Update') + '</b>' + esc(e.alert) + '</div>';

      html += '<div class="segmented segmented--cat ' + catClass(x) + '" role="tablist" aria-label="Event sections">' + tabs.map(function (t) {
        return '<button type="button" role="tab" id="tab-' + t[0] + '" aria-controls="panel" aria-selected="' + (t[0] === tab) + '" tabindex="' + (t[0] === tab ? 0 : -1) + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div><div id="panel" role="tabpanel" tabindex="-1"></div>' +
        '<div class="actionbar">' + primaryBar + '<button class="btn btn--ghost' + (primaryBar ? '' : ' btn--wide') + '" type="button" data-save="' + esc(x.id) + '" data-title="' + esc(x.short) + '" data-on="' + onNow + '" aria-label="' + esc(saveLabel(onNow, x.short)) + '">' + icon('bookmark') +
        '<span aria-hidden="true">' + (onNow ? 'Saved' : 'Save') + '</span></button></div>';
      view.innerHTML = html;
      view.querySelectorAll('img[data-hide-on-error]').forEach(function (img) { img.addEventListener('error', function () { img.parentNode.hidden = true; }); });

      function show(name, focusPanel) {
        tab = name;
        view.querySelectorAll('[role="tab"]').forEach(function (b) {
          var on = b.getAttribute('data-tab') === name;
          b.setAttribute('aria-selected', on); b.setAttribute('tabindex', on ? 0 : -1);
        });
        var panel = document.getElementById('panel');
        panel.setAttribute('aria-labelledby', 'tab-' + name);
        panel.innerHTML = name === 'entry' ? entryPanel(x, flyer, cops)
          : name === 'entries' ? entriesPanel(e) : name === 'draw' ? drawPanel(e)
          : name === 'results' ? resultsPanel(result) : overviewPanel(x, phase, st, flyer, cops, !!result);
        if (name === 'draw' && ls.gated) loadGated(id);
        var u = new URL(location.href);
        if (name === 'overview') u.searchParams.delete('tab'); else u.searchParams.set('tab', name);
        history.replaceState(history.state, '', u.pathname + u.search);
        if (focusPanel) {
          var tl = view.querySelector('[role="tablist"]');
          tl.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
          document.getElementById('tab-' + name).focus({ preventScroll: true });
        }
      }
      var tl = view.querySelector('[role="tablist"]');
      tl.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-tab]'); if (b) show(b.getAttribute('data-tab'));
      });
      tl.addEventListener('keydown', function (ev) {
        if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
        var bs = Array.prototype.slice.call(view.querySelectorAll('[role="tab"]'));
        var i = bs.indexOf(document.activeElement); if (i < 0) return;
        var n = bs[(i + (ev.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length];
        n.focus(); show(n.getAttribute('data-tab'));
      });
      view.addEventListener('click', function (ev) {
        var j = ev.target.closest('[data-goto-tab]');
        if (j) { ev.preventDefault(); show(j.getAttribute('data-goto-tab'), true); }
      });
      show(tab);
    });
  }

  function overviewPanel(x, phase, st, flyer, cops, hasResult) {
    var e = x.e, h = '';
    // Date, venue, format, deadline, fee and schedule first
    var facts = [];
    if (e.format) facts.push(['Format', cap(e.format), false]);
    if (x.deadline && phase !== 'past') facts.push(['Entry deadline', fmt(x.deadline, { month: 'long', day: 'numeric', year: 'numeric' }), false]);
    else if (e.deadline && phase !== 'past') facts.push(['Entry', e.deadline, true]);
    if (e.fee) facts.push(['Entry fee', e.fee, String(e.fee).length > 28]);
    if (e.time) facts.push(['Schedule', e.time, true]);
    if (e.club && e.club.address) facts.push(['Venue', e.club.address, true]);
    if (e.formatDetails) facts.push(['Format details', e.formatDetails, true]);
    if (facts.length) {
      h += '<dl class="facts">' + facts.map(function (f) {
        return '<div' + (f[2] ? ' class="wide"' : '') + '><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd></div>';
      }).join('') + '</dl>';
    }

    // Actions: one primary, the rest quiet
    var acts = [];
    if (e.club && safeUrl(e.club.mapUrl)) acts.push('<a class="btn btn--ghost" href="' + esc(e.club.mapUrl) + '" target="_blank" rel="noopener">' + icon('map') + 'Directions</a>');
    if (x.dates && phase !== 'past') acts.push('<a class="btn btn--ghost" href="' + icsHref(x) + '" download="' + esc(x.id) + '.ics" data-ics>' + icon('cal') + 'Add to calendar</a>');
    var on = isSaved(x.id);
    acts.push('<button class="btn btn--ghost" type="button" data-save="' + esc(x.id) + '" data-title="' + esc(x.short) + '" data-on="' + on + '" aria-label="' + esc(saveLabel(on, x.short)) + '">' + icon('bookmark') +
      '<span aria-hidden="true">' + (on ? 'Saved' : 'Save') + '</span></button>');
    acts.push(shareBtn(x.e.title, '/app/events/' + x.id));
    h += '<div class="actions">' + acts.join('') + '</div>';
    h += '<p class="note">Saving an event keeps it in your list. It does not register your team.</p>';

    if (e.schedule && e.schedule.length) h += '<section class="block"><h2>Schedule</h2><ul>' + e.schedule.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></section>';
    if (phase === 'past') h += docsBlock(e, flyer, cops);
    if (e.rules && e.rules.length) {
      var rl = '<ul>' + e.rules.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>';
      h += '<section class="block"><h2>Rules</h2>' + (e.rules.length > 5
        ? '<details class="fold"><summary><span>Read all ' + e.rules.length + ' rules</span>' + CHEV + '</summary><div style="padding-bottom:16px">' + rl + '</div></details>'
        : rl) + '</section>';
    }
    if (e.noviceDefinition) h += '<section class="block"><h2>Who counts as a novice</h2><p>' + esc(e.noviceDefinition) + '</p></section>';
    if (e.livestreamNotice) h += '<section class="block"><h2>Livestreaming</h2><p>' + esc(e.livestreamNotice) + '</p></section>';
    h += '<ul class="rows" style="margin-top:24px">' + linkRow('/event?id=' + encodeURIComponent(x.id), 'globe', 'This event on the website', '', { ext: true }) + '</ul>';
    return h;
  }
  function docsBlock(e, flyer, cops) {
    var docs = [];
    if (flyer) docs.push(docRow(flyer, 'Tournament flyer', e.flyer.type));
    if (cops) docs.push(docRow(cops, 'Conditions of play', 'pdf'));
    return docs.length ? '<section class="block"><h2>Flyer & conditions of play</h2><ul class="rows">' + docs.join('') + '</ul></section>' : '';
  }
  // The real entry process, as published. Email or postal entry stays
  // email or postal entry — it is never turned into an online sign-up.
  function entryPanel(x, flyer, cops) {
    var e = x.e, how = [];
    if (safeUrl(e.registrationUrl)) {
      how.push('<p>Enter online using the official form.</p><a class="btn btn--split btn--block" href="' + esc(e.registrationUrl) + '" target="_blank" rel="noopener">' + esc(e.registrationLabel || 'Register') + icon('ext') + '</a>');
    }
    if (e.registrationInstructions) how.push('<p>' + esc(e.registrationInstructions) + '</p>');
    if (e.paypal && e.paypal.system && e.paypal.system !== 'none') {
      how.push('<p>The entry fee can be paid online on the event’s page on the website.</p>' +
        '<a class="btn btn--ghost btn--block" href="/event?id=' + encodeURIComponent(x.id) + '#pay" target="_blank" rel="noopener">' + icon('ext') + 'Pay entry fee on the website</a>');
    }
    var c = e.contact || {};
    if (c.mailTo && !e.registrationInstructions) how.push('<p><b>Mail entries to:</b> ' + esc(c.mailTo) + '</p>');
    if (e.deadline) how.push('<p><b>Deadline:</b> ' + esc(String(e.deadline).replace(/^(entry\s+)?deadline:?\s*/i, '')) + '</p>');
    if (e.fee) how.push('<p><b>Entry fee:</b> ' + esc(e.fee) + '</p>');
    if (how.length <= 2 && !safeUrl(e.registrationUrl) && !e.registrationInstructions && (c.name || c.email || c.phone)) how.push('<p>Contact the tournament organizer below to enter.</p>');
    if (!how.length) how.push('<p>Entry details haven’t been published yet. Check back, or see the flyer if there is one.</p>');
    var h = '<section class="block" style="margin-top:8px"><h2>How to enter</h2>' + how.join('') + '</section>';
    h += docsBlock(e, flyer, cops);
    if (c.name || c.email || c.phone) {
      h += '<section class="block"><h2>Contact</h2><ul class="rows">' +
        (c.name ? '<li><div class="row">' + icon('people') + '<span class="row__main"><span class="row__title"><b>' + esc(c.name) + '</b></span><span class="row__meta">Tournament contact</span></span></div></li>' : '') +
        (c.phone ? linkRow(tel(c.phone), 'phone', c.phone) : '') +
        (c.email ? linkRow('mailto:' + c.email, 'mail', c.email) : '') +
        '</ul></section>';
    }
    return h;
  }
  function docRow(url, label, type) {
    var kind = type === 'image' ? 'Image' : type === 'gdoc' ? 'Google Doc' : /\.pdf$/i.test(url) ? 'PDF' : 'Document';
    return linkRow(url, 'doc', label, 'Opens in a new window', { ext: true, extText: kind });
  }
  function embedCard(title, why, url, height, kind) {
    var key = 'emb-' + Math.random().toString(36).slice(2, 8);
    return '<div class="card embed-card"><b>' + esc(title) + '</b><p>' + esc(why) + '</p>' +
      '<div class="actions"><button class="btn" type="button" data-embed="' + key + '" data-url="' + esc(url) + '" data-h="' + (parseInt(height, 10) || 650) + '" data-title="' + esc(title) + '">Show ' + esc(kind) + '</button>' +
      '<a class="btn btn--ghost" href="' + esc(url.replace(/([?&])widget=true&?/, '$1').replace(/[?&]$/, '')) + '" target="_blank" rel="noopener">' + icon('ext') + 'Open full screen</a></div>' +
      '<div id="' + key + '"></div></div>';
  }
  function entriesPanel(e) {
    return '<section class="block" style="margin-top:8px"><h2>Entries</h2>' +
      embedCard('Entry list', 'Teams entered so far, from the tournament’s Google Sheet. It’s updated by the organizer and needs a connection.', e.entries.pubUrl, e.entries.height, 'entries') +
      '</section>';
  }
  function drawPanel(e) {
    var ls = e.liveScoring || {};
    var h = '<section class="block" style="margin-top:8px"><h2>Draw & scores</h2>';
    if (ls.gated) return h + '<div id="gated">' + loading() + '</div></section>';
    if (ls.sheets && ls.sheets.length) {
      h += ls.sheets.map(function (s) { return embedCard(s.label || 'Draw & scores', 'Draw and scores from the tournament’s Google Sheet. Needs a connection.', s.url, s.height, 'draw'); }).join('');
    } else {
      h += embedCard('Draw & scores', 'Draw and scores from the tournament’s Google Sheet. Needs a connection.', ls.pubUrl, ls.height, 'draw');
    }
    return h + '</section>';
  }
  function loadGated(id) {
    fetch('/api/live-scoring?id=' + encodeURIComponent(id), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      var box = document.getElementById('gated'); if (!box) return;
      if (d && d.sheets && d.sheets.length) {
        box.innerHTML = d.sheets.map(function (s) { return embedCard(s.label || 'Draw & scores', 'Draw and scores from the tournament’s Google Sheet.', s.url, s.height, 'draw'); }).join('');
      } else {
        box.innerHTML = '<p>The draw and scores will appear here once the tournament starts.</p>';
      }
    }).catch(function () {
      var box = document.getElementById('gated');
      if (box) box.innerHTML = '<p>The draw and scores need a connection. Try again when you have a signal.</p>';
    });
  }
  function resultsPanel(r) {
    return divisionsHtml(r.t);
  }

  // .ics for "Add to calendar" — an all-day event in the user's calendar
  // app. It is a one-time copy: later venue or date changes don't follow.
  function icsHref(x) {
    var e = x.e, d = x.dates, T = Logic.icsText;
    var doc = Logic.icsDocument(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Southwest Bowls//App//EN', 'BEGIN:VEVENT',
      'UID:' + x.id + '@swlawnbowls.org',
      'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''),
      'DTSTART;VALUE=DATE:' + d.start.replace(/-/g, ''),
      'DTEND;VALUE=DATE:' + addDays(d.end, 1).replace(/-/g, ''),
      'SUMMARY:' + T(e.title),
      'LOCATION:' + T([e.club && e.club.name, e.club && e.club.address].filter(Boolean).join(', ')),
      'DESCRIPTION:' + T([e.time, e.format && cap(e.format), e.fee && 'Entry ' + e.fee, e.deadline, Logic.canonicalUrl('/app/events/' + x.id)].filter(Boolean).join('\n')),
      'URL:' + Logic.canonicalUrl('/app/events/' + x.id),
      'END:VEVENT', 'END:VCALENDAR']);
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(doc);
  }

  /* ---------------------------------------------------------------
     RESULTS
     --------------------------------------------------------------- */
  function resultsList(params) {
    setTitle('Results');
    return Promise.all([loadResults(), standingsLink()]).then(function (all) {
      var list = all[0], standLink = all[1];
      var f = { q: params.get('q') || '', cat: params.get('cat') || '', year: params.get('year') || '' };
      var years = {}; list.forEach(function (r) { if (r.year) years[r.year] = 1; });
      function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>'; }
      view.innerHTML = pageHead('Results', '') +
        '<label class="search">' + icon('search') + '<span class="sr-only">Search results or players</span>' +
        '<input type="search" id="q" placeholder="Search results or players" value="' + esc(f.q) + '" autocomplete="off" enterkeyhint="search"></label>' +
        champStrip(list) + standLink +
        '<section class="section" aria-labelledby="h-latest">' + sectionHead('h-latest', 'Recent results') +
        '<div class="chips" role="group" aria-label="Filter results">' + [['', 'All']].concat(CATS.map(function (c) { return [c, c]; })).map(function (c) {
          return '<button type="button" class="chip" data-cat="' + esc(c[0]) + '" aria-pressed="' + (c[0] === f.cat) + '">' + esc(c[1]) + '</button>';
        }).join('') + (Object.keys(years).length > 1 ? '<label class="chip chip--select"><span class="sr-only">Year</span><select id="f-year">' + opt('', 'All years', f.year) + Object.keys(years).sort().reverse().map(function (y) { return opt(y, y, f.year); }).join('') + '</select></label>' : '<input type="hidden" id="f-year" value="">') + '</div>' +
        '<input type="hidden" id="f-cat" value="' + esc(f.cat) + '">' +
        '<div id="res-list"></div></section>' +
        '<ul class="rows" style="margin-top:24px">' + linkRow('/archive', 'doc', '2022–2025 results', 'The results archive', { ext: true }) + '</ul>' +
        '';
      view.querySelectorAll('img[data-hide-on-error]').forEach(function (img) { img.addEventListener('error', function () { img.hidden = true; }); });
      function apply() {
        var qRaw = document.getElementById('q').value.trim(), q = qRaw.toLowerCase();
        var cat = document.getElementById('f-cat').value, year = document.getElementById('f-year').value;
        view.querySelectorAll('[data-cat]').forEach(function (c) { c.setAttribute('aria-pressed', c.getAttribute('data-cat') === cat); });
        var out = list.filter(function (r) {
          if (cat && r.cat !== cat) return false;
          if (year && r.year !== year) return false;
          if (q && (r.t.title + ' ' + (r.t.meta || '') + ' ' + r.names).toLowerCase().indexOf(q) < 0) return false;
          return true;
        });
        var filtered = q || cat || year;
        var cap = (filtered || showAll) ? out.length : 8, shown = out.slice(0, cap);
        document.getElementById('res-list').innerHTML = '<p class="sr-only" aria-live="polite">' + out.length + ' result' + (out.length === 1 ? '' : 's') + '</p>' + (out.length
          ? '<ul class="list list--plain">' + shown.map(resultRow).join('') + '</ul>' +
            (out.length > cap ? '<button class="btn btn--ghost btn--wide" type="button" data-showall>Show all ' + out.length + ' results</button>'
              : filtered ? '<p class="count">' + out.length + ' result' + (out.length === 1 ? '' : 's') + ' <button class="clear" type="button" data-clear>Clear filters</button></p>' : '')
          : state('empty', 'No results match', 'Try a different name or clear the filters.', '<button class="btn btn--ghost" type="button" data-clear>Clear filters</button>'));
        var u = new URLSearchParams();
        if (q) u.set('q', qRaw); if (cat) u.set('cat', cat); if (year) u.set('year', year);
        history.replaceState(history.state, '', '/app/results' + (u.toString() ? '?' + u : ''));
      }
      var t, showAll = false;
      document.getElementById('q').addEventListener('input', function () { clearTimeout(t); t = setTimeout(apply, 150); });
      var yr = document.getElementById('f-year'); if (yr) yr.addEventListener('change', apply);
      view.addEventListener('click', function (ev) {
        var ch = ev.target.closest('[data-cat]');
        if (ch) { document.getElementById('f-cat').value = ch.getAttribute('data-cat'); apply(); return; }
        if (ev.target.closest('[data-showall]')) { showAll = true; apply(); return; }
        if (ev.target.closest('[data-clear]')) {
          document.getElementById('q').value = ''; document.getElementById('f-cat').value = ''; document.getElementById('f-year').value = ''; showAll = false; apply();
        }
      });
      apply();
    });
  }
  function resultDetail(params, id) {
    setTitle('Results');
    return loadResults().then(function (list) {
      var r = list.filter(function (x) { return x.id === id; })[0];
      if (!r) { view.innerHTML = backLink('/app/results', 'Results') + state('empty', 'We couldn’t find those results', '', '<a class="btn" href="/app/results">All results</a>'); return; }
      setTitle(shortTitle(r.t.title));
      view.innerHTML = backLink('/app/results', 'Results') +
        (r.t.meta ? '<p class="eyebrow">' + esc(r.t.meta) + '</p>' : '') +
        '<h1 class="detail-title">' + esc(r.t.title) + '</h1>' +
        divisionsHtml(r.t) +
        '<div class="actions" style="margin-top:24px">' + shareBtn(r.t.title + ' — results', '/app/results/' + r.id) + '</div>' +
        (r.eventId ? '<ul class="rows" style="margin-top:16px">' + linkRow('/app/events/' + encodeURIComponent(r.eventId), 'cal', 'Event details') + '</ul>' : '');
    });
  }
  // ---- Season standings ------------------------------------------------
  // The Division keeps the points in two published Google Sheets, listed in
  // content/standings.json (the website's /standings page). The app reads
  // the same sheets, so updating the sheet updates the app. The last copy is
  // kept on the phone for when there is no signal.
  function loadStandingsSources() {
    return getJSON('/content/standings.json').then(function (page) {
      return (page.sections || []).filter(function (s) { return s.type === 'embed' && Logic.standingsCsvUrl(s.url); }).map(function (s) {
        var h = s.heading || '';
        var key = /women|ladies/i.test(h) ? 'women' : /\bmen/i.test(h) ? 'men' : slugify(h);
        return { key: key, heading: h, label: key === 'women' ? 'Women’s' : key === 'men' ? 'Men’s' : h, year: yearOf(h), csv: Logic.standingsCsvUrl(s.url) };
      });
    });
  }
  var standingsCache = {};
  function loadStandings(src) {
    if (standingsCache[src.key]) return standingsCache[src.key];
    standingsCache[src.key] = fetch(src.csv, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (text) {
      var s = Logic.standingsFromCsv(text);
      if (!s || !s.players.length) throw new Error('No standings in sheet');
      store('standings:' + src.key, { at: Date.now(), csv: text });
      return s;
    }).catch(function (e) {
      delete standingsCache[src.key];
      var saved = store('standings:' + src.key);
      var s = saved && Logic.standingsFromCsv(saved.csv);
      if (!s) throw e;
      s.savedAt = saved.at;
      return s;
    });
    return standingsCache[src.key];
  }
  function standingRow(p) {
    var rank = p.rank ? (p.tied ? 'T' : '') + p.rank : '–';
    var said = p.rank ? (p.tied ? 'Tied ' : '') + ordinal(p.rank) : 'Unranked';
    return '<li><details class="stand' + (p.rank && p.rank <= 3 ? ' stand--' + p.rank : '') + '"><summary>' +
      '<span class="stand__rank" aria-hidden="true">' + esc(rank) + '</span>' +
      '<span class="stand__name"><span class="sr-only">' + esc(said) + ': </span>' + esc(p.name) + '</span>' +
      '<span class="stand__pts"><b>' + esc(p.points) + '</b> pts</span>' + CHEV + '</summary>' +
      (p.events.length
        ? '<ul class="stand__events">' + p.events.map(function (e) { return '<li><span>' + esc(e.event) + '</span><b>' + esc(e.points) + '</b></li>'; }).join('') + '</ul>'
        : '<p class="stand__none">No points yet this season.</p>') +
      '</details></li>';
  }
  function standings(params) {
    setTitle('Standings');
    return loadStandingsSources().then(function (srcs) {
      if (!srcs.length) { view.innerHTML = backLink('/app/results', 'Results') + state('empty', 'No standings published yet', ''); return; }
      var cur = srcs.filter(function (s) { return s.key === params.get('list'); })[0] || srcs[0];
      var year = srcs[0].year;
      view.innerHTML = backLink('/app/results', 'Results') +
        pageHead((year ? year + ' ' : '') + 'Standings', 'Season points') +
        '<div class="segmented" role="tablist" aria-label="Which standings">' + srcs.map(function (s) {
          var on = s.key === cur.key;
          return '<button type="button" class="' + (s.key === 'women' ? 'cat--w' : s.key === 'men' ? 'cat--m' : '') + '" role="tab" id="tab-' + esc(s.key) + '" aria-controls="panel" aria-selected="' + on + '" tabindex="' + (on ? 0 : -1) + '" data-list="' + esc(s.key) + '">' + esc(s.label) + '</button>';
        }).join('') + '</div>' +
        '<label class="search">' + icon('search') + '<span class="sr-only">Find a player</span>' +
        '<input type="search" id="q" placeholder="Find a player" value="' + esc(params.get('q') || '') + '" autocomplete="off" enterkeyhint="search"></label>' +
        '<div id="panel" role="tabpanel" tabindex="-1"></div>' +
        '<ul class="rows" style="margin-top:24px">' + linkRow('/standings', 'doc', 'Standings on the website', 'The full sheet with every column', { ext: true }) + '</ul>' +
        '<p class="footnote">Tap a name to see points by event. Points are kept by the Division and update here when the sheet changes.</p>';
      var data = null, token = 0;
      function draw() {
        var panel = document.getElementById('panel');
        panel.setAttribute('aria-labelledby', 'tab-' + cur.key);
        if (!data) return;
        var qRaw = document.getElementById('q').value.trim(), q = fold(qRaw);
        var list = q ? data.players.filter(function (p) { return fold(p.name).indexOf(q) >= 0; }) : data.players;
        panel.innerHTML = (data.savedAt ? '<p class="note" role="note"><b>Saved copy</b>Showing the standings as of ' + esc(new Date(data.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) + '. Connect to see the latest.</p>' : '') +
          (list.length
            ? '<p class="count" aria-live="polite">' + list.length + ' player' + (list.length === 1 ? '' : 's') + (q ? ' <button class="clear" type="button" data-clear>Clear</button>' : '') + '</p>' +
              '<ol class="stands" aria-label="' + esc(cur.heading) + '">' + list.map(standingRow).join('') + '</ol>'
            : state('empty', 'No player by that name', 'Check the spelling or clear the search.', '<button class="btn btn--ghost" type="button" data-clear>Clear search</button>'));
        var u = new URLSearchParams();
        if (cur.key !== srcs[0].key) u.set('list', cur.key);
        if (qRaw) u.set('q', qRaw);
        history.replaceState(history.state, '', '/app/standings' + (u.toString() ? '?' + u : ''));
      }
      function show(src) {
        cur = src; data = null;
        view.querySelectorAll('[role="tab"]').forEach(function (b) {
          var on = b.getAttribute('data-list') === src.key;
          b.setAttribute('aria-selected', on); b.setAttribute('tabindex', on ? 0 : -1);
        });
        var mine = ++token;
        document.getElementById('panel').innerHTML = loading();
        draw();
        return loadStandings(src).then(function (s) { if (mine === token) { data = s; draw(); } }, function () {
          if (mine === token) document.getElementById('panel').innerHTML = errorState();
        });
      }
      var t;
      document.getElementById('q').addEventListener('input', function () { clearTimeout(t); t = setTimeout(draw, 120); });
      view.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-list]');
        if (b) { show(srcs.filter(function (s) { return s.key === b.getAttribute('data-list'); })[0]); return; }
        if (ev.target.closest('[data-clear]')) { document.getElementById('q').value = ''; draw(); return; }
        if (ev.target.closest('[data-retry]')) { ev.stopPropagation(); show(cur); }
      });
      view.querySelector('[role="tablist"]').addEventListener('keydown', function (ev) {
        if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
        var i = srcs.indexOf(cur), n = srcs[(i + (ev.key === 'ArrowRight' ? 1 : srcs.length - 1)) % srcs.length];
        show(n); view.querySelector('[data-list="' + n.key + '"]').focus();
      });
      return show(cur);
    });
  }
  // A compact way in from Results
  function standingsLink() {
    return loadStandingsSources().then(function (srcs) {
      if (!srcs.length) return '';
      var y = srcs[0].year;
      return '<a class="standlink" href="/app/standings">' + icon('medal') +
        '<span class="standlink__body"><span class="standlink__title">' + esc((y ? y + ' ' : '') + 'Standings') + '</span>' +
        '<span class="standlink__meta">' + esc(srcs.map(function (s) { return s.label; }).join(' & ')) + ' season points</span></span>' + CHEV + '</a>';
    }).catch(function () { return ''; });
  }

  var ORD = ['', '1st', '2nd', '3rd'];
  function ordinal(n) { n = +n; if (ORD[n]) return ORD[n]; var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function placeItem(p, winnerLabel) {
    var rank = +p.rank || 0;
    var label = p.rankLabel || (rank ? ordinal(rank) + ' place' : '');
    return '<li class="place' + (rank && rank <= 3 ? ' place--' + rank : '') + '">' +
      '<span class="place__rank" aria-hidden="true">' + esc(rank ? ordinal(rank) : '–') + '</span>' +
      '<span class="place__names"><span class="sr-only">' + esc(label) + ': </span>' + esc(p.names || '') +
      (rank === 1 ? '<span class="place__label">' + esc(winnerLabel) + '</span>' : p.rankLabel && !/place$/i.test(p.rankLabel) ? '<span class="place__label">' + esc(p.rankLabel) + '</span>' : '') + '</span>' +
      (safeUrl(p.photo) ? '<img class="place__photo" src="' + esc(p.photo) + '" alt="' + esc(p.names || '') + '" loading="lazy">' : '') +
      '</li>';
  }
  function byRank(list) { return list.slice().sort(function (a, b) { return (+a.rank || 99) - (+b.rank || 99); }); }
  // Verified winners first; the complete published standings underneath.
  function divisionsHtml(t) {
    var divs = t.divisions || [];
    // One division: its winners are the event's champions. Several (venues,
    // greens, genders): each has its own winners, labelled as such.
    var winnerLabel = divs.length > 1 ? 'Division winners' : 'Champions';
    return divs.map(function (dv) {
      var groups = divisionPlaces(dv);
      if (!groups.length) return '';
      var first = byRank(groups[0].places);
      var podium = first.filter(function (p) { return +p.rank >= 1 && +p.rank <= 3; });
      if (!podium.length) podium = first.slice(0, 3);
      var total = groups.reduce(function (n, g) { return n + g.places.length; }, 0);
      var item = function (p) { return placeItem(p, winnerLabel); };
      var html = '<section class="division"><h2 class="division__title">' + esc(dv.label || 'Results') + '</h2>' +
        (dv.venue ? '<p class="division__venue">' + esc(dv.venue) + '</p>' : '') +
        (groups.length > 1 && groups[0].label ? '<h3 class="flight">' + esc(groups[0].label) + '</h3>' : '') +
        '<ol class="places" aria-label="' + esc(dv.label || '') + ' top places">' + podium.map(item).join('') + '</ol>';
      if (total > podium.length) {
        html += '<details class="fold"><summary><span>Complete standings</span><span class="row__meta">' + total + ' places' +
          (groups.length > 1 ? ' · ' + groups.length + ' flights' : '') + '</span>' + CHEV + '</summary>' +
          groups.map(function (g) {
            return (g.label ? '<h3 class="flight">' + esc(g.label) + '</h3>' : '') +
              '<ol class="places" aria-label="' + esc((dv.label || '') + ' ' + (g.label || '')) + ' standings">' + byRank(g.places).map(item).join('') + '</ol>';
          }).join('') + '</details>';
      }
      if (dv.eventUrl) html += '<ul class="rows">' + linkRow(dv.eventUrl, '', 'Full breakdown on the website', '', { ext: true }) + '</ul>';
      return html + '</section>';
    }).join('') || state('empty', 'Results coming soon', 'They’ll appear here as soon as they’re published.');
  }

  /* ---------------------------------------------------------------
     WATCH
     --------------------------------------------------------------- */
  function ytData() {
    var c = null;
    try { c = JSON.parse(sessionStorage.getItem('swd:yt')); } catch (e) {}
    if (c && Date.now() - c.t < 5 * 60 * 1000) return Promise.resolve(c.d);
    var base = 'https://www.googleapis.com/youtube/v3/';
    return fetch(base + 'playlistItems?part=contentDetails&maxResults=12&playlistId=' + YT_UPLOADS + '&key=' + YT_KEY)
      .then(function (r) { if (!r.ok) throw new Error('yt'); return r.json(); })
      .then(function (d) {
        var ids = (d.items || []).map(function (i) { return i.contentDetails.videoId; }).join(',');
        if (!ids) return [];
        return fetch(base + 'videos?part=snippet,liveStreamingDetails&id=' + ids + '&key=' + YT_KEY)
          .then(function (r) { if (!r.ok) throw new Error('yt'); return r.json(); })
          .then(function (v) {
            var out = (v.items || []).map(function (it) {
              var s = it.snippet || {}, l = it.liveStreamingDetails || {}, th = s.thumbnails || {};
              return {
                id: it.id, title: s.title, state: s.liveBroadcastContent,   // 'live' | 'upcoming' | 'none'
                when: l.actualStartTime || l.scheduledStartTime || s.publishedAt,
                scheduled: l.scheduledStartTime, wasLive: !!l.actualStartTime,
                thumb: (th.high || th.medium || th.default || {}).url || ''
              };
            });
            try { sessionStorage.setItem('swd:yt', JSON.stringify({ t: Date.now(), d: out })); } catch (e) {}
            return out;
          });
      });
  }
  function fmtTime(isoStr, withTime) {
    var o = { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' };
    if (withTime) { o.hour = 'numeric'; o.minute = '2-digit'; }
    return new Intl.DateTimeFormat('en-US', o).format(new Date(isoStr));
  }
  // Video players load only when someone taps play
  function poster(v, tagHtml, meta) {
    var still = 'https://i.ytimg.com/vi/' + encodeURIComponent(v.id) + '/hqdefault.jpg';
    return '<div class="video"><div><button class="poster" type="button" data-play="' + esc(v.id) + '" data-title="' + esc(v.title) + '" aria-label="Play: ' + esc(v.title) + '">' +
      '<img class="poster__img" src="' + esc(safeUrl(v.thumb) || still) + '" data-still="' + esc(still) + '" alt="" loading="lazy" decoding="async">' +
      (tagHtml || '') + '<span class="poster__play" aria-hidden="true">' + playSvg() + '</span></button></div>' +
      '<p class="video-title">' + esc(v.title) + '</p>' + (meta ? '<p class="video-meta">' + esc(meta) + '</p>' : '') + '</div>';
  }
  // Watch: one charcoal feature, then replays and what's coming. States
  // are said in words: Live (only when YouTube says so), Scheduled,
  // Replay, or Unavailable. Scheduled coverage never gets a play button.
  function watch() {
    setTitle('Watch');
    var today = todayISO();
    view.innerHTML = backLink('/app/more', 'More') + pageHead('Southwest TV', 'Livestreams and replays') +
      '<div id="w-feature">' + loading() + '</div><div id="w-again"></div><div id="w-next"></div><p class="footnote" id="w-status"></p>' +
      '<section class="section" aria-labelledby="h-more-tv"><h2 class="section__title" id="h-more-tv">More from SW TV</h2><ul class="rows rows--menu">' +
      menuRow(YT_CHANNEL_URL, 'tv', 'SW TV on YouTube', 'Subscribe to hear when we go live') +
      menuRow('https://www.youtube.com/playlist?list=PLHSDPOGEH8batQ10BOOCBnrK-msAl-FUO', 'info', 'HOW! Lessons', 'Learn to read the head and more') +
      '</ul></section>';
    return Promise.all([
      getJSON('/streams-data.json').catch(function () { return { streams: [] }; }),
      ytData().catch(function () { return null; })
    ]).then(function (all) {
      var plan = (all[0].streams || []).filter(function (s) { return s.date >= today; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      var vids = all[1];
      var live = vids ? vids.filter(function (v) { return v.state === 'live'; }) : [];
      var ytSoon = vids ? vids.filter(function (v) { return v.state === 'upcoming'; }) : [];
      var recent = vids ? vids.filter(function (v) { return v.state === 'none'; }).slice(0, 4) : [];
      var when = function (s) { return (s.date === today ? 'Today' : fmt(s.date, { month: 'short', day: 'numeric' })) + (s.venue ? ' · ' + s.venue : ''); };

      // Feature
      var feat;
      if (live.length) {
        var v = live[0];
        feat = '<article class="media"><div class="media__frame">' + poster(v, '<span class="live-tag">LIVE</span>') + '</div>' +
          '<p class="media__kicker">Live now on SW TV</p><h2 class="media__title">' + esc(v.title) + '</h2></article>';
      } else if (plan.length) {
        var n = plan[0];
        feat = '<article class="media media--compact"><span class="art-plate art-plate--round media__logo"><img src="/photos/home/livestream-tv-logo.png" alt="Livestream Southwest Bowls TV" width="400" height="380" decoding="async"></span>' +
          '<div class="media__body"><p class="media__kicker"><span class="tag tag--upcoming">Upcoming</span> Next coverage</p><h2 class="media__title">' + esc(n.title) + '</h2>' +
          '<p class="media__meta">' + esc(when(n)) + ' · not live yet</p>' +
          '<a class="textlink textlink--onink" href="' + esc(safeUrl(n.link) || YT_CHANNEL_URL) + '" target="_blank" rel="noopener">Open SW TV on YouTube' + icon('ext', 'i--sm') + '</a></div></article>';
      } else {
        feat = '<article class="media"><p class="media__kicker">Southwest TV</p><h2 class="media__title">No coverage scheduled right now.</h2>' +
          '<p class="media__meta">New dates appear here when they’re planned.</p></article>';
      }
      document.getElementById('w-feature').innerHTML = feat;

      // Watch again
      document.getElementById('w-again').innerHTML = '<section class="section" aria-labelledby="h-again">' +
        '<div class="section__head"><h2 class="section__title" id="h-again">Watch again</h2><a class="section__more" href="' + YT_CHANNEL_URL + '" target="_blank" rel="noopener">Replays' + icon('ext', 'i--sm') + '</a></div>' +
        (recent.length
          ? '<div class="videos">' + recent.map(function (x) { return poster(x, x.wasLive ? '<span class="tag">Replay</span>' : '', fmtTime(x.when)); }).join('') + '</div>'
          : '<ul class="rows rows--menu">' + menuRow(YT_CHANNEL_URL, 'tv', 'Southwest replays', vids ? 'Browse the video library' : 'Videos didn’t load here — browse them on YouTube') + '</ul>') +
        '</section>';

      // Coming next: the rest of the schedule, plus anything YouTube has scheduled
      var rest = (live.length ? plan : plan.slice(1)).slice(0, 4);
      var rows = rest.map(function (s) {
        return '<li class="evrow"><span class="art-plate art-plate--round art-plate--row"><img src="/photos/home/livestream-tv-logo.png" alt="" width="400" height="380" loading="lazy" decoding="async"></span>' +
          '<span class="evrow__main"><span class="evrow__title">' + esc(s.title) + '</span>' +
          '<span class="evrow__meta">' + esc(fmt(s.date, { weekday: 'short', month: 'short', day: 'numeric' })) + (s.venue ? ' · ' + esc(s.venue) : '') + '</span>' +
          '<span class="status"><span class="tag tag--upcoming">Upcoming</span> Scheduled coverage</span></span></li>';
      }).concat(ytSoon.map(function (y) {
        return '<li>' + menuRow('https://www.youtube.com/watch?v=' + encodeURIComponent(y.id), 'clock', y.title, 'Scheduled on YouTube' + (y.scheduled ? ' · ' + fmtTime(y.scheduled, true) : '')).replace(/^<li>|<\/li>$/g, '') + '</li>';
      }));
      document.getElementById('w-next').innerHTML = rows.length ? '<section class="section" aria-labelledby="h-coming"><h2 class="section__title" id="h-coming">Coming next</h2>' +
        '<ul class="list list--cards">' + rows.join('') + '</ul></section>' : '';

      document.getElementById('w-status').textContent = !vids ? 'Live status unavailable right now — check SW TV on YouTube.'
        : live.length ? '' : 'No live broadcast right now.';
    });
  }

  /* ---------------------------------------------------------------
     MORE — a short grouped menu; the website's longer menu lives in
     subsections. Website addresses and years come from nav-data.json,
     so a new season's links follow the website menu automatically.
     --------------------------------------------------------------- */
  // A menu row: icon, label, chevron. Website destinations open in a new
  // window and say so; everything else is an in-app screen.
  function menuRow(href, iconName, label, meta) {
    var web = /^https?:/i.test(href) || (href.charAt(0) === '/' && !/^\/app\b/.test(href));   // tel: and mailto: open the phone's own apps
    return '<li><a class="row" href="' + esc(href) + '"' + (web ? ' target="_blank" rel="noopener"' : '') + '>' +
      icon(iconName || 'chev') + '<span class="row__main"><span class="row__title">' + esc(label) + '</span>' +
      (meta ? '<span class="row__meta">' + esc(meta) + '</span>' : '') + '</span>' +
      (web ? extLabel(isExternal(href) ? 'External' : 'Website') : CHEV) + '</a></li>';
  }
  function menuGroup(id, title, rows) {
    return '<section class="menu" aria-labelledby="' + id + '"><h2 class="menu__head" id="' + id + '">' + esc(title) + '</h2><ul class="rows rows--menu">' + rows + '</ul></section>';
  }
  // Find a website menu entry by its address (top level or inside a group)
  function navFind(nav, test) {
    var hit = null;
    (nav.items || []).forEach(function (it) {
      if (!hit && it.href && test(it.href)) hit = it;
      (it.children || []).forEach(function (c) { if (!hit && c.href && test(c.href)) hit = c; });
    });
    return hit;
  }
  function yearOf(label) { var m = /\b(20\d{2})\b/.exec(label || ''); return m ? m[1] : ''; }

  // Each subsection: path, heading, icon, and its rows built from nav-data
  var SUBSECTIONS = {
    play: { title: 'Learn bowls', icon: 'flag', rows: function () {
      return [['/app/page/learnmore', 'Learn to bowl'], ['/app/page/coachinghub', 'Coaching'], ['/app/page/umpires', 'Umpires'], ['/app/page/markers', 'Markers']];
    } },
    division: { title: 'Division information', icon: 'info', rows: function (nav) {
      var st = navFind(nav, function (h) { return h === '/standings'; });
      var ag = navFind(nav, function (h) { return /^\/20\d{2}-season-agenda$/.test(h); });
      var y = yearOf(st && st.label);
      return [['/app/page/about-us', 'About Southwest'],
        ['/app/standings', (y ? y + ' standings' : 'Standings')],
        ['/us-nationals-teams', 'U.S. Nationals teams'],
        ['/app/page/bowlsdevelopmnetfund', 'Bowls Development Fund'],
        ['/policies-and-procedures', 'Policies & procedures'],
        ['/delegate-information', 'Delegate information']]
        .concat(ag ? [[ag.href, 'Season agenda' + (yearOf(ag.label) ? ' ' + yearOf(ag.label) : '')]] : []);
    } },
    'ladies-day': { title: 'Ladies Day', icon: 'people', rows: function () {
      return [['/app/page/ladies-day-sign-up', 'Sign up'], ['/app/page/ladies-day-results', 'Results'], ['/app/page/ie-ladies-day', 'Inland Empire']];
    } },
    archives: { title: 'Archives', icon: 'archive', rows: function (nav) {
      // Every year the website menu lists, newest first
      var rows = [], seen = {};
      (nav.items || []).forEach(function (it) {
        (it.children || [it]).forEach(function (c) {
          if (!c.href || !/^\/archive\b/.test(c.href) || seen[c.href]) return;
          seen[c.href] = 1;
          var y = /year=(\d{4})/.exec(c.href);
          rows.push([c.href, y ? y[1] + ' results' : 'Results archive', y ? +y[1] : 9999]);
        });
      });
      return rows.sort(function (a, b) { return b[2] - a[2]; });
    } },
    resources: { title: 'Resources', icon: 'doc', rows: function () {
      return [['/app/more/division', 'Division information', 'info'], ['/app/more/ladies-day', 'Ladies Day', 'people'],
        ['/app/more/archives', 'Archives', 'archive'], ['/app/more/follow', 'Follow Southwest', 'facebook']];
    } },
    follow: { title: 'Follow Southwest', icon: 'people', rows: function () {
      return [[FACEBOOK_URL, 'Follow us on Facebook', 'facebook'], [YT_CHANNEL_URL, 'Watch SW TV on YouTube', 'tv']];
    } }
  };
  // Which subsection an information page belongs to, for its Back link
  function parentOf(pageId) {
    var hit = null;
    ['play', 'division', 'ladies-day'].forEach(function (k) {
      SUBSECTIONS[k].rows({ items: [] }).forEach(function (r) { if (r[0] === '/app/page/' + pageId) hit = k; });
    });
    return hit ? { href: '/app/more/' + hit, label: SUBSECTIONS[hit].title } : { href: '/app/more', label: 'More' };
  }

  function more() {
    setTitle('More');
    var today = todayISO();
    return Promise.all([loadEvents().catch(function () { return []; }), getJSON('/clubs-data.json').catch(function () { return {}; }),
      getJSON('/news-data.json').catch(function () { return {}; }), loadResults().catch(function () { return []; })]).then(function (all) {
      var events = all[0], nClubs = (all[1].clubs || []).length, results = all[3];
      var news = (all[2].items || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      var played = events.filter(function (x) { return eventPhase(x, today) === 'past' && x.e.status !== 'cancelled'; }).length;
      var upcoming = events.filter(function (x) { var ph = eventPhase(x, today); return ph === 'upcoming' || ph === 'now'; }).length;
      currentNotices = events.filter(function (x) { var p = eventPhase(x, today); return x.e.alert && (p === 'upcoming' || p === 'now'); });
      var n = currentNotices.length;
      // Four plain groups, one row style. Icon colour tells the group, nothing else changes.
      function mrow(href, iconName, title, meta, tone) {
        var web = /^https?:/i.test(href) || (href.charAt(0) === '/' && !/^\/app\b/.test(href));
        return '<li><a class="mrow" href="' + esc(href) + '"' + (web ? ' target="_blank" rel="noopener"' : '') + '><span class="mrow__ic mrow__ic--' + tone + '">' + icon(iconName) + '</span>' +
          '<span class="mrow__main"><span class="mrow__title">' + esc(title) + '</span>' + (meta ? '<span class="mrow__meta">' + esc(meta) + '</span>' : '') + '</span>' +
          (web ? '<span class="mrow__end" aria-hidden="true">' + icon('ext', 'i--sm') + '</span><span class="sr-only">Opens in your browser</span>' : '<span class="mrow__end" aria-hidden="true">' + icon('chev', 'i--sm') + '</span>') + '</a></li>';
      }
      function group(label, rows) { return '<section class="mgroup" aria-labelledby="mg-' + slugify(label) + '"><h2 class="mgroup__label" id="mg-' + slugify(label) + '">' + esc(label) + '</h2><ul class="mlist">' + rows.join('') + '</ul></section>'; }
      function stat(n, label) { return '<span class="hub__stat"><b>' + n + '</b><span>' + esc(label) + '</span></span>'; }
      view.innerHTML = '<h1 class="sr-only">More</h1>' +
        '<section class="hub" aria-label="Southwest Bowls Division"><span class="logo-plate hub__logo"><img src="/assets/app/swd-logo.png" alt="" width="64" height="75"></span>' +
        '<div class="hub__text"><span class="hub__name">Southwest Bowls Division</span><span class="hub__sub">Lawn bowls across Southern California</span></div>' +
        '<div class="hub__stats">' + stat(nClubs, 'Clubs') + stat(upcoming, 'Events ahead') + stat(played, 'Played so far') + '</div></section>' +
        group('Explore', [
          mrow('/app/more/clubs', 'pin', 'Clubs', nClubs ? nClubs + ' clubs, on a map or in a list' : 'Map and list', 'blue'),
          mrow('/app/more/news', 'news', 'News', news[0] ? news[0].title : '', 'blue'),
          mrow('/app/more/play', 'flag', 'Learn bowls', 'Learn to bowl, coaching, umpires, markers', 'blue'),
          mrow('/app/watch', 'tv', 'Southwest TV', 'Livestreams and replays', 'blue'),
          mrow('/app/more/resources', 'doc', 'Resources', '', 'blue')]) +
        group('About', [
          mrow('/app/more/settings', 'sliders', 'App settings', 'Appearance, text size, offline copies', 'blush'),
          mrow('/app/page/about-us', 'info', 'About Southwest', '', 'blush'),
          mrow('/app/page/contact-us', 'mail', 'Help and contact', '', 'blush'),
          mrow('/', 'globe', 'Southwest website', 'swlawnbowls.org', 'blush'),
          mrow(FACEBOOK_URL, 'facebook', 'Facebook', 'Follow Southwest', 'blush')]);
    });
  }

  function subsection(params, key) {
    var sec = SUBSECTIONS[key];
    if (!sec) { history.replaceState(history.state, '', '/app/more'); return more(); }
    setTitle(sec.title);
    return getJSON('/nav-data.json').catch(function () { return { items: [] }; }).then(function (nav) {
      var rows = sec.rows(nav);
      var up = ['division', 'ladies-day', 'archives', 'follow'].indexOf(key) >= 0 ? ['/app/more/resources', 'Resources'] : ['/app/more', 'More'];
      view.innerHTML = backLink(up[0], up[1]) + '<div class="intro"><h1>' + esc(sec.title) + '</h1></div>' +
        (rows.length ? '<ul class="rows rows--menu">' + rows.map(function (r) {
          return menuRow(r[0], r[2] && typeof r[2] === 'string' ? r[2] : key === 'archives' ? 'archive' : 'doc', r[1]);
        }).join('') + '</ul>' : state('empty', 'Nothing here yet', ''));
    });
  }

  // News: every item has its own page at /app/news/<id>. Expired notices
  // (a sale or sign-up that has closed) stay readable, marked as ended.
  function newsEnded(n) { return Logic.isExpiredNotice(n, Date.now()); }
  function newsList() {
    setTitle('News');
    return getJSON('/news-data.json').then(function (d) {
      var items = (d.items || []).filter(function (n) { return n.id; }).slice().sort(function (a, b) { return (b.date || '') < (a.date || '') ? -1 : 1; });
      view.innerHTML = backLink('/app/more', 'More') + '<div class="intro"><h1>News</h1></div>' +
        (items.length ? '<ul class="rows newsrows">' + items.map(function (n) {
          return '<li><a class="row" href="/app/news/' + encodeURIComponent(n.id) + '"><span class="row__main">' +
            '<span class="row__meta">' + (n.date ? esc(fmt(n.date, { month: 'long', day: 'numeric', year: 'numeric' })) : '') + (newsEnded(n) ? ' · Ended' : '') + '</span>' +
            '<span class="row__title">' + esc(n.title) + '</span></span>' + CHEV + '</a></li>';
        }).join('') + '</ul>' : state('empty', 'No news right now', ''));
    });
  }
  function newsArticle(params, id) {
    setTitle('News');
    return getJSON('/news-data.json').then(function (d) {
      var n = (d.items || []).filter(function (x) { return x.id === id; })[0];
      if (!n) { view.innerHTML = backLink('/app/more/news', 'News') + state('empty', 'We couldn’t find that story', 'It may have been removed.', '<a class="btn" href="/app/more/news">All news</a>'); return; }
      setTitle(n.title);
      var link = n.resultId ? { href: '/app/results/' + encodeURIComponent(n.resultId), label: 'See the results' } : appLink(n.link || '');
      var ended = newsEnded(n), until = Logic.expiryTime(n.expires);
      view.innerHTML = backLink('/app/more/news', 'News') +
        '<p class="eyebrow">' + (n.date ? esc(fmt(n.date, { month: 'long', day: 'numeric', year: 'numeric' })) : '') + '</p>' +
        '<h1 class="detail-title">' + esc(n.title) + '</h1>' +
        (ended ? '<p class="note"><b>This has ended.</b>It closed ' + esc(new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(until))) + '.</p>' : '') +
        (safeUrl(n.image) ? '<img class="article__img" src="' + esc(n.image) + '" alt="" loading="lazy" data-hide-on-error>' : '') +
        String(n.body || '').split(/\n\s*\n/).map(function (para) { return '<p class="article__p">' + esc(para) + '</p>'; }).join('') +
        '<div class="actions">' +
          (link && !ended ? '<a class="btn btn--split" href="' + esc(link.href) + '"' + (link.ext ? ' target="_blank" rel="noopener"' : '') + '>' + esc(link.label) + icon(link.ext ? 'ext' : 'chev') + '</a>' : '') +
          (link && ended ? '<a class="btn btn--ghost" href="' + esc(link.href) + '"' + (link.ext ? ' target="_blank" rel="noopener"' : '') + '>' + (link.ext ? icon('ext') : '') + esc(link.label) + '</a>' : '') +
          shareBtn(n.title, '/app/news/' + n.id) +
        '</div>';
      view.querySelectorAll('img[data-hide-on-error]').forEach(function (img) { img.addEventListener('error', function () { img.hidden = true; }); });
    });
  }

  // Southern California map. A simple drawn coastline (not survey-accurate) with a pin per club,
  // placed from each club's own latitude and longitude. No map service, so it works offline.
  var COAST = [[-121.40, 35.95], [-121.30, 35.74], [-121.28, 35.66], [-121.10, 35.56], [-120.86, 35.37], [-120.64, 35.14], [-120.64, 34.90], [-120.65, 34.58],
    [-120.47, 34.45], [-120.00, 34.46], [-119.70, 34.40], [-119.29, 34.27], [-119.06, 34.09], [-118.68, 34.03], [-118.50, 34.01], [-118.41, 33.80], [-118.41, 33.74],
    [-118.19, 33.75], [-117.90, 33.60], [-117.70, 33.46], [-117.38, 33.19], [-117.27, 32.85], [-117.24, 32.67], [-117.12, 32.53], [-114.72, 32.72], [-114.50, 35.95]];
  var MAP_CITIES = [['Cambria', -121.08, 35.56, 8, 5, 'start'], ['Santa Barbara', -119.72, 34.62, 0, 0, 'middle'], ['Los Angeles', -118.15, 34.78, 0, 0, 'middle'], ['San Diego', -117.30, 32.58, 0, 0, 'end']];
  function clubMapHtml(clubs, selId) {
    var pts = clubs.filter(function (c) { return c.lat && c.lng; });
    var lo0 = -121.55, lo1 = -116.55, la0 = 32.45, la1 = 35.85, k = Math.cos(34 * Math.PI / 180);
    var W = (lo1 - lo0) * k * 100, H = (la1 - la0) * 100;
    function X(lo) { return (lo - lo0) * k * 100; }
    function Y(la) { return (la1 - la) * 100; }
    var poly = COAST.map(function (c) { return X(c[0]).toFixed(1) + ',' + Y(c[1]).toFixed(1); }).join(' ');
    var svg = '<svg class="cmap__svg" viewBox="0 0 ' + W.toFixed(0) + ' ' + H.toFixed(0) + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">' +
      '<rect width="100%" height="100%" class="cmap__sea"/><polygon points="' + poly + '" class="cmap__land"/>' +
      MAP_CITIES.map(function (c) { return '<text x="' + (X(c[1]) + c[3]).toFixed(1) + '" y="' + (Y(c[2]) + c[4]).toFixed(1) + '" text-anchor="' + c[5] + '" class="cmap__label">' + esc(c[0]) + '</text>'; }).join('') + '</svg>';
    return '<div class="cmap" role="group" aria-label="Map of clubs">' + svg + pts.map(function (c) {
      var id = c.id || slugify(c.name), on = isFollowing(id);
      return '<button type="button" class="cmap__pin' + (on ? ' cmap__pin--on' : '') + (id === selId ? ' cmap__pin--sel' : '') + '" data-pin="' + esc(id) + '" style="left:' +
        (X(+c.lng) / W * 100).toFixed(2) + '%;top:' + (Y(+c.lat) / H * 100).toFixed(2) + '%" aria-label="' + esc(c.name + ', ' + c.city) + '"><span></span></button>';
    }).join('') + '</div>';
  }
  function clubCard(c) {
    if (!c) return '<p class="cmap__hint">Tap a pin to see the club.</p>';
    var id = c.id || slugify(c.name);
    var photo = c.image && /^\/photos\//.test(c.image) && !c.imageNeedsReview ? c.image : '';
    return '<a class="ccard" href="/app/more/clubs/' + encodeURIComponent(id) + '">' + (photo ? '<img class="ccard__img" src="' + esc(photo) + '" alt="" width="72" height="72" loading="lazy" data-hide-on-error>' : '') +
      '<span class="ccard__body"><span class="ccard__title">' + esc(c.name) + '</span><span class="ccard__meta">' + esc(c.city + (c.status === 'private' ? ' · Private club' : '')) + '</span></span>' + CHEV + '</a>';
  }
  function clubsList(params) {
    setTitle('Clubs');
    return getJSON('/clubs-data.json').then(function (d) {
      var clubs = d.clubs || [];
      var q0 = params.get('q') || '', cview = params.get('view') === 'list' ? 'list' : 'map', selId = '';
      view.innerHTML = backLink('/app/more', 'More') + pageHead('Clubs', clubs.length + ' clubs, Cambria to Coronado') +
        '<label class="search">' + icon('search') + '<span class="sr-only">Search clubs</span>' +
        '<input type="search" id="q" placeholder="Search by club or city" value="' + esc(q0) + '" autocomplete="off"></label>' +
        '<div class="segmented" role="group" aria-label="Show clubs as">' + [['map', 'Map'], ['list', 'List']].map(function (k) {
          return '<button type="button" data-cview="' + k[0] + '" aria-pressed="' + (k[0] === cview) + '">' + k[1] + '</button>'; }).join('') + '</div>' +
        '<div id="c-map"></div><div id="c-list"></div>';
      function drawMap() {
        var box = document.getElementById('c-map');
        if (cview !== 'map') { box.innerHTML = ''; return; }
        var q = fold(document.getElementById('q').value.trim());
        var shown = clubs.filter(function (c) { return !q || fold(c.name + ' ' + c.city + ' ' + (c.summary || '')).indexOf(q) >= 0; });
        if (!shown.length) { box.innerHTML = state('empty', 'No clubs match', 'Try another name or city.'); return; }
        var sel = shown.filter(function (c) { return (c.id || slugify(c.name)) === selId; })[0];
        box.innerHTML = clubMapHtml(shown, sel ? selId : '') + '<div id="c-card" aria-live="polite">' + clubCard(sel) + '</div>';
        box.querySelectorAll('img[data-hide-on-error]').forEach(function (img) { img.addEventListener('error', function () { img.hidden = true; }); });
      }
      function syncUrl() {
        var u = new URLSearchParams(), qv = document.getElementById('q').value.trim();
        if (qv) u.set('q', qv); if (cview === 'list') u.set('view', 'list');
        history.replaceState(history.state, '', '/app/more/clubs' + (u.toString() ? '?' + u : ''));
      }
      function apply() {
        syncUrl();
        if (cview === 'map') { document.getElementById('c-list').innerHTML = ''; return; }
        var q = fold(document.getElementById('q').value.trim());
        var list = clubs.filter(function (c) { return !q || fold(c.name + ' ' + c.city + ' ' + (c.summary || '')).indexOf(q) >= 0; });
        document.getElementById('c-list').innerHTML = list.length ? '<p class="count">' + list.length + ' club' + (list.length === 1 ? '' : 's') + '</p><ul class="list list--plain">' + list.map(function (c) {
          var id = c.id || slugify(c.name), on = isFollowing(id);
          return '<li><a class="rcard" href="/app/more/clubs/' + encodeURIComponent(id) + '"><span class="clubdot' + (on ? ' clubdot--on' : '') + '" aria-hidden="true">' + icon(on ? 'star' : 'pin') + '</span>' +
            '<span class="rcard__body"><span class="rcard__title">' + esc(c.name) + '</span><span class="rcard__meta">' + esc(c.city + (c.status === 'private' ? ' · Private club' : '') + (on ? ' · Following' : '')) + '</span></span>' + CHEV + '</a></li>';
        }).join('') + '</ul>' : state('empty', 'No clubs match', 'Try another name or city.');
      }
      document.getElementById('q').addEventListener('input', function () { apply(); drawMap(); });
      view.addEventListener('click', function (ev) {
        var pin = ev.target.closest('[data-pin]');
        if (pin) { selId = pin.getAttribute('data-pin'); drawMap(); var pb = view.querySelector('[data-pin="' + selId + '"]'); if (pb) pb.focus({ preventScroll: true }); var ca = document.getElementById('c-card'); if (ca) ca.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
        var cv = ev.target.closest('[data-cview]');
        if (cv) { cview = cv.getAttribute('data-cview'); view.querySelectorAll('[data-cview]').forEach(function (b) { b.setAttribute('aria-pressed', b === cv); }); drawMap(); apply(); }
      });
      apply(); drawMap();
    });
  }
  function clubDetail(params, slug) {
    setTitle('Club');
    return getJSON('/clubs-data.json').then(function (d) {
      var c = (d.clubs || []).filter(function (x) { return (x.id || slugify(x.name)) === slug || slugify(x.name) === slug; })[0];
      if (!c) { view.innerHTML = backLink('/app/more/clubs', 'Clubs') + state('empty', 'Club not found', '', '<a class="btn" href="/app/more/clubs">All clubs</a>'); return; }
      setTitle(c.name);
      var cid = c.id || slugify(c.name);
      var maps = c.lat && c.lng ? 'https://www.google.com/maps/search/?api=1&query=' + c.lat + ',' + c.lng : '';
      // Only a local, unflagged photo is shown (never a hotlink, never a doubtful one)
      var photo = c.image && /^\/photos\//.test(c.image) && !c.imageNeedsReview ? c.image : '';
      // One primary action pinned at the bottom (Directions, else the website), Follow beside it
      var primary = maps ? '<a class="btn btn--wide" href="' + maps + '" target="_blank" rel="noopener">' + icon('map') + 'Directions</a>'
        : safeUrl(c.website) ? '<a class="btn btn--wide" href="' + esc(c.website) + '" target="_blank" rel="noopener">' + icon('globe') + 'Website</a>' : '';
      var facts = [];
      if (c.phone) facts.push(menuRow(tel(c.phone), 'phone', 'Call ' + c.phone));
      if (c.email) facts.push(menuRow('mailto:' + c.email, 'mail', c.email));
      if (safeUrl(c.website) && maps) facts.push(menuRow(c.website, 'globe', 'Website'));
      view.innerHTML = backLink('/app/more/clubs', 'Clubs') +
        '<div class="chero">' + (photo ? '<img class="chero__img" src="' + esc(photo) + '" alt="' + esc(c.name) + ' lawn bowling club" loading="lazy" data-hide-on-error>' : '<div class="chero__img chero__img--none">' + icon('pin') + '</div>') +
        (c.status === 'private' ? '<span class="chero__tag">Private club</span>' : '') + '</div>' +
        '<h1 class="detail-title chero__title">' + esc(c.name) + '</h1>' +
        '<p class="chero__where">' + icon('pin', 'i--sm') + esc(c.city) + '</p>' +
        (c.summary ? '<p class="club__summary">' + esc(c.summary) + '</p>' : '') +
        (facts.length ? '<ul class="rows rows--cards" style="margin-top:16px">' + facts.join('') + '</ul>' : '') +
        (c.details ? '<details class="fold"><summary><span>About the club</span>' + CHEV + '</summary><p style="padding-bottom:16px">' + esc(c.details) + '</p></details>' : '') +
        '<p class="muted" style="margin-top:8px">Following is saved on this phone and puts this club’s events first. It doesn’t turn on notifications.</p>' +
        '<div class="actionbar">' + primary + followBtn(cid, c.name) + '</div>';
      view.querySelectorAll('img[data-hide-on-error]').forEach(function (img) { img.addEventListener('error', function () { img.hidden = true; }); });
    });
  }

  function settings() {
    setTitle('App settings');
    var standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    var n = saved().length;
    view.innerHTML = backLink('/app/more', 'More') + '<div class="intro"><h1>App settings</h1></div>' +
      '<section class="settings" aria-labelledby="h-appear"><h2 id="h-appear">Appearance</h2>' + themeChoices() + '</section>' +
      '<section class="settings" aria-labelledby="h-text"><h2 id="h-text">Text size</h2>' + textChoices() + '</section>' +
      '<section class="settings" aria-labelledby="h-off"><h2 id="h-off">Offline copies</h2><p>Pages you open are kept so they work without a signal. Clearing them frees space; they come back as you browse.</p>' +
      '<div class="actions"><button class="btn btn--ghost" type="button" data-clear-cache>Clear offline copies</button></div></section>' +
      '<section class="settings" aria-labelledby="h-sv"><h2 id="h-sv">Saved events</h2><p>' + (n ? n + ' event' + (n === 1 ? '' : 's') + ' saved on this phone. Saving an event doesn’t enter you in it.' : 'No events saved yet.') + '</p>' +
      (n ? '<div class="actions"><button class="btn btn--ghost" type="button" data-clear-saved>Clear saved events</button></div>' : '') + '</section>' +
      '<section class="settings" aria-labelledby="h-fc"><h2 id="h-fc">Followed clubs</h2><div id="fc-list"></div></section>' +
      (!standalone ? '<section class="settings" aria-labelledby="h-inst"><h2 id="h-inst">Add to your home screen</h2><p>Get the Southwest Bowls icon on your phone.</p><div class="actions"><a class="btn" href="/get-the-app" target="_blank" rel="noopener">How to add it</a></div></section>' : '') +
      '<p class="footnote">Southwest Bowls app · information from swlawnbowls.org</p>';
    // Followed clubs list (names from clubs-data.json); unfollow in place
    getJSON('/clubs-data.json').then(function (d) {
      function draw() {
        var box = document.getElementById('fc-list'); if (!box) return;
        var fol = followed();
        var mine = (d.clubs || []).filter(function (c) { return fol.indexOf(c.id) >= 0; });
        box.innerHTML = mine.length
          ? '<p>On this phone only. Their events come first in Events and on Home.</p><ul class="rows rows--menu">' + mine.map(function (c) {
              return '<li><div class="row">' + icon('star') + '<span class="row__main"><span class="row__title">' + esc(c.name) + '</span><span class="row__meta">' + esc(c.city || '') + '</span></span>' +
                '<button class="btn btn--ghost btn--sm" type="button" data-follow="' + esc(c.id) + '" data-name="' + esc(c.name) + '" aria-pressed="true" aria-label="Unfollow ' + esc(c.name) + '"><span>Following</span></button></div></li>';
            }).join('') + '</ul>'
          : '<p>You’re not following any clubs. Follow a club from its page to see its events first.</p><div class="actions"><a class="btn btn--ghost" href="/app/more/clubs">Find a club</a></div>';
      }
      draw();
      view.addEventListener('follow-change', draw);
    }).catch(function () {});
    view.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-clear-saved]')) { store('saved', []); toast('Saved events cleared'); render(); }
      if (ev.target.closest('[data-clear-cache]')) {
        (window.caches ? caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }) : Promise.resolve())
          .then(function () { toast('Offline copies cleared'); });
      }
    });
    return Promise.resolve();
  }

  /* ---------------------------------------------------------------
     My membership (Supabase). Hidden while testing: the More row only
     appears after opening /app/more/membership?preview=1, and the
     server answers only test-listed addresses until the Division opens it.
     The publishable key is public by design — members can only call the
     three functions in member-platform/supabase/0004_my_membership.sql.
     --------------------------------------------------------------- */
  var MEMBERS_API = { url: 'https://azbluidsfrjtoeeesqwa.supabase.co', key: 'sb_publishable_CL2AYkEOhlthkOIMISTEDg_0ig-qI_e' };
  function memberSession() { return store('session'); }
  function setMemberSession(s) {
    try { if (s) store('session', s); else localStorage.removeItem('swd:session'); } catch (e) {}
  }
  // A sign-in link returns here with the session in the address (#access_token=…)
  function captureSignIn() {
    if (!/[#&](access_token|error_description)=/.test(location.hash)) return;
    var h = new URLSearchParams(location.hash.slice(1));
    if (h.get('access_token')) {
      setMemberSession({ access: h.get('access_token'), refresh: h.get('refresh_token'), expires: Date.now() + (+h.get('expires_in') || 3600) * 1000 });
      store('memberPreview', true);
    } else store('signinError', h.get('error_description') || 'That sign-in link didn’t work.');
    var back = store('afterSignIn') || '/app/my';
    history.replaceState({ depth: 0 }, '', back);
  }
  function memberFetch(path, body, token) {
    var h = { apikey: MEMBERS_API.key, 'content-type': 'application/json' };
    if (token) h.authorization = 'Bearer ' + token;
    return fetch(MEMBERS_API.url + path, { method: 'POST', headers: h, body: JSON.stringify(body || {}) }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = JSON.parse(t); } catch (e) {}
        if (!r.ok) { var err = new Error((j && (j.message || j.msg || j.error_description)) || ('HTTP ' + r.status)); err.status = r.status; throw err; }
        return j;
      });
    });
  }
  function freshToken() {
    var s = memberSession();
    if (!s) return Promise.resolve(null);
    if (s.expires - Date.now() > 60000) return Promise.resolve(s.access);
    return memberFetch('/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh }).then(function (j) {
      setMemberSession({ access: j.access_token, refresh: j.refresh_token, expires: Date.now() + (j.expires_in || 3600) * 1000 });
      return j.access_token;
    }, function () { setMemberSession(null); return null; });
  }
  function memberRpc(fn, args) {
    return freshToken().then(function (t) {
      if (!t) { var e = new Error('signed out'); e.status = 401; throw e; }
      return memberFetch('/rest/v1/rpc/' + fn, args, t);
    });
  }
  function longDate(isoStr) { return isoStr ? fmt(isoStr, { month: 'long', day: 'numeric', year: 'numeric' }) : ''; }
  function monthYear(isoStr) { return isoStr ? fmt(isoStr, { month: 'long', year: 'numeric' }) : ''; }
  function factRow(label, value, good) {
    return '<li class="mfact"><span class="mfact__label">' + esc(label) + '</span><span class="mfact__value' + (good ? ' mfact__value--ok' : '') + '">' +
      (good ? icon('check', 'i--sm') : '') + esc(value) + '</span></li>';
  }
  // The digital membership card. The photo is chosen by the member and kept
  // on this phone only (never uploaded). The club mark is the club's real
  // logo when clubs-data.json has one ("logo"), otherwise its real green
  // photo — logos are never redrawn or invented.
  function memberPhoto(id) { return store('memberPhoto:' + id); }
  function idCardHtml(m, club) {
    var today = todayISO();
    var photo = memberPhoto(m.id);
    var mark = club && safeUrl(club.logo) ? { src: club.logo, cls: 'idcard__club--logo' }
      : club && club.image && !club.imageNeedsReview ? { src: club.image, cls: 'idcard__club--photo' } : null;
    var novice = m.noviceUntil && m.noviceUntil >= today;
    return '<figure class="idcard" aria-label="Southwest Bowls membership card for ' + esc(m.name) + '">' +
      '<div class="idcard__top"><span class="idcard__logo"><img src="/assets/app/swd-logo.png" alt="Southwest Bowls" width="64" height="75"></span>' +
        '<span class="idcard__org"><b>Southwest Bowls</b><span>Division membership</span></span>' +
        '<span class="idcard__season">' + esc(m.season) + '</span></div>' +
      '<div class="idcard__body">' +
        '<button class="idcard__photo" type="button" data-photo aria-label="' + (photo ? 'Change your card photo' : 'Add a photo to your card') + '">' +
          (photo ? '<img src="' + esc(photo) + '" alt="">' : icon('person') + '<span>Add photo</span>') + '</button>' +
        '<div class="idcard__who"><p class="idcard__label">Member</p><p class="idcard__name">' + esc(m.name) + '</p>' +
          '<p class="idcard__label">Home club</p><p class="idcard__clubname">' + esc(m.club ? m.club.name : 'Not on record') + '</p></div>' +
        (mark ? '<span class="idcard__club ' + mark.cls + '"><img src="' + esc(mark.src) + '" alt="' + esc((m.club && m.club.name) || '') + '" loading="lazy" data-hide-on-error></span>' : '') +
      '</div>' +
      '<div class="idcard__chips">' +
        (m.swDuesPaid ? '<span class="idchip idchip--ok">' + icon('check', 'i--sm') + 'SW dues ' + esc(m.season) + '</span>' : '<span class="idchip">SW dues not on record</span>') +
        (m.usaDuesPaid ? '<span class="idchip idchip--ok">' + icon('check', 'i--sm') + 'Bowls USA ' + esc(m.season) + '</span>' : '') +
        (novice ? '<span class="idchip idchip--novice">Novice until ' + esc(fmt(m.noviceUntil, { month: 'short', year: 'numeric' })) + '</span>' : '') +
      '</div>' +
      '<p class="idcard__foot">Valid for the ' + esc(m.season) + ' season · swlawnbowls.org</p>' +
      '</figure>' +
      '<input type="file" accept="image/*" id="m-photo" hidden>' +
      '<p class="muted idcard__note">' + (photo ? 'Your photo is kept on this phone only. <button class="linkbtn" type="button" data-photo-remove>Remove photo</button>' : 'Tap the photo square to add your picture. It stays on this phone only.') + '</p>';
  }
  // A picked photo is cropped to a portrait and shrunk on the phone before saving
  function savePhoto(file, id) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onerror = reject;
      r.onload = function () {
        var img = new Image();
        img.onerror = reject;
        img.onload = function () {
          // Portrait 4:5 like an ID photo, centred, 320×400
          var W = 320, H = 400, sw = Math.min(img.width, img.height * W / H), sh = sw * H / W;
          var c = document.createElement('canvas'); c.width = W; c.height = H;
          c.getContext('2d').drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, W, H);
          var data = c.toDataURL('image/jpeg', 0.82);
          try { localStorage.setItem('swd:memberPhoto:' + id, JSON.stringify(data)); resolve(); } catch (e) { reject(e); }
        };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }
  function memberCardHtml(m, club) {
    var today = todayISO();
    var novice = !m.noviceUntil ? 'Start date not on record — ask the Division'
      : m.noviceUntil >= today ? 'Novice until ' + longDate(m.noviceUntil)
      : 'Not a novice (novice period ended ' + longDate(m.noviceUntil) + ')';
    return idCardHtml(m, club) +
      (m.club ? '<a class="mcard__club" href="/app/more/clubs/' + encodeURIComponent(m.club.id) + '">' + icon('pin', 'i--sm') + esc(m.club.name) + ' club page' + CHEV + '</a>' : '') +
      '<ul class="mfacts">' +
        factRow(m.season + ' Southwest dues', m.swDuesPaid ? 'Paid' : 'Not on record', m.swDuesPaid) +
        factRow(m.season + ' Bowls USA dues', m.usaDuesPaid ? 'Paid' : 'Not on record', m.usaDuesPaid) +
        factRow('Novice status', novice, false) +
        (m.begnovMonth ? factRow('Started bowling', monthYear(m.begnovMonth), false) : '') +
      '</ul>' +
      '<section class="section" aria-labelledby="h-contact">' + sectionHead('h-contact', 'Your contact details') +
        '<ul class="mfacts">' + factRow('Email', m.email || 'Not on record', false) + factRow('Phone', m.phone || 'Not on record', false) + '</ul>' +
        (m.pendingChanges.length ? '<div class="note" role="note"><b>Waiting for the Division to review</b>' +
          m.pendingChanges.map(function (c) { return esc(cap(c.kind)) + ': ' + esc(c.value); }).join('<br>') + '</div>' : '') +
        '<details class="fold"><summary><span>Suggest a correction</span>' + CHEV + '</summary>' +
          '<form class="mform" id="m-change" novalidate>' +
            '<div class="segmented" role="radiogroup" aria-label="What to correct">' +
              '<button type="button" role="radio" aria-checked="true" data-kind="email">Email</button>' +
              '<button type="button" role="radio" aria-checked="false" data-kind="phone">Phone</button></div>' +
            '<label class="mfield"><span>New email</span><input id="m-value" type="email" autocomplete="email" inputmode="email" required></label>' +
            '<p class="muted">The Division checks every change before it’s saved. Your current details stay until then.</p>' +
            '<p class="mform__err" id="m-err" role="alert"></p>' +
            '<div class="actions"><button class="btn" type="submit">Send for review</button></div>' +
          '</form></details>' +
      '</section>';
  }
  // "Need help accessing your membership?" — for missing, outdated or shared roster emails
  function memberHelpHtml(open) {
    return '<details class="fold mhelp"' + (open ? ' open' : '') + '><summary><span>Need help accessing your membership?</span>' + CHEV + '</summary>' +
      '<ul class="mhelp__list">' +
        '<li><b>Your email isn’t recognised.</b> The roster may have an older address, or none. Tell the Division your name, club and the email you want to use.</li>' +
        '<li><b>You share an email with a partner or family.</b> After signing in you choose who you are. The Division confirms it before your membership shows — signing in never links everyone on a shared email.</li>' +
        '<li><b>Your details are wrong.</b> Once you’re in, use “Suggest a correction”. Nothing changes until the Division checks it.</li>' +
      '</ul><div class="actions"><a class="btn btn--ghost" href="/app/page/contact-us">' + icon('mail') + 'Contact Southwest Bowls</a></div></details>';
  }
  /* ---------------------------------------------------------------
     Sign in or create an account: email, then a short code typed in the
     app (a link opens in the browser, away from the installed app, so the
     code is the main way). The email also carries a link as a backup.
     Apple and Google buttons are added here once the store accounts exist
     (Apple requires Sign in with Apple whenever Google is offered).
     SIGNUP_OPEN stays false until sign-ups are opened in Supabase; until
     then only addresses already on the roster receive a code.
     --------------------------------------------------------------- */
  var SIGNUP_OPEN = false;
  function signInScreen(params) {
    setTitle('Sign in');
    var email = '', timer = null, root = view;
    function live() { if (view === root) return true; clearInterval(timer); return false; }
    var MAIL_ART = '<svg class="signin__art" viewBox="0 0 120 90" aria-hidden="true" focusable="false"><rect x="14" y="22" width="92" height="58" rx="10" class="sa-body"/>' +
      '<path d="M18 28 60 58l42-30" class="sa-flap"/><circle cx="96" cy="22" r="11" class="sa-dot"/><path d="m91 22 4 4 7-8" class="sa-tick"/></svg>';
    function shell(step, inner, backTo) {
      view.innerHTML = '<div class="signin"><div class="signin__top"><button class="circbtn" type="button" data-sback aria-label="Back">' + icon('back') + '</button>' +
        '<span class="signin__step">Step ' + step + ' of 2</span></div>' + inner + '</div>';
      view.querySelector('[data-sback]').addEventListener('click', function () {
        if (backTo) { backTo(); return; }
        if (history.state && history.state.from) { history.back(); return; }
        navDir = 'back'; go('/app/my', true);
      });
    }
    function socialRow() {
      return '<div class="signin__or"><span>or continue with</span></div><div class="social">' +
        '<button class="social__btn" type="button" disabled aria-disabled="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.2.8 1.1 1.700 2.300 2.900 2.300 1.200 0 1.600-.7 3-.7s1.800.7 3 .7c1.300 0 2.100-1.100 2.800-2.200.9-1.300 1.300-2.500 1.300-2.600-.1 0-2.500-1-2.500-3.800ZM14.200 5.800c.6-.8 1.100-1.800 1-2.900-.9 0-2 .6-2.700 1.400-.6.700-1.100 1.800-1 2.800 1 .1 2-.5 2.700-1.300Z"/></svg>Apple<small>Soon</small></button>' +
        '<button class="social__btn" type="button" disabled aria-disabled="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.300-.2-1.900H12v3.700h5.400c-.2 1.200-.9 2.300-2 3v2.500h3.200c1.900-1.700 3-4.300 3-7.300Z"/><path fill="#34A853" d="M12 22c2.700 0 5-.9 6.600-2.400l-3.200-2.500c-.9.600-2 .9-3.400.9-2.600 0-4.800-1.800-5.600-4.100H3.100v2.600C4.700 19.800 8.100 22 12 22Z"/><path fill="#FBBC05" d="M6.400 14c-.2-.6-.3-1.300-.3-2s.1-1.400.3-2V7.400H3.100C2.400 8.800 2 10.400 2 12s.4 3.200 1.100 4.600L6.400 14Z"/><path fill="#EA4335" d="M12 5.900c1.500 0 2.800.5 3.800 1.500l2.900-2.900C17 2.900 14.700 2 12 2 8.100 2 4.700 4.200 3.100 7.400L6.400 10C7.200 7.700 9.400 5.900 12 5.900Z"/></svg>Google<small>Soon</small></button></div>';
    }
    function emailStep(msg) {
      clearInterval(timer);
      shell(1, '<h1 class="signin__h">Log in or create an account</h1><p class="signin__sub">Enter your email and we’ll send you a code. No password to remember.</p>' +
        (msg ? '<div class="note" role="alert">' + esc(msg) + '</div>' : '') +
        '<form class="mform" id="s-form" novalidate><label class="mfield mfield--icon mfield--pill"><span>Email</span><span class="mfield__box">' + icon('mail') +
        '<input id="s-email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" value="' + esc(email) + '" required></span></label>' +
        '<p class="mform__err" id="s-err" role="alert"></p><div class="actions"><button class="btn btn--wide" type="submit">Send me a code</button></div></form>' +
        socialRow() +
        '<p class="signin__foot">No account needed to browse. <a class="textlink" href="/app">Continue as a guest</a></p>');
      var f = view.querySelector('#s-form');
      f.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var v = f.querySelector('#s-email').value.trim(), out = f.querySelector('#s-err');
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { out.textContent = 'Enter your email address.'; f.querySelector('#s-email').focus(); return; }
        email = v; f.querySelector('button').disabled = true; out.textContent = '';
        store('afterSignIn', '/app/my');
        var next = function () { if (live()) codeStep(); };
        // Same answer whether or not the address exists: never reveal who is on the roster
        memberFetch('/auth/v1/otp?redirect_to=' + encodeURIComponent(location.origin + '/app/my'), { email: email, create_user: SIGNUP_OPEN }).then(next, next);
      });
    }
    function codeStep(msg) {
      var left = 45;
      shell(2, MAIL_ART + '<h1 class="signin__h">Check your email</h1><p class="signin__sub">If <b>' + esc(email) + '</b> can sign in, we’ve sent a 6-digit code. It works for 10 minutes.</p>' +
        (msg ? '<div class="note" role="alert">' + esc(msg) + '</div>' : '') +
        '<form class="mform" id="c-form" novalidate><div class="otp" id="c-otp"><input class="otp__input" id="c-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" aria-label="6-digit code" aria-describedby="c-err">' +
        '<span class="otp__box"></span><span class="otp__box"></span><span class="otp__box"></span><span class="otp__box"></span><span class="otp__box"></span><span class="otp__box"></span></div>' +
        '<p class="mform__err" id="c-err" role="alert"></p><div class="actions"><button class="btn btn--wide" type="submit">Confirm</button></div></form>' +
        '<p class="signin__again"><span id="c-timer"></span></p><p class="signin__foot">Wrong email? <button class="textlink" type="button" id="c-edit">Change it</button></p>', emailStep);
      var f = view.querySelector('#c-form'), tm = view.querySelector('#c-timer'), inp = f.querySelector('#c-code'), boxes = f.querySelectorAll('.otp__box');
      function paint() {
        var v = inp.value.replace(/\D/g, '').slice(0, 6); inp.value = v;
        boxes.forEach(function (b, i) { b.textContent = v.charAt(i); b.classList.toggle('is-on', i === v.length && document.activeElement === inp); });
        if (v.length === 6) f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true }));
      }
      inp.addEventListener('input', paint); inp.addEventListener('focus', paint); inp.addEventListener('blur', paint);
      setTimeout(function () { inp.focus(); }, 50);
      function tick() {
        if (left > 0) { tm.textContent = 'You can resend the code in ' + left + ' seconds'; left--; return; }
        clearInterval(timer); tm.innerHTML = '<button class="textlink" type="button" id="c-resend">Resend code</button>';
        tm.querySelector('#c-resend').addEventListener('click', function () {
          memberFetch('/auth/v1/otp', { email: email, create_user: SIGNUP_OPEN }).then(function () { if (live()) toast('Code sent'); }, function () { if (live()) toast('Code sent'); });
          left = 45; timer = setInterval(tick, 1000); tick();
        });
      }
      clearInterval(timer); timer = setInterval(tick, 1000); tick();
      view.querySelector('#c-edit').addEventListener('click', function () { emailStep(); });
      var busy = false;
      f.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var code = inp.value.replace(/\D/g, ''), out = f.querySelector('#c-err');
        if (busy) return;
        if (code.length < 6) { out.textContent = 'Enter the 6-digit code from the email.'; inp.focus(); return; }
        busy = true; f.querySelector('button').disabled = true; out.textContent = '';
        memberFetch('/auth/v1/verify', { type: 'email', email: email, token: code }).then(function (j) {
          if (!live()) return;
          clearInterval(timer);
          setMemberSession({ access: j.access_token, refresh: j.refresh_token, expires: Date.now() + (j.expires_in || 3600) * 1000 });
          store('memberPreview', true); toast('Signed in');
          go('/app/my', true);
        }, function () { if (!live()) return; busy = false; f.querySelector('button').disabled = false; inp.value = ''; paint(); out.textContent = 'That code didn’t work. Check it or ask for a new one.'; });
      });
    }
    if (params.get('demo') === 'code') { email = 'you@example.com'; codeStep(); return Promise.resolve(); }
    emailStep(); return Promise.resolve();
  }

  // Identity header: everyone can use the app without an account, including
  // players from other divisions and other countries. The optional details
  // behind it stay on this phone; nothing is sent anywhere.
  var DIVISION_HINTS = ['Southwest (SWD)', 'Pacific Inter-Mountain (PIMD)', 'Arizona', 'Other U.S. division', 'Outside the United States'];
  function initials(name) {
    var w = String(name || '').trim().split(/\s+/).filter(Boolean);
    return w.length ? (w[0].charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : '')).toUpperCase() : '';
  }
  function profileHeader() {
    var p = store('profile') || {};
    var first = String(p.name || '').trim().split(/\s+/)[0];
    var chips = [p.division, p.club].filter(Boolean).map(function (c) { return '<span class="idhead__chip">' + esc(c) + '</span>'; }).join('');
    return '<button class="idhead" type="button" data-edit-profile aria-label="Edit your details">' +
      '<span class="idhead__avatar" aria-hidden="true">' + (initials(p.name) ? esc(initials(p.name)) : icon('person')) + '</span>' +
      '<span class="idhead__text"><span class="idhead__name">' + (first ? 'Hi, ' + esc(first) : 'Welcome to Southwest Bowls') + '</span>' +
      (chips ? '<span class="idhead__chips">' + chips + '</span>' : '<span class="idhead__meta">Guest · Tap to add details</span>') + '</span>' +
      icon('chev', 'i--sm') + '</button>';
  }
  function wireProfile() {
    var b = view.querySelector('[data-edit-profile]'); if (!b) return;
    b.addEventListener('click', function () {
      var p = store('profile') || {};
      openDialog('Your details',
        '<p class="muted">Optional, and kept on this phone only. You never need to be an SWD member to use the app or to enter an event.</p>' +
        '<form class="mform" id="g-form" novalidate>' +
          '<label class="mfield mfield--icon"><span>Your name</span><span class="mfield__box">' + icon('person') + '<input id="g-name" type="text" autocomplete="name" value="' + esc(p.name || '') + '"></span></label>' +
          '<label class="mfield mfield--icon"><span>Home division or country</span><span class="mfield__box">' + icon('pin') + '<input id="g-div" type="text" list="g-div-list" value="' + esc(p.division || '') + '"></span>' +
            '<datalist id="g-div-list">' + DIVISION_HINTS.map(function (d) { return '<option value="' + esc(d) + '">'; }).join('') + '</datalist></label>' +
          '<label class="mfield mfield--icon"><span>Home club</span><span class="mfield__box">' + icon('people') + '<input id="g-club" type="text" value="' + esc(p.club || '') + '"></span></label>' +
          '<div class="actions"><button class="btn" type="submit">Save</button></div></form>');
      document.getElementById('g-form').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var f = ev.target;
        store('profile', { name: f.querySelector('#g-name').value.trim(), division: f.querySelector('#g-div').value.trim(), club: f.querySelector('#g-club').value.trim() });
        closeDialog(); toast('Saved');
        var h = view.querySelector('[data-edit-profile]'); if (h) { h.outerHTML = profileHeader(); wireProfile(); }
      });
    });
  }
  // My SWD: membership (sign-in, preview while testing), then the things
  // kept on this phone — saved events and followed clubs — which never need
  // an account. Entries and personal results appear here once they exist.
  function mySwd(params) {
    setTitle('My SWD');
    if (params.get('preview') === '1') { store('memberPreview', true); history.replaceState(history.state, '', location.pathname); }
    var err = store('signinError'); if (err) { try { localStorage.removeItem('swd:signinError'); } catch (e) {} }
    var preview = !!store('memberPreview') || !!memberSession();
    var today = todayISO();

    view.innerHTML = profileHeader() +
      (memberSession() ? '' : '<a class="btn btn--wide signin__cta" href="/app/signin">Sign in or create an account</a>') +
      (preview ? '<section class="section mysec" aria-labelledby="h-member"><div class="section__head"><h2 class="section__title" id="h-member">Membership</h2>' +
        '<span class="tag tag--preview">Preview</span></div><div id="m-box">' + loading() + '</div></section>' : '') +
      '<section class="section mysec" aria-labelledby="h-saved"><div class="section__head"><h2 class="section__title" id="h-saved">Saved events</h2>' +
        '<a class="section__more" href="/app/events?show=saved">All saved' + icon('chev', 'i--sm') + '</a></div><div id="my-saved">' + loading() + '</div>' +
        '<p class="muted">Saved on this phone. Saving an event doesn’t enter you in it.</p></section>' +
      '<section class="section mysec" aria-labelledby="h-clubs"><div class="section__head"><h2 class="section__title" id="h-clubs">Followed clubs</h2>' +
        '<a class="section__more" href="/app/more/clubs">All clubs' + icon('chev', 'i--sm') + '</a></div><div id="my-clubs"></div></section>' +
      '<section class="section mysec" aria-labelledby="h-set"><div class="section__head"><h2 class="section__title" id="h-set">Settings</h2></div>' +
        '<ul class="rows rows--cards">' + linkRow('/app/more/settings', 'sliders', 'App settings', 'Appearance, text size, offline copies') + '</ul></section>';
    var box = view.querySelector('#m-box');
    wireProfile();

    // Saved events and followed clubs: this phone only, no sign-in
    loadEvents().then(function (events) {
      var ids = saved();
      var mine = events.filter(function (x) { return ids.indexOf(x.id) >= 0; });
      var next = mine.filter(function (x) { var p = eventPhase(x, today); return p === 'upcoming' || p === 'now'; });
      var el = view.querySelector('#my-saved'); if (!el) return;
      el.innerHTML = next.length
        ? '<ul class="list list--cards">' + next.slice(0, 3).map(function (x) { return eventRow(x, today); }).join('') + '</ul>' +
          (next.length > 3 ? '<p class="count">+ ' + (next.length - 3) + ' more saved</p>' : '')
        : state('empty', mine.length ? 'No upcoming saved events' : 'Nothing saved yet', mine.length ? 'Your saved events have all been played.' : 'Tap Save on any event to keep it here.',
            '<a class="btn btn--ghost" href="/app/events">Browse events</a>');
    }, function () { var el = view.querySelector('#my-saved'); if (el) el.innerHTML = errorState(); });
    getJSON('/clubs-data.json').then(function (d) {
      var fol = followed(), el = view.querySelector('#my-clubs'); if (!el) return;
      var mine = (d.clubs || []).filter(function (c) { return fol.indexOf(c.id) >= 0; });
      el.innerHTML = mine.length
        ? '<ul class="rows rows--cards">' + mine.map(function (c) { return linkRow('/app/more/clubs/' + encodeURIComponent(c.id), 'star', c.name, c.city || ''); }).join('') + '</ul>'
        : state('empty', 'No clubs followed', 'Follow a club to see its events first.', '<a class="btn btn--ghost" href="/app/more/clubs">Find a club</a>');
    }).catch(function () {});

    if (!preview) return Promise.resolve();   // members' card appears here once sign-in opens

    function signInForm(msg) {
      box.innerHTML =
        '<h3 class="signin__title">Sign in</h3><p class="signin__sub">We’ll email you a link. No password needed.</p>' +
        (msg ? '<div class="note" role="alert"><b>Sign-in didn’t work</b>' + esc(msg) + '</div>' : '') +
        '<form class="mform" id="m-signin" novalidate>' +
          '<label class="mfield mfield--icon"><span>Email</span><span class="mfield__box">' + icon('mail') + '<input id="m-email" type="email" autocomplete="email" inputmode="email" required></span></label>' +
          '<p class="mform__err" id="m-err" role="alert"></p>' +
          '<div class="actions"><button class="btn btn--wide" type="submit">Email me a sign-in link</button></div>' +
        '</form>' + memberHelpHtml(false) +
        '<p class="footnote">Your details are only shown to you. Only Division administrators can see the full roster.</p>';
      box.querySelector('#m-signin').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var email = box.querySelector('#m-email').value.trim(), out = box.querySelector('#m-err');
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { out.textContent = 'Enter your email address.'; box.querySelector('#m-email').focus(); return; }
        ev.target.querySelector('button[type=submit]').disabled = true; out.textContent = '';
        store('afterSignIn', '/app/my');
        var done = function () {
          // Same answer whether or not the address exists — never reveal who is on the roster
          box.innerHTML = state('empty', 'Check your email', 'If ' + email + ' is set up for the app, a sign-in link is on its way. Open it on this phone. It works for 10 minutes.',
            '<button class="btn btn--ghost" type="button" data-again>Use a different email</button>') + memberHelpHtml(false);
        };
        memberFetch('/auth/v1/otp?redirect_to=' + encodeURIComponent(location.origin + '/app/my'), { email: email, create_user: false }).then(done, done);
      });
    }
    function signOut() {
      var s = memberSession();
      if (s) memberFetch('/auth/v1/logout', {}, s.access).catch(function () {});
      setMemberSession(null); toast('Signed out'); signInForm();
    }
    var foot = '<div class="actions"><button class="btn btn--ghost" type="button" data-signout>Sign out</button></div>';
    function draw(res) {
      if (res.state === 'linked') {
        return getJSON('/clubs-data.json').catch(function () { return { clubs: [] }; }).then(function (cd) {
          var m = res.member, club = m.club && (cd.clubs || []).filter(function (c) { return c.id === m.club.id; })[0];
          box.innerHTML = memberCardHtml(m, club) + foot; wireChange();
          box.querySelectorAll('img[data-hide-on-error]').forEach(function (img) { img.addEventListener('error', function () { img.parentNode.hidden = true; }); });
          var input = box.querySelector('#m-photo');
          box.querySelector('[data-photo]').addEventListener('click', function () { input.click(); });
          input.addEventListener('change', function () {
            if (!input.files[0]) return;
            savePhoto(input.files[0], m.id).then(function () { draw(res); toast('Photo added to your card'); }, function () { toast('That photo couldn’t be used. Try another.'); });
          });
          var rm = box.querySelector('[data-photo-remove]');
          if (rm) rm.addEventListener('click', function () { try { localStorage.removeItem('swd:memberPhoto:' + m.id); } catch (e) {} draw(res); toast('Photo removed'); });
        });
      }
      if (res.state === 'not_open') { box.innerHTML = state('empty', 'Not open yet', 'Member sign-in is being tested and will open soon.') + foot; return; }
      if (res.state === 'not_found') { box.innerHTML = state('empty', 'We couldn’t find your membership', 'This email isn’t on the 2026 roster.') + memberHelpHtml(true) + foot; return; }
      if (res.state === 'pending') { box.innerHTML = state('empty', 'Waiting for the Division', 'You asked to link this sign-in to ' + (res.name || 'a member') + '. Because this email is shared, the Division confirms it first. Your membership shows here once it’s done.') + memberHelpHtml(false) + foot; return; }
      if (res.state === 'choose') {
        box.innerHTML = '<p>' + (res.shared ? 'This email is shared by more than one member. Which one are you?' : 'Is this you?') + '</p>' +
          '<ul class="rows rows--cards">' + res.candidates.map(function (c) {
            return '<li><button class="row" type="button" data-claim="' + esc(c.id) + '">' + icon('person') + '<span class="row__main"><span class="row__title">' + esc(c.name) + '</span>' +
              (c.club ? '<span class="row__meta">' + esc(c.club) + '</span>' : '') + '</span><span class="textlink">This is me</span></button></li>';
          }).join('') + '</ul>' +
          (res.shared ? '<p class="footnote">With a shared email, the Division confirms who you are before showing your membership.</p>' : '') + memberHelpHtml(false) + foot;
      }
    }
    function wireChange() {
      var f = box.querySelector('#m-change'); if (!f) return;
      var kind = 'email', input = f.querySelector('#m-value');
      f.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-kind]'); if (!b) return;
        kind = b.getAttribute('data-kind');
        f.querySelectorAll('[data-kind]').forEach(function (x) { x.setAttribute('aria-checked', x === b); });
        input.type = kind === 'email' ? 'email' : 'tel'; input.autocomplete = kind === 'email' ? 'email' : 'tel';
        input.inputMode = kind === 'email' ? 'email' : 'tel';
        f.querySelector('.mfield span').textContent = kind === 'email' ? 'New email' : 'New phone number';
        input.value = ''; input.focus();
      });
      f.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var out = f.querySelector('#m-err'); out.textContent = '';
        if (!input.value.trim()) { out.textContent = kind === 'email' ? 'Enter the new email.' : 'Enter the new phone number.'; input.focus(); return; }
        memberRpc('request_contact_change', { p_kind: kind, p_value: input.value }).then(function (res) { draw(res); toast('Sent to the Division for review'); },
          function (e) { out.textContent = cap(e.message || 'That didn’t work. Try again.'); });
      });
    }
    box.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-signout]')) { signOut(); return; }
      if (ev.target.closest('[data-again]')) { signInForm(); return; }
      var c = ev.target.closest('[data-claim]');
      if (c) { c.disabled = true; memberRpc('claim_member', { p_member: c.getAttribute('data-claim') }).then(draw, function () { c.disabled = false; toast('That didn’t work. Try again.'); }); }
    });

    if (!memberSession()) { signInForm(err); return Promise.resolve(); }
    return memberRpc('my_membership').then(draw, function (e) {
      if (e.status === 401) { setMemberSession(null); signInForm(err); return; }
      box.innerHTML = errorState();
    });
  }

  /* ---------------------------------------------------------------
     Information pages (content/<id>.json) — same renderer rules as
     page.html, laid out for a phone
     --------------------------------------------------------------- */
  // Logo tiles: the original logos at their own proportions, on light plates.
  // A tile is a link only when partners-data.json has an official URL.
  function logoTiles(list) {
    return '<ul class="logotiles">' + list.map(function (o) {
      var img = '<img src="' + esc(o.logo) + '" alt="" width="' + (+o.width || 400) + '" height="' + (+o.height || 200) + '" loading="lazy" decoding="async">';
      var body = '<span class="logotile__plate">' + img + '</span><span class="logotile__name">' + esc(o.name) + '</span>';
      return '<li>' + (safeUrl(o.url)
        ? '<a class="logotile" href="' + esc(o.url) + '" target="_blank" rel="noopener">' + body + '<span class="ext">' + icon('ext', 'i--sm') + 'Website<span class="sr-only"> (opens ' + esc(o.name) + ' website)</span></span></a>'
        : '<div class="logotile">' + body + '</div>') + '</li>';
    }).join('') + '</ul>';
  }
  function partnersHtml(pd) {
    if (!pd) return '';
    return '<section class="page-sec" id="partners" tabindex="-1" aria-labelledby="h-partners"><h2 id="h-partners">Our Partners</h2>' + logoTiles(pd.partners || []) + '</section>' +
      '<section class="page-sec" aria-labelledby="h-memberof"><h2 id="h-memberof">Proud Member of</h2>' + logoTiles(pd.memberOf || []) + '</section>';
  }
  function infoPage(params, id) {
    setTitle('');
    var partners = id === 'about-us' ? getJSON('/partners-data.json').catch(function () { return null; }) : Promise.resolve(null);
    return Promise.all([getJSON('/content/' + encodeURIComponent(id) + '.json'), partners]).then(function (all) {
      var d = all[0], pd = all[1];
      setTitle(d.title || '');
      var fig = function (im) {
        var src = safeUrl(im.src); if (!src) return '';
        return '<figure><img src="' + esc(src) + '" alt="' + esc(im.alt || '') + '" loading="lazy">' + (im.caption ? '<figcaption>' + esc(im.caption) + '</figcaption>' : '') + '</figure>';
      };
      var R = {
        prose: function (s) { return (s.body || []).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join(''); },
        list: function (s) { var t = s.ordered ? 'ol' : 'ul'; return '<' + t + '>' + (s.items || []).map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</' + t + '>'; },
        image: function (s) { return fig(s); },
        gallery: function (s) { return '<div class="gallery">' + (s.images || []).map(fig).join('') + '</div>'; },
        cards: function (s) {
          // People (merged board + contacts): name, role, what they do, one email
          if (s.people) return '<ul class="rows people">' + (s.items || []).map(function (c) {
            return '<li><div class="row person"><span class="row__main"><span class="row__title"><b>' + esc(c.title || '') + '</b></span>' +
              (c.meta ? '<span class="row__meta">' + esc(c.meta) + '</span>' : '') +
              (c.body ? '<span class="person__body">' + esc(c.body) + '</span>' : '') +
              (c.email ? '<a class="person__link" href="mailto:' + esc(c.email) + '">' + icon('mail', 'i--sm') + esc(c.email) + '</a>' : '') +
              (c.phone ? '<a class="person__link" href="' + esc(tel(c.phone)) + '">' + esc(c.phone) + '</a>' : '') + '</span></div></li>';
          }).join('') + '</ul>';
          return '<ul class="rows">' + (s.items || []).map(function (c) {
            var link = safeUrl(c.link);
            var inner = (safeUrl(c.photo) ? '<img class="thumb" src="' + esc(c.photo) + '" alt="" loading="lazy">' : '') +
              '<span class="row__main"><span class="row__title"><b>' + esc(c.title || '') + '</b></span>' +
              (c.meta ? '<span class="row__meta">' + esc(c.meta) + '</span>' : '') +
              (c.body ? '<span style="display:block;margin-top:4px">' + esc(c.body) + '</span>' : '') + '</span>';
            return '<li>' + (link ? '<a class="row" href="' + esc(link) + '"' + (isExternal(link) || /^\//.test(link) ? ' target="_blank" rel="noopener"' : '') + '>' + inner + CHEV + '</a>' : '<div class="row">' + inner + '</div>') + '</li>';
          }).join('') + '</ul>';
        },
        table: function (s) {
          return '<div class="tablewrap" tabindex="0" role="region" aria-label="' + esc(s.heading || 'Table') + '"><table><thead><tr>' + (s.columns || []).map(function (c) { return '<th scope="col">' + esc(c) + '</th>'; }).join('') +
            '</tr></thead><tbody>' + (s.rows || []).map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
        },
        embed: function (s) {
          var url = safeUrl(s.url); if (!url) return '';
          var form = /docs\.google\.com\/forms/.test(url);
          return embedCard(s.heading || (form ? 'Form' : 'Embedded content'), form ? 'A Google Form. Needs a connection.' : 'From Google. Needs a connection.', url, s.height, form ? 'form' : 'content');
        },
        buttons: function (s) {
          return '<div class="actions">' + (s.items || []).map(function (b) {
            var u = safeUrl(b.url); if (!u) return '';
            var a = appLink(u) || { href: u };
            var ext = !/^\/app\b/.test(a.href);
            return '<a class="btn btn--ghost" href="' + esc(a.href) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + (ext ? icon('ext') : '') + esc(b.label || 'Open') + '</a>';
          }).join('') + '</div>';
        },
        contact: function (s) {
          return '<ul class="rows">' + (s.items || []).map(function (c) {
            return '<li><div class="row" style="flex-direction:column;align-items:stretch;gap:2px">' +
              (c.label ? '<span class="row__meta">' + esc(c.label) + '</span>' : '') + (c.name ? '<span class="row__title"><b>' + esc(c.name) + '</b></span>' : '') +
              (c.email ? '<a href="mailto:' + esc(c.email) + '" style="min-height:44px;display:flex;align-items:center;overflow-wrap:anywhere">' + esc(c.email) + '</a>' : '') +
              (c.phone ? '<a href="' + esc(tel(c.phone)) + '" style="min-height:44px;display:flex;align-items:center">' + esc(c.phone) + '</a>' : '') +
              '</div></li>';
          }).join('') + '</ul>';
        }
      };
      var up = parentOf(id);
      view.innerHTML = backLink(up.href, up.label) + '<div class="intro"><h1>' + esc(d.title || '') + '</h1>' + (d.subtitle ? '<p>' + esc(d.subtitle) + '</p>' : '') + '</div>' +
        Logic.mergeRepeatedContacts(d.sections).map(function (s) {
          var r = R[s.type]; if (!r) return '';
          var inner = r(s); if (!inner) return '';
          return '<section class="page-sec">' + (s.heading && s.type !== 'embed' ? '<h2>' + esc(s.heading) + '</h2>' : '') + inner + '</section>';
        }).join('') + partnersHtml(pd);
    });
  }

  /* ---------------------------------------------------------------
     Router
     --------------------------------------------------------------- */
  var ROUTES = [
    [/^\/app\/?$/, home, 'home'],
    [/^\/app\/events\/?$/, eventsList, 'events'],
    [/^\/app\/events\/([^/]+)\/?$/, eventDetail, 'events'],
    [/^\/app\/results\/?$/, resultsList, 'results'],
    [/^\/app\/standings\/?$/, standings, 'results'],
    [/^\/app\/page\/standings\/?$/, standings, 'results'],
    [/^\/app\/results\/([^/]+)\/?$/, resultDetail, 'results'],
    [/^\/app\/watch\/?$/, watch, 'more'],   // Home tile and More → Southwest TV
    [/^\/app\/more\/?$/, more, 'more'],
    [/^\/app\/more\/clubs\/?$/, clubsList, 'more'],
    [/^\/app\/more\/clubs\/([^/]+)\/?$/, clubDetail, 'more'],
    [/^\/app\/more\/news\/?$/, newsList, 'more'],
    [/^\/app\/news\/([a-z0-9-]+)\/?$/, newsArticle, 'more'],
    [/^\/app\/more\/settings\/?$/, settings, 'more'],
    [/^\/app\/my\/?$/, mySwd, 'my'],
    [/^\/app\/more\/membership\/?$/, mySwd, 'my'],   // earlier preview address
    [/^\/app\/more\/(play|division|ladies-day|archives|follow|resources)\/?$/, subsection, 'more'],
    [/^\/app\/signin\/?$/, signInScreen, 'my'],
    [/^\/app\/search\/?$/, searchScreen, 'home'],
    [/^\/app\/page\/([a-z0-9-]+)\/?$/, infoPage, 'more']
  ];
  var scrollMemory = {};
  var renderToken = 0;
  var restoring = false;
  var navDir = null;      // how the next screen arrives: 'fwd', 'back' or 'tab' (null on first load)

  function render() {
    var path = location.pathname, params = new URLSearchParams(location.search);
    var match = null, route = null;
    for (var i = 0; i < ROUTES.length; i++) { match = ROUTES[i][0].exec(path); if (match) { route = ROUTES[i]; break; } }
    if (!route) { history.replaceState(null, '', '/app'); return render(); }
    document.querySelectorAll('.tabbar a').forEach(function (a) {
      if (a.getAttribute('data-tab') === route[2]) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    var token = ++renderToken;
    var fresh = view.cloneNode(false);           // drop listeners left by the last screen
    view.parentNode.replaceChild(fresh, view); view = fresh;
    view.innerHTML = loading();
    // A short slide or fade so screens arrive instead of snapping in
    view.classList.remove('view--fwd', 'view--back', 'view--tab');   // cloneNode copied the last screen's class
    if (navDir) {
      view.classList.add('view--' + navDir);
      var arrived = view;
      setTimeout(function () { arrived.classList.remove('view--fwd', 'view--back', 'view--tab'); }, 400);
      navDir = null;
    }
    var p;
    try { p = route[1](params, match[1] && decodeURIComponent(match[1])); } catch (e) { p = Promise.reject(e); }
    return Promise.resolve(p).catch(function (err) {
      if (token === renderToken) view.innerHTML = errorState(err);
    }).then(function () {
      if (token !== renderToken) return;
      var key = path + location.search;
      var y = (history.state && history.state.y) || scrollMemory[key] || 0;
      window.scrollTo(0, restoring ? y : 0);
      // A link to a section of a screen (e.g. About → #partners) lands on it
      var target = !restoring && location.hash && document.getElementById(location.hash.slice(1));
      if (target) { target.scrollIntoView({ block: 'start' }); target.focus({ preventScroll: true }); }
      restoring = false;
    });
  }

  function go(href, replace) {
    // Remember scroll position on the screen we are leaving
    var cur = location.pathname + location.search;
    scrollMemory[cur] = window.scrollY;
    try { history.replaceState(Object.assign({}, history.state, { y: window.scrollY }), ''); } catch (e) {}
    var depth = (history.state && history.state.depth) || 0;
    if (replace) history.replaceState({ depth: depth }, '', href);
    else history.pushState({ depth: depth + 1, from: cur }, '', href);
    if (!navDir) navDir = replace ? 'tab' : 'fwd';
    return render().then(function () { view.focus({ preventScroll: true }); });
  }

  window.addEventListener('popstate', function () { closeDialog(); restoring = true; navDir = 'back'; render(); });

  document.addEventListener('click', function (ev) {
    // Save / unsave
    var sv = ev.target.closest('[data-save]');
    if (sv) {
      ev.preventDefault();
      var sid = sv.getAttribute('data-save');
      setSaved(sid, !isSaved(sid), sv.getAttribute('data-title') || '');
      return;
    }
    var sh = ev.target.closest('[data-share]');
    if (sh) { share(sh.getAttribute('data-share-title'), sh.getAttribute('data-share')); return; }
    var fo = ev.target.closest('[data-follow]');
    if (fo) { var fid = fo.getAttribute('data-follow'); setFollowing(fid, !isFollowing(fid), fo.getAttribute('data-name') || ''); return; }
    if (ev.target.closest('[data-ics]')) toast('Calendar file saved', 'It’s a one-time copy: it won’t change if the venue or date changes.');
    // Appearance and text size
    var th = ev.target.closest('[data-theme-choice]');
    if (th) { store('theme', th.getAttribute('data-theme-choice')); applyTheme(); return; }
    var sz = ev.target.closest('[data-size]');
    if (sz) {
      store('text', sz.getAttribute('data-size')); applyTextSize();
      markChecked('data-size', sz.getAttribute('data-size'));
      return;
    }
    if (ev.target.closest('[data-notices]')) { noticesDialog(currentNotices); return; }
    // Load an embedded sheet or form on demand
    var em = ev.target.closest('[data-embed]');
    if (em) {
      var box = document.getElementById(em.getAttribute('data-embed'));
      if (!navigator.onLine) { box.innerHTML = '<p class="muted">This needs a connection.</p>'; return; }
      box.innerHTML = '<div class="embed"><iframe src="' + esc(em.getAttribute('data-url')) + '" height="' + em.getAttribute('data-h') + '" title="' + esc(em.getAttribute('data-title')) + '" loading="lazy"></iframe></div>';
      em.remove();
      return;
    }
    // Play a video in place
    var pl = ev.target.closest('[data-play]');
    if (pl) {
      var vid = pl.getAttribute('data-play');
      pl.parentNode.innerHTML = '<div class="player"><iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(vid) + '?autoplay=1&rel=0&playsinline=1" title="' + esc(pl.getAttribute('data-title')) +
        '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>';
      return;
    }
    if (ev.target.closest('[data-retry]')) { cache = {}; render(); return; }

    var a = ev.target.closest('a');
    if (!a || a.target === '_blank' || a.hasAttribute('download') || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
    var href = a.getAttribute('href') || '';
    if (href.charAt(0) === '#' || href.charAt(0) === '?') return;
    if (!/^\/app(\/|$|\?)/.test(href)) return;
    ev.preventDefault();
    if (dlg.contains(a)) closeDialog();
    // Back link: go back in history when we came from inside the app,
    // so the list keeps its filters and scroll position
    if (a.hasAttribute('data-back')) {
      var from = history.state && history.state.from;
      if (from && from.split('?')[0] === href.split('?')[0]) { history.back(); return; }
      navDir = 'back';
      return go(href);
    }
    // Tapping the current tab again returns to the top of that tab
    var tab = a.getAttribute('data-tab');
    if (tab && a.getAttribute('aria-current') === 'page') {
      var root = a.getAttribute('href');
      if (location.pathname === root) { window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); return; }
      navDir = 'tab';
      return go(root);
    }
    // A tab always opens its main screen, so Results means the results
    // list, never the last tournament you looked at
    if (tab) navDir = 'tab';
    go(href);
  });

  document.addEventListener('keydown', function (ev) {
    var r = ev.target.closest && ev.target.closest('[role="radio"]');
    if (!r || ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].indexOf(ev.key) < 0) return;
    ev.preventDefault();
    var all = Array.prototype.slice.call(r.parentNode.querySelectorAll('[role="radio"]'));
    var next = all[(all.indexOf(r) + (ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length];
    next.focus(); next.click();
  });

  applyTheme();
  applyTextSize();
  // Poster thumbnails: YouTube's own still, then the official SW TV logo
  document.addEventListener('error', function (ev) {
    var img = ev.target;
    if (!img || !img.classList || !img.classList.contains('poster__img')) return;
    var still = img.getAttribute('data-still');
    if (still && img.src !== still) { img.src = still; return; }
    img.removeAttribute('data-still');
    img.src = '/photos/home/livestream-tv-logo.png'; img.classList.add('poster__img--logo');
  }, true);
  captureSignIn();
  if (!history.state) history.replaceState({ depth: 0 }, '');
  render();

  // Offline helper (network-first: new versions always win when online)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  }
})();

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
    share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    medal: '<circle cx="12" cy="15" r="5"/><path d="M8.5 11 6 3h4l2 5 2-5h4l-2.5 8"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>'
  };
  function icon(name, cls) {
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
  document.getElementById('theme-btn').addEventListener('click', function () {
    openDialog('Appearance', '<p>Light, dark, or match your phone’s setting.</p>' + themeChoices());
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
        var m = /id=([^&]+)/.exec(t.eventUrl || '');
        var year = (/\b(20\d{2})\b/.exec(t.title + ' ' + t.id) || [])[1] || '';
        return {
          t: t, id: t.id, order: i, eventId: m ? decodeURIComponent(m[1]) : '', year: year,
          cat: categoryOf(t.title), names: (t.divisions || []).map(divisionNames).join(' ')
        };
      });
      RESULTS = { src: d, list: list };
      RESULT_EVENTS = {};
      list.forEach(function (r) { if (r.eventId) RESULT_EVENTS[r.eventId] = true; RESULT_EVENTS[r.id] = true; });
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
  function dateBlock(x, accent) {
    if (!x.dates) return '<span class="dateblock' + (accent ? ' dateblock--accent' : '') + '" aria-hidden="true"><small>TBA</small><b>–</b></span>';
    return '<span class="dateblock' + (accent ? ' dateblock--accent' : '') + '" aria-hidden="true"><small>' +
      fmt(x.dates.start, { month: 'short' }) + '</small><b>' + fmt(x.dates.start, { day: 'numeric' }) + '</b></span>';
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
  function backLink(href, label) {
    return '<a class="back" href="' + esc(href) + '" data-back>' + icon('back', 'i--sm') + esc(label) + '</a>';
  }
  function linkRow(href, iconName, title, meta, opts) {
    opts = opts || {};
    var ext = opts.ext;
    return '<li><a class="row" href="' + esc(href) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + (opts.attrs || '') + '>' +
      (iconName ? icon(iconName) : '') + '<span class="row__main"><span class="row__title">' + esc(title) + '</span>' +
      (meta ? '<span class="row__meta">' + esc(meta) + '</span>' : '') + '</span>' + (ext ? extLabel(opts.extText) : CHEV) + '</a></li>';
  }

  function championPanel(r, cls) {
    var f = firsts(r);
    if (!f.length) return '';
    var eyebrow = f.length === 1 ? (f[0].where ? f[0].where + ' champions' : 'Champions') : f[0].where + ' winners';
    return '<a class="panel' + (cls ? ' ' + cls : '') + '" href="/app/results/' + encodeURIComponent(r.id) + '">' +
      '<span class="eyebrow">' + esc(eyebrow) + '</span>' +
      '<span class="panel__title">' + esc(f[0].who) + '</span>' +
      '<span class="panel__sub">' + esc(shortTitle(r.t.title)) + '</span>' +
      (r.t.meta ? '<span class="panel__meta">' + esc(r.t.meta) + '</span>' : '') +
      (f.length > 1 ? '<span class="panel__meta">+ ' + (f.length - 1) + ' more division winner' + (f.length > 2 ? 's' : '') + '</span>' : '') +
      '</a>';
  }
  function resultRow(r) {
    var f = firsts(r);
    var who = !f.length ? '' : f.length === 1 ? f[0].who : f[0].where + ' winners: ' + f[0].who;
    return '<li><a class="resrow" href="/app/results/' + encodeURIComponent(r.id) + '">' +
      '<span class="resrow__title">' + esc(shortTitle(r.t.title)) + '</span>' +
      (r.t.meta ? '<span class="resrow__meta">' + esc(r.t.meta) + '</span>' : '') +
      (who ? '<span class="resrow__who">' + esc(who) + '</span>' : '') +
      (f.length > 1 ? '<span class="resrow__meta">+ ' + (f.length - 1) + ' more division winner' + (f.length > 2 ? 's' : '') + '</span>' : '') +
      '</a></li>';
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
  // Home is the overview: personal and timely first, community after.
  // Events stays the complete directory.
  //   1 greeting + Find events / My saved events shortcuts
  //   2 Your next games (alerts on saved events lead it)
  //   3 This week · 4 News & community · 5 Around the greens · 6 SW TV
  var CRITICAL = /cancel|postpon|venue|reschedul|new date|moved/i;
  function isCritical(x) { return !!x.e.alert && CRITICAL.test((x.e.alertLabel || '') + ' ' + x.e.alert); }

  function home() {
    setTitle('');
    var today = todayISO();
    return Promise.all([
      loadEvents(),
      loadResults().catch(function () { return []; }),
      getJSON('/streams-data.json').catch(function () { return { streams: [] }; }),
      getJSON('/app-home-data.json').catch(function () { return {}; }),
      getJSON('/news-data.json').catch(function () { return { items: [] }; })
    ]).then(function (all) {
      var data = { events: all[0], results: all[1], streams: all[2].streams || [], story: all[3].feature || null,
        news: all[4].items || [], today: today };
      drawHome(data);
      // Saving or unsaving anywhere on Home redraws it straight away
      view.addEventListener('saved-change', function (ev) {
        var y = window.scrollY;
        drawHome(data);
        window.scrollTo(0, y);
        if (ev.detail && !ev.detail.on) { var h = document.getElementById('h-next'); if (h) h.focus({ preventScroll: true }); }
      });
      checkLiveForHome(data);
    });
  }

  function drawHome(d) {
    var today = d.today;
    var live = d.events.filter(function (x) { var p = eventPhase(x, today); return p === 'upcoming' || p === 'now'; });
    var ids = saved();
    var mine = d.events.filter(function (x) { return ids.indexOf(x.id) >= 0; });
    var mineNext = mine.filter(function (x) { return live.indexOf(x) >= 0; });   // already in date order

    // 1. Greeting and two compact shortcuts — no hero
    var html = '<div class="intro intro--compact"><h1>Your Southwest.</h1><div class="intro__row"><p>On the green. In the game. Together.</p>' +
      '<img class="intro__art" src="/assets/app/art/welcome-bowls.png" alt="" aria-hidden="true" width="181" height="72" decoding="async"></div></div>' +
      '<nav class="shortcuts" aria-label="Shortcuts">' +
      '<a class="shortcut" href="/app/events">' + icon('cal') + '<span>Find events</span></a>' +
      '<a class="shortcut" href="/app/events?show=saved">' + icon('bookmark') + '<span>My saved events</span></a>' +
      '</nav>';

    // 2. Your next games — a cancellation or venue change on a saved event leads
    var myAlerts = mineNext.filter(isCritical);
    currentNotices = live.filter(function (x) { return x.e.alert; });
    var others = currentNotices.filter(function (x) { return myAlerts.indexOf(x) < 0; });
    html += '<section class="section section--first" aria-labelledby="h-next"><div class="section__head"><h2 class="section__title" id="h-next" tabindex="-1">Your next games</h2>' +
      (mine.length ? '<a class="section__more" href="/app/events?show=saved">View saved' + icon('chev', 'i--sm') + '</a>' : '') + '</div>';
    html += myAlerts.map(function (x) {
      return '<a class="alert" href="/app/events/' + encodeURIComponent(x.id) + '">' + icon('alert') +
        '<span><b>' + esc(x.e.alertLabel || 'Update') + ' · ' + esc(x.short) + '</b><span class="alert__text">' + esc(x.e.alert) + '</span></span></a>';
    }).join('');
    if (mineNext.length) {
      html += '<ul class="list">' + mineNext.slice(0, 2).map(function (x) { return gameRow(x, today); }).join('') + '</ul>';
    } else if (mine.length) {
      html += '<div class="invite"><p class="invite__lead">No upcoming saved events.</p>' +
        '<a class="textlink" href="/app/events?show=saved">View saved events' + icon('chev', 'i--sm') + '</a></div>';
    } else {
      html += '<div class="invite invite--art"><img class="invite__art" src="/assets/app/art/saved-empty.png" alt="" aria-hidden="true" width="64" height="64" decoding="async">' +
        '<div><p class="invite__lead">Save events to see your next games here.</p>' +
        '<p class="invite__small">Saving doesn’t register you.</p></div></div>';
    }
    html += '</section>';

    // 3. This week — a deadline or today's event, plus tournament updates
    d.otherNotices = others.length ? '<button class="noticebtn noticebtn--quiet" type="button" data-notices aria-haspopup="dialog">' + icon('bell') +
      '<span data-upd-label>' + updatesLabel(currentNotices) + '</span>' + CHEV + '</button>' : '';
    html += thisWeek(d);

    // 4. News & community — the community story, then the latest news
    var st = d.story;
    var nowMs = Date.now();
    var news = d.news.filter(function (n) { return n.id && !Logic.isExpiredNotice(n, nowMs); })
      .sort(function (a, b) { return (b.date || '') < (a.date || '') ? -1 : 1; }).slice(0, 2);
    if ((st && st.headline) || news.length) {
      html += '<section class="section" aria-labelledby="h-news">' + sectionHead('h-news', 'News & community', '/app/more/news', 'All news');
      if (st && st.headline) {
        var ph = st.photo || {};
        html += '<article class="story" aria-labelledby="h-story">' +
          (safeUrl(ph.src) ? '<figure class="story__fig"><img class="story__img" src="' + esc(ph.src) + '" alt="' + esc(ph.alt || '') + '"' +
            (ph.width && ph.height ? ' width="' + (+ph.width) + '" height="' + (+ph.height) + '"' : '') + ' loading="lazy" decoding="async"' +
            ' style="' + (ph.aspect ? 'aspect-ratio:' + esc(ph.aspect) + ';' : '') + (ph.focus ? 'object-position:' + esc(ph.focus) : '') + '" data-hide-on-error>' +
            '</figure>' : '') +
          (st.eyebrow ? '<p class="eyebrow">' + esc(st.eyebrow) + '</p>' : '') +
          '<h3 class="story__title" id="h-story">' + esc(st.headline) + '</h3>' +
          (st.summary ? '<p class="story__text">' + esc(st.summary) + '</p>' : '') +
          (st.champions && st.champions.length
            ? '<button class="textlink" type="button" data-story aria-haspopup="dialog">' + esc(st.actionLabel || 'Read more') + icon('chev', 'i--sm') + '</button>'
            : st.source && safeUrl(st.source.url) ? '<a class="textlink" href="' + esc(st.source.url) + '" target="_blank" rel="noopener">' + esc(st.actionLabel || 'Read more') + icon('ext', 'i--sm') + '</a>' : '') +
          '</article>';
      }
      if (news.length) {
        html += '<ul class="rows newsrows">' + news.map(function (n) {
          return '<li><a class="row" href="/app/news/' + encodeURIComponent(n.id) + '"><span class="row__main">' +
            (n.date ? '<span class="row__meta">' + esc(fmt(n.date, { month: 'long', day: 'numeric' })) + '</span>' : '') +
            '<span class="row__title">' + esc(n.title) + '</span></span>' + CHEV + '</a></li>';
        }).join('') + '</ul>';
      }
      html += '</section>';
    }

    // 5. Around the greens — the actual latest published result
    var r = d.results[0];
    if (r) {
      var f = firsts(r), w = f[0];
      var label = !w ? '' : f.length === 1 ? (w.where ? w.where + ' champions' : 'Champions') : w.where + ' winners';
      html += '<section class="section" aria-labelledby="h-greens">' + sectionHead('h-greens', 'Around the greens', '/app/results', 'All results') +
        '<a class="achieve" href="/app/results/' + encodeURIComponent(r.id) + '">' +
        (w && w.photo ? '<span class="achieve__frame"><img class="achieve__img" src="' + esc(w.photo) + '" alt="' + esc(w.who) + '" loading="lazy" data-hide-on-error></span>' : '') +
        '<span class="achieve__body"><span class="eyebrow eyebrow--medal">' + icon('medal', 'i--sm') + esc(label || 'Latest result') + '</span>' +
        (w ? '<span class="achieve__who">' + esc(w.who) + '</span>' : '') +
        '<span class="achieve__event">' + esc(shortTitle(r.t.title)) + '</span>' +
        (r.t.meta ? '<span class="achieve__meta">' + esc(r.t.meta) + '</span>' : '') +
        (f.length > 1 ? '<span class="achieve__meta">+ ' + (f.length - 1) + ' more division winner' + (f.length > 2 ? 's' : '') + '</span>' : '') +
        '</span>' + CHEV + '</a></section>';
    }

    // 6. SW TV — live only when YouTube says so; otherwise the next scheduled broadcast
    html += '<div id="home-tv">' + tvSection(d) + '</div>';

    // Small secondary links (existing in-app routes)
    html += '<nav class="minor" aria-label="Get started"><a href="/app/more/clubs">Find a club' + icon('chev', 'i--sm') + '</a>' +
      '<a href="/app/page/learnmore">Learn to bowl' + icon('chev', 'i--sm') + '</a></nav>';

    view.innerHTML = html;
    // Text and actions must still work when a photo doesn't load
    view.querySelectorAll('img[data-hide-on-error]').forEach(function (img) {
      img.addEventListener('error', function () { (img.closest('.story__fig') || img.closest('.achieve__frame') || img).hidden = true; });
    });
    var sb = view.querySelector('[data-story]');
    if (sb) sb.addEventListener('click', function () { storyDialog(d.story); });
  }

  function tvSection(d) {
    var today = d.today, row;
    if (d.liveVideo) {
      row = '<a class="row" href="/app/watch">' + icon('tv') + '<span class="row__main"><span class="live-tag">LIVE</span>' +
        '<span class="row__title" style="margin-top:4px"><b>' + esc(d.liveVideo.title) + '</b></span><span class="row__meta">Streaming now on SW TV</span></span>' + CHEV + '</a>';
    } else {
      var s = d.streams.filter(function (x) { return x.date >= today; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0];
      row = s
        ? '<a class="row" href="/app/watch">' + icon('tv') + '<span class="row__main"><span class="row__title"><b>' + esc(s.title) + '</b></span>' +
          '<span class="row__meta">Scheduled broadcast · ' + esc(s.date === today ? 'Today' : fmt(s.date, { weekday: 'short', month: 'short', day: 'numeric' })) +
          (s.venue ? ' · ' + esc(s.venue) : '') + '</span></span>' + CHEV + '</a>'
        : '<a class="row" href="/app/watch">' + icon('tv') + '<span class="row__main"><span class="row__title"><b>Replays and lessons</b></span>' +
          '<span class="row__meta">Past livestreams and HOW! lessons</span></span>' + CHEV + '</a>';
    }
    return '<section class="section" aria-labelledby="h-tv">' + sectionHead('h-tv', 'SW TV', '/app/watch', 'Watch') +
      '<ul class="rows rows--menu"><li>' + row + '</li></ul></section>';
  }

  // A saved event on Home: date, club, the real entry status, any alert
  function gameRow(x, today) {
    var e = x.e, st = entryStatus(x, today);
    return '<li class="evrow">' + dateBlock(x) +
      '<a class="evrow__main" href="/app/events/' + encodeURIComponent(x.id) + '">' +
      '<span class="evrow__title">' + esc(x.short) + '</span>' +
      '<span class="evrow__meta">' + esc([dateRangeLabel(x.dates, true), x.clubLabel].filter(Boolean).join(' · ')) + '</span>' +
      (st ? statusLine(st) : '') +
      (e.alert ? '<span class="status status--update">' + icon('bell') + esc(e.alertLabel || 'Update') + '</span>' : '') +
      '</a>' + saveBtn(x.id, x.short) + '</li>';
  }

  // One timely item: an entry deadline in the next 7 days, otherwise an
  // event happening today. Broadcasts are in the SW TV section.
  function thisWeek(d) {
    var today = d.today, horizon = addDays(today, 7), item = null;
    var fol = followed();
    var dl = Logic.preferFollowed(
      d.events.map(function (x) { return { x: x, clubIds: x.clubIds, st: entryStatus(x, today) }; })
        .filter(function (o) { return o.st && o.st.kind === 'open' && o.st.close <= horizon; }),
      fol, function (o) { return o.st.close; })[0];
    if (dl) item = { href: '/app/events/' + encodeURIComponent(dl.x.id), date: dl.st.close, kicker: 'Entry deadline',
      title: dl.x.short, meta: 'Entries close ' + fmt(dl.st.close, { weekday: 'long', month: 'long', day: 'numeric' }) + (dl.x.clubLabel ? ' · ' + dl.x.clubLabel : '') };
    if (!item) {
      var t = d.events.filter(function (x) { return eventPhase(x, today) === 'now'; })[0];
      if (t) item = { href: '/app/events/' + encodeURIComponent(t.id), date: today, kicker: 'Today', title: t.short,
        meta: [t.clubLabel, startTime(t.e.time)].filter(Boolean).join(' · ') };
    }
    var notes = d.otherNotices || '';
    // The next event from a club you follow (not already shown, not saved)
    var ids = saved();
    var fromClubs = fol.length ? d.events.filter(function (x) {
      var p = eventPhase(x, today);
      return (p === 'upcoming' || p === 'now') && ids.indexOf(x.id) < 0 && (!item || item.href !== '/app/events/' + encodeURIComponent(x.id)) &&
        x.clubIds.some(function (c) { return fol.indexOf(c) >= 0; });
    })[0] : null;
    if (fromClubs) notes = '<ul class="list"><li class="evrow">' + dateBlock(fromClubs) + '<a class="evrow__main" href="/app/events/' + encodeURIComponent(fromClubs.id) + '">' +
      '<span class="eyebrow">From clubs you follow</span><span class="evrow__title">' + esc(fromClubs.short) + '</span>' +
      '<span class="evrow__meta">' + esc([dateRangeLabel(fromClubs.dates, true), fromClubs.clubLabel].filter(Boolean).join(' · ')) + '</span>' +
      statusLine(entryStatus(fromClubs, today)) + '</a>' + saveBtn(fromClubs.id, fromClubs.short) + '</li></ul>' + notes;
    if (!item && !notes) return '';
    return '<section class="section" aria-labelledby="h-week">' + sectionHead('h-week', 'This week') +
      (item ? '<a class="week" href="' + esc(item.href) + '">' +
      (item.date ? '<span class="dateblock" aria-hidden="true"><small>' + fmt(item.date, { month: 'short' }) + '</small><b>' + fmt(item.date, { day: 'numeric' }) + '</b></span>' : icon('tv')) +
      '<span class="week__body">' + (item.tag || '<span class="eyebrow">' + esc(item.kicker) + '</span>') +
      '<span class="week__title">' + esc(item.title) + '</span><span class="week__meta">' + esc(item.meta) + '</span></span>' + CHEV + '</a>' : '') +
      notes + '</section>';
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
      var segs = [['upcoming', 'Upcoming']].concat(hasPast ? [['past', 'Completed']] : []).concat([['saved', 'Saved']]);
      view.innerHTML =
        '<div class="intro" style="margin-bottom:0"><h1>Events</h1><p>Find your next game.</p></div>' +
        '<div class="segmented" role="group" aria-label="Which events">' + segs.map(function (k) {
          return '<button type="button" data-show="' + k[0] + '" aria-pressed="' + (k[0] === show) + '">' + k[1] + '</button>';
        }).join('') + '</div>' +
        '<label class="search">' + icon('search') + '<span class="sr-only">Search events or clubs</span>' +
        '<input type="search" id="q" placeholder="Search events or clubs" value="' + esc(f.q) + '" autocomplete="off" enterkeyhint="search"></label>' +
        '<div class="filters">' +
        '<label><span class="sr-only">Category</span><select id="f-cat">' + opt('', 'All categories', f.cat) +
        CATS.map(function (c) { return opt(c, c, f.cat); }).join('') + '</select></label>' +
        '<label><span class="sr-only">Club</span><select id="f-club">' + opt('', 'All clubs', f.club) + opt('followed', 'Followed clubs', f.club) +
        Object.keys(clubs).sort(function (a, b) { return clubs[a] < clubs[b] ? -1 : 1; }).map(function (k) { return opt(k, clubs[k], f.club); }).join('') + '</select></label>' +
        '<label><span class="sr-only">Month</span><select id="f-month">' + opt('', 'Any month', f.month) +
        Object.keys(months).sort().map(function (k) { return opt(k, months[k], f.month); }).join('') + '</select></label>' +
        '</div><div id="ev-results"></div>';

      function apply() {
        var qRaw = document.getElementById('q').value.trim(), q = qRaw.toLowerCase();
        var month = document.getElementById('f-month').value;
        var cat = document.getElementById('f-cat').value;
        var club = document.getElementById('f-club').value;
        ['f-month', 'f-cat', 'f-club'].forEach(function (id) { var el = document.getElementById(id); el.classList.toggle('is-set', !!el.value); });
        var sv = saved();
        var list = events.filter(function (x) {
          var p = eventPhase(x, today);
          if (show === 'upcoming' && !(p === 'upcoming' || p === 'now')) return false;
          if (show === 'past' && p !== 'past') return false;
          if (show === 'saved' && sv.indexOf(x.id) < 0) return false;
          if (month && !(x.dates && x.dates.start.slice(0, 7) === month)) return false;
          if (cat && x.cat !== cat) return false;
          if (club === 'followed') { var fol = followed(); if (!x.clubIds.some(function (c) { return fol.indexOf(c) >= 0; })) return false; }
          else if (club && x.clubId !== club) return false;
          if (q && (x.e.title + ' ' + (x.e.subtitle || '') + ' ' + x.club + ' ' + x.clubLabel + ' ' + (x.e.format || '') + ' ' + (x.e.club && x.e.club.address || '')).toLowerCase().indexOf(q) < 0) return false;
          return true;
        });
        if (show === 'past') list = list.slice().reverse();
        var filtered = q || month || cat || club;
        var out = document.getElementById('ev-results');
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
              (up.length ? '<ul class="list">' + up.map(function (x) { return eventRow(x, today); }).join('') + '</ul>'
                : '<p class="muted" style="margin:12px 0">No upcoming saved events.</p>') +
              (past.length ? '<h2 class="group-title" id="h-past">Past</h2><ul class="list" aria-labelledby="h-past">' + past.map(function (x) { return eventRow(x, today); }).join('') + '</ul>' : '');
          } else {
            out.innerHTML = head + '<ul class="list">' + list.map(function (x) { return eventRow(x, today); }).join('') + '</ul>';
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
      ['f-month', 'f-cat', 'f-club'].forEach(function (id) { document.getElementById(id).addEventListener('change', apply); });
      view.addEventListener('click', function (ev) {
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
    return Promise.all([loadEvents(), loadResults().catch(function () { return []; })]).then(function (all) {
      var x = all[0].filter(function (y) { return y.id === id; })[0];
      if (!x) {
        view.innerHTML = backLink('/app/events', 'Events') + state('empty', 'We couldn’t find that event', 'It may have been renamed or removed.',
          '<a class="btn" href="/app/events">See all events</a>');
        return;
      }
      var e = x.e, phase = eventPhase(x, today), st = entryStatus(x, today);
      var result = all[1].filter(function (r) { return r.eventId === id; })[0];
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
      var html = backLink('/app/events', 'Events') +
        '<p class="eyebrow">' + esc(e.subtitle || season) + '</p>' +
        '<h1 class="detail-title">' + esc(e.title) + '</h1>' +
        (x.club ? '<p>' + esc(x.club) + '</p>' : '') +
        '<div class="detail-date">' + dateBlock(x, true) + '<div><b>' + esc(e.date || 'Date to be announced') + '</b>' + statusLine(st) + '</div></div>';
      if (e.alert) html += '<div class="note" role="note"><b>' + esc(e.alertLabel || 'Update') + '</b>' + esc(e.alert) + '</div>';

      html += '<div class="segmented" role="tablist" aria-label="Event sections">' + tabs.map(function (t) {
        return '<button type="button" role="tab" id="tab-' + t[0] + '" aria-controls="panel" aria-selected="' + (t[0] === tab) + '" tabindex="' + (t[0] === tab ? 0 : -1) + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div><div id="panel" role="tabpanel" tabindex="-1"></div>';
      view.innerHTML = html;

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
    if (phase !== 'past') acts.push('<a class="btn btn--split btn--primary-wide" href="?tab=entry" data-goto-tab="entry">Entry details' + icon('chev') + '</a>');
    else if (hasResult) acts.push('<a class="btn btn--split btn--primary-wide" href="?tab=results" data-goto-tab="results">See the results' + icon('chev') + '</a>');
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
    return loadResults().then(function (list) {
      var f = { q: params.get('q') || '', cat: params.get('cat') || '', year: params.get('year') || '' };
      var years = {}; list.forEach(function (r) { if (r.year) years[r.year] = 1; });
      function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>'; }
      view.innerHTML = '<div class="intro"><h1>Results</h1><p>Celebrating Southwest bowlers.</p></div>' +
        (list.length ? championPanel(list[0]) : '') +
        '<section class="section" aria-labelledby="h-latest">' + sectionHead('h-latest', 'Latest results') +
        '<label class="search">' + icon('search') + '<span class="sr-only">Search results</span>' +
        '<input type="search" id="q" placeholder="Search tournaments or players" value="' + esc(f.q) + '" autocomplete="off" enterkeyhint="search"></label>' +
        '<div class="filters">' +
        '<label><span class="sr-only">Category</span><select id="f-cat">' + opt('', 'All categories', f.cat) + CATS.map(function (c) { return opt(c, c, f.cat); }).join('') + '</select></label>' +
        '<label><span class="sr-only">Year</span><select id="f-year">' + opt('', 'All years', f.year) + Object.keys(years).sort().reverse().map(function (y) { return opt(y, y, f.year); }).join('') + '</select></label>' +
        '</div><div id="res-list"></div></section>' +
        '<ul class="rows" style="margin-top:24px">' + linkRow('/archive', 'doc', '2022–2025 results', 'The results archive', { ext: true }) + '</ul>';
      function apply() {
        var qRaw = document.getElementById('q').value.trim(), q = qRaw.toLowerCase();
        var cat = document.getElementById('f-cat').value, year = document.getElementById('f-year').value;
        ['f-cat', 'f-year'].forEach(function (id) { var el = document.getElementById(id); el.classList.toggle('is-set', !!el.value); });
        var out = list.filter(function (r) {
          if (cat && r.cat !== cat) return false;
          if (year && r.year !== year) return false;
          if (q && (r.t.title + ' ' + (r.t.meta || '') + ' ' + r.names).toLowerCase().indexOf(q) < 0) return false;
          return true;
        });
        var filtered = q || cat || year;
        document.getElementById('res-list').innerHTML = out.length
          ? '<p class="count" aria-live="polite">' + out.length + ' tournament' + (out.length === 1 ? '' : 's') + (filtered ? ' <button class="clear" type="button" data-clear>Clear filters</button>' : '') + '</p><ul class="list">' + out.map(resultRow).join('') + '</ul>'
          : state('empty', 'No results match', 'Try a different name or clear the filters.', '<button class="btn btn--ghost" type="button" data-clear>Clear filters</button>');
        var u = new URLSearchParams();
        if (q) u.set('q', qRaw); if (cat) u.set('cat', cat); if (year) u.set('year', year);
        history.replaceState(history.state, '', '/app/results' + (u.toString() ? '?' + u : ''));
      }
      var t;
      document.getElementById('q').addEventListener('input', function () { clearTimeout(t); t = setTimeout(apply, 150); });
      document.getElementById('f-cat').addEventListener('change', apply);
      document.getElementById('f-year').addEventListener('change', apply);
      view.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-clear]')) {
          document.getElementById('q').value = ''; document.getElementById('f-cat').value = ''; document.getElementById('f-year').value = ''; apply();
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
  function checkLiveForHome(d) {
    ytData().then(function (vids) {
      d.liveVideo = vids.filter(function (v) { return v.state === 'live'; })[0] || null;
      var slot = document.getElementById('home-tv');
      if (d.liveVideo && slot) slot.innerHTML = tvSection(d);
    }).catch(function () {});
  }
  function fmtTime(isoStr, withTime) {
    var o = { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' };
    if (withTime) { o.hour = 'numeric'; o.minute = '2-digit'; }
    return new Intl.DateTimeFormat('en-US', o).format(new Date(isoStr));
  }
  // Video players load only when someone taps play
  function poster(v, tagHtml, meta) {
    return '<div class="video"><div><button class="poster" type="button" data-play="' + esc(v.id) + '" data-title="' + esc(v.title) + '" style="background-image:url(\'' + esc(v.thumb) + '\')" aria-label="Play: ' + esc(v.title) + '">' +
      (tagHtml || '') + '<span class="poster__play" aria-hidden="true">' + playSvg() + '</span></button></div>' +
      '<p class="video-title">' + esc(v.title) + '</p>' + (meta ? '<p class="video-meta">' + esc(meta) + '</p>' : '') + '</div>';
  }
  function watch() {
    setTitle('Watch');
    var today = todayISO();
    view.innerHTML = '<div class="intro"><h1>SW TV</h1><p>Livestreams, replays and HOW! lessons from Southwest Bowls.</p></div>' +
      '<div id="w-next"></div><div id="w-live">' + loading() + '</div><div id="w-plan"></div><div id="w-recent"></div>' +
      '<section class="section"><ul class="rows">' +
      linkRow(YT_CHANNEL_URL, 'tv', 'SW TV on YouTube', 'Subscribe to get notified when we go live', { ext: true, extText: 'YouTube' }) +
      linkRow('https://www.youtube.com/playlist?list=PLHSDPOGEH8batQ10BOOCBnrK-msAl-FUO', 'info', 'HOW! Lessons playlist', 'Learn to read the head and more', { ext: true, extText: 'YouTube' }) +
      '</ul></section>';

    getJSON('/streams-data.json').then(function (d) {
      var plan = (d.streams || []).filter(function (s) { return s.date >= today; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(0, 5);
      if (!plan.length) return;
      var n = plan[0];
      document.getElementById('w-next').innerHTML = '<article class="watch-card"><span class="watch-card__icon">' + icon('tv') + '</span>' +
        '<p class="eyebrow">Next scheduled broadcast</p><h2>' + esc(n.title) + '</h2>' +
        '<p>' + esc(n.date === today ? 'Today' : fmt(n.date, { weekday: 'long', month: 'long', day: 'numeric' })) + (n.venue ? '<br>' + esc(n.venue) : '') + '</p>' +
        '<a class="btn btn--split btn--block" href="' + esc(safeUrl(n.link) || YT_CHANNEL_URL) + '" target="_blank" rel="noopener">Open SW TV' + icon('ext') + '</a></article>';
      if (plan.length > 1) {
        document.getElementById('w-plan').innerHTML = '<section class="section" aria-labelledby="h-plan">' + sectionHead('h-plan', 'Coming to SW TV') + '<ul class="list">' +
          plan.slice(1).map(function (s) {
            return '<li class="evrow"><span class="dateblock" aria-hidden="true"><small>' + fmt(s.date, { month: 'short' }) + '</small><b>' + fmt(s.date, { day: 'numeric' }) + '</b></span>' +
              '<span class="evrow__main"><span class="evrow__title">' + esc(s.title) + '</span><span class="evrow__meta">' + esc(fmt(s.date, { weekday: 'long', month: 'long', day: 'numeric' })) + (s.venue ? ' · ' + esc(s.venue) : '') + '</span></span></li>';
          }).join('') + '</ul></section>';
      }
      document.getElementById('w-plan').insertAdjacentHTML('beforeend', '<p class="muted" style="margin-top:12px">Planned dates from the SW TV schedule; schedules may change. A stream shows as live only when YouTube says it is.</p>');
    }).catch(function () {});

    return ytData().then(function (vids) {
      var live = vids.filter(function (v) { return v.state === 'live'; });
      var upcoming = vids.filter(function (v) { return v.state === 'upcoming'; });
      var recent = vids.filter(function (v) { return v.state === 'none'; }).slice(0, 6);
      var top = '';
      if (live.length) top += '<section class="section" aria-labelledby="h-live">' + sectionHead('h-live', 'Live now') + '<div class="videos">' + live.map(function (v) { return poster(v, '<span class="live-tag">LIVE</span>'); }).join('') + '</div></section>';
      if (upcoming.length) top += '<section class="section" aria-labelledby="h-sched">' + sectionHead('h-sched', 'Scheduled on YouTube') + '<div class="videos">' +
        upcoming.map(function (v) { return poster(v, '<span class="tag">' + icon('clock', 'i--sm') + esc(v.scheduled ? fmtTime(v.scheduled, true) : 'Scheduled') + '</span>'); }).join('') + '</div></section>';
      if (!live.length && !upcoming.length) top += '<p class="muted" style="margin-top:16px">Nothing is live right now. When SW TV goes live, it shows here.</p>';
      document.getElementById('w-live').innerHTML = top;
      if (recent.length) document.getElementById('w-recent').innerHTML = '<section class="section" aria-labelledby="h-rec">' + sectionHead('h-rec', 'Replays & videos') + '<div class="videos">' +
        recent.map(function (v) { return poster(v, v.wasLive ? '<span class="tag">Replay</span>' : '', fmtTime(v.when)); }).join('') + '</div></section>';
    }).catch(function () {
      document.getElementById('w-live').innerHTML = '<p class="muted" style="margin-top:16px">' +
        (navigator.onLine ? 'Videos didn’t load. Open SW TV on YouTube instead.' : 'Videos need a connection.') + '</p>';
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
    var web = /^https?:/i.test(href) || !/^\/app\b/.test(href);
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
    play: { title: 'Play & learn', icon: 'flag', rows: function () {
      return [['/app/page/learnmore', 'Learn to bowl'], ['/app/page/coachinghub', 'Coaching'], ['/app/page/umpires', 'Umpires'], ['/app/page/markers', 'Markers']];
    } },
    division: { title: 'Division information', icon: 'info', rows: function (nav) {
      var st = navFind(nav, function (h) { return h === '/standings'; });
      var ag = navFind(nav, function (h) { return /^\/20\d{2}-season-agenda$/.test(h); });
      var y = yearOf(st && st.label);
      return [['/app/page/about-us', 'About Southwest'],
        ['/app/page/standings', (y ? y + ' standings' : 'Standings')],
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
    follow: { title: 'Follow us', icon: 'people', rows: function () {
      return [[YT_CHANNEL_URL, 'YouTube · SW TV', 'tv'], [FACEBOOK_URL, 'Facebook', 'people']];
    } }
  };
  // Which subsection an information page belongs to, for its Back link
  function parentOf(pageId) {
    var hit = null;
    ['play', 'division', 'ladies-day'].forEach(function (k) {
      SUBSECTIONS[k].rows({ items: [] }).forEach(function (r) { if (r[0] === '/app/page/' + pageId) hit = k; });
    });
    if (pageId === 'standings') hit = 'division';
    return hit ? { href: '/app/more/' + hit, label: SUBSECTIONS[hit].title } : { href: '/app/more', label: 'More' };
  }

  function more() {
    setTitle('More');
    var today = todayISO();
    return loadEvents().catch(function () { return []; }).then(function (events) {
      currentNotices = events.filter(function (x) { var p = eventPhase(x, today); return x.e.alert && (p === 'upcoming' || p === 'now'); });
      var n = currentNotices.length;
      var html = '<div class="intro"><h1>More</h1></div>' +
        menuGroup('h-quick', 'Quick access',
          menuRow('/app/events?show=saved', 'bookmark', 'Saved events') +
          menuRow('/app/more/clubs', 'pin', 'Find a club') +
          '<li><button class="row" type="button" data-notices aria-haspopup="dialog">' + icon('bell') +
            '<span class="row__main"><span class="row__title">Tournament updates</span>' + (n ? '<span class="row__meta" data-upd-label="short">' + updatesShort(currentNotices) + '</span>' : '') + '</span>' + CHEV + '</button></li>') +
        menuGroup('h-explore', 'Explore Southwest',
          menuRow('/app/more/play', 'flag', 'Play & learn') +
          menuRow('/app/more/news', 'news', 'News') +
          menuRow('/app/more/division', 'info', 'Division information') +
          menuRow('/app/more/ladies-day', 'people', 'Ladies Day') +
          menuRow('/app/more/archives', 'archive', 'Archives')) +
        menuGroup('h-help', 'Help & settings',
          menuRow('/app/page/contact-us', 'mail', 'Contact') +
          menuRow('/app/more/settings', 'sliders', 'App settings')) +
        '<ul class="rows rows--menu rows--quiet">' +
          menuRow('/app/more/follow', 'tv', 'Follow us') +
          menuRow('/', 'globe', 'Southwest website') +
        '</ul>';
      view.innerHTML = html;
    });
  }

  function subsection(params, key) {
    var sec = SUBSECTIONS[key];
    if (!sec) { history.replaceState(history.state, '', '/app/more'); return more(); }
    setTitle(sec.title);
    return getJSON('/nav-data.json').catch(function () { return { items: [] }; }).then(function (nav) {
      var rows = sec.rows(nav);
      view.innerHTML = backLink('/app/more', 'More') + '<div class="intro"><h1>' + esc(sec.title) + '</h1></div>' +
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
      var link = appLink(n.link || '');
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

  function clubsList(params) {
    setTitle('Clubs');
    return getJSON('/clubs-data.json').then(function (d) {
      var clubs = d.clubs || [];
      var q0 = params.get('q') || '';
      view.innerHTML = backLink('/app/more', 'More') + '<div class="intro"><h1>Clubs</h1><p>Cambria to Coronado.</p></div>' +
        '<label class="search">' + icon('search') + '<span class="sr-only">Search clubs</span>' +
        '<input type="search" id="q" placeholder="Search by club or city" value="' + esc(q0) + '" autocomplete="off"></label><div id="c-list"></div>';
      function apply() {
        var q = document.getElementById('q').value.trim().toLowerCase();
        var list = clubs.filter(function (c) { return !q || (c.name + ' ' + c.city + ' ' + (c.summary || '')).toLowerCase().indexOf(q) >= 0; });
        document.getElementById('c-list').innerHTML = list.length ? '<p class="count">' + list.length + ' club' + (list.length === 1 ? '' : 's') + '</p><ul class="rows">' + list.map(function (c) {
          return linkRow('/app/more/clubs/' + slugify(c.name), isFollowing(c.id || slugify(c.name)) ? 'star' : 'pin', c.name, c.city + (c.status === 'private' ? ' · Private club' : '') + (isFollowing(c.id || slugify(c.name)) ? ' · Following' : ''));
        }).join('') + '</ul>' : state('empty', 'No clubs match', 'Try another name or city.');
        history.replaceState(history.state, '', '/app/more/clubs' + (q ? '?q=' + encodeURIComponent(document.getElementById('q').value.trim()) : ''));
      }
      document.getElementById('q').addEventListener('input', apply);
      apply();
    });
  }
  function clubDetail(params, slug) {
    setTitle('Club');
    return getJSON('/clubs-data.json').then(function (d) {
      var c = (d.clubs || []).filter(function (x) { return slugify(x.name) === slug; })[0];
      if (!c) { view.innerHTML = backLink('/app/more/clubs', 'Clubs') + state('empty', 'Club not found', '', '<a class="btn" href="/app/more/clubs">All clubs</a>'); return; }
      setTitle(c.name);
      var maps = c.lat && c.lng ? 'https://www.google.com/maps/search/?api=1&query=' + c.lat + ',' + c.lng : '';
      var acts = [];
      if (maps) acts.push('<a class="btn btn--split btn--primary-wide" href="' + maps + '" target="_blank" rel="noopener">Directions' + icon('ext') + '</a>');
      if (c.phone) acts.push('<a class="btn btn--ghost" href="' + esc(tel(c.phone)) + '">' + icon('phone') + 'Call</a>');
      if (c.email) acts.push('<a class="btn btn--ghost" href="mailto:' + esc(c.email) + '">' + icon('mail') + 'Email</a>');
      if (safeUrl(c.website)) acts.push('<a class="btn btn--ghost" href="' + esc(c.website) + '" target="_blank" rel="noopener">' + icon('globe') + 'Website</a>');
      var cid = c.id || slugify(c.name);
      view.innerHTML = backLink('/app/more/clubs', 'Clubs') + '<p class="eyebrow">' + esc(c.city) + (c.status === 'private' ? ' · Private club' : '') + '</p>' +
        '<h1 class="detail-title">' + esc(c.name) + '</h1>' +
        '<div class="actions">' + acts.join('') + followBtn(cid, c.name) + '</div>' +
        '<p class="muted" style="margin-top:8px">Following is saved on this phone and puts this club’s events first. It doesn’t turn on notifications.</p>' +
        (c.summary ? '<section class="block"><p><b>' + esc(c.summary) + '</b></p>' + (c.details ? '<p>' + esc(c.details) + '</p>' : '') + '</section>' : c.details ? '<section class="block"><p>' + esc(c.details) + '</p></section>' : '') +
        ((c.phone || c.email) ? '<section class="block"><h2>Contact</h2><ul class="rows">' +
          (c.phone ? linkRow(tel(c.phone), 'phone', c.phone) : '') +
          (c.email ? linkRow('mailto:' + c.email, 'mail', c.email) : '') +
          '</ul></section>' : '');
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
     Information pages (content/<id>.json) — same renderer rules as
     page.html, laid out for a phone
     --------------------------------------------------------------- */
  function infoPage(params, id) {
    setTitle('');
    return getJSON('/content/' + encodeURIComponent(id) + '.json').then(function (d) {
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
        (d.sections || []).map(function (s) {
          var r = R[s.type]; if (!r) return '';
          var inner = r(s); if (!inner) return '';
          return '<section class="page-sec">' + (s.heading && s.type !== 'embed' ? '<h2>' + esc(s.heading) + '</h2>' : '') + inner + '</section>';
        }).join('');
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
    [/^\/app\/results\/([^/]+)\/?$/, resultDetail, 'results'],
    [/^\/app\/watch\/?$/, watch, 'watch'],
    [/^\/app\/more\/?$/, more, 'more'],
    [/^\/app\/more\/clubs\/?$/, clubsList, 'more'],
    [/^\/app\/more\/clubs\/([^/]+)\/?$/, clubDetail, 'more'],
    [/^\/app\/more\/news\/?$/, newsList, 'more'],
    [/^\/app\/news\/([a-z0-9-]+)\/?$/, newsArticle, 'more'],
    [/^\/app\/more\/settings\/?$/, settings, 'more'],
    [/^\/app\/more\/(play|division|ladies-day|archives|follow)\/?$/, subsection, 'more'],
    [/^\/app\/page\/([a-z0-9-]+)\/?$/, infoPage, 'more']
  ];
  var scrollMemory = {};
  var renderToken = 0;
  var restoring = false;
  var tabMemory = {};

  function render() {
    var path = location.pathname, params = new URLSearchParams(location.search);
    var match = null, route = null;
    for (var i = 0; i < ROUTES.length; i++) { match = ROUTES[i][0].exec(path); if (match) { route = ROUTES[i]; break; } }
    if (!route) { history.replaceState(null, '', '/app'); return render(); }
    document.querySelectorAll('.tabbar a').forEach(function (a) {
      if (a.getAttribute('data-tab') === route[2]) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    // Remember where each tab was, so tapping the tab returns there
    tabMemory[route[2]] = path + location.search;
    var token = ++renderToken;
    var fresh = view.cloneNode(false);           // drop listeners left by the last screen
    view.parentNode.replaceChild(fresh, view); view = fresh;
    view.innerHTML = loading();
    var p;
    try { p = route[1](params, match[1] && decodeURIComponent(match[1])); } catch (e) { p = Promise.reject(e); }
    return Promise.resolve(p).catch(function (err) {
      if (token === renderToken) view.innerHTML = errorState(err);
    }).then(function () {
      if (token !== renderToken) return;
      var key = path + location.search;
      var y = (history.state && history.state.y) || scrollMemory[key] || 0;
      window.scrollTo(0, restoring ? y : 0);
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
    render().then(function () { view.focus({ preventScroll: true }); });
  }

  window.addEventListener('popstate', function () { closeDialog(); restoring = true; render(); });

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
      return go(href);
    }
    // Tapping the current tab again returns to the top of that tab
    var tab = a.getAttribute('data-tab');
    if (tab && a.getAttribute('aria-current') === 'page') {
      var root = a.getAttribute('href');
      if (location.pathname === root) { window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); return; }
      return go(root);
    }
    if (tab && tabMemory[tab]) return go(tabMemory[tab]);
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
  if (!history.state) history.replaceState({ depth: 0 }, '');
  render();

  // Offline helper (network-first: new versions always win when online)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  }
})();

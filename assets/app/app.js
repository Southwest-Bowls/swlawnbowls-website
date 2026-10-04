/* ============================================================
   app.js — the Southwest Bowls phone app (served at /app).

   One small single-page app with no framework and no build step.
   Every screen is drawn from the website's own data files, so there
   is nothing extra to maintain: publish to events-data.json or
   results-data.json and the app shows it the next time it opens.

   Screens (all under /app):
     /app                     Home dashboard
     /app/events              Event list   (?q= &month= &cat= &club= &show=)
     /app/events/<id>         Event detail (?tab=overview|entries|draw|results)
     /app/results             Results list (?q= &cat=)
     /app/results/<id>        Results for one tournament
     /app/watch               Live, scheduled and recent video
     /app/more                Division information, clubs, settings
     /app/more/clubs[/<slug>] Club directory
     /app/more/settings       Text size, saved events, offline copies
     /app/page/<id>           An information page from content/<id>.json

   Rules this file keeps:
   - Dates are worked out in California time (America/Los_Angeles).
   - Entry status comes only from a real deadline. A future event is
     never assumed to be open.
   - "Live" is shown only when YouTube itself says a stream is live.
   - Saved copies used offline are labelled with when they were saved.
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

  var view = document.getElementById('view');
  var topbar = document.getElementById('topbar');
  var netbar = document.getElementById('netbar');

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

  var ICON = {
    chev: '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>',
    ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    people: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.2A5 5 0 0 1 21 19"/></svg>',
    fee: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/></svg>',
    alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7"/></svg>',
    hourglass: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12M6 21h12M7 3c0 5 10 6 10 9s-10 4-10 9M17 3c0 5-10 6-10 9"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>',
    map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7z"/><path d="M9 4v13M15 7v13"/></svg>',
    doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M8.5 13h7M8.5 17h7"/></svg>',
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6 8.5 7 8.5-7"/></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2"/></svg>',
    globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>',
    tv: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="13" rx="2.5"/><path d="m10 9 5 2.5-5 2.5z"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/></svg>',
    gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>'
  };
  function rowIcon(name) { return ICON[name].replace('<svg ', '<svg class="row__icon" '); }
  function extLabel(text) { return '<span class="ext">' + ICON.ext + esc(text || 'Opens website') + '</span>'; }

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

  var EVENTS = null;
  function loadEvents() {
    return getJSON('/events-data.json').then(function (d) {
      if (EVENTS && EVENTS.src === d) return EVENTS.list;
      var list = (d.events || []).filter(function (e) { return e.id && e.title && !/^paypal-test/.test(e.id); })
        .map(decorateEvent);
      list.sort(function (a, b) { return (a.dates ? a.dates.start : '9') < (b.dates ? b.dates.start : '9') ? -1 : 1; });
      EVENTS = { src: d, list: list };
      return list;
    });
  }
  function decorateEvent(e) {
    var dates = parseDates(e.date);
    var text = (e.title + ' ' + (e.subtitle || '')).toLowerCase();
    var cat = /women/.test(text) ? "Women's" : /\bmen['’]?s?\b/.test(text) ? "Men's" : /mixed|mix\/match|mix-match/.test(text) ? 'Mixed' : 'Open';
    return { e: e, id: e.id, dates: dates, cat: cat, club: (e.club && e.club.name) || '' };
  }
  function eventPhase(x, today) {
    if (!x.dates) return 'unknown';
    if (x.dates.end < today) return 'past';
    if (x.dates.start <= today) return 'now';
    return 'upcoming';
  }
  // Entry status: only from a real, parseable deadline.
  function entryStatus(x, today) {
    var e = x.e, phase = eventPhase(x, today);
    if (phase === 'past') return { kind: 'done', label: 'Completed', icon: 'check', cls: '' };
    if (phase === 'now') return { kind: 'now', label: 'Happening now', icon: 'flag', cls: 'badge--blue' };
    var dl = e.deadline ? parseDates(!/\b20\d{2}\b/.test(e.deadline) && x.dates ? e.deadline + ' ' + x.dates.start.slice(0, 4) : e.deadline) : null;
    if (!dl) return null;
    var close = dl.start;
    if (today > close) return { kind: 'closed', label: 'Entry deadline passed', icon: 'lock', cls: 'badge--red' };
    var left = daysBetween(today, close);
    var label = left === 0 ? 'Entries close today' : left === 1 ? 'Entries close tomorrow'
      : 'Entries close ' + fmt(close, { month: 'short', day: 'numeric' });
    return { kind: 'closing', label: label, icon: 'hourglass', cls: left <= 7 ? 'badge--orange' : 'badge--green' };
  }
  function badge(st) {
    if (!st) return '';
    return '<span class="badge ' + st.cls + '">' + ICON[st.icon] + esc(st.label) + '</span>';
  }

  var RESULTS = null;
  function loadResults() {
    return getJSON('/results-data.json').then(function (d) {
      if (RESULTS && RESULTS.src === d) return RESULTS.list;
      var list = (d.tournaments || []).map(function (t, i) {
        var m = /id=([^&]+)/.exec(t.eventUrl || '');
        var text = (t.title || '').toLowerCase();
        var year = (/\b(20\d{2})\b/.exec(t.title + ' ' + t.id) || [])[1] || '';
        return {
          t: t, id: t.id, order: i, eventId: m ? decodeURIComponent(m[1]) : '', year: year,
          cat: /women/.test(text) ? "Women's" : /\bmen['’]?s?\b/.test(text) ? "Men's" : /mixed|mix\/match/.test(text) ? 'Mixed' : 'Open',
          names: (t.divisions || []).map(divisionNames).join(' ')
        };
      });
      RESULTS = { src: d, list: list };
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
  function winnersLine(r) {
    var firsts = [];
    (r.t.divisions || []).forEach(function (dv) {
      var g = divisionPlaces(dv)[0];
      var p = g && g.places.filter(function (x) { return +x.rank === 1; })[0];
      if (p) firsts.push({ who: p.names, where: dv.label });
    });
    if (!firsts.length) return '';
    var html = '<b>' + esc(firsts[0].who) + '</b>' + (firsts.length > 1 ? ' · ' + esc(firsts[0].where) : '');
    if (firsts.length > 1) html += ' <span>+ ' + (firsts.length - 1) + ' more</span>';
    return html;
  }

  /* ---------------------------------------------------------------
     Saved events (no account — kept on this phone)
     --------------------------------------------------------------- */
  function saved() { return store('saved') || []; }
  function isSaved(id) { return saved().indexOf(id) >= 0; }
  function toggleSaved(id) {
    var s = saved(), i = s.indexOf(id);
    if (i >= 0) s.splice(i, 1); else s.push(id);
    store('saved', s);
    toast(i >= 0 ? 'Removed from Saved' : 'Saved on this phone. This doesn’t enter you in the event.');
    return i < 0;
  }
  function saveBtn(id, title) {
    var on = isSaved(id);
    return '<button class="iconbtn" type="button" data-save="' + esc(id) + '" aria-pressed="' + on + '" aria-label="' +
      (on ? 'Remove ' : 'Save ') + esc(title) + (on ? ' from Saved' : ' to Saved') + '">' + ICON.bookmark + '</button>';
  }

  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }

  /* ---------------------------------------------------------------
     Shared pieces of markup
     --------------------------------------------------------------- */
  function eventRow(x, today) {
    var e = x.e, phase = eventPhase(x, today);
    var tile = x.dates
      ? '<span class="datetile' + (phase === 'past' ? ' datetile--past' : '') + '" aria-hidden="true"><small>' +
        fmt(x.dates.start, { month: 'short' }) + '</small><b>' + fmt(x.dates.start, { day: 'numeric' }) + '</b></span>'
      : '<span class="datetile" aria-hidden="true"><small>TBA</small><b>–</b></span>';
    var meta = [dateRangeLabel(x.dates), x.club].filter(Boolean).join(' · ');
    return '<li><div class="row" style="padding-right:4px">' +
      '<a class="row" style="padding:0;min-height:0" href="/app/events/' + encodeURIComponent(x.id) + '">' + tile +
      '<span class="row__main"><span class="row__title">' + esc(e.title) + '</span>' +
      '<span class="row__meta" style="display:block">' + esc(meta) + (e.format ? ' · ' + esc(cap(e.format)) : '') + '</span>' +
      '<span class="badges">' + badge(entryStatus(x, today)) + (e.alert && phase !== 'past' ? '<span class="badge badge--orange">' + ICON.alert + esc(e.alertLabel || 'Update') + '</span>' : '') + '</span>' +
      '</span></a>' + saveBtn(x.id, e.title) + '</div></li>';
  }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

  function championPhoto(r) {
    var photo = '';
    (r.t.divisions || []).some(function (dv) {
      var g = divisionPlaces(dv)[0];
      var p = g && g.places.filter(function (x) { return +x.rank === 1 && safeUrl(x.photo); })[0];
      if (p) photo = p.photo;
      return !!photo;
    });
    return photo;
  }
  function resultRow(r) {
    var ph = championPhoto(r);
    return '<li><a class="row" href="/app/results/' + encodeURIComponent(r.id) + '">' +
      (ph ? '<img class="thumb" src="' + esc(ph) + '" alt="" loading="lazy" width="64" height="64">' : rowIcon('trophy')) +
      '<span class="row__main"><span class="row__title">' + esc(r.t.title) + '</span>' +
      '<span class="row__meta" style="display:block">' + esc(r.t.meta || '') + '</span>' +
      (winnersLine(r) ? '<span class="winner" style="display:block">Winners: ' + winnersLine(r) + '</span>' : '') +
      '</span>' + ICON.chev + '</a></li>';
  }

  function state(kind, title, body, action) {
    return '<div class="' + kind + '" role="status"><b>' + esc(title) + '</b>' + (body ? '<p>' + esc(body) + '</p>' : '') + (action || '') + '</div>';
  }
  function errorState(err) {
    return state('error', navigator.onLine ? 'This didn’t load' : 'You’re offline',
      navigator.onLine ? 'Check your connection and try again.' : 'This hasn’t been saved on your phone yet. Try again when you have a signal.',
      '<button class="btn" type="button" data-retry>Try again</button>');
  }
  function loading() { return '<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span>Loading…</div>'; }

  /* ---------------------------------------------------------------
     Top bar
     --------------------------------------------------------------- */
  function setTop(opts) {
    var inner;
    if (opts.brand) {
      var hour = +new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(new Date()) % 24;
      var hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      inner = '<div class="topbar__brand"><img src="/assets/app/swd-logo.png" alt="Southwest Bowls" width="65" height="76">' +
        '<div class="hello"><p class="hello__hi">' + hello + '</p>' +
        '<p class="hello__date">' + esc(fmt(todayISO(), { weekday: 'long', month: 'long', day: 'numeric' })) + '</p>' +
        '<p class="hello__tag">Lawn Bowls – A Sport for Life!</p></div></div>';
    } else {
      inner = (opts.back ? '<a class="back" href="' + esc(opts.back.href) + '" data-back>' + ICON.back + '<span>' + esc(opts.back.label) + '</span></a>' : '') +
        '<h1 class="topbar__title">' + esc(opts.title || '') + '</h1>';
    }
    topbar.innerHTML = '<div class="topbar__inner">' + inner + '</div>';
    topbar.classList.toggle('topbar--home', !!opts.brand);
    document.title = (opts.title ? opts.title + ' · ' : '') + 'Southwest Bowls';
  }

  /* ---------------------------------------------------------------
     HOME
     --------------------------------------------------------------- */
  function home() {
    setTop({ brand: true });
    var today = todayISO();
    view.innerHTML = '<h1 class="sr-only">Southwest Bowls home</h1>' + loading();
    return Promise.all([
      loadEvents(),
      loadResults().catch(function () { return []; }),
      getJSON('/news-data.json').catch(function () { return { items: [] }; }),
      getJSON('/streams-data.json').catch(function () { return { streams: [] }; })
    ]).then(function (all) {
      var events = all[0], results = all[1], news = all[2].items || [], streams = all[3].streams || [];
      var live = events.filter(function (x) { var p = eventPhase(x, today); return p === 'upcoming' || p === 'now'; });
      var html = '<h1 class="sr-only">Southwest Bowls home</h1>';

      // 1. Notices — one compact card, one line each (only when one exists)
      var notices = live.filter(function (x) { return x.e.alert; }).slice(0, 3);
      var noticesHtml = notices.length ? '<section class="section" aria-labelledby="h-upd"><div class="updates">' +
        '<p class="updates__head" id="h-upd">' + ICON.alert + 'Updates</p><ul>' + notices.map(function (x) {
          return '<li><a href="/app/events/' + encodeURIComponent(x.id) + '"><span class="updates__text"><b>' + esc(x.e.alertLabel || 'Update') + '</b> · ' +
            esc(shortTitle(x.e.title)) + '</span>' + ICON.chev + '</a></li>';
        }).join('') + '</ul></div></section>' : '';

      // 2. Next tournament
      var next = live[0], heroHtml = '';
      if (next) {
        var e = next.e, st = entryStatus(next, today), phase = eventPhase(next, today);
        var days = next.dates ? daysBetween(today, next.dates.start) : null;
        var when = phase === 'now' ? 'Happening now' : days === 1 ? 'Next tournament · Tomorrow' : days != null ? 'Next tournament · In ' + days + ' days' : 'Next tournament';
        heroHtml = '<section class="section" aria-labelledby="h-next"><article class="hero">' +
          '<a class="hero__top" href="/app/events/' + encodeURIComponent(next.id) + '">' +
          '<p class="hero__kicker" id="h-next">' + (phase === 'now' ? '<span class="dot" aria-hidden="true"></span>' : '') + esc(when) + '</p>' +
          '<h2 class="hero__title">' + esc(e.title) + '</h2>' +
          '<p class="hero__date">' + ICON.cal + esc(dateRangeLabel(next.dates, true) || e.date) + '</p></a>' +
          '<div class="hero__body"><ul class="facts">' +
          (e.time ? '<li>' + ICON.clock + '<span>' + esc(e.time) + '</span></li>' : '') +
          (next.club ? '<li>' + ICON.pin + '<span>' + esc(next.club) + (e.club.address ? '<small>' + esc(e.club.address) + '</small>' : '') + '</span></li>' : '') +
          (e.format ? '<li>' + ICON.people + '<span>' + esc(cap(e.format)) + (e.fee ? '<small>Entry ' + esc(e.fee) + '</small>' : '') + '</span></li>' : '') +
          '</ul>' + (st && phase !== 'now' ? '<div class="badges" style="margin-top:12px">' + badge(st) + '</div>' : '') +
          '<div class="actions"><a class="btn" href="/app/events/' + encodeURIComponent(next.id) + '">' + (phase === 'now' ? 'Event details' : 'Details & how to enter') + '</a>' +
          (e.club && safeUrl(e.club.mapUrl) ? '<a class="btn btn--ghost" href="' + esc(e.club.mapUrl) + '" target="_blank" rel="noopener">' + ICON.map + 'Directions</a>' : '') +
          '</div></div></article></section>';
      }
      html += heroHtml + noticesHtml;

      // 3. Coming up
      var soon = live.slice(1, 5);
      if (soon.length) {
        html += '<section class="section" aria-labelledby="h-soon"><div class="section__head"><h2 class="section__title" id="h-soon">Coming up</h2>' +
          '<a class="section__more" href="/app/events">View all</a></div><ul class="list">' +
          soon.map(function (x) { return eventRow(x, today); }).join('') + '</ul></section>';
      }

      // 4. Recent results
      if (results.length) {
        html += '<section class="section" aria-labelledby="h-res"><div class="section__head"><h2 class="section__title" id="h-res">Recent results</h2>' +
          '<a class="section__more" href="/app/results">View all</a></div><ul class="list">' +
          results.slice(0, 3).map(resultRow).join('') + '</ul></section>';
      }

      // 5. Livestream — the next planned date, from the SW TV schedule
      var nextStream = streams.filter(function (s) { return s.date >= today; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0];
      html += '<section class="section" aria-labelledby="h-tv"><div class="section__head"><h2 class="section__title" id="h-tv">SW TV</h2>' +
        '<a class="section__more" href="/app/watch">Watch</a></div><ul class="list"><li id="home-live">' +
        (nextStream
          ? '<a class="row" href="/app/watch">' + rowIcon('tv') + '<span class="row__main"><span class="row__title">' + esc(nextStream.title) + '</span>' +
            '<span class="row__meta" style="display:block">Planned livestream · ' + esc(fmt(nextStream.date, { weekday: 'short', month: 'short', day: 'numeric' })) +
            (nextStream.venue ? ' · ' + esc(nextStream.venue) : '') + '</span></span>' + ICON.chev + '</a>'
          : '<a class="row" href="/app/watch">' + rowIcon('tv') + '<span class="row__main"><span class="row__title">Recent videos and replays</span>' +
            '<span class="row__meta" style="display:block">Lessons and past livestreams from SW TV</span></span>' + ICON.chev + '</a>') +
        '</li></ul></section>';

      // 6. News
      var items = news.slice().sort(function (a, b) { return (b.date || '') < (a.date || '') ? -1 : 1; }).slice(0, 3);
      if (items.length) {
        html += '<section class="section news" aria-labelledby="h-news"><div class="section__head"><h2 class="section__title" id="h-news">News</h2></div><div class="list">' +
          items.map(newsItem).join('') + '</div></section>';
      }

      html += '<p class="updated">Southwest Bowls Division · Lawn Bowls – A Sport for Life!</p>';
      view.innerHTML = html;
      checkLiveForHome();
    });
  }
  function shortTitle(t) { return String(t).replace(/^20\d{2}\s+(SWD\s+)?/, ''); }
  function newsItem(n) {
    var link = appLink(n.link || '');
    return '<details style="border-top:1px solid var(--line)"><summary>' +
      '<span class="row__main"><span class="row__title">' + esc(n.title) + '</span>' +
      '<span class="row__meta" style="display:block">' + (n.date ? esc(fmt(n.date, { month: 'long', day: 'numeric', year: 'numeric' })) : '') + '</span></span>' + ICON.chev +
      '</summary><div class="news__body"><p>' + esc(n.body || '') + '</p>' +
      (link ? '<a class="btn btn--ghost" href="' + esc(link.href) + '"' + (link.ext ? ' target="_blank" rel="noopener"' : '') + '>' +
        (link.ext ? ICON.ext : '') + esc(link.label) + '</a>' : '') + '</div></details>';
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
    setTop({ title: 'Events' });
    var today = todayISO();
    return loadEvents().then(function (events) {
      var show = params.get('show') || 'upcoming';
      var months = {}, clubs = {};
      events.forEach(function (x) {
        if (x.dates) months[x.dates.start.slice(0, 7)] = fmt(x.dates.start, { month: 'long', year: 'numeric' });
        if (x.club) clubs[x.club] = 1;
      });
      var f = { q: params.get('q') || '', month: params.get('month') || '', cat: params.get('cat') || '', club: params.get('club') || '' };
      function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>'; }
      view.innerHTML =
        '<h1 class="sr-only">Events</h1>' +
        '<div class="segmented" role="group" aria-label="Which events">' +
        ['upcoming', 'past', 'saved'].map(function (k) {
          return '<button type="button" data-show="' + k + '" aria-pressed="' + (k === show) + '">' + { upcoming: 'Upcoming', past: 'Completed', saved: 'Saved' }[k] + '</button>';
        }).join('') + '</div>' +
        '<label class="search">' + ICON.search + '<span class="sr-only">Search events</span>' +
        '<input type="search" id="q" placeholder="Search tournaments, clubs, players" value="' + esc(f.q) + '" autocomplete="off" enterkeyhint="search"></label>' +
        '<div class="filters">' +
        '<label><span class="sr-only">Month</span><select id="f-month">' + opt('', 'Any month', f.month) +
        Object.keys(months).sort().map(function (k) { return opt(k, months[k], f.month); }).join('') + '</select></label>' +
        '<label><span class="sr-only">Category</span><select id="f-cat">' + opt('', 'Any category', f.cat) +
        ["Men's", "Women's", 'Mixed', 'Open'].map(function (c) { return opt(c, c, f.cat); }).join('') + '</select></label>' +
        '<label><span class="sr-only">Club</span><select id="f-club">' + opt('', 'Any club', f.club) +
        Object.keys(clubs).sort().map(function (c) { return opt(c, c.replace(/ Lawn Bowl(ing|s) (Club|Green)$/, ' LBC'), f.club); }).join('') + '</select></label>' +
        '</div><div id="ev-results"></div>';

      function apply() {
        var q = document.getElementById('q').value.trim().toLowerCase();
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
          if (club && x.club !== club) return false;
          if (q && (x.e.title + ' ' + (x.e.subtitle || '') + ' ' + x.club + ' ' + (x.e.format || '') + ' ' + (x.e.club && x.e.club.address || '')).toLowerCase().indexOf(q) < 0) return false;
          return true;
        });
        if (show === 'past') list = list.slice().reverse();
        var filtered = q || month || cat || club;
        var out = document.getElementById('ev-results');
        if (!list.length) {
          out.innerHTML = show === 'saved' && !filtered
            ? state('empty', 'No saved events yet', 'Tap the bookmark on any event to keep it here. Saving doesn’t enter you in the event.')
            : state('empty', 'No events match', filtered ? 'Try a different search or clear the filters.' : '',
                filtered ? '<button class="btn btn--ghost" type="button" data-clear>Clear filters</button>' : '');
        } else {
          out.innerHTML = '<p class="count" aria-live="polite">' + list.length + ' event' + (list.length === 1 ? '' : 's') +
            (filtered ? ' · <button class="clear" type="button" data-clear>Clear filters</button>' : '') + '</p>' +
            '<ul class="list">' + list.map(function (x) { return eventRow(x, today); }).join('') + '</ul>';
        }
        var u = new URLSearchParams();
        if (show !== 'upcoming') u.set('show', show);
        if (q) u.set('q', document.getElementById('q').value.trim());
        if (month) u.set('month', month); if (cat) u.set('cat', cat); if (club) u.set('club', club);
        var qs = u.toString();
        history.replaceState(history.state, '', '/app/events' + (qs ? '?' + qs : ''));
      }
      var t;
      document.getElementById('q').addEventListener('input', function () { clearTimeout(t); t = setTimeout(apply, 150); });
      ['f-month', 'f-cat', 'f-club'].forEach(function (id) { document.getElementById(id).addEventListener('change', apply); });
      view.addEventListener('click', function onClick(ev) {
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
      apply();
    });
  }

  /* ---------------------------------------------------------------
     EVENTS — detail
     --------------------------------------------------------------- */
  function eventDetail(params, id) {
    var back = { href: '/app/events', label: 'Events' };
    setTop({ title: 'Event', back: back });
    var today = todayISO();
    return Promise.all([loadEvents(), loadResults().catch(function () { return []; })]).then(function (all) {
      var x = all[0].filter(function (y) { return y.id === id; })[0];
      if (!x) {
        view.innerHTML = state('empty', 'We couldn’t find that event', 'It may have been renamed or removed.',
          '<a class="btn" href="/app/events">See all events</a>');
        return;
      }
      var e = x.e, phase = eventPhase(x, today), st = entryStatus(x, today);
      var result = all[1].filter(function (r) { return r.eventId === id; })[0];
      setTop({ title: shortTitle(e.title), back: back });

      var flyer = safeUrl(e.flyer && (e.flyer.localPath || e.flyer.externalUrl));
      var cops = safeUrl(e.cops && (e.cops.localPath || e.cops.externalUrl));
      var hasEntries = e.entries && safeUrl(e.entries.pubUrl);
      var ls = e.liveScoring || {};
      var hasDraw = safeUrl(ls.pubUrl) || (ls.sheets && ls.sheets.length) || ls.gated;
      var tabs = [['overview', 'Overview']];
      if (hasEntries) tabs.push(['entries', 'Entries']);
      if (hasDraw) tabs.push(['draw', 'Draw & scores']);
      if (result) tabs.push(['results', 'Results']);
      var tab = params.get('tab');
      if (!tabs.some(function (t) { return t[0] === tab; })) tab = 'overview';

      var html = '<div class="ev-head">' + (e.subtitle ? '<p class="ev-head__sub">' + esc(e.subtitle) + '</p>' : '') +
        '<h1 class="ev-head__title">' + esc(e.title) + '</h1></div>';
      if (e.alert) html += '<div class="notice" role="note">' + ICON.alert + '<span><b>' + esc(e.alertLabel || 'Update') + '</b>' + esc(e.alert) + '</span></div><div style="height:12px"></div>';

      html += '<div class="card"><ul class="facts">' +
        '<li>' + ICON.cal + '<span>' + esc(e.date || 'Date to be announced') + '</span></li>' +
        (e.time ? '<li>' + ICON.clock + '<span>' + esc(e.time) + '</span></li>' : '') +
        (x.club ? '<li>' + ICON.pin + '<span>' + esc(x.club) + (e.club.address ? '<small>' + esc(e.club.address) + '</small>' : '') + '</span></li>' : '') +
        (e.format ? '<li>' + ICON.people + '<span>' + esc(cap(e.format)) + (e.formatDetails ? '<small>' + esc(e.formatDetails) + '</small>' : '') + '</span></li>' : '') +
        (e.fee ? '<li>' + ICON.fee + '<span>Entry fee: ' + esc(e.fee) + '</span></li>' : '') +
        (e.deadline ? '<li>' + ICON.hourglass + '<span>' + esc(e.deadline) + '</span></li>' : '') +
        '</ul>' + (st ? '<div class="badges" style="margin-top:12px">' + badge(st) + '</div>' : '') + '</div>';

      // Primary actions
      var acts = [];
      if (phase !== 'past') acts.push('<a class="btn" href="#how-to-enter" data-tab-jump="overview">' + ICON.doc + 'Entry details</a>');
      if (e.club && safeUrl(e.club.mapUrl)) acts.push('<a class="btn btn--ghost" href="' + esc(e.club.mapUrl) + '" target="_blank" rel="noopener">' + ICON.map + 'Directions</a>');
      if (x.dates && phase !== 'past') acts.push('<a class="btn btn--ghost" href="' + icsHref(x) + '" download="' + esc(id) + '.ics">' + ICON.cal + 'Add to calendar</a>');
      acts.push('<button class="btn btn--ghost" type="button" data-save="' + esc(id) + '" aria-pressed="' + isSaved(id) + '">' + ICON.bookmark +
        '<span>' + (isSaved(id) ? 'Saved' : 'Save') + '</span></button>');
      html += '<div class="actions">' + acts.join('') + '</div>';

      html += '<div class="tabs" role="tablist" aria-label="Event sections">' + tabs.map(function (t) {
        return '<button type="button" role="tab" id="tab-' + t[0] + '" aria-controls="panel" aria-selected="' + (t[0] === tab) + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div><div id="panel" role="tabpanel"></div>';
      view.innerHTML = html;

      function show(name) {
        tab = name;
        view.querySelectorAll('[role="tab"]').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-tab') === name); });
        var panel = document.getElementById('panel');
        panel.setAttribute('aria-labelledby', 'tab-' + name);
        panel.innerHTML = name === 'entries' ? entriesPanel(e) : name === 'draw' ? drawPanel(e) : name === 'results' ? resultsPanel(result) : overviewPanel(x, phase, flyer, cops);
        if (name === 'draw' && ls.gated) loadGated(id);
        var u = new URL(location.href);
        if (name === 'overview') u.searchParams.delete('tab'); else u.searchParams.set('tab', name);
        history.replaceState(history.state, '', u.pathname + u.search);
      }
      view.querySelector('[role="tablist"]').addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-tab]'); if (b) show(b.getAttribute('data-tab'));
      });
      view.querySelector('[role="tablist"]').addEventListener('keydown', function (ev) {
        if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
        var bs = Array.prototype.slice.call(view.querySelectorAll('[role="tab"]'));
        var i = bs.indexOf(document.activeElement); if (i < 0) return;
        var n = bs[(i + (ev.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length];
        n.focus(); show(n.getAttribute('data-tab'));
      });
      var jump = view.querySelector('[data-tab-jump]');
      if (jump) jump.addEventListener('click', function (ev) {
        ev.preventDefault(); show('overview');
        var t = document.getElementById('how-to-enter');
        if (t) { t.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); t.focus({ preventScroll: true }); }
      });
      show(tab);
    });
  }

  function overviewPanel(x, phase, flyer, cops) {
    var e = x.e, h = '';
    // How to enter — the real process, as published
    var how = [];
    if (phase === 'past') how.push('<p>This event has finished.</p>');
    else {
      if (safeUrl(e.registrationUrl)) {
        how.push('<p>Enter online using the official form.</p><a class="btn btn--block" href="' + esc(e.registrationUrl) + '" target="_blank" rel="noopener">' + ICON.ext + esc(e.registrationLabel || 'Register') + '</a>');
      }
      if (e.registrationInstructions) how.push('<p>' + esc(e.registrationInstructions) + '</p>');
      if (e.paypal && e.paypal.system && e.paypal.system !== 'none') {
        how.push('<p>The entry fee can be paid online on the event’s page on the website.</p>' +
          '<a class="btn btn--ghost btn--block" href="/event?id=' + encodeURIComponent(x.id) + '#pay" target="_blank" rel="noopener">' + ICON.ext + 'Pay entry fee on the website</a>');
      }
      var c = e.contact || {};
      if (c.mailTo && !e.registrationInstructions) how.push('<p><b>Mail entries to:</b> ' + esc(c.mailTo) + '</p>');
      if (e.deadline) how.push('<p class="note">' + esc(e.deadline) + '</p>');
      if (!how.length && (c.name || c.email || c.phone)) how.push('<p>Contact the tournament organizer below to enter.</p>');
      if (!how.length) how.push('<p>Entry details haven’t been published yet. Check back, or see the flyer if there is one.</p>');
    }
    h += '<section class="block" id="how-to-enter" tabindex="-1"><h3>How to enter</h3><div class="card">' + how.join('<div style="height:12px"></div>') + '</div></section>';

    if (e.schedule && e.schedule.length) h += '<section class="block"><h3>Schedule</h3><ul class="card" style="padding-left:2.2em">' + e.schedule.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></section>';

    var docs = [];
    if (flyer) docs.push(docRow(flyer, 'Tournament flyer', e.flyer.type));
    if (cops) docs.push(docRow(cops, 'Conditions of play', 'pdf'));
    if (docs.length) h += '<section class="block"><h3>Flyer & conditions of play</h3><ul class="list">' + docs.join('') + '</ul></section>';

    var c2 = e.contact || {};
    if (c2.name || c2.email || c2.phone) {
      h += '<section class="block"><h3>Contact</h3><ul class="list">' +
        (c2.name ? '<li><div class="row">' + rowIcon('people') + '<span class="row__main"><span class="row__title">' + esc(c2.name) + '</span><span class="row__meta" style="display:block">Tournament contact</span></span></div></li>' : '') +
        (c2.phone ? '<li><a class="row" href="tel:' + esc(String(c2.phone).replace(/[^0-9+]/g, '')) + '">' + rowIcon('phone') + '<span class="row__main">' + esc(c2.phone) + '</span>' + ICON.chev + '</a></li>' : '') +
        (c2.email ? '<li><a class="row" href="mailto:' + esc(c2.email) + '">' + rowIcon('mail') + '<span class="row__main" style="overflow-wrap:anywhere">' + esc(c2.email) + '</span>' + ICON.chev + '</a></li>' : '') +
        '</ul></section>';
    }
    if (e.rules && e.rules.length) {
      var rl = '<ul>' + e.rules.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>';
      h += '<section class="block"><h3>Rules</h3>' + (e.rules.length > 5
        ? '<details class="standings card" style="padding:0"><summary><span>Read all ' + e.rules.length + ' rules</span>' + ICON.chev + '</summary><div style="padding:0 16px 16px">' + rl + '</div></details>'
        : '<div class="card">' + rl + '</div>') + '</section>';
    }
    if (e.noviceDefinition) h += '<section class="block"><h3>Who counts as a novice</h3><div class="callout">' + esc(e.noviceDefinition) + '</div></section>';
    if (e.livestreamNotice) h += '<section class="block"><h3>Livestreaming</h3><div class="callout callout--plain">' + esc(e.livestreamNotice) + '</div></section>';
    h += '<p class="note" style="margin-top:24px"><a href="/event?id=' + encodeURIComponent(x.id) + '" target="_blank" rel="noopener">Open this event on the website</a> ' + extLabel('') + '</p>';
    return h;
  }
  function docRow(url, label, type) {
    var kind = type === 'image' ? 'Image' : type === 'gdoc' ? 'Google Doc' : /\.pdf$/i.test(url) ? 'PDF' : 'Document';
    return '<li><a class="row" href="' + esc(url) + '" target="_blank" rel="noopener">' + rowIcon('doc') +
      '<span class="row__main"><span class="row__title">' + esc(label) + '</span><span class="row__meta" style="display:block">' + kind + ' · opens in a new window</span></span>' + ICON.ext.replace('<svg ', '<svg class="chev" ') + '</a></li>';
  }
  function embedCard(title, why, url, height, kind) {
    var key = 'emb-' + Math.random().toString(36).slice(2, 8);
    return '<div class="card embed-card"><b>' + esc(title) + '</b><p>' + esc(why) + '</p>' +
      '<div class="actions" style="margin-top:0"><button class="btn" type="button" data-embed="' + key + '" data-url="' + esc(url) + '" data-h="' + (parseInt(height, 10) || 650) + '" data-title="' + esc(title) + '">Show ' + esc(kind) + '</button>' +
      '<a class="btn btn--ghost" href="' + esc(url.replace(/([?&])widget=true&?/, '$1').replace(/[?&]$/, '')) + '" target="_blank" rel="noopener">' + ICON.ext + 'Open full screen</a></div>' +
      '<div id="' + key + '"></div></div>';
  }
  function entriesPanel(e) {
    return '<section class="block"><h3>Entries</h3>' +
      embedCard('Entry list', 'Teams entered so far, from the tournament’s Google Sheet. It’s updated by the organizer and needs a connection.', e.entries.pubUrl, e.entries.height, 'entries') +
      '</section>';
  }
  function drawPanel(e) {
    var ls = e.liveScoring || {};
    var h = '<section class="block"><h3>Draw & scores</h3>';
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
        box.innerHTML = '<div class="card"><p>The draw and scores will appear here once the tournament starts.</p></div>';
      }
    }).catch(function () {
      var box = document.getElementById('gated');
      if (box) box.innerHTML = '<div class="card"><p>The draw and scores need a connection. Try again when you have a signal.</p></div>';
    });
  }
  function resultsPanel(r) {
    return '<section class="block">' + divisionsHtml(r.t) + '</section>';
  }

  // .ics for "Add to calendar" — an all-day event in the user's calendar app
  function icsHref(x) {
    var e = x.e, d = x.dates;
    var fold = function (s) { return String(s || '').replace(/[\\,;]/g, function (c) { return '\\' + c; }).replace(/\n/g, '\\n'); };
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Southwest Bowls//App//EN', 'BEGIN:VEVENT',
      'UID:' + x.id + '@swlawnbowls.org',
      'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''),
      'DTSTART;VALUE=DATE:' + d.start.replace(/-/g, ''),
      'DTEND;VALUE=DATE:' + addDays(d.end, 1).replace(/-/g, ''),
      'SUMMARY:' + fold(e.title),
      'LOCATION:' + fold([e.club && e.club.name, e.club && e.club.address].filter(Boolean).join(', ')),
      'DESCRIPTION:' + fold([e.time, e.format && cap(e.format), e.fee && 'Entry ' + e.fee, e.deadline, location.origin + '/event?id=' + x.id].filter(Boolean).join('\n')),
      'END:VEVENT', 'END:VCALENDAR'];
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(lines.join('\r\n'));
  }

  /* ---------------------------------------------------------------
     RESULTS
     --------------------------------------------------------------- */
  function resultsList(params) {
    setTop({ title: 'Results' });
    return loadResults().then(function (list) {
      var f = { q: params.get('q') || '', cat: params.get('cat') || '', year: params.get('year') || '' };
      var years = {}; list.forEach(function (r) { if (r.year) years[r.year] = 1; });
      function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>'; }
      view.innerHTML = '<h1 class="sr-only">Results</h1>' +
        '<label class="search">' + ICON.search + '<span class="sr-only">Search results</span>' +
        '<input type="search" id="q" placeholder="Search tournaments or player names" value="' + esc(f.q) + '" autocomplete="off" enterkeyhint="search"></label>' +
        '<div class="filters">' +
        '<label><span class="sr-only">Year</span><select id="f-year">' + opt('', 'All years', f.year) + Object.keys(years).sort().reverse().map(function (y) { return opt(y, y, f.year); }).join('') + '</select></label>' +
        '<label><span class="sr-only">Category</span><select id="f-cat">' + opt('', 'Any category', f.cat) + ["Men's", "Women's", 'Mixed', 'Open'].map(function (c) { return opt(c, c, f.cat); }).join('') + '</select></label>' +
        '</div><div id="res-list"></div>' +
        '<section class="section"><ul class="list"><li><a class="row" href="/archive" target="_blank" rel="noopener">' + rowIcon('doc') +
        '<span class="row__main"><span class="row__title">2022–2025 results</span><span class="row__meta" style="display:block">The results archive</span></span>' + extLabel('Website') + '</a></li></ul></section>';
      function apply() {
        var q = document.getElementById('q').value.trim().toLowerCase();
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
          ? '<p class="count" aria-live="polite">' + out.length + ' tournament' + (out.length === 1 ? '' : 's') + (filtered ? ' · <button class="clear" type="button" data-clear>Clear filters</button>' : '') + '</p><ul class="list">' + out.map(resultRow).join('') + '</ul>'
          : state('empty', 'No results match', 'Try a different name or clear the filters.', '<button class="btn btn--ghost" type="button" data-clear>Clear filters</button>');
        var u = new URLSearchParams();
        if (q) u.set('q', document.getElementById('q').value.trim()); if (cat) u.set('cat', cat); if (year) u.set('year', year);
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
    var back = { href: '/app/results', label: 'Results' };
    setTop({ title: 'Results', back: back });
    return loadResults().then(function (list) {
      var r = list.filter(function (x) { return x.id === id; })[0];
      if (!r) { view.innerHTML = state('empty', 'We couldn’t find those results', '', '<a class="btn" href="/app/results">All results</a>'); return; }
      setTop({ title: shortTitle(r.t.title), back: back });
      view.innerHTML = '<div class="ev-head"><h1 class="ev-head__title">' + esc(r.t.title) + '</h1>' +
        (r.t.meta ? '<p class="ev-head__sub" style="margin-top:4px">' + esc(r.t.meta) + '</p>' : '') + '</div>' +
        divisionsHtml(r.t) +
        (r.eventId ? '<section class="section"><ul class="list"><li><a class="row" href="/app/events/' + encodeURIComponent(r.eventId) + '">' + rowIcon('cal') +
          '<span class="row__main"><span class="row__title">Event details</span></span>' + ICON.chev + '</a></li></ul></section>' : '');
    });
  }
  var ORD = ['', '1st', '2nd', '3rd'];
  function ordinal(n) { n = +n; if (ORD[n]) return ORD[n]; var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function placeItem(p) {
    var rank = +p.rank || 0;
    var label = p.rankLabel || (rank ? ordinal(rank) + ' place' : '');
    return '<li class="place' + (rank && rank <= 3 ? ' place--' + rank : '') + '">' +
      '<span class="place__rank" aria-hidden="true">' + (rank === 1 ? ICON.star.replace('<svg ', '<svg style="fill:currentColor" ') : '') + esc(rank ? ordinal(rank) : '–') + '</span>' +
      '<span class="place__names"><span class="sr-only">' + esc(label) + ': </span>' + esc(p.names || '') +
      (rank === 1 ? '<span class="place__label">Champions</span>' : p.rankLabel && !/place$/i.test(p.rankLabel) ? '<span class="place__label">' + esc(p.rankLabel) + '</span>' : '') + '</span>' +
      (safeUrl(p.photo) ? '<img class="place__photo" src="' + esc(p.photo) + '" alt="' + esc(p.names || '') + '" loading="lazy">' : '') +
      '</li>';
  }
  function byRank(list) { return list.slice().sort(function (a, b) { return (+a.rank || 99) - (+b.rank || 99); }); }
  // Podium first; the complete standings fold away underneath.
  function divisionsHtml(t) {
    return (t.divisions || []).map(function (dv) {
      var groups = divisionPlaces(dv);
      if (!groups.length) return '';
      var first = byRank(groups[0].places);
      var podium = first.filter(function (p) { return +p.rank >= 1 && +p.rank <= 3; });
      if (!podium.length) podium = first.slice(0, 3);
      var total = groups.reduce(function (n, g) { return n + g.places.length; }, 0);
      var html = '<section class="division"><h2 class="division__title">' + esc(dv.label || 'Results') + '</h2>' +
        (dv.venue ? '<p class="division__venue">' + esc(dv.venue) + '</p>' : '') +
        (groups.length > 1 && groups[0].label ? '<h3 class="flight">' + esc(groups[0].label) + '</h3>' : '') +
        '<ol class="places" aria-label="' + esc(dv.label || '') + ' podium">' + podium.map(placeItem).join('') + '</ol>';
      if (total > podium.length) {
        html += '<details class="standings"><summary><span>Complete standings</span><span class="row__meta">' + total + ' places' +
          (groups.length > 1 ? ' · ' + groups.length + ' flights' : '') + '</span>' + ICON.chev + '</summary>' +
          groups.map(function (g) {
            return (g.label ? '<h3 class="flight">' + esc(g.label) + '</h3>' : '') +
              '<ol class="places" aria-label="' + esc((dv.label || '') + ' ' + (g.label || '')) + ' standings">' + byRank(g.places).map(placeItem).join('') + '</ol>';
          }).join('') + '</details>';
      }
      if (dv.eventUrl) html += '<p class="note"><a href="' + esc(dv.eventUrl) + '" target="_blank" rel="noopener">Full breakdown on the website</a> ' + extLabel('') + '</p>';
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
  function checkLiveForHome() {
    ytData().then(function (vids) {
      var live = vids.filter(function (v) { return v.state === 'live'; })[0];
      var slot = document.getElementById('home-live');
      if (live && slot) {
        slot.innerHTML = '<a class="row" href="/app/watch">' + rowIcon('tv') + '<span class="row__main"><span class="badge badge--live">LIVE</span>' +
          '<span class="row__title" style="display:block;margin-top:4px">' + esc(live.title) + '</span><span class="row__meta" style="display:block">Streaming now on SW TV</span></span>' + ICON.chev + '</a>';
      }
    }).catch(function () {});
  }
  function fmtTime(isoStr, withTime) {
    var o = { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' };
    if (withTime) { o.hour = 'numeric'; o.minute = '2-digit'; }
    return new Intl.DateTimeFormat('en-US', o).format(new Date(isoStr));
  }
  function poster(v, badgeHtml) {
    return '<div class="video"><div data-player="' + esc(v.id) + '"><button class="poster" type="button" data-play="' + esc(v.id) + '" data-title="' + esc(v.title) + '" style="background-image:url(\'' + esc(v.thumb) + '\')" aria-label="Play: ' + esc(v.title) + '">' +
      (badgeHtml || '') + '<span class="poster__play" aria-hidden="true">' + ICON.play + '</span></button></div>' +
      '<p class="video-title">' + esc(v.title) + '</p>' + '</div>';
  }
  function watch() {
    setTop({ title: 'Watch' });
    var today = todayISO();
    view.innerHTML = '<h1 class="screen-title">SW TV</h1><p class="screen-sub">Livestreams, replays and HOW! lessons from Southwest Bowls.</p><section class="section" id="w-live">' + loading() + '</section><div id="w-plan"></div><div id="w-recent"></div>' +
      '<section class="section"><ul class="list">' +
      '<li><a class="row" href="' + YT_CHANNEL_URL + '" target="_blank" rel="noopener">' + rowIcon('tv') + '<span class="row__main"><span class="row__title">SW TV on YouTube</span><span class="row__meta" style="display:block">Subscribe to get notified when we go live</span></span>' + extLabel('YouTube') + '</a></li>' +
      '<li><a class="row" href="https://www.youtube.com/playlist?list=PLHSDPOGEH8batQ10BOOCBnrK-msAl-FUO" target="_blank" rel="noopener">' + rowIcon('info') + '<span class="row__main"><span class="row__title">HOW! Lessons playlist</span><span class="row__meta" style="display:block">Learn to read the head and more</span></span>' + extLabel('YouTube') + '</a></li>' +
      '</ul></section>';

    getJSON('/streams-data.json').then(function (d) {
      var plan = (d.streams || []).filter(function (s) { return s.date >= today; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(0, 4);
      if (!plan.length) return;
      document.getElementById('w-plan').innerHTML = '<section class="section"><div class="section__head"><h2 class="section__title">Planned livestreams</h2></div><ul class="list">' +
        plan.map(function (s) {
          return '<li><a class="row" href="' + esc(safeUrl(s.link) || YT_CHANNEL_URL) + '" target="_blank" rel="noopener"><span class="datetile" aria-hidden="true"><small>' + fmt(s.date, { month: 'short' }) + '</small><b>' + fmt(s.date, { day: 'numeric' }) + '</b></span>' +
            '<span class="row__main"><span class="row__title">' + esc(s.title) + '</span><span class="row__meta" style="display:block">' + esc(fmt(s.date, { weekday: 'long' })) + (s.venue ? ' · ' + esc(s.venue) : '') + '</span>' +
            '<span class="badges"><span class="badge badge--blue">' + ICON.cal + 'Planned</span></span></span>' + extLabel('YouTube') + '</a></li>';
        }).join('') + '</ul><p class="note">Planned dates from the SW TV schedule. Streams appear on YouTube when they go live.</p></section>';
    }).catch(function () {});

    return ytData().then(function (vids) {
      var live = vids.filter(function (v) { return v.state === 'live'; });
      var upcoming = vids.filter(function (v) { return v.state === 'upcoming'; });
      var recent = vids.filter(function (v) { return v.state === 'none'; }).slice(0, 6);
      var top = '';
      if (live.length) top += '<section class="section"><div class="section__head"><h2 class="section__title">Live now</h2></div>' + live.map(function (v) { return poster(v, '<span class="badge badge--live">LIVE</span>'); }).join('') + '</section>';
      if (upcoming.length) top += '<section class="section"><div class="section__head"><h2 class="section__title">Scheduled on YouTube</h2></div><div class="videos">' +
        upcoming.map(function (v) { return poster(v, '<span class="badge badge--blue">' + ICON.clock + esc(v.scheduled ? fmtTime(v.scheduled, true) : 'Scheduled') + '</span>'); }).join('') + '</div></section>';
      if (!live.length && !upcoming.length) top += '<div class="card"><p><b>Nothing is live right now.</b></p><p class="note" style="margin-top:4px">When SW TV goes live, it shows here.</p></div>';
      document.getElementById('w-live').innerHTML = top;
      if (recent.length) document.getElementById('w-recent').innerHTML = '<section class="section"><div class="section__head"><h2 class="section__title">Recent videos & replays</h2></div><div class="videos">' +
        recent.map(function (v) {
          return poster(v, v.wasLive ? '<span class="badge">' + ICON.play + 'Replay</span>' : '').replace('</p></div>', '</p><p class="video-meta">' + esc(fmtTime(v.when)) + '</p></div>');
        }).join('') + '</div></section>';
    }).catch(function () {
      document.getElementById('w-live').innerHTML = '<div class="card"><p><b>Videos didn’t load.</b></p><p class="note" style="margin-top:4px">' +
        (navigator.onLine ? 'Open SW TV on YouTube instead.' : 'Videos need a connection.') + '</p></div>';
    });
  }

  /* ---------------------------------------------------------------
     MORE — division information, clubs, settings
     --------------------------------------------------------------- */
  var SKIP_IN_MORE = ['/', '/2026-tournaments-events', '/2026-tournament-results'];
  // Website pages the app has its own screen for
  var IN_APP = { '/club-info': '/app/more/clubs' };
  function more() {
    setTop({ title: 'More' });
    return getJSON('/nav-data.json').then(function (nav) {
      var groups = [], loose = [];
      (nav.items || []).forEach(function (it) {
        if (it.children) groups.push(it);
        else if (SKIP_IN_MORE.indexOf(it.href) < 0 && !/youtube/i.test(it.href || '')) loose.push(it);
      });
      var links = [];
      groups.forEach(function (g) { g.children.forEach(function (c) { links.push(c); }); });
      loose.forEach(function (c) { links.push(c); });
      // Which menu pages exist as app-readable content? Ask once, in parallel.
      var slugs = links.filter(function (l) { return !l.external && /^\/[a-z0-9-]+$/.test(l.href || ''); }).map(function (l) { return l.href.slice(1); });
      return Promise.all(slugs.map(function (s) {
        return fetch('/content/' + s + '.json', { method: 'HEAD' }).then(function (r) { return r.ok ? s : null; }).catch(function () { return null; });
      })).then(function (found) {
        var native = {}; found.forEach(function (s) { if (s) native[s] = 1; });
        function linkRow(l) {
          var slug = (l.href || '').slice(1);
          if (SKIP_IN_MORE.indexOf(l.href) >= 0 || /youtube/i.test(l.href || '')) return '';
          if (IN_APP[l.href]) return '<li><a class="row" href="' + IN_APP[l.href] + '"><span class="row__main">' + esc(l.label) + '</span>' + ICON.chev + '</a></li>';
          if (native[slug]) return '<li><a class="row" href="/app/page/' + esc(slug) + '"><span class="row__main">' + esc(l.label) + '</span>' + ICON.chev + '</a></li>';
          var href = safeUrl(l.href); if (!href) return '';
          return '<li><a class="row" href="' + esc(href) + '" target="_blank" rel="noopener"><span class="row__main">' + esc(l.label) + '</span>' + extLabel(isExternal(href) ? 'External' : 'Website') + '</a></li>';
        }
        var html = '<h1 class="sr-only">More</h1>';
        html += '<section class="section"><ul class="list">' +
          '<li><a class="row" href="/app/more/clubs">' + rowIcon('pin') + '<span class="row__main"><span class="row__title">Clubs</span><span class="row__meta" style="display:block">All 26 clubs, Cambria to Coronado</span></span>' + ICON.chev + '</a></li>' +
          '<li><a class="row" href="/app/events?show=saved">' + rowIcon('bookmark') + '<span class="row__main"><span class="row__title">Saved events</span></span>' + ICON.chev + '</a></li>' +
          (native['contact-us'] ? '<li><a class="row" href="/app/page/contact-us">' + rowIcon('mail') + '<span class="row__main"><span class="row__title">Contact Southwest Bowls</span></span>' + ICON.chev + '</a></li>' : '') +
          '</ul></section>';
        groups.forEach(function (g) {
          var rows = g.children.map(linkRow).join('');
          if (rows) html += '<section class="section"><div class="section__head"><h2 class="section__title">' + esc(g.label) + '</h2></div><ul class="list">' + rows + '</ul></section>';
        });
        var looseRows = loose.map(linkRow).join('');
        if (looseRows) html += '<section class="section"><div class="section__head"><h2 class="section__title">Also on the website</h2></div><ul class="list">' + looseRows + '</ul></section>';
        html += '<section class="section"><div class="section__head"><h2 class="section__title">Follow us</h2></div><ul class="list">' +
          '<li><a class="row" href="' + YT_CHANNEL_URL + '" target="_blank" rel="noopener">' + rowIcon('tv') + '<span class="row__main">YouTube · SW TV</span>' + extLabel('External') + '</a></li>' +
          '<li><a class="row" href="' + FACEBOOK_URL + '" target="_blank" rel="noopener">' + rowIcon('people') + '<span class="row__main">Facebook</span>' + extLabel('External') + '</a></li>' +
          '</ul></section>';
        html += '<section class="section"><ul class="list">' +
          '<li><a class="row" href="/app/more/settings">' + rowIcon('gear') + '<span class="row__main"><span class="row__title">App settings</span><span class="row__meta" style="display:block">Text size, saved events, offline copies</span></span>' + ICON.chev + '</a></li>' +
          '<li><a class="row" href="/" target="_blank" rel="noopener">' + rowIcon('globe') + '<span class="row__main">Full website</span>' + extLabel('Website') + '</a></li>' +
          '</ul></section>';
        view.innerHTML = html;
      });
    });
  }

  function clubsList(params) {
    setTop({ title: 'Clubs', back: { href: '/app/more', label: 'More' } });
    return getJSON('/clubs-data.json').then(function (d) {
      var clubs = d.clubs || [];
      var q0 = params.get('q') || '';
      view.innerHTML = '<h1 class="sr-only">Clubs</h1><label class="search">' + ICON.search + '<span class="sr-only">Search clubs</span>' +
        '<input type="search" id="q" placeholder="Search by club or city" value="' + esc(q0) + '" autocomplete="off"></label><div id="c-list"></div>';
      function apply() {
        var q = document.getElementById('q').value.trim().toLowerCase();
        var list = clubs.filter(function (c) { return !q || (c.name + ' ' + c.city + ' ' + (c.summary || '')).toLowerCase().indexOf(q) >= 0; });
        document.getElementById('c-list').innerHTML = list.length ? '<p class="count">' + list.length + ' club' + (list.length === 1 ? '' : 's') + '</p><ul class="list">' + list.map(function (c) {
          return '<li><a class="row" href="/app/more/clubs/' + slugify(c.name) + '">' + rowIcon('pin') + '<span class="row__main"><span class="row__title">' + esc(c.name) + '</span>' +
            '<span class="row__meta" style="display:block">' + esc(c.city) + '</span>' + (c.status === 'private' ? '<span class="badges"><span class="badge">' + ICON.lock + 'Private club</span></span>' : '') + '</span>' + ICON.chev + '</a></li>';
        }).join('') + '</ul>' : state('empty', 'No clubs match', 'Try another name or city.');
        history.replaceState(history.state, '', '/app/more/clubs' + (q ? '?q=' + encodeURIComponent(document.getElementById('q').value.trim()) : ''));
      }
      document.getElementById('q').addEventListener('input', apply);
      apply();
    });
  }
  function clubDetail(params, slug) {
    var back = { href: '/app/more/clubs', label: 'Clubs' };
    setTop({ title: 'Club', back: back });
    return getJSON('/clubs-data.json').then(function (d) {
      var c = (d.clubs || []).filter(function (x) { return slugify(x.name) === slug; })[0];
      if (!c) { view.innerHTML = state('empty', 'Club not found', '', '<a class="btn" href="/app/more/clubs">All clubs</a>'); return; }
      setTop({ title: c.name, back: back });
      var maps = c.lat && c.lng ? 'https://www.google.com/maps/search/?api=1&query=' + c.lat + ',' + c.lng : '';
      var acts = [];
      if (maps) acts.push('<a class="btn" href="' + maps + '" target="_blank" rel="noopener">' + ICON.map + 'Directions</a>');
      if (c.phone) acts.push('<a class="btn btn--ghost" href="tel:' + esc(String(c.phone).replace(/[^0-9+]/g, '')) + '">' + ICON.phone + 'Call</a>');
      if (c.email) acts.push('<a class="btn btn--ghost" href="mailto:' + esc(c.email) + '">' + ICON.mail + 'Email</a>');
      if (safeUrl(c.website)) acts.push('<a class="btn btn--ghost" href="' + esc(c.website) + '" target="_blank" rel="noopener">' + ICON.globe + 'Website</a>');
      view.innerHTML = '<div class="ev-head"><p class="ev-head__sub">' + esc(c.city) + '</p><h1 class="ev-head__title">' + esc(c.name) + '</h1>' +
        (c.status === 'private' ? '<div class="badges"><span class="badge">' + ICON.lock + 'Private club</span></div>' : '') + '</div>' +
        '<div class="actions" style="margin-top:0">' + acts.join('') + '</div>' +
        (c.summary ? '<section class="block" style="margin-top:24px"><p><b>' + esc(c.summary) + '</b></p></section>' : '') +
        (c.details ? '<section class="block"><p>' + esc(c.details) + '</p></section>' : '') +
        ((c.phone || c.email) ? '<section class="block"><h3>Contact</h3><ul class="list">' +
          (c.phone ? '<li><a class="row" href="tel:' + esc(String(c.phone).replace(/[^0-9+]/g, '')) + '">' + rowIcon('phone') + '<span class="row__main">' + esc(c.phone) + '</span>' + ICON.chev + '</a></li>' : '') +
          (c.email ? '<li><a class="row" href="mailto:' + esc(c.email) + '">' + rowIcon('mail') + '<span class="row__main" style="overflow-wrap:anywhere">' + esc(c.email) + '</span>' + ICON.chev + '</a></li>' : '') +
          '</ul></section>' : '');
    });
  }

  function settings() {
    setTop({ title: 'Settings', back: { href: '/app/more', label: 'More' } });
    var size = store('text') || 'standard';
    var standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    var n = saved().length;
    view.innerHTML = '<h1 class="sr-only">Settings</h1>' +
      '<div class="card setting"><p class="setting__label" id="ts-l">Text size</p><p class="setting__help">Makes all the text in the app bigger.</p>' +
      '<div class="segmented" role="group" aria-labelledby="ts-l">' + [['standard', 'Standard'], ['large', 'Large'], ['xlarge', 'Extra large']].map(function (o) {
        return '<button type="button" data-size="' + o[0] + '" aria-pressed="' + (o[0] === size) + '">' + o[1] + '</button>';
      }).join('') + '</div></div>' +
      '<div class="card setting"><p class="setting__label">Saved events</p><p class="setting__help">' + (n ? n + ' event' + (n === 1 ? '' : 's') + ' saved on this phone. Saving an event doesn’t enter you in it.' : 'No events saved yet.') + '</p>' +
      (n ? '<button class="btn btn--ghost" type="button" data-clear-saved>Clear saved events</button>' : '') + '</div>' +
      '<div class="card setting"><p class="setting__label">Offline copies</p><p class="setting__help">Pages you open are kept so they work without a signal. Clearing them frees space; they come back as you browse.</p>' +
      '<button class="btn btn--ghost" type="button" data-clear-cache>Clear offline copies</button></div>' +
      (!standalone ? '<div class="card setting"><p class="setting__label">Add to your home screen</p><p class="setting__help">Get the Southwest Bowls icon on your phone.</p><a class="btn" href="/get-the-app" target="_blank" rel="noopener">How to add it</a></div>' : '') +
      '<p class="updated">Southwest Bowls app · data from swlawnbowls.org</p>';
    view.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-size]');
      if (b) {
        var v = b.getAttribute('data-size'); store('text', v); applyTextSize();
        view.querySelectorAll('[data-size]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      }
      if (ev.target.closest('[data-clear-saved]')) { store('saved', []); toast('Saved events cleared'); render(); }
      if (ev.target.closest('[data-clear-cache]')) {
        (window.caches ? caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }) : Promise.resolve())
          .then(function () { toast('Offline copies cleared'); });
      }
    });
    return Promise.resolve();
  }
  function applyTextSize() {
    var v = store('text');
    if (v === 'large' || v === 'xlarge') document.documentElement.setAttribute('data-text', v);
    else document.documentElement.removeAttribute('data-text');
  }

  /* ---------------------------------------------------------------
     Information pages (content/<id>.json) — same renderer rules as
     page.html, laid out for a phone
     --------------------------------------------------------------- */
  function infoPage(params, id) {
    var back = { href: '/app/more', label: 'More' };
    setTop({ title: '', back: back });
    return getJSON('/content/' + encodeURIComponent(id) + '.json').then(function (d) {
      setTop({ title: d.title || '', back: back });
      var fig = function (im) {
        var src = safeUrl(im.src); if (!src) return '';
        return '<figure><img src="' + esc(src) + '" alt="' + esc(im.alt || '') + '" loading="lazy">' + (im.caption ? '<figcaption>' + esc(im.caption) + '</figcaption>' : '') + '</figure>';
      };
      var R = {
        prose: function (s) { return (s.body || []).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join(''); },
        list: function (s) { var t = s.ordered ? 'ol' : 'ul'; return '<div class="card"><' + t + '>' + (s.items || []).map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</' + t + '></div>'; },
        image: function (s) { return fig(s); },
        gallery: function (s) { return '<div class="gallery">' + (s.images || []).map(fig).join('') + '</div>'; },
        cards: function (s) {
          return '<ul class="list">' + (s.items || []).map(function (c) {
            var link = safeUrl(c.link);
            var inner = (safeUrl(c.photo) ? '<img class="place__photo" src="' + esc(c.photo) + '" alt="" loading="lazy">' : '') +
              '<span class="row__main"><span class="row__title">' + esc(c.title || '') + '</span>' +
              (c.meta ? '<span class="row__meta" style="display:block">' + esc(c.meta) + '</span>' : '') +
              (c.body ? '<span style="display:block;margin-top:4px">' + esc(c.body) + '</span>' : '') + '</span>';
            return '<li>' + (link ? '<a class="row" href="' + esc(link) + '"' + (isExternal(link) || /^\//.test(link) ? ' target="_blank" rel="noopener"' : '') + '>' + inner + ICON.chev + '</a>' : '<div class="row">' + inner + '</div>') + '</li>';
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
            return '<a class="btn btn--ghost" href="' + esc(a.href) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + (ext ? ICON.ext : '') + esc(b.label || 'Open') + '</a>';
          }).join('') + '</div>';
        },
        contact: function (s) {
          return '<ul class="list">' + (s.items || []).map(function (c) {
            return '<li><div class="row" style="flex-direction:column;align-items:stretch;gap:2px">' +
              (c.label ? '<span class="row__meta">' + esc(c.label) + '</span>' : '') + (c.name ? '<span class="row__title">' + esc(c.name) + '</span>' : '') +
              (c.email ? '<a href="mailto:' + esc(c.email) + '" style="min-height:44px;display:flex;align-items:center;overflow-wrap:anywhere">' + esc(c.email) + '</a>' : '') +
              (c.phone ? '<a href="tel:' + esc(String(c.phone).replace(/[^0-9+]/g, '')) + '" style="min-height:44px;display:flex;align-items:center">' + esc(c.phone) + '</a>' : '') +
              '</div></li>';
          }).join('') + '</ul>';
        }
      };
      view.innerHTML = '<h1 class="screen-title">' + esc(d.title || '') + '</h1>' + (d.subtitle ? '<p class="screen-sub">' + esc(d.subtitle) + '</p>' : '') +
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
    [/^\/app\/more\/settings\/?$/, settings, 'more'],
    [/^\/app\/page\/([a-z0-9-]+)\/?$/, infoPage, 'more']
  ];
  var scrollMemory = {};
  var renderToken = 0;

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
  var restoring = false;
  var tabMemory = {};

  function go(href, replace) {
    // Remember scroll position on the screen we are leaving
    var cur = location.pathname + location.search;
    scrollMemory[cur] = window.scrollY;
    try { history.replaceState(Object.assign({}, history.state, { y: window.scrollY }), ''); } catch (e) {}
    var depth = (history.state && history.state.depth) || 0;
    if (replace) history.replaceState({ depth: depth }, '', href);
    else history.pushState({ depth: depth + 1 }, '', href);
    render().then(function () { view.focus({ preventScroll: true }); });
  }

  window.addEventListener('popstate', function () { restoring = true; render(); });

  document.addEventListener('click', function (ev) {
    // Save / unsave
    var sv = ev.target.closest('[data-save]');
    if (sv) {
      ev.preventDefault();
      var on = toggleSaved(sv.getAttribute('data-save'));
      document.querySelectorAll('[data-save="' + sv.getAttribute('data-save') + '"]').forEach(function (b) {
        b.setAttribute('aria-pressed', on);
        var span = b.querySelector('span'); if (span) span.textContent = on ? 'Saved' : 'Save';
      });
      return;
    }
    // Load an embedded sheet or form on demand
    var em = ev.target.closest('[data-embed]');
    if (em) {
      var box = document.getElementById(em.getAttribute('data-embed'));
      if (!navigator.onLine) { box.innerHTML = '<p class="note">This needs a connection.</p>'; return; }
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
    if (href.charAt(0) === '#') return;
    if (!/^\/app(\/|$|\?)/.test(href)) return;
    ev.preventDefault();
    // Back button: go back in history when we came from inside the app
    if (a.hasAttribute('data-back') && history.state && history.state.depth > 0) { history.back(); return; }
    // Tapping the current tab again returns to the top of that tab
    var tab = a.getAttribute('data-tab');
    if (tab && a.getAttribute('aria-current') === 'page') {
      var root = a.getAttribute('href');
      if (location.pathname === root) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      return go(root);
    }
    if (tab && tabMemory[tab]) return go(tabMemory[tab]);
    go(href);
  });

  applyTextSize();
  if (!history.state) history.replaceState({ depth: 0 }, '');
  render();

  // Offline helper (network-first: new versions always win when online)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  }
})();

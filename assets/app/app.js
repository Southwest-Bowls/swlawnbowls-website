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
  // Icons: Lucide (ISC licence, lucide.dev), one 24px line style throughout
  var PATHS = {
    chev: '<path d="m9 18 6-6-6-6" />',
    back: '<path d="m15 18-6-6 6-6" />',
    ext: '<path d="M15 3h6v6" /> <path d="M10 14 21 3" /> <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />',
    cal: '<path d="M8 2v4" /> <path d="M16 2v4" /> <rect width="18" height="18" x="3" y="4" rx="2" /> <path d="M3 10h18" />',
    pin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /> <circle cx="12" cy="10" r="3" />',
    clock: '<circle cx="12" cy="12" r="10" /> <polyline points="12 6 12 12 16 14" />',
    bowl: '<circle cx="12" cy="12" r="10" /> <circle cx="12" cy="12" r="1" />',
    ends: '<path d="m17 2 4 4-4 4" /> <path d="M3 11v-1a4 4 0 0 1 4-4h14" /> <path d="m7 22-4-4 4-4" /> <path d="M21 13v1a4 4 0 0 1-4 4H3" />',
    people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /> <circle cx="9" cy="7" r="4" /> <path d="M22 21v-2a4 4 0 0 0-3-3.87" /> <path d="M16 3.13a4 4 0 0 1 0 7.75" />',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /> <path d="M12 9v4" /> <path d="M12 17h.01" />',
    bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0" /> <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />',
    check: '<path d="M20 6 9 17l-5-5" />',
    hourglass: '<path d="M5 22h14" /> <path d="M5 2h14" /> <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" /> <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2" /> <path d="M7 11V7a5 5 0 0 1 10 0v4" />',
    bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />',
    map: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" /> <path d="M15 5.764v15" /> <path d="M9 3.236v15" />',
    doc: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /> <path d="M14 2v4a2 2 0 0 0 2 2h4" /> <path d="M10 9H8" /> <path d="M16 13H8" /> <path d="M16 17H8" />',
    person: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /> <circle cx="12" cy="7" r="4" />',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2" /> <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />',
    globe: '<circle cx="12" cy="12" r="10" /> <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /> <path d="M2 12h20" />',
    search: '<circle cx="11" cy="11" r="8" /> <path d="m21 21-4.3-4.3" />',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /> <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /> <path d="M4 22h16" /> <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /> <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /> <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />',
    tv: '<rect width="20" height="15" x="2" y="7" rx="2" ry="2" /> <polyline points="17 2 12 7 7 2" />',
    info: '<circle cx="12" cy="12" r="10" /> <path d="M12 16v-4" /> <path d="M12 8h.01" />',
    gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /> <circle cx="12" cy="12" r="3" />',
    sliders: '<line x1="21" x2="14" y1="4" y2="4" /> <line x1="10" x2="3" y1="4" y2="4" /> <line x1="21" x2="12" y1="12" y2="12" /> <line x1="8" x2="3" y1="12" y2="12" /> <line x1="21" x2="16" y1="20" y2="20" /> <line x1="12" x2="3" y1="20" y2="20" /> <line x1="14" x2="14" y1="2" y2="6" /> <line x1="8" x2="8" y1="10" y2="14" /> <line x1="16" x2="16" y1="18" y2="22" />',
    news: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" /> <path d="M18 14h-8" /> <path d="M15 18h-5" /> <path d="M10 6h8v4h-8V6Z" />',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /> <line x1="4" x2="4" y1="22" y2="15" />',
    sun: '<circle cx="12" cy="12" r="4" /> <path d="M12 2v2" /> <path d="M12 20v2" /> <path d="m4.93 4.93 1.41 1.41" /> <path d="m17.66 17.66 1.41 1.41" /> <path d="M2 12h2" /> <path d="M20 12h2" /> <path d="m6.34 17.66-1.41 1.41" /> <path d="m19.07 4.93-1.41 1.41" />',
    share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /> <polyline points="16 6 12 2 8 6" /> <line x1="12" x2="12" y1="2" y2="15" />',
    star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />',
    medal: '<path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15" /> <path d="M11 12 5.12 2.2" /> <path d="m13 12 5.88-9.8" /> <path d="M8 7h8" /> <circle cx="12" cy="17" r="5" /> <path d="M12 18v-2h-.5" />',
    archive: '<rect width="20" height="5" x="2" y="3" rx="1" /> <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /> <path d="M10 12h4" />',
    sq: '<rect x="5" y="5" width="14" height="14" rx="4"/>',
    rows: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /> <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />',
    more: '<circle cx="12" cy="12" r="1" /> <circle cx="19" cy="12" r="1" /> <circle cx="5" cy="12" r="1" />',
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
    document.querySelectorAll('[' + attr + ']:not(html)').forEach(function (b) {
      var on = b.getAttribute(attr) === value;
      b.setAttribute('aria-checked', on); b.setAttribute('tabindex', on ? 0 : -1);
    });
  }
  function phoneWantsLessMotion() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function motionChoices() {
    return radioGroup('Number animations', 'data-motion', [['system', 'Follow my phone'], ['on', 'Always on']], store('motion') === 'on' ? 'on' : 'system') +
      '<p class="muted" id="motion-note">' + (phoneWantsLessMotion() ? 'Your phone is asking apps for less motion (Reduce Motion is on), so numbers stay still. Choose “Always on” to see them roll.' : 'Your phone allows animation, so numbers roll when a page opens.') + '</p>';
  }
  function themeChoices() {
    return radioGroup('Appearance', 'data-theme-choice', [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']], themePref());
  }
  function textChoices() {
    return radioGroup('Text size', 'data-size', [['standard', 'Standard'], ['large', 'Large'], ['xlarge', 'Larger'], ['xxlarge', 'Extra large']], store('text') || 'standard');
  }
  function applyTextSize() {
    var v = store('text');
    if (v === 'large' || v === 'xlarge' || v === 'xxlarge') document.documentElement.setAttribute('data-text', v);
    else document.documentElement.removeAttribute('data-text');
  }

  /* ---------------------------------------------------------------
     Dialog (tournament updates, appearance)
     --------------------------------------------------------------- */
  function openDialog(title, html) {
    document.getElementById('dlg-body').innerHTML = '<h2 id="dlg-title">' + esc(title) + '</h2>' + html;
    if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
    dlg.scrollTop = 0; requestAnimationFrame(function () { dlg.scrollTop = 0; });
  }
  function closeDialog() { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }
  var dlgHold = false;   // a long-press opened the sheet and the finger is still down (its release must not count as a backdrop tap)
  document.getElementById('dlg-close').addEventListener('click', closeDialog);
  dlg.addEventListener('click', function (ev) {
    if (ev.target !== dlg || dlgHold) return;
    var r = dlg.getBoundingClientRect();
    if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) closeDialog();   // padding inside the sheet is not the backdrop
  });
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
    // Only redraw when something was served from the offline copy or the screen shows the error state,
    // and never over a half-typed form or an open sheet
    var needs = Object.keys(stale).length > 0 || !!view.querySelector('[data-retry]');
    stale = {}; cache = {}; netbar.hidden = true;
    var ae = document.activeElement;
    if (needs && !dlg.open && !(ae && ae.matches && ae.matches('input, textarea, select, [contenteditable]'))) render();
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
  var CLUBS_LIST = [];
  // Sheet links kept in the database (table event_links), so a new link needs no deploy. They win over events-data.json;
  // if the database does not answer, the links in events-data.json are used.
  var LINKS = null;
  function eventLinks() {
    if (LINKS) return Promise.resolve(LINKS);
    var ctl = window.AbortController ? new AbortController() : null, timer = ctl ? setTimeout(function () { ctl.abort(); }, 3500) : 0;
    return fetch(MEMBERS_API.url + '/rest/v1/event_links?select=event_id,kind,label,url,height,sort&order=sort', { headers: { apikey: MEMBERS_API.key }, signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(timer); return r.ok ? r.json() : null; })
      .then(function (rows) { if (Array.isArray(rows)) LINKS = rows; return LINKS; }, function () { clearTimeout(timer); return null; });
  }
  function applyEventLinks(d, rows) {
    if (!rows || !rows.length) return;
    var by = {}; rows.forEach(function (r) { (by[r.event_id + '|' + r.kind] = by[r.event_id + '|' + r.kind] || []).push(r); });
    (d.events || []).forEach(function (e) {
      var en = by[e.id + '|entries'], dr = by[e.id + '|draw'];
      if (en && en.length) e.entries = Object.assign({}, e.entries, { pubUrl: en[0].url, height: en[0].height });
      if (dr && dr.length) {
        var ls = Object.assign({}, e.liveScoring); delete ls.sheets; delete ls.gated;
        if (dr.length === 1 && !dr[0].label) { ls.pubUrl = dr[0].url; ls.height = dr[0].height; }
        else { ls.pubUrl = ''; ls.sheets = dr.map(function (r) { return { label: r.label || 'Draw', url: r.url, height: r.height }; }); }
        e.liveScoring = ls;
      }
    });
  }
  function loadEvents() {
    return Promise.all([getJSON('/events-data.json'), getJSON('/clubs-data.json').catch(function () { return { clubs: [] }; }), eventLinks()]).then(function (all) {
      var d = all[0]; CLUBS_LIST = all[1].clubs || [];
      if (EVENTS && EVENTS.src === d) return EVENTS.list;
      applyEventLinks(d, all[2]);
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
    var x = { e: e, id: e.id, dates: parseDates(e.date), cat: e.category || categoryOf(e.title + ' ' + (e.subtitle || '')),
      club: club, clubId: club ? clubKey(club) : '', clubLabel: club ? clubLabel(club) : '', short: shortTitle(e.title) };
    x.deadline = deadlineDate(x);
    x.clubIds = Logic.clubIdsForVenue(club, CLUB_ALIASES);
    return x;
  }
  function eventPhase(x, today) {
    if (!x.dates) return 'unknown';
    if (x.e && x.e.status === 'postponed') return 'upcoming';   // no new date yet: stays on the list, never "Completed"
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
    if (e.status === 'postponed') return { kind: 'postponed', label: 'Postponed · new date to come', icon: 'alert' };
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
      : left <= 6 ? 'Entries open · close in ' + left + ' days'
      : 'Entries open · close ' + fmt(x.deadline, { month: 'short', day: 'numeric' });
    return { kind: 'open', label: label, icon: 'hourglass', close: x.deadline, left: left, urgent: left <= 2 };
  }
  function statusLine(st) {
    if (!st) return '';
    var cls = st.urgent ? ' status--urgent' : st.kind === 'open' || st.kind === 'openish' ? ' status--open' : st.kind === 'cancelled' ? ' status--cancelled' : '';
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
  // Save (bookmark) is switched off for now. Set to true to bring the ribbon, the Saved tab and My SWD row back.
  var SAVE_ON = false;
  function saved() { return SAVE_ON ? (store('saved') || []) : []; }
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
      toast('Saved', first ? 'Find it under Events, then Saved. Saving doesn’t register you or turn on reminders.' : 'Find it under Events, then Saved.',
        function () { setSaved(id, false, title); }, 'Saved:' + name + '. Find it under Events, then Saved.');
    } else {
      toast('Removed from saved', '', function () { setSaved(id, true, title); }, 'Removed from saved:' + name + '.');
    }
  }
  function saveLabel(on, title) { return (on ? 'Unsave ' : 'Save ') + title; }
  function saveBtn(id, title) {
    if (!SAVE_ON) return '';
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
  // Metric: label on top, big value, helper line below. Numbers roll once when the app opens.
  function metric(key, value, label, helper) {
    return '<span class="hub__stat"><span class="hub__label">' + esc(label) + '</span><b data-roll="' + esc(String(value)) + '" data-roll-key="' + esc(key) + '">' + esc(String(value)) + '</b>' +
      (helper ? '<span class="hub__help">' + esc(helper) + '</span>' : '') + '</span>';
  }
  var rolledKeys = {};
  function rollIn(root) {
    if (phoneWantsLessMotion() && store('motion') !== 'on') return;
    var els = [];
    root.querySelectorAll('[data-roll]').forEach(function (el) {
      var key = el.getAttribute('data-roll-key') || el.getAttribute('data-roll');
      if (rolledKeys[key] && Date.now() - rolledKeys[key] < 60000) return; rolledKeys[key] = Date.now();
      var txt = el.getAttribute('data-roll'); el.setAttribute('aria-label', txt); el.setAttribute('role', 'text');
      el.innerHTML = txt.split('').map(function (ch, i) {
        if (!/\d/.test(ch)) return '<span aria-hidden="true">' + esc(ch) + '</span>';
        var col = ''; for (var d = 0; d < 10; d++) col += '<span>' + d + '</span>';
        return '<span class="roll" aria-hidden="true"><span class="roll__col" style="--d:' + ch + ';--i:' + i + '">' + col + '</span></span>';
      }).join('');
      els.push(el);
    });
    if (!els.length) return;
    // Start the roll after first paint; a timer (not rAF) so it also runs when the page is in the background,
    // and always settle on the plain number afterwards so it can never be left showing a wrong digit.
    setTimeout(function () { els.forEach(function (el) { el.classList.add('is-rolling'); }); }, 80);
    setTimeout(function () { els.forEach(function (el) { el.textContent = el.getAttribute('data-roll'); el.classList.remove('is-rolling'); }); }, 2600);
  }
  var CAT_DOT = { "Women's": 'cat--w', "Men's": 'cat--m', 'Mixed': 'cat--x', 'Open': 'cat--o' };
  function catChips(attr, current) {
    return [['', 'All']].concat(CATS.map(function (c) { return [c, c]; })).map(function (c) {
      return '<button type="button" class="chip" ' + attr + '="' + esc(c[0]) + '" aria-pressed="' + (c[0] === current) + '">' + (CAT_DOT[c[0]] ? '<i class="chip__dot ' + CAT_DOT[c[0]] + '" aria-hidden="true"></i>' : '') + esc(c[1]) + '</button>';
    }).join('');
  }
  // Partner and membership logos: one calm card, logos in fixed slots (no tile borders), a note where a partner requires one
  function logoCard(pd, big) {
    function row(label, list) {
      if (!list || !list.length) return '';
      return '<div class="lcard__sec"><h3 class="lcard__label">' + esc(label) + '</h3><ul class="lcard__row lcard__row--' + list.length + '">' + list.map(function (o) {
        var dark = /world bowls/i.test(o.name);
        var img = '<img src="' + esc(o.logo) + '" alt="' + esc(o.name) + '" decoding="async">';
        var cls = 'lcard__logo' + (dark ? ' lcard__logo--dark' : '');
        return '<li>' + (safeUrl(o.url) ? '<a class="' + cls + '" href="' + esc(o.url) + '" target="_blank" rel="noopener" aria-label="' + esc(o.name) + ', opens their website">' + img + '</a>' : '<span class="' + cls + '">' + img + '</span>') + '</li>';
      }).join('') + '</ul></div>';
    }
    var notes = (pd.partners || []).concat(pd.memberOf || []).filter(function (o) { return o.note; });
    return '<section class="lcard' + (big ? ' lcard--big' : '') + '" aria-label="Partners and memberships">' + row('Our partners', pd.partners) + row('Proud member of', pd.memberOf) +
      (big && notes.length ? '<p class="lcard__note">' + notes.map(function (o) { return esc(o.note); }).join(' ') + '</p>' : '') + '</section>';
  }
  // Photo for an event: its host club's own photo (never a doubtful or hotlinked one)
  function eventPhoto(x, clubs) {
    var c = (clubs || []).filter(function (k) { return (x.clubIds || []).indexOf(k.id) >= 0; })[0];
    return c && c.image && /^\/photos\//.test(c.image) && !c.imageNeedsReview ? c.image : '';
  }
  // Photo card: full-bleed picture, dark gradient for legibility, big title, glass status chip
  function photoCard(x, clubs, today, opts) {
    opts = opts || {};
    var ph = eventPhoto(x, clubs), st = entryStatus(x, today), saved0 = isSaved(x.id);
    return '<a class="pcard ' + catClass(x) + (opts.big ? ' pcard--big' : '') + '" href="/app/events/' + encodeURIComponent(x.id) + '"' + (ph ? ' style="--ph:url(\'' + esc(ph) + '\')"' : '') + '>' +
      '<span class="pcard__cat">' + esc(x.cat || 'Open') + '</span>' + (SAVE_ON && saved0 ? '<span class="pcard__saved" aria-label="Saved">' + icon('bookmark') + '</span>' : '') +
      '<span class="pcard__body"><span class="pcard__date">' + esc(dateRangeLabel(x.dates, true)) + '</span><span class="pcard__title">' + esc(x.short) + '</span>' +
      '<span class="pcard__meta">' + esc([x.clubLabel, x.e.format && cap(x.e.format)].filter(Boolean).join(' · ')) + '</span>' +
      (st ? '<span class="pcard__status">' + icon(st.icon) + esc(st.label) + '</span>' : '') + '</span></a>';
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
    var strip = '';
    for (var d = 1; d <= n; d++) {
      var iso = ym + '-' + String(d).padStart(2, '0'), ev = on(iso);
      var kinds = {}; ev.forEach(function (e0) { kinds[catClass(e0)] = 1; });
      var kc = Object.keys(kinds).length === 1 ? Object.keys(kinds)[0] : (ev.length ? 'cat--o' : '');
      strip += '<button type="button" class="wday ' + kc + (iso === showDay ? ' wday--sel' : '') + (iso === today ? ' wday--today' : '') + '" data-cal-day="' + iso + '" aria-pressed="' + (iso === showDay) + '" aria-label="' +
        esc(fmt(iso, { weekday: 'long', month: 'long', day: 'numeric' }) + (ev.length ? ', ' + ev.length + (ev.length === 1 ? ' event' : ' events') : ', no events')) + '">' +
        '<span class="wday__l" aria-hidden="true">' + esc(fmt(iso, { weekday: 'narrow' })) + '</span><b class="wday__n" aria-hidden="true">' + d + '</b><i class="wday__dot' + (ev.length ? ' wday__dot--on' : '') + '" aria-hidden="true"></i></button>';
    }
    var dayEv = showDay ? on(showDay) : [];
    var html = '<div class="cal"><div class="cal__head"><h2 class="cal__title" aria-live="polite">' + esc(fmt(first, { month: 'long', year: 'numeric' })) + '</h2>' +
      '<button class="circbtn" type="button" data-cal-nav="-1" aria-label="Previous month">' + icon('back') + '</button>' +
      '<button class="circbtn" type="button" data-cal-nav="1" aria-label="Next month">' + icon('chev') + '</button></div>' +
      '<div class="wstrip" role="group" aria-label="Days of the month">' + strip + '</div>';
    var tl = dayEv.map(function (x, i) {
      var e = x.e, phase = eventPhase(x, today), ph = eventPhoto(x, CLUBS_LIST), st = entryStatus(x, today);
      return '<li class="tl__item' + (phase === 'past' ? ' tl__item--done' : '') + '"><span class="tl__node" aria-hidden="true">' + (phase === 'past' ? icon('check') : '') + '</span>' +
        '<a class="tcard ' + catClass(x) + ' tcard--lead' + '" href="/app/events/' + encodeURIComponent(x.id) + '">' +
        '<span class="tcard__who"><span class="tcard__av"' + (ph ? ' style="--ph:url(\'' + esc(ph) + '\')"' : '') + '></span><span class="tcard__wt"><b>' + esc(x.clubLabel || 'Southwest Bowls') + '</b><small>' + esc(x.cat || 'Open') + (e.format ? ' · ' + esc(cap(e.format)) : '') + '</small></span></span>' +
        (e.time ? '<span class="tcard__time">' + esc(e.time) + '</span>' : '') +
        '<span class="tcard__title">' + esc(x.short) + '</span>' + (st ? '<span class="tcard__st">' + icon(st.icon) + esc(st.label) + '</span>' : '') + '</a></li>';
    }).join('');
    html += '<div id="cal-day-list" tabindex="-1">' + (!anyThisMonth ? state('empty', 'No events this month', 'Use the arrows to look at another month.')
      : (dayEv.length ? '<ol class="tl">' + tl + '</ol>' : '<p class="muted tl__none">Nothing scheduled this day. Days with a colored dot have events.</p>')) + '</div></div>';
    return html;
  }
  // One event as a coloured card (same look as the calendar timeline)
  function eventRow(x, today) {
    var e = x.e, phase = eventPhase(x, today), ph = eventPhoto(x, CLUBS_LIST), st = entryStatus(x, today);
    var update = e.alert && phase !== 'past' ? '<span class="tcard__st">' + icon('bell') + esc(e.alertLabel || 'Update') + '</span>' : '';
    return '<li class="evcard"><a class="tcard ' + catClass(x) + '" href="/app/events/' + encodeURIComponent(x.id) + '">' +
      '<span class="tcard__who"><span class="tcard__av"' + (ph ? ' style="--ph:url(\'' + esc(ph) + '\')"' : '') + '></span><span class="tcard__wt"><b>' + esc(x.clubLabel || 'Southwest Bowls') + '</b><small>' + esc(x.cat || 'Open') + (e.format ? ' · ' + esc(cap(e.format)) : '') + '</small></span></span>' +
      '<span class="tcard__time">' + (e.status === 'postponed' ? 'New date to come' : esc(dateRangeLabel(x.dates, true))) + (e.time && phase !== 'past' && x.dates && x.dates.start === x.dates.end ? ' · ' + esc(startTime(e.time) || e.time) : '') + '</span>' +
      '<span class="tcard__title">' + esc(x.short) + '</span>' +
      (st ? '<span class="tcard__st">' + icon(st.icon) + esc(st.label) + '</span>' : '') + update + '</a>' + saveBtn(x.id, x.short) + '</li>';
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
    var items = list.filter(function (r) { return firsts(r).length; }).slice(0, 6);
    if (!items.length) return '';
    return '<section class="hsec" aria-labelledby="h-champ"><div class="section__head"><h2 class="section__title" id="h-champ">Latest champions</h2></div>' + deckShell(items.map(function (r) {
      var f = firsts(r)[0], cat = catClass(r.cat ? r : { cat: categoryOf(r.t.title) });
      return '<a class="kcard kcard--champ ' + cat + '" href="/app/results/' + encodeURIComponent(r.id) + '"><div class="kcard__photo"' + (f.photo ? ' style="--ph:url(\'' + esc(f.photo) + '\')"' : '') + '><span class="kcard__chip kcard__chip--cat">' + icon('trophy', 'i--sm') + 'Champions</span></div>' +
        '<div class="kcard__body"><h3 class="kcard__name">' + esc(f.who) + '</h3><p class="kcard__city">' + esc(shortTitle(r.t.title)) + '</p><p class="kcard__sum">' + esc(r.t.meta || '') + '</p></div></a>';
    }), 'Latest champions') + '</section>';
  }
  // Home version: same size and look as the "Coming up" row
  function champRow(list) {
    var items = list.filter(function (r) { return firsts(r).length; }).slice(0, 8);
    if (!items.length) return '';
    return '<section class="hsec" aria-labelledby="h-champ"><div class="section__head"><h2 class="section__title" id="h-champ">Latest champions</h2>' +
      '<a class="section__more" href="/app/results">See all' + icon('chev', 'i--sm') + '</a></div><ul class="hscroll">' + items.map(function (r) {
        var f = firsts(r)[0], cat = catClass(r.cat ? r : { cat: categoryOf(r.t.title) });
        return '<li><a class="pcard ' + cat + '" href="/app/results/' + encodeURIComponent(r.id) + '"' + (f.photo ? ' style="--ph:url(\'' + esc(f.photo) + '\')"' : '') + '>' +
          '<span class="pcard__cat">' + icon('trophy', 'i--sm') + 'Champions</span>' +
          '<span class="pcard__body"><span class="pcard__date">' + esc(r.t.meta || '') + '</span><span class="pcard__title">' + esc(f.who) + '</span><span class="pcard__meta">' + esc(shortTitle(r.t.title)) + '</span></span></a></li>';
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
    // One line per division, so a two-division tournament shows both sets of winners
    var lines = !f.length ? ['Published result'] : f.length === 1 ? [f[0].who] : f.slice(0, 4).map(function (x) { return x.where + ': ' + x.who; });
    return '<li><a class="rcard rcard--multi" href="/app/results/' + encodeURIComponent(r.id) + '">' + resultBlock(r) +
      '<span class="rcard__body"><span class="rcard__title">' + esc(shortTitle(r.t.title)) + '</span>' +
      lines.map(function (l) { return '<span class="rcard__meta">' + esc(l) + '</span>'; }).join('') + '</span>' + CHEV + '</a></li>';
  }

  // Empty states get a small drawn illustration: soft brand-coloured discs behind a card with a line icon
  function illo(kind, title) {
    var t = String(title || '').toLowerCase(), ic = kind === 'error' ? 'alert' : /saved|bookmark/.test(t) ? 'bookmark' : /club/.test(t) ? 'pin' : /result|podium|champion/.test(t) ? 'trophy' : /event|month|day|match/.test(t) ? 'cal' : /search|found|match/.test(t) ? 'search' : 'bowl';
    var tone = ic === 'trophy' ? 'sun' : ic === 'pin' || ic === 'cal' ? 'teal' : ic === 'alert' ? 'red' : 'blush';
    return '<span class="illo illo--' + tone + '" aria-hidden="true"><i class="illo__a"></i><i class="illo__b"></i><i class="illo__c"></i><span class="illo__card">' + icon(ic) + '</span></span>';
  }
  function state(kind, title, body, action) {
    return '<div class="' + kind + '" role="status">' + illo(kind, title) + '<b>' + esc(title) + '</b>' + (body ? '<p>' + esc(body) + '</p>' : '') + (action || '') + '</div>';
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
      '<span class="skel__card"></span><span class="skel__card"></span><span class="skel__l skel__l--s"></span></div>';
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
  function shareBtnIcon(title, path) {
    return '<button class="circbtn" type="button" data-share="' + esc(path) + '" data-share-title="' + esc(title) + '" aria-label="Share ' + esc(title) + '">' + icon('share') + '</button>';
  }
  function share(title, path) {
    var url = Logic.canonicalUrl(path);
    function closeMenu() { if (dlg.open && dlg.querySelector('.qmenu')) closeDialog(); }
    function copied() { closeMenu(); toast('Link copied.'); }
    function failed() { openDialog('Share this link', '<p>Copy this link to share it:</p><p class="copylink"><input type="text" readonly value="' + esc(url) + '" aria-label="Link to share" onfocus="this.select()"></p>'); }
    function copy() {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(copied, failed);
      else failed();
    }
    if (navigator.share) {
      navigator.share({ title: title, url: url }).then(closeMenu, function (err) { if (!err || err.name !== 'AbortError') copy(); });
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


  /* ---------------------------------------------------------------
     Personalization: what you are here for, setup progress, smart defaults.
     Kept on this phone. Used only to put things in a better order.
     --------------------------------------------------------------- */
  var TOPICS = [['tournaments', 'cal', 'Tournaments and entries'], ['results', 'trophy', 'Results and champions'], ['standings', 'medal', 'Standings'],
    ['clubs', 'pin', 'Clubs near me'], ['watch', 'tv', 'Southwest TV'], ['news', 'news', 'News']];
  var CAT_PICKS = ["Women's", "Men's", 'Mixed', 'Open'];
  function interests() { var v = store('interests'); return v && typeof v === 'object' ? v : null; }
  function wantsTopic(t) { var v = interests(); return !!(v && (v.topics || []).indexOf(t) >= 0); }
  function interestCats() { var v = interests(); return (v && v.cats) || []; }
  function interestsForm() {
    var v = interests() || { topics: [], cats: [] };
    return '<div class="ichips" role="group" aria-label="What you are here for">' + TOPICS.map(function (t) {
      return '<button type="button" class="ichip" data-itopic="' + t[0] + '" aria-pressed="' + ((v.topics || []).indexOf(t[0]) >= 0) + '">' + icon(t[1], 'i--sm') + '<span>' + esc(t[2]) + '</span></button>'; }).join('') + '</div>' +
      '<h3 class="ichips__h">Which events?</h3><div class="ichips" role="group" aria-label="Which events">' + CAT_PICKS.map(function (c) {
      return '<button type="button" class="ichip" data-icat="' + esc(c) + '" aria-pressed="' + ((v.cats || []).indexOf(c) >= 0) + '"><i class="chip__dot ' + CAT_DOT[c] + '" aria-hidden="true"></i><span>' + esc(c) + '</span></button>'; }).join('') + '</div>';
  }
  function readInterests(root) {
    var o = { topics: [], cats: [], at: Date.now() };
    root.querySelectorAll('[data-itopic][aria-pressed="true"]').forEach(function (b) { o.topics.push(b.getAttribute('data-itopic')); });
    root.querySelectorAll('[data-icat][aria-pressed="true"]').forEach(function (b) { o.cats.push(b.getAttribute('data-icat')); });
    return o;
  }
  function openInterests(after) {
    openDialog('Make it yours', '<p class="muted">Pick what matters to you and we’ll put it first, and choose how your profile card looks. It stays on your phone.</p>' + interestsForm() +
      '<h3 class="ichips__h">Your profile card</h3>' + lookForm(look(), (store('profile') || {}).name) +
      '<div class="actions"><button class="btn btn--wide btn--dark" type="button" data-int-save>Save</button></div>');
    var box = document.getElementById('dlg-body'); wireLook(box);
    box.querySelector('[data-int-save]').addEventListener('click', function () { store('interests', readInterests(box)); store('look', readLook(box)); closeDialog(); toast('Saved', 'Home now has a “For you” section, and your picks come first.'); if (after) after(); });
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-itopic], [data-icat]'); if (!b) return;
    b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); haptic();
  });
  // Five steps to a set-up app; each links to where it is done
  function hasAnyPhoto() {
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('swd:memberPhoto:') === 0 && localStorage.getItem(k)) return true; } } catch (e) {}
    return false;
  }
  function setupSteps() {
    var p = store('profile') || {};
    return [
      { k: 'signin', label: 'Sign in', done: !!memberSession(), href: '/app/signin' },
      { k: 'profile', label: 'Profile', done: !!(p.name && p.division), href: '/app/my/profile' },
      { k: 'club', label: 'Club', done: !!(p.club || followed().length), href: '/app/more/clubs' },
      { k: 'photo', label: 'Photo', done: hasAnyPhoto(), href: '/app/my/profile' },
      { k: 'interests', label: 'Interests', done: !!interests(), href: '' }
    ];
  }
  function setupCard() {
    if (store('setupDone')) return '';
    var st = setupSteps(), n = st.filter(function (x) { return x.done; }).length, pct = Math.round(n / st.length * 100);
    if (n === st.length) {
      store('setupDone', true);
      var conf = ''; for (var i = 0; i < 22; i++) conf += '<i style="--x:' + ((i * 37) % 100) + '%;--d:' + ((i * 53) % 900) + 'ms;--c:' + ['#6a50d6', '#f2a43a', '#2a8fa0', '#e5484d', '#a6d63a'][i % 5] + '"></i>';
      return '<section class="setup setup--done" aria-label="Setup complete"><div class="confetti" aria-hidden="true">' + conf + '</div><b class="setup__t">You’re all set!</b><p>Your profile is complete. The app now puts what you care about first.</p></section>';
    }
    return '<section class="setup" aria-labelledby="h-setup"><div class="setup__head"><b id="h-setup" class="setup__t">Finish setting up</b><span class="setup__pct">' + pct + '%</span></div>' +
      '<div class="setup__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Setup progress"><i style="width:' + pct + '%"></i></div>' +
      '<ol class="setup__steps">' + st.map(function (x, i) {
        var inner = '<span class="setup__dot' + (x.done ? ' is-done' : '') + '" aria-hidden="true">' + (x.done ? icon('check') : (i + 1)) + '</span><span class="setup__l">' + esc(x.label) + (x.done ? '<span class="sr-only"> done</span>' : '') + '</span>';
        return '<li>' + (x.k === 'interests' && !x.done ? '<button type="button" class="setup__s" data-open-interests>' + inner + '</button>' : x.done ? '<span class="setup__s">' + inner + '</span>' : '<a class="setup__s" href="' + esc(x.href) + '">' + inner + '</a>') + '</li>';
      }).join('') + '</ol></section>';
  }

  // "Make it yours": a palette and a card style for your profile card
  var PALETTES = [['lilac', 'Lilac'], ['sky', 'Sky'], ['mint', 'Mint'], ['rose', 'Rose']];
  var STYLES = [['soft', 'Soft'], ['dark', 'Dark'], ['minimal', 'Minimal']];
  function look() { var v = store('look'); return v && v.palette ? v : { palette: 'lilac', style: 'soft' }; }
  function lookForm(l, name) {
    return '<div class="lookcard" data-pal="' + l.palette + '" data-sty="' + l.style + '" data-lookcard><span class="lookcard__av" aria-hidden="true">' + icon('person') + '</span><b class="lookcard__n">' + (name ? esc(name) : 'Your name') + '</b><span class="lookcard__s">Southwest Bowls</span></div>' +
      '<h3 class="ichips__h">Color palette</h3><div class="swatches" role="radiogroup" aria-label="Color palette">' + PALETTES.map(function (c) {
        return '<button type="button" class="swatch" data-pal-pick="' + c[0] + '" data-pal="' + c[0] + '" role="radio" aria-checked="' + (l.palette === c[0]) + '" aria-label="' + c[1] + '"></button>'; }).join('') + '</div>' +
      '<h3 class="ichips__h">Card style</h3><div class="swatches swatches--sty" role="radiogroup" aria-label="Card style">' + STYLES.map(function (c) {
        return '<button type="button" class="swatch swatch--sty" data-sty-pick="' + c[0] + '" data-sty="' + c[0] + '" data-pal="' + l.palette + '" role="radio" aria-checked="' + (l.style === c[0]) + '"><span>' + c[1] + '</span></button>'; }).join('') + '</div>';
  }
  function wireLook(root) {
    root.addEventListener('click', function (ev) {
      var pb = ev.target.closest('[data-pal-pick]'), sb = ev.target.closest('[data-sty-pick]'); if (!pb && !sb) return;
      var card = root.querySelector('[data-lookcard]'); haptic();
      if (pb) { root.querySelectorAll('[data-pal-pick]').forEach(function (b) { b.setAttribute('aria-checked', b === pb); }); card.setAttribute('data-pal', pb.getAttribute('data-pal-pick')); root.querySelectorAll('.swatch--sty').forEach(function (b) { b.setAttribute('data-pal', pb.getAttribute('data-pal-pick')); }); }
      if (sb) { root.querySelectorAll('[data-sty-pick]').forEach(function (b) { b.setAttribute('aria-checked', b === sb); }); card.setAttribute('data-sty', sb.getAttribute('data-sty-pick')); }
    });
  }
  function readLook(root) { var c = root.querySelector('[data-lookcard]'); return c ? { palette: c.getAttribute('data-pal'), style: c.getAttribute('data-sty') } : null; }

  function home() {
    setTitle('');
    var today = todayISO(), root = view;
    return Promise.all([
      loadEvents(),
      getJSON('/app-home-data.json').catch(function () { return {}; }),
      getJSON('/clubs-data.json').catch(function () { return {}; })
    ]).then(function (all) {
      if (root !== view) return;
      var data = { events: all[0], story: all[1].feature || null, today: today, clubs: all[2].clubs || [] };
      drawHome(data);
      // Saving or unsaving on Home redraws it straight away
      view.addEventListener('saved-change', function (ev) {
        var y = window.scrollY;
        drawHome(data);
        window.scrollTo(0, y);
        if (ev.detail && !ev.detail.on) { var h = document.getElementById('h-next'); if (h) h.focus({ preventScroll: true }); }
      });
      try {
        if (sessionStorage.getItem('swd:refocusSearch')) {
          sessionStorage.removeItem('swd:refocusSearch');
          var hq = document.getElementById('hq'); if (hq) hq.focus();
        }
      } catch (e) {}
    });
  }

  // Coming up on Home: every event as a calm white card with a colored edge (photo cards stay in Next up)
  function upHtml(list, mode, d, today) {
    return '<ul class="vcards">' + list.map(function (x) { return eventRow(x, today).replace('class="evcard"', 'class="evcard evcard--calm"'); }).join('') + '</ul>';
  }
  function drawHome(d) {
    var today = d.today;
    var live = d.events.filter(function (x) { var p = eventPhase(x, today); return p === 'upcoming' || p === 'now'; });
    var liveAll = live;
    live = live.filter(function (x) { return x.e.status !== 'postponed'; });   // a postponed event has no date to count down to
    // never filtered: saved-event alerts and the bell must not depend on your picks
    // Personal focus: with interests picked, Home shows only what you chose. "Show everything" brings the full Home back.
    var ivx = interests() || {}, focusTopics = !ivx.all && (ivx.topics || []).length > 0, focusCats = !ivx.all && (ivx.cats || []).length > 0;
    function showT(t) { return !focusTopics || (ivx.topics || []).indexOf(t) >= 0; }
    if (focusCats) live = live.filter(function (x) { return ivx.cats.indexOf(x.cat || 'Open') >= 0; });
    var ids = saved();
    var mine = d.events.filter(function (x) { return ids.indexOf(x.id) >= 0; });
    var mineNext = mine.filter(function (x) { return liveAll.indexOf(x) >= 0; });   // already in date order

    // 1. Greeting bar: date and hello on the left; search, updates and profile as small round buttons
    var prof = store('profile') || {}, first = String(prof.name || '').trim().split(/\s+/)[0];
    currentNotices = liveAll.filter(function (x) { return x.e.alert; });
    var unread = unreadCount(currentNotices);
    var hbgEv = (function () { var u0 = live.filter(function (x) { return eventPhase(x, today) === 'now'; }).concat(live.filter(function (x) { return eventPhase(x, today) !== 'now'; }))[0]; return u0 ? eventPhoto(u0, d.clubs) : ''; })();
    var html = (hbgEv ? '<div class="hbg" aria-hidden="true" style="--ph:url(\'' + esc(hbgEv) + '\')"></div>' : '') + '<header class="hbar"><span class="hbar__logo" aria-hidden="true"><img src="/assets/app/swd-logo.png" alt="" width="30" height="35"></span><div class="hbar__text"><span class="hbar__date">' + esc(fmt(today, { weekday: 'short' }) + ', ' + fmt(today, { month: 'short' })) + ' <b class="rollnum" data-roll="' + (+today.slice(8)) + '" data-roll-key="home-day-' + today + '">' + (+today.slice(8)) + '</b></span>' +
      '<h1 class="hbar__hello">' + (function () { var h = new Date().getHours(); return h < 5 ? 'Hello' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; })() + (first ? ', ' + esc(first) : '') + '</h1>' +
'</div>' +
      '<button class="circbtn" type="button" data-notices aria-haspopup="dialog" aria-label="Tournament updates' + (unread ? ', ' + unread + ' new' : '') + '">' + icon('bell') + (unread ? '<span class="circbtn__dot" aria-hidden="true"></span>' : '') + '</button>' +
      '<a class="circbtn" href="/app/more/settings" aria-label="App settings">' + icon('gear') + '</a></header>' +
      '<a class="hsearch" id="hq" href="/app/search" aria-label="Search tournaments, clubs or players">' + icon('search') + '<span>Search tournaments, clubs, players</span></a>' +
      '';

    // Division card (same as the one on More): who we are and the season at a glance
    (function () {
      var played = d.events.filter(function (x) { return eventPhase(x, today) === 'past' && x.e.status !== 'cancelled' && x.e.status !== 'postponed'; }).length;
      var ahead = d.events.filter(function (x) { var p = eventPhase(x, today); return (p === 'upcoming' || p === 'now') && x.e.status !== 'postponed'; }).length;
      html += '<section class="hub hub--home" aria-label="Southwest Bowls Division"><span class="logo-plate hub__logo"><img src="/assets/app/swd-logo.png" alt="" width="64" height="75"></span>' +
        '<div class="hub__text"><span class="hub__name">Southwest Bowls Division</span><span class="hub__sub">Lawn bowls across Southern California</span></div>' +
        '<div class="hub__stats">' + metric('home-clubs', (d.clubs || []).length, 'Clubs', 'in the Division') + metric('home-ahead', ahead, 'Tournaments', 'coming up') + metric('home-played', played, 'Tournaments', 'played this season') + '</div></section>';
    })();

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
    // For you: shows what you picked, so choosing interests visibly does something
    (function () {
      var iv = interests(); if (!iv || !((iv.topics || []).length || (iv.cats || []).length)) return;
      var links = [], T = { tournaments: ['/app/events', 'cal', 'Tournaments'], results: ['/app/results', 'trophy', 'Latest results'], standings: ['/app/standings', 'medal', 'Standings'], clubs: ['/app/more/clubs', 'pin', 'Clubs'], watch: ['/app/watch', 'tv', 'Southwest TV'], news: ['/app/more/news', 'news', 'News'] };
      (iv.topics || []).forEach(function (t) { if (T[t]) links.push('<a class="fy__i" href="' + T[t][0] + '"><span class="fy__ic" aria-hidden="true">' + icon(T[t][1]) + '</span><span>' + T[t][2] + '</span></a>'); });
      (iv.cats || []).forEach(function (c) { links.push('<a class="fy__i" href="/app/events?cat=' + encodeURIComponent(c) + '"><span class="fy__ic" aria-hidden="true"><i class="chip__dot ' + CAT_DOT[c] + '"></i></span><span>' + esc(c) + '</span></a>'); });
      var nextFor = (!focusTopics || showT('tournaments') || (iv.cats || []).length) ? live.filter(function (x) { return !(iv.cats || []).length || (iv.cats || []).indexOf(x.cat || 'Open') >= 0; })[0] : null;
      html += '<section class="fy" aria-labelledby="h-fy"><div class="section__head"><h2 class="section__title" id="h-fy">For you</h2><span class="fy__acts"><button class="section__more" type="button" data-toggle-all>' + (iv.all ? 'Only my picks' : 'Show everything') + '</button><button class="section__more" type="button" data-open-interests>Edit' + icon('chev', 'i--sm') + '</button></span></div>' +
        (nextFor ? '<a class="fy__next ' + catClass(nextFor) + '" href="/app/events/' + encodeURIComponent(nextFor.id) + '"><small>Next for you</small><b>' + esc(nextFor.short) + '</b><span>' + esc(dateRangeLabel(nextFor.dates, true)) + ' · ' + esc(nextFor.clubLabel) + '</span></a>' : '') +
        '<div class="fy__row">' + links.join('') + '</div></section>';
    })();
    // Live pulse: what is on right now, or a countdown to the next event with a nudge for closing entries
    if (showT('tournaments')) (function () {
      var pc = '';
      underway.slice(0, 3).forEach(function (ue) {
        var ls = ue.e.liveScoring || {}, hasDraw = (ls.sheets && ls.sheets.length) || ls.pubUrl;
        pc += '<a class="pulse pulse--live" href="/app/events/' + encodeURIComponent(ue.id) + (hasDraw ? '?tab=draw' : '') + '"><span class="pulse__dot" aria-hidden="true"></span><span class="pulse__t"><small>Happening now</small><b>' + esc(ue.short) + '</b><span>' + esc(ue.clubLabel) + '</span></span>' + (hasDraw ? '<span class="pulse__go">Draw' + icon('chev', 'i--sm') + '</span>' : '') + '</a>';
      });
      var urg = live.map(function (x) { return { x: x, st: entryStatus(x, today) }; }).filter(function (o) { return o.st && o.st.kind === 'open' && o.st.left <= 3; }).sort(function (a, b) { return a.st.left - b.st.left; })[0];
      if (urg) pc += '<a class="pulse__nudge' + (urg.st.urgent ? ' pulse__nudge--hot' : '') + '" href="/app/events/' + encodeURIComponent(urg.x.id) + '">' + icon('hourglass', 'i--sm') + '<span><b>' + (urg.st.left === 0 ? 'Entries close today' : urg.st.left === 1 ? 'Entries close tomorrow' : 'Entries close in ' + urg.st.left + ' days') + '</b> · ' + esc(urg.x.short) + '</span></a>';
      html += pc ? '<div class="pulsewrap">' + pc + '</div>' : '';
    })();
    if (heroEvs.length && showT('tournaments')) {
      var headLabel = underway.length && !sameDay.length ? 'On now' : underway.length ? 'On now and next' : (heroEvs.length > 1 ? 'Next up · ' + fmt(nextStart, { weekday: 'long', month: 'long', day: 'numeric' }) : 'Next event');
      var ddays = (!underway.length && nextStart) ? daysBetween(today, nextStart) : -1;
      var cdPill = ddays >= 0 ? '<span class="cdpill"><b class="rollnum" data-roll="' + ddays + '" data-roll-key="home-cd-' + today + '-' + ddays + '">' + ddays + '</b> ' + (ddays === 1 ? 'day to go' : 'days to go') + '</span>' : '';
      html += '<section aria-labelledby="h-next"><div class="hero-row"><h2 class="hero-label" id="h-next" tabindex="-1">' + esc(headLabel) + '</h2>' + cdPill + '</div><ul class="stage">' +
        heroEvs.map(function (heroEv) { return '<li>' + photoCard(heroEv, d.clubs, today, { big: true }) + '</li>'; }).join('') + '</ul></section>';
    }

    // 3. Four quick links as round shortcuts
    var SC = [
      ['/app/events?show=calendar', 'cal', 'Calendar', 'blue', 'tournaments', 1], ['/app/results', 'trophy', 'Results', 'orange', 'results', 1],
      ['/app/more/clubs', 'pin', 'Clubs', 'blush', 'clubs', 1], ['/app/watch', 'tv', 'Watch', 'ink', 'watch', 1],
      ['/app/standings', 'medal', 'Standings', 'orange', 'standings', 0], ['/app/more/news', 'news', 'News', 'blue', 'news', 0]];
    var scList = SC.filter(function (t) { return focusTopics ? (ivx.topics || []).indexOf(t[4]) >= 0 : (t[5] === 1 || wantsTopic(t[4])); });
    if (scList.length) html += '<nav class="shortcuts" aria-label="Sections">' + scList.sort(function (a, b) { return (wantsTopic(b[4]) ? 1 : 0) - (wantsTopic(a[4]) ? 1 : 0); }).map(function (t) {
      return '<a class="shortcut shortcut--' + t[3] + '" href="' + t[0] + '"><span class="shortcut__dot">' + icon(t[1]) + '</span><span class="shortcut__label">' + t[2] + '</span></a>';
    }).join('') + '</nav>';

    // Your clubs: the clubs you follow, one tap to each (shown only when you follow some)
    (function () {
      var fol = followed(), mineC = (d.clubs || []).filter(function (c) { return fol.indexOf(c.id || slugify(c.name)) >= 0; });
      if (!mineC.length || !showT('clubs')) return;
      html += '<section class="hsec" aria-labelledby="h-yc"><div class="section__head"><h2 class="section__title" id="h-yc">Your clubs</h2><a class="section__more" href="/app/more/clubs?view=cards">All clubs' + icon('chev', 'i--sm') + '</a></div><ul class="cstrip">' +
        mineC.map(function (c) {
          var id = c.id || slugify(c.name), ph = clubPhotoOf(c), n = live.filter(function (x) { return (x.clubIds || []).indexOf(id) >= 0; }).length;
          return '<li><a class="cstrip__i" href="/app/more/clubs/' + encodeURIComponent(id) + '"><span class="cstrip__ph"' + (ph ? ' style="--ph:url(\'' + esc(ph) + '\')"' : '') + '>' + (ph ? '' : esc((c.name || '?').charAt(0))) + '</span><span>' + esc(c.name) + '</span>' + (n ? '<small class="cstrip__n">' + n + ' upcoming</small>' : '') + '</a></li>';
        }).join('') + '</ul></section>';
    })();

    // 4. Upcoming events: a row of cards you swipe sideways
    var more = live.filter(function (x) { return !shownIds[x.id]; }).slice(0, 8);
    var icats = interestCats(); if (icats.length) more = more.filter(function (x) { return icats.indexOf(x.cat || 'Open') >= 0; }).concat(more.filter(function (x) { return icats.indexOf(x.cat || 'Open') < 0; }));
    var champFirst = focusTopics && showT('results') && !showT('tournaments');
    if (champFirst && showT('results')) html += '<div id="home-champ"></div>';
    if (more.length && showT('tournaments')) {
      var totalMore = live.filter(function (x) { return !shownIds[x.id]; }).length;
      html += '<section class="hsec" aria-labelledby="h-up"><div class="section__head section__head--count"><div class="hcount"><h2 class="section__title" id="h-up">Coming up</h2><span class="hcount__n">' + totalMore + ' tournament' + (totalMore === 1 ? '' : 's') + '</span></div></div>' +
        '<div id="home-up">' + upHtml(more, 'list', d, today) + '</div><a class="btn btn--ghost btn--wide hmore" href="/app/events">See all tournaments' + icon('chev', 'i--sm') + '</a></section>';
    }

    if (!focusTopics) html += '<a class="newcard" href="/app/page/learnmore"><span class="newcard__ic" aria-hidden="true">' + icon('bowl') + '</span><span class="newcard__t"><b>New to bowls?</b><small>Learn to bowl: the game, equipment and finding a club</small></span><span class="newcard__go" aria-hidden="true">' + icon('chev', 'i--sm') + '</span></a>';
    if (!champFirst && showT('results')) html += '<div id="home-champ"></div>';
    html += '<div class="tagline"><span class="art-plate"><img src="/photos/home/tagline-sport-for-life.png" alt="Lawn Bowls — A Sport for Life!" width="341" height="160" decoding="async" loading="lazy"></span></div>';
    html += '<div id="home-partners"></div>';

    view.innerHTML = html;
    var hv = view;
    hv.querySelectorAll('[data-toggle-all]').forEach(function (b) { b.addEventListener('click', function () { var v = Object.assign({}, interests() || {}); v.all = !v.all; store('interests', v); haptic(); render(); }); });
    hv.querySelectorAll('[data-open-interests]').forEach(function (b) { b.addEventListener('click', function () { openInterests(function () { render(); }); }); });
    view.querySelectorAll('img[data-hide-on-error]').forEach(function (img) {
      img.addEventListener('error', function () { img.hidden = true; });
    });
    getJSON('/partners-data.json').then(function (pd) {
      var el = hv.querySelector('#home-partners'); if (el) el.innerHTML = logoCard(pd, false);
    }).catch(function () {});
    var sb = view.querySelector('[data-story]');
    if (sb) sb.addEventListener('click', function () { storyDialog(d.story); });
    rollIn(view);
    loadResults().then(function (list) {
      var el = hv.querySelector('#home-champ'); if (!el) return;
      el.innerHTML = champRow(list);
    }).catch(function () {});
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
    var today = todayISO(), root = view;
    // The field appears at once (so typing carries on); results follow the data
    view.innerHTML = '<div class="searchbar"><a class="circbtn" href="/app" data-back data-close-search aria-label="Close search">' + icon('back') + '</a>' +
      '<form class="search search--page" role="search">' + icon('search') + '<label class="sr-only" for="sq">Search events, clubs, results</label>' +
      '<input id="sq" type="search" placeholder="Events, clubs, results" value="' + esc(params.get('q') || '') + '" autocomplete="off" enterkeyhint="search"></form></div>' +
      '<div id="s-out">' + loading() + '</div>';
    if (searchFocus) { searchFocus = false; var f0 = document.getElementById('sq'); f0.focus(); var n0 = f0.value.length; try { f0.setSelectionRange(n0, n0); } catch (e) {} }
    return Promise.all([loadEvents(), getJSON('/clubs-data.json').catch(function () { return { clubs: [] }; }), loadResults().catch(function () { return []; })]).then(function (all) {
      if (root !== view) return;
      var EV = all[0].map(function (x) { return { x: x, t: fold([x.e.title, x.e.subtitle, x.club, x.clubLabel, x.e.format, x.e.date, x.cat].join(' ')) }; });
      var CL = (all[1].clubs || []).map(function (c) { return { c: c, t: fold([c.name, c.city, c.summary].join(' ')) }; });
      var RS = all[2].map(function (r) { return { r: r, t: fold([r.t.title, r.t.meta, r.names].join(' ')) }; });
      var expand = params.get('all') || '';
      var input = document.getElementById('sq');
      var clubsAll = all[1].clubs || [], special = ['weekend', 'open'].indexOf(params.get('s')) >= 0 ? params.get('s') : '';
      function clubMini(c) {
        var id = c.id || slugify(c.name), ph = clubPhotoOf(c);
        return '<li><a class="smini" href="/app/more/clubs/' + encodeURIComponent(id) + '"><span class="smini__ph"' + (ph ? ' style="--ph:url(\'' + esc(ph) + '\')"' : '') + '></span><span class="smini__t"><b>' + esc(c.name) + '</b><small>' + esc(c.city) + '</small></span><span class="smini__go" aria-hidden="true">' + icon('chev', 'i--sm') + '</span></a></li>';
      }
      function recents() { var r = store('recentSearches'); return Array.isArray(r) ? r : []; }
      function remember(q) { q = String(q || '').trim(); if (q.length < 2) return; var r = recents().filter(function (z) { return fold(z) !== fold(q); }); r.unshift(q); store('recentSearches', r.slice(0, 6)); }
      function weekendRange() { var d = new Date(), dow = new Date(today + 'T12:00:00Z').getUTCDay(), toSat = (6 - dow + 7) % 7, sat = addDays(today, dow === 0 ? -1 : toSat), sun = addDays(sat, 1); return dow === 0 ? [addDays(today, 0), today] : [sat, sun]; }
      function drawSpecial(out) {
        var list;
        if (special === 'weekend') { var wr = weekendRange(); list = all[0].filter(function (x) { return x.dates && x.dates.start <= wr[1] && x.dates.end >= wr[0]; }); }
        else list = all[0].filter(function (x) { var st = entryStatus(x, today); return st && (st.kind === 'open' || st.kind === 'openish'); });
        out.innerHTML = '<h2 class="group-title">' + (special === 'weekend' ? 'This weekend' : 'Entries open') + ' <span class="muted">(' + list.length + ')</span></h2>' +
          (list.length ? '<ul class="list list--cards">' + list.map(function (x) { return eventRow(x, today); }).join('') + '</ul>' : state('empty', special === 'weekend' ? 'Nothing this weekend' : 'No entries open', 'Check the calendar for what is coming up.', '<a class="btn btn--ghost" href="/app/events?show=calendar">Open the calendar</a>'));
      }
      function drawStart(out) {
        var upc = all[0].filter(function (x) { return eventPhase(x, today) !== 'past'; }).slice(0, 5), rc = recents();
        var chips = [['weekend', 'This weekend'], ['open', 'Entries open'], ["women's", "Women's"], ["men's", "Men's"], ['mixed', 'Mixed'], ['pairs', 'Pairs'], ['triples', 'Triples'], ['singles', 'Singles']];
        out.innerHTML = '<div class="schips" role="group" aria-label="Quick searches">' + chips.map(function (c) { return '<button type="button" class="cchip" data-sq="' + esc(c[0]) + '">' + esc(c[1]) + '</button>'; }).join('') + '</div>' +
          (rc.length ? '<section class="ssec"><div class="section__head"><h2 class="section__title">Recent</h2><button class="section__more" type="button" data-clear-recent>Clear</button></div><div class="schips">' + rc.map(function (q) { return '<button type="button" class="cchip cchip--recent" data-sq="' + esc(q) + '">' + icon('clock', 'i--sm') + esc(q) + '</button>'; }).join('') + '</div></section>' : '') +
          (upc.length ? '<section class="ssec"><div class="section__head"><h2 class="section__title">Coming up</h2><a class="section__more" href="/app/events">See all' + icon('chev', 'i--sm') + '</a></div><ul class="hscroll">' + upc.map(function (x) { return '<li>' + photoCard(x, clubsAll, today) + '</li>'; }).join('') + '</ul></section>' : '') +
          champRow(all[2]).replace('class="hsec"', 'class="ssec"').replace('Latest champions', 'Latest results') +
          '<section class="ssec"><div class="section__head"><h2 class="section__title">Clubs</h2><a class="section__more" href="/app/more/clubs">See all' + icon('chev', 'i--sm') + '</a></div><ul class="cstrip">' + clubsAll.filter(function (c) { return clubPhotoOf(c); }).slice(0, 14).map(function (c) {
            return '<li><a class="cstrip__i" href="/app/more/clubs/' + encodeURIComponent(c.id || slugify(c.name)) + '"><span class="cstrip__ph" style="--ph:url(\'' + esc(clubPhotoOf(c)) + '\')"></span><span>' + esc(c.name) + '</span></a></li>'; }).join('') + '</ul></section>';
        blurUp(out);
      }
      function group(key, title, items, row, kind) {
        if (!items.length) return '';
        var shown = expand === key ? items : items.slice(0, 5);
        return '<section class="sgroup" aria-labelledby="sg-' + key + '"><h2 class="group-title" id="sg-' + key + '">' + title + ' <span class="muted">(' + items.length + ')</span></h2>' +
          '<ul class="' + (kind === 'cards' ? 'list list--cards' : kind === 'clubs' ? 'smini-list' : 'rows rows--menu') + '">' + shown.map(row).join('') + '</ul>' +
          (items.length > shown.length ? '<button class="textlink" type="button" data-expand="' + key + '">Show all ' + items.length + ' ' + title.toLowerCase() + icon('chev', 'i--sm') + '</button>' : '') + '</section>';
      }
      function apply() {
        if (root !== view) return;
        var raw = input.value.trim(), q = fold(raw), terms = q.split(/\s+/).filter(Boolean);
        var out = document.getElementById('s-out');
        var u = new URLSearchParams(); if (raw) u.set('q', raw); if (raw && expand) u.set('all', expand);
        history.replaceState(history.state, '', '/app/search' + (u.toString() ? '?' + u : ''));
        if (special) { drawSpecial(out); return; }
        if (!terms.length) { drawStart(out); return; }
        var hit = function (o) { return terms.every(function (w) { return o.t.indexOf(w) >= 0; }); };
        var ev = EV.filter(hit).map(function (o) { return o.x; });
        var up = ev.filter(function (x) { return eventPhase(x, today) !== 'past'; });
        var past = ev.filter(function (x) { return eventPhase(x, today) === 'past'; }).reverse();
        ev = up.concat(past);
        var cl = CL.filter(hit).map(function (o) { return o.c; });
        var rs = RS.filter(hit).map(function (o) { return o.r; });
        if (!ev.length && !cl.length && !rs.length) {
          out.innerHTML = state('empty', 'Nothing found', 'Nothing matches “' + raw + '”. Try a club name or a player’s last name.', '<button class="btn btn--ghost" type="button" data-clear-search>Clear search</button>');
          return;
        }
        out.innerHTML = '<p class="sr-only" aria-live="polite">' + (ev.length + cl.length + rs.length) + ' matches</p>' +
          group('events', 'Events', ev, function (x) { return eventRow(x, today); }, 'cards') +
          group('clubs', 'Clubs', cl, function (c) { return clubMini(c); }, 'clubs') +
          group('results', 'Results', rs, function (r) { return menuRow('/app/results/' + encodeURIComponent(r.id), 'trophy', shortTitle(r.t.title), r.t.meta || ''); });
      }
      var tmr;
      input.addEventListener('input', function () { expand = ''; special = ''; clearTimeout(tmr); tmr = setTimeout(apply, 120); });
      view.querySelector('form').addEventListener('submit', function (ev) { ev.preventDefault(); remember(input.value); apply(); input.blur(); });
      view.addEventListener('click', function (ev) {
        // Back arrow with a search or chip showing: step back to the Search start first, only then leave Search
        if (ev.target.closest('[data-close-search]') && (input.value.trim() || special)) { ev.preventDefault(); ev.stopPropagation(); input.value = ''; special = ''; apply(); return; }
        var sq = ev.target.closest('[data-sq]');
        if (sq) { var v = sq.getAttribute('data-sq'); haptic(); if (v === 'weekend' || v === 'open') { special = v; input.value = ''; } else { special = ''; input.value = v; remember(v); } apply(); return; }
        if (ev.target.closest('[data-clear-recent]')) { store('recentSearches', []); apply(); return; }
        if (special && ev.target.closest('.schips')) return;
        var rl = ev.target.closest('#s-out a[href]'); if (rl && input.value.trim()) remember(input.value);
        var x = ev.target.closest('[data-expand]'); if (x) { expand = x.getAttribute('data-expand'); apply(); }
        if (ev.target.closest('[data-clear-search]')) { input.value = ''; special = ''; apply(); input.focus(); }
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
    var today = todayISO(), root = view;
    return Promise.all([loadEvents(), loadResults().catch(function () { return []; })]).then(function (all) {
      if (root !== view) return;
      var events = all[0];
      var hasPast = events.some(function (x) { return eventPhase(x, today) === 'past'; });
      var show = params.get('show') || 'upcoming';
      if (show === 'saved' && !SAVE_ON) show = 'upcoming';
      if (show === 'past' && !hasPast) show = 'upcoming';
      var months = {}, clubs = {};
      events.forEach(function (x) {
        if (x.dates) months[x.dates.start.slice(0, 7)] = fmt(x.dates.start, { month: 'long', year: 'numeric' });
        (x.clubIds || []).forEach(function (cid) {
          if (clubs[cid]) return;
          var ck = CLUBS_LIST.filter(function (k) { return k.id === cid; })[0];
          clubs[cid] = ck ? ck.name : x.clubLabel;
        });
      });
      // Accept a clubs-data id, or an older bookmarked club slug
      var clubParam = params.get('club') || '';
      if (clubParam && clubParam !== 'followed' && !clubs[clubParam]) {
        var oldEv = events.filter(function (x) { return x.clubId === clubKey(clubParam) && x.clubIds && x.clubIds.length; })[0];
        clubParam = oldEv ? oldEv.clubIds[0] : '';
      }
      var f = { q: params.get('q') || '', month: params.get('month') || '', cat: params.has('cat') ? params.get('cat') : (interestCats().length === 1 && CATS.indexOf(interestCats()[0]) >= 0 ? interestCats()[0] : ''), club: clubParam };
      function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>'; }
      var segs = [['calendar', 'Calendar'], ['upcoming', 'Upcoming']].concat(SAVE_ON ? [['saved', 'Saved']] : []).concat(hasPast ? [['past', 'Completed']] : []);
      var calMonth = (f.month || today.slice(0, 7)), calDay = (/^\d{4}-\d{2}-\d{2}$/.test(params.get('day') || '') && params.get('day').slice(0, 7) === (f.month || today.slice(0, 7))) ? params.get('day') : '', evLimit = 10, evLastKey = '';
      var nSet = f.club ? 1 : 0;
      view.innerHTML = ((params.get('show') === 'saved' && history.state && /^\/app\/(my|more\/membership)\b/.test(String(history.state.from || '').split('?')[0])) ? backLink('/app/events', 'Events') : '') + pageHead('Events', '') +
        '<div class="segmented" role="group" aria-label="Which events">' + segs.map(function (k) {
          return '<button type="button" data-show="' + k[0] + '" aria-pressed="' + (k[0] === show) + '">' + k[1] + '</button>';
        }).join('') + '</div>' +
        '<div class="chips" role="group" aria-label="Filter by category">' + catChips('data-ecat', f.cat) + '</div>' +
        '<div class="monthbar tint tint--blue">' + icon('cal') +
        '<label class="monthbar__month"><span class="sr-only">Month</span><select id="f-month">' + opt('', 'Any month', f.month) +
        Object.keys(months).sort().map(function (k) { return opt(k, months[k], f.month); }).join('') + '</select></label>' +
        '<button class="monthbar__filters" type="button" data-filters aria-expanded="' + (nSet > 0) + '" aria-controls="filters-panel">Filters<span class="monthbar__n" id="f-n">' + (nSet ? ' (' + nSet + ')' : '') + '</span></button></div>' +
        '<div class="filters" id="filters-panel"' + (nSet ? '' : ' hidden') + '>' +
        '<input type="hidden" id="f-cat" value="' + esc(f.cat) + '">' +
        '<label><span class="sr-only">Club</span><select id="f-club">' + opt('', 'All clubs', f.club) + opt('followed', 'Followed clubs', f.club) +
        Object.keys(clubs).sort(function (a, b) { return clubs[a] < clubs[b] ? -1 : 1; }).map(function (k) { return opt(k, clubs[k], f.club); }).join('') + '</select></label>' +
        '</div><label class="search search--list">' + icon('search') + '<span class="sr-only">Search events</span>' +
        '<input type="search" id="q" placeholder="Search events" value="' + esc(f.q) + '" autocomplete="off" enterkeyhint="search"></label><div id="ev-results"></div>';

      function apply() {
        if (root !== view) return;
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
          else if (club && (x.clubIds || []).indexOf(club) < 0) return false;
          if (q && (x.e.title + ' ' + (x.e.subtitle || '') + ' ' + x.club + ' ' + x.clubLabel + ' ' + (x.e.format || '') + ' ' + (x.e.club && x.e.club.address || '')).toLowerCase().indexOf(q) < 0) return false;
          return true;
        });
        if (show === 'past') list = list.slice().reverse();
        var filtered = q || month || cat || club;
        var out = document.getElementById('ev-results');
        var mb = view.querySelector('.monthbar'); if (mb) mb.classList.toggle('monthbar--cal', show === 'calendar');
        if (show === 'calendar') {
          out.innerHTML = calendarHtml(list, calMonth, calDay, today);
          var wsel = out.querySelector('.wday--sel'); if (wsel && wsel.parentNode) wsel.parentNode.scrollLeft = Math.max(0, wsel.offsetLeft - 140);
          var cu = new URLSearchParams(); cu.set('show', 'calendar');
          if (q) cu.set('q', qRaw); if (cat) cu.set('cat', cat); if (club) cu.set('club', club);
          if (calMonth !== today.slice(0, 7)) cu.set('month', calMonth);
          if (calDay) cu.set('day', calDay);
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
            var evKey = [show, cat, month, club, q].join('|'); if (evKey !== evLastKey) { evLimit = 10; evLastKey = evKey; }
            var evShown = list.slice(0, evLimit);
            out.innerHTML = head +
              '<ul class="list list--cards">' + evShown.map(function (x) { return eventRow(x, today); }).join('') + '</ul>' +
              (list.length > evLimit ? '<button class="btn btn--ghost btn--wide" type="button" data-evmore>Show ' + Math.min(10, list.length - evLimit) + ' more (' + (list.length - evLimit) + ' left)</button>' : '');
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
        if (ev.target.closest('[data-evmore]')) { evLimit += 10; apply(); return; }
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
    var today = todayISO(), root = view;
    return Promise.all([loadEvents(), loadResults().catch(function () { return []; }), getJSON('/clubs-data.json').catch(function () { return {}; })]).then(function (all) {
      if (root !== view) return;
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
      var isClosed = !!(st && (st.kind === 'closed' || st.kind === 'cancelled' || st.kind === 'postponed'));
      if (phase !== 'past' && !isClosed) tabs.push(['entry', 'Entry details']);
      if (hasEntries) tabs.push(['entries', 'Entries']);
      if (hasDraw) tabs.push(['draw', 'Draw']);
      if (result) tabs.push(['results', 'Results']);
      var tab = params.get('tab');
      if (!tabs.some(function (t) { return t[0] === tab; })) tab = 'overview';

      var season = x.dates ? x.dates.start.slice(0, 4) + ' Southwest season' : '';
      // Photo header: the host club's own photo, when we have one
      var hostClub = (all[2].clubs || []).filter(function (c) { return (x.clubIds || []).indexOf(c.id) >= 0; })[0];
      var hostPhoto = hostClub && hostClub.image && /^\/photos\//.test(hostClub.image) && !hostClub.imageNeedsReview ? hostClub.image : '';
      var method = entryMethod(e);
      var hubEnter = hubOn() && phase !== 'past' && phase !== 'now' && st && st.kind !== 'closed' && st.kind !== 'cancelled' && st.kind !== 'postponed' && st.kind !== 'today';
      var entryOpen = phase !== 'past' && phase !== 'now' && st && st.kind !== 'closed' && st.kind !== 'cancelled' && st.kind !== 'postponed' && st.kind !== 'today' && method !== 'none';
      var primaryBar = hubEnter ? '<a class="btn btn--wide" href="/app/events/' + encodeURIComponent(x.id) + '/enter">Enter this tournament (preview)</a>' : entryOpen ? '<a class="btn btn--wide" href="?tab=entry" data-goto-tab="entry">' + (method === 'online' ? 'Enter online' : method === 'paypal' ? 'Enter and pay' : 'How to enter') + '</a>'
        : phase !== 'past' && method === 'none' && flyer ? '<a class="btn btn--wide" href="/app/events/' + encodeURIComponent(x.id) + '/doc/flyer">See the flyer</a>'
        : '';
      var onNow = isSaved(x.id);
      var html = (hostPhoto ? '<div class="escene__bg" aria-hidden="true" style="--ph:url(\'' + esc(hostPhoto) + '\')"></div>' : '') + backLink('/app/events', 'Events') +
        '<header class="ehero ' + catClass(x) + '"' + (hostPhoto ? ' style="--ph:url(\'' + esc(hostPhoto) + '\')"' : '') + '>' +
          '<span class="ehero__cat">' + esc(x.cat || 'Open') + '</span>' + saveBtn(x.id, x.short) +
          '<button class="iconbtn ehero__share" type="button" data-share="/app/events/' + esc(x.id) + '" data-share-title="' + esc(x.e.title) + '" aria-label="Share ' + esc(x.short) + '">' + icon('share') + '</button>' +
          '<div class="ehero__body"><p class="ehero__sub">' + esc(String(e.subtitle || '').toLowerCase().indexOf(String(x.cat || '').toLowerCase().replace(/'s$/, '')) === 0 ? e.subtitle : (e.subtitle || season)).split(' · ')[0] + '</p>' +
          '<h1 class="ehero__title">' + esc(e.title) + '</h1>' +
          (x.club ? '<p class="ehero__club">' + icon('pin', 'i--sm') + esc(x.club) + '</p>' : '') + '</div></header>' +
        '<div class="detail-date detail-date--plain"><div><b>' + (e.status === 'postponed' ? 'New date to be announced' : esc(e.date || 'Date to be announced')) + '</b>' + (e.status === 'postponed' && e.date ? '<span class="muted" style="display:block">Was ' + esc(e.date) + '</span>' : '') + statusLine(st) + '</div></div>';
      if (e.alert) html += '<div class="note" role="note"><b>' + esc(e.alertLabel || 'Update') + '</b>' + esc(e.alert) + '</div>';

      html += '<div class="esheet"><div class="esheet__grab" aria-hidden="true"></div><div class="segmented segmented--cat ' + catClass(x) + '" role="tablist" aria-label="Event sections">' + tabs.map(function (t) {
        return '<button type="button" role="tab" id="tab-' + t[0] + '" aria-controls="panel" aria-selected="' + (t[0] === tab) + '" tabindex="' + (t[0] === tab ? 0 : -1) + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div><div id="panel" role="tabpanel" tabindex="-1"></div></div>' +
        (primaryBar ? '<div class="actionbar" id="abar">' + primaryBar + '</div>' : '');
      view.innerHTML = html;
      view.querySelectorAll('img[data-hide-on-error]').forEach(function (img) { img.addEventListener('error', function () { img.parentNode.hidden = true; }); });

      function show(name, focusPanel) {
        tab = name;
        view.querySelectorAll('[role="tab"]').forEach(function (b) {
          var on = b.getAttribute('data-tab') === name;
          b.setAttribute('aria-selected', on); b.setAttribute('tabindex', on ? 0 : -1);
        });
        segReveal(view);
        var panel = document.getElementById('panel');
        var abar = document.getElementById('abar'); if (abar) abar.hidden = name === 'entry';
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

  // Free-text "format details" -> the same few icon badges for every event; anything else becomes a short note
  function formatBadges(x) {
    var e = x.e, t = String(e.formatDetails || ''), out = [], notes = [];
    var NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
    function n(v) { v = String(v).toLowerCase(); return NUM[v] || parseInt(v, 10); }
    var W = '(\\d+|one|two|three|four|five|six|seven|eight)', G = '(?:\\s+|\\s*[×x]\\s*)';
    // Take a pattern only when it appears once (several different values means the text is too detailed for a badge)
    function take(re, fn) {
      var g = new RegExp(re.source, 'gi'), all = t.match(g);
      if (!all || all.length !== 1) return;
      var mm = re.exec(t); if (mm) { fn(mm); t = t.replace(mm[0], ' · '); }
    }
    // Qualifiers that belong to the game count ("a day", "+ finals") stay with the ends badge instead of becoming stray notes
    var perDay = /\b(\d+[- ]end\s+games?|\d+[- ]point\s+games?)\s+(?:a|per|each)\s+day\b/i.test(t), plusFinals = /\bgames?\s*\+\s*finals\b/i.test(t);
    if (perDay) t = t.replace(/(\d+[- ](?:end|point)\s+games?)\s+(?:a|per|each)\s+day\b/i, '$1');
    if (plusFinals) t = t.replace(/(\bgames?)\s*\+\s*finals\b/i, '$1');
    function qual(lbl) { return lbl + (perDay ? ' / day' : '') + (plusFinals ? ' + finals' : ''); }
    take(new RegExp('\\b' + W + '[- ]bowls?\\b', 'i'), function (mm) { out.push(['bowl', n(mm[1]) + ' bowls']); });
    var before = out.length;
    take(new RegExp('\\b' + W + G + '(?:\\(\\d+\\)\\s*)?(\\d+)[- ]end\\s*games?\\b', 'i'), function (mm) { out.push(['ends', qual(n(mm[1]) + ' × ' + mm[2] + ' ends')]); });
    take(new RegExp('\\b' + W + '\\s+games?\\s+of\\s+(\\d+)\\s+ends\\b', 'i'), function (mm) { out.push(['ends', qual(n(mm[1]) + ' × ' + mm[2] + ' ends')]); });
    take(new RegExp('\\b' + W + '\\s*(?:games?\\s*)?[×x]\\s*(\\d+)\\s*ends\\b', 'i'), function (mm) { out.push(['ends', qual(n(mm[1]) + ' × ' + mm[2] + ' ends')]); });
    take(new RegExp('\\b' + W + '\\s*[×x]\\s*(\\d+)[- ]point\\s*games?\\b', 'i'), function (mm) { out.push(['ends', n(mm[1]) + ' × ' + mm[2] + ' pts']); });
    take(new RegExp('\\b' + W + '\\s+(\\d+)[- ]point\\s*games?\\b', 'i'), function (mm) { out.push(['ends', (n(mm[1]) > 1 ? n(mm[1]) + ' × ' : '') + mm[2] + ' pts']); });
    if (out.length === before) take(/\b(\d+)[- ]end\s*games?\b/i, function (mm) { out.push(['ends', mm[1] + ' ends']); });
    var ttl = fold((e.title || '') + ' ' + (x.cat || '') + ' ' + (x.short || '') + ' ' + (e.format || '')), fmt0 = fold(e.format || '');
    function wordsOf(z) { return fold(z).split(/[^a-z0-9]+/).filter(function (w) { return w && !/^(tournament|event|the|and|of|format|games?|teams?)$/.test(w); }); }
    function redundant(ws) { return ws.every(function (w) { return ttl.indexOf(w) >= 0 || w === fmt0 + 's' || w + 's' === fmt0; }); }
    t.split(/\s*[·•|]\s*/).forEach(function (sg) {
      sg = sg.replace(/^[\s,;:\-–]+|[\s,;:\-–]+$/g, '').trim(); if (!sg) return;
      // "Redundant label — explanation": keep the explanation; an explained clause ("1 powerplay — doubles ...") stays in one piece
      var dm = /^(.+?)\s+[—–]\s+(.+)$/.exec(sg);
      if (dm && wordsOf(dm[1]).length && redundant(wordsOf(dm[1]))) sg = dm[2].trim();
      // Drop brackets that wrap the whole note
      var bm = /^\((.+)\)$/.exec(sg); if (bm) sg = bm[1].trim();
      var words = wordsOf(sg);
      if (!words.length) return;
      if (redundant(words)) return;
      if (/^skip\b|^lead\b/i.test(sg) && sg.length <= 24) { out.push(['people', sg.replace(/\s*\/\s*/g, ' / ')]); return; }
      notes.push(sg);
    });
    return { badges: out, notes: notes };
  }
  function overviewPanel(x, phase, st, flyer, cops, hasResult) {
    var e = x.e, h = '';
    // Date, venue, format, deadline, fee and schedule first
    if (st && st.kind === 'closed') h += '<div class="note" role="note"><b>Entries are closed</b>' + ((e.contact && (e.contact.email || e.contact.phone)) ? 'Contact the organizer to ask about a late entry.' : 'Check the flyer for details.') + '</div>';
    // Ticket: event day(s) on the left, entry deadline (or end day) on the right, small round badges below
    if (x.dates && e.status !== 'postponed') {
      var multi = x.dates.start !== x.dates.end, st0 = startTime(e.time);
      var right = multi ? ['Ends', fmt(x.dates.end, { weekday: 'short', month: 'short', day: 'numeric' }), ''] : (x.deadline && phase !== 'past' ? ['Entries close', fmt(x.deadline, { weekday: 'short', month: 'short', day: 'numeric' }), ''] : null);
      var fb = formatBadges(x), badges = fb.badges;
      if (e.format) badges.push(['people', cap(e.format)]);
      if (e.fee && !/^tbd/i.test(e.fee)) badges.push(['$', String(e.fee).split(/\s*[(·—]/)[0].trim()]);
      if ((e.rules || []).concat(e.formatDetails || [], e.notes || []).some(function (r) { return /\bA or B green\b|designate A or B|\bA Green\b.*\bB Green\b/i.test(String(r)); })) badges.push(['A/B', 'A or B green']);
      h += '<div class="ticket"><div class="ticket__row"><div class="ticket__side"><span class="ticket__k">' + (multi ? 'Starts' : 'Event day') + '</span><b class="ticket__v">' + esc(fmt(x.dates.start, { weekday: 'short', month: 'short', day: 'numeric' })) + '</b>' + (st0 ? '<span class="ticket__s">' + esc(st0) + '</span>' : '') + '</div>' +
        (right ? '<span class="ticket__arrow" aria-hidden="true">' + icon('chev') + '</span><div class="ticket__side ticket__side--r"><span class="ticket__k">' + right[0] + '</span><b class="ticket__v">' + esc(right[1]) + '</b></div>' : '') + '</div>' +
        (badges.length ? '<ul class="ticket__badges">' + badges.map(function (b) { return '<li><span class="ticket__ic" aria-hidden="true">' + (PATHS[b[0]] ? icon(b[0]) : esc(b[0])) + '</span><span>' + esc(b[1]) + '</span></li>'; }).join('') + '</ul>' : '') + (fb.notes.length ? (fb.notes.join(' · ').length > 110 ? '<details class="ticket__fd ticket__more"><summary><span>Format notes</span>' + CHEV + '</summary><ul>' + fb.notes.map(function (z) { return '<li>' + esc(z) + '</li>'; }).join('') + '</ul></details>' : '<p class="ticket__fd">' + esc(fb.notes.join(' · ')) + '</p>') : '') +
        (e.club && e.club.address ? (safeUrl(e.club.mapUrl) ? '<a class="ticket__venue" href="' + esc(e.club.mapUrl) + '" target="_blank" rel="noopener"><span class="ticket__ic" aria-hidden="true">' + icon('pin') + '</span><span><b>' + esc(e.club.name || 'Venue') + '</b><small>' + esc(e.club.address) + ' · opens in Maps</small></span></a>' : '<div class="ticket__venue"><span class="ticket__ic" aria-hidden="true">' + icon('pin') + '</span><span><b>' + esc(e.club.name || 'Venue') + '</b><small>' + esc(e.club.address) + '</small></span></div>') : '') + '</div>';
    }
    var facts = [];
    if (!x.dates && e.format) facts.push(['Format', cap(e.format), false]);
    if (e.deadline && !x.deadline && phase !== 'past') facts.push(['Entry', e.deadline, true]);
    if (!x.dates && e.club && e.club.address) facts.push(['Venue', e.club.address, true]);
    if (!x.dates && e.formatDetails) facts.push(['Format details', e.formatDetails, true]);
    if (facts.length) {
      h += '<dl class="facts">' + facts.map(function (f) {
        return '<div' + (f[2] ? ' class="wide"' : '') + '><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd></div>';
      }).join('') + '</dl>';
    }

    // Actions: one primary, the rest quiet
    var acts = [];
    if (x.dates && phase !== 'past') acts.push('<a class="btn btn--ghost" href="' + icsHref(x) + '" download="' + esc(x.id) + '.ics" data-ics>' + icon('cal') + 'Add to calendar</a>');
    h += '<div class="actions">' + acts.join('') + '</div>';

    if (e.schedule && e.schedule.length) {
      var TIME_RE = /^(\d{1,2}(?::\d{2})?(?:\s*[–-]\s*\d{1,2}(?::\d{2})?)?\s*[AP]M)(?:\s+sharp)?\s*[—–-]\s*(\S.*)$/i;
      var schedRows = e.schedule.filter(function (z) {
        z = String(z);
        if (/^\s*\d{1,2}(?::\d{2})?\s*[AP]M\s*[—–-]\s*$/i.test(z)) return false; // time with no label
        if (e.formatDetails && !/\d\s*[AP]M/i.test(z)) {
          if (/bowls/i.test(z) && /\bgames?\b/i.test(z)) return false;
          if (/^\s*(?:\d+|one|two|three|four|five|six|seven|eight)\s+\d+[- ]end\s+games?\s*$/i.test(z)) return false; // restates the format badges
        }
        return true;
      }).map(function (s) {
        s = String(s);
        var m = TIME_RE.exec(s), t = m ? m[2] : s, note = '', tm = '';
        if (m) {
          tm = m[1].replace(/\s*([AP])M$/i, ' $1M').toUpperCase();
          if (/\bsharp\b/i.test(s.slice(0, s.indexOf(m[2])))) note = 'sharp';
        }
        var pm = /^(.*?)\s*\((.+)\)\s*$/.exec(t); if (pm) { t = pm[1]; note = note ? note + ' · ' + pm[2] : pm[2]; }
        return '<li class="' + (m ? '' : 'tline__plain') + '">' + (m ? '<b class="tline__t">' + esc(tm) + '</b>' : '') + '<span class="tline__x">' + esc(t) + (note ? '<small>' + esc(note) + '</small>' : '') + '</span></li>';
      });
      if (schedRows.length) h += '<section class="block"><h2>Schedule</h2><ol class="tline">' + schedRows.join('') + '</ol></section>';
    }
    if (phase === 'past' || (st && st.kind === 'closed')) h += docsBlock(e, flyer, cops);
    if (e.noviceDefinition) {
      var nd = String(e.noviceDefinition), dm = /^(.{2,40}?)\s[—–]\s(.+)$/.exec(nd), term = dm ? dm[1] : 'Novice', rest = dm ? dm[2] : nd;
      var sents = rest.match(/[^.!?]+[.!?]+(\s|$)/g) || [rest], lead = sents[0].trim(), more = sents.slice(1).map(function (z) { return z.trim(); });
      h += '<div class="nov"><span class="nov__ic" aria-hidden="true">' + icon('star') + '</span><div class="nov__b"><small>Who counts as a novice</small><b>' + esc(term) + '</b><p>' + esc(lead) + '</p>' +
        (more.length ? '<details class="nov__more"><summary>Cut-off and eligibility</summary>' + more.map(function (z) { return '<p>' + esc(z) + '</p>'; }).join('') + '</details>' : '') + '</div></div>';
    }
    if (e.livestreamNotice) h += '<section class="block"><h2>Livestreaming</h2><p>' + esc(e.livestreamNotice) + '</p></section>';
    h += '<ul class="rows" style="margin-top:24px">' + linkRow('/event?id=' + encodeURIComponent(x.id), 'globe', 'This event on the website', '', { ext: true }) + '</ul>';
    return h;
  }
  function docsBlock(e, flyer, cops) {
    var docs = [];
    function tile(kind0, ic, label, kind) { return '<a class="dtile" href="/app/events/' + encodeURIComponent(e.id) + '/doc/' + kind0 + '"><span class="dtile__ic" aria-hidden="true">' + icon(ic) + '</span><b>' + label + '</b><small>' + kind + '</small></a>'; }
    if (flyer) docs.push(tile('flyer', 'doc', 'Flyer', /\.(jpe?g|png|webp)$/i.test(flyer) ? 'Image' : 'Document'));
    if (cops) docs.push(tile('conditions', 'trophy', 'Conditions', 'Document'));
    return docs.length ? '<div class="dtiles">' + docs.join('') + '</div>' : '';
  }
  // The real entry process, as published. Email or postal entry stays
  // email or postal entry — it is never turned into an online sign-up.
  // How an event is entered, decided once from the data: online form, organizer's own instructions,
  // PayPal on the Division website, contact (email, phone or a mailing address), or nothing published.
  function entryMethod(e) {
    var c = e.contact || {};
    if (safeUrl(e.registrationUrl)) return 'online';
    if (e.registrationInstructions) return 'instructions';
    if (e.paypal && e.paypal.system && e.paypal.system !== 'none') return 'paypal';
    if (c.email || c.phone || c.mailTo) return 'contact';
    return 'none';
  }
  function entryPanel(x, flyer, cops) {
    var e = x.e, c = e.contact || {}, method = entryMethod(e), today = todayISO(), st = entryStatus(x, today);
    var deadline = x.deadline ? fmt(x.deadline, { weekday: 'long', month: 'long', day: 'numeric' }) : (e.deadline ? String(e.deadline).replace(/^(entry\s+)?deadline:?\s*/i, '') : '');
    var h = '';
    if (st && st.kind === 'postponed') return '<div class="note" role="note"><b>Postponed</b>' + esc(e.alert || 'A new date will be announced.') + '</div>' + docsBlock(e, flyer, cops);
    if (st && st.kind === 'cancelled') return '<div class="note" role="note"><b>This event is cancelled</b>' + esc(e.alert || '') + '</div>' + docsBlock(e, flyer, cops);
    if (st && st.kind === 'closed') h += '<div class="note" role="note"><b>Entries are closed</b>' + (c.email || c.phone ? 'Contact the organizer below to ask about a late entry.' : 'Check the flyer for details.') + '</div>';
    // Summary strip
    var facts = [];
    if (e.fee) facts.push(['Entry fee', e.fee]);
    if (deadline) facts.push(['Deadline', deadline]);
    if (st) facts.push(['Status', st.label]);
    if (facts.length) h += '<dl class="facts facts--entry">' + facts.map(function (f) { return '<div class="wide"><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd></div>'; }).join('') + '</dl>';
    // Steps
    var steps = [];
    function step(title, body) { steps.push('<li class="step"><span class="step__n" aria-hidden="true"></span><div class="step__body"><b>' + esc(title) + '</b>' + body + '</div></li>'); }
    var open = !(st && st.kind === 'closed');
    if (st && st.kind === 'today') {
      h += '<section class="block" style="margin-top:8px"><h2>Entries</h2><p>This tournament is under way, so entries are closed. The flyer and conditions of play are below.</p></section>';
    } else if (method === 'none') {
      h += '<section class="block" style="margin-top:8px"><h2>How to enter</h2><p>Entry details haven’t been published yet. Check back, or see the flyer if there is one.</p></section>';
    } else {
      step('Check the details', '<p>' + (flyer ? 'Read the flyer and conditions of play below, then ' : '') + 'make sure your team and the dates suit you.</p>');
      if (method === 'online') step('Fill in the official entry form', '<p>The organizer collects entries on their own form.</p><a class="btn btn--wide" href="' + esc(e.registrationUrl) + '" target="_blank" rel="noopener">' + esc(e.registrationLabel || 'Open the entry form') + icon('ext') + '</a>');
      if (method === 'instructions') step('Follow the organizer’s instructions', '<p>' + esc(e.registrationInstructions) + '</p>');
      if (method === 'paypal') step('Enter and pay on the Division website', '<p>Name your team and pay the entry fee by PayPal on the event’s page. It opens in your browser.</p><a class="btn btn--wide" href="/event?id=' + encodeURIComponent(x.id) + '" target="_blank" rel="noopener">' + icon('ext') + 'Enter and pay</a>');
      if (method === 'contact' || (method === 'paypal' && c.mailTo)) {
        var ways = [];
        if (c.email) ways.push('<a class="btn btn--ghost" href="mailto:' + esc(c.email) + '">' + icon('mail') + 'Email ' + esc(c.name || 'the organizer') + '</a>');
        if (c.phone) ways.push('<a class="btn btn--ghost" href="' + esc(tel(c.phone)) + '">' + icon('phone') + 'Call ' + esc(c.phone) + '</a>');
        if (method === 'contact') step('Send your entry', '<p>Tell the organizer the names of everyone on your team' + (e.format ? ' (' + esc(e.format) + ')' : '') + '.</p>' + (ways.length ? '<div class="actions">' + ways.join('') + '</div>' : ''));
        if (c.mailTo) step(method === 'paypal' ? 'Or mail your entry' : 'Mail your payment', '<p>' + esc(c.mailTo) + '</p>');
      }
      if (e.livestreamNotice) step('Good to know', '<p>' + esc(e.livestreamNotice) + '</p>');
      h += '<section class="block" style="margin-top:8px"><h2>How to enter</h2><ol class="steps">' + steps.join('') + '</ol></section>';
    }
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
  // Flyer / conditions of play shown inside the app, with a back button and an "open in browser" fallback
  function docScreen(params, id, kind) {
    setTitle(kind === 'conditions' ? 'Conditions of play' : 'Flyer');
    var root = view;
    return loadEvents().then(function (events) {
      if (root !== view) return;
      var x = events.filter(function (y) { return y.id === id; })[0];
      var d = x && x.e[kind === 'conditions' ? 'cops' : 'flyer'], url = safeUrl(d && (d.localPath || d.externalUrl));
      if (!x || !url) { view.innerHTML = backLink('/app/events/' + encodeURIComponent(id), 'Event') + state('empty', 'Document not found', 'It may have been removed.', '<a class="btn" href="/app/events/' + encodeURIComponent(id) + '">Back to the event</a>'); return; }
      var label = kind === 'conditions' ? 'Conditions of play' : 'Flyer';
      var isImg = /\.(jpe?g|png|webp|gif)$/i.test(url), isPdf = /\.pdf($|\?)/i.test(url) || /export\?format=pdf/i.test(url), isDocx = /\.docx?$/i.test(url), gdoc = /docs\.google\.com\/document/.test(url) && !/export/.test(url);
      var src = gdoc && !/embedded=true/.test(url) ? url + (url.indexOf('?') < 0 ? '?' : '&') + 'embedded=true' : url;
      var body = isImg ? '<div class="docview__img"><img src="' + esc(url) + '" alt="' + esc(label + ' for ' + x.short) + '"></div>'
        : isDocx ? state('empty', 'Preview not available', 'This file type can’t be shown here. Open it to read or save it.')
        : '<iframe class="docview__frame" src="' + esc(src) + '" title="' + esc(label + ' for ' + x.short) + '"></iframe>';
      view.innerHTML = '<div class="dhead"><a class="circbtn" href="/app/events/' + encodeURIComponent(id) + '" data-back aria-label="Back to ' + esc(x.short) + '">' + icon('back') + '</a><span class="dhead__t">' + esc(label) + '</span>' +
        '<a class="circbtn" href="' + esc(url) + '" target="_blank" rel="noopener" aria-label="Open ' + esc(label) + ' in your browser">' + icon('ext') + '</a></div>' +
        '<p class="docview__for">' + esc(x.short) + '</p>' + '<div class="docview' + (isImg || isDocx ? '' : ' docview--frame') + '">' + body + '</div>' +
        '<p class="muted docview__hint">Not showing properly? <a class="textlink" href="' + esc(url) + '" target="_blank" rel="noopener">Open in your browser</a>. Use the back arrow to return to the event.</p>';
    });
  }
  function docRow(url, label, type) {
    var kind = type === 'image' ? 'Image' : type === 'gdoc' ? 'Google Doc' : /\.pdf$/i.test(url) ? 'PDF' : 'Document';
    return linkRow(url, 'doc', label, 'Opens in a new window', { ext: true, extText: kind });
  }
  function embedCard(title, why, url, height, kind) {
    var key = 'emb-' + Math.random().toString(36).slice(2, 8);
    var ic = kind === 'list' ? 'people' : kind === 'draw' ? 'trophy' : 'doc';
    return '<div class="ecard"><div class="ecard__row"><span class="ecard__ic" aria-hidden="true">' + icon(ic) + '</span><b class="ecard__t">' + esc(title) + '</b>' +
      '<button class="btn btn--dark btn--sm" type="button" data-embed="' + key + '" data-url="' + esc(url) + '" data-h="' + (parseInt(height, 10) || 650) + '" data-title="' + esc(title) + '">View</button>' +
      '<a class="circbtn ecard__ext" href="' + esc(url.replace(/([?&])widget=true&?/, '$1').replace(/[?&]$/, '')) + '" target="_blank" rel="noopener" aria-label="Open ' + esc(title) + ' full screen">' + icon('ext') + '</a></div>' +
      (kind === 'form' ? '<p class="ecard__note">No Google account needed. If the form says “Sign in to Google to save your progress”, ignore it: fill it in and press Submit.</p>' : '') +
      '<div id="' + key + '"></div></div>';
  }
  // Our own version of the Division's Google Forms: same questions, same responses sheet,
  // but no Google page, sign-in text or extra steps. Field ids come from each form's public page.
  var NATIVE_FORMS = {
    '1FAIpQLSckmJjRIoUNxocttOTJYxivCPQYIFsfdrVy8wn1ppg7dlaEQg': {
      title: 'Send us a message', intro: 'Questions or comments about the site or about lawn bowling go to the Southwest Division.', button: 'Send message', thanks: 'Thank you. Your message has been sent to the Southwest Division.',
      fields: [{ id: 'entry.1963690784', label: 'Name', type: 'text', ac: 'name', req: true }, { id: 'entry.1742168176', label: 'Email', type: 'email', ac: 'email', req: true }, { id: 'entry.1665584687', label: 'Message', type: 'textarea', req: true }]
    }
  };
  function nativeForm(url) {
    var m = /\/forms\/d\/e\/([A-Za-z0-9_-]+)\//.exec(url), f = m && NATIVE_FORMS[m[1]]; if (!f) return '';
    var key = 'nf-' + m[1].slice(-6);
    return '<form class="nform" data-nform="' + esc(m[1]) + '" novalidate><h2 class="nform__t">' + esc(f.title) + '</h2><p class="muted">' + esc(f.intro) + '</p>' +
      f.fields.map(function (fl, i) {
        var idf = key + '-' + i;
        return '<label class="mfield" for="' + idf + '"><span>' + esc(fl.label) + (fl.req ? '' : ' (optional)') + '</span>' +
          (fl.type === 'textarea' ? '<textarea id="' + idf + '" name="' + esc(fl.id) + '" rows="5" ' + (fl.req ? 'required' : '') + '></textarea>'
            : '<input id="' + idf + '" name="' + esc(fl.id) + '" type="' + fl.type + '" ' + (fl.ac ? 'autocomplete="' + fl.ac + '" ' : '') + (fl.type === 'email' ? 'inputmode="email" ' : '') + (fl.req ? 'required' : '') + '>') + '</label>';
      }).join('') +
      '<input class="nform__hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<p class="mform__err" role="alert" data-nerr></p><div class="actions"><button class="btn btn--wide btn--dark" type="submit">' + esc(f.button) + '</button></div></form>';
  }
  document.addEventListener('submit', function (ev) {
    var form = ev.target.closest && ev.target.closest('[data-nform]'); if (!form) return;
    ev.preventDefault();
    var f = NATIVE_FORMS[form.getAttribute('data-nform')], err = form.querySelector('[data-nerr]'), btn = form.querySelector('button[type=submit]');
    if (form.querySelector('.nform__hp').value) return;   // bots fill the hidden field
    var body = new URLSearchParams(), bad = '';
    f.fields.forEach(function (fl) {
      var el = form.querySelector('[name="' + fl.id + '"]'), v = el.value.trim();
      if (fl.req && !v && !bad) bad = 'Please fill in ' + fl.label.toLowerCase() + '.';
      if (fl.type === 'email' && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) && !bad) bad = 'Enter a valid email address.';
      body.append(fl.id, v);
    });
    if (bad) { err.textContent = bad; return; }
    var last = +(store('lastForm') || 0); if (Date.now() - last < 20000) { err.textContent = 'Please wait a moment before sending again.'; return; }
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Sending…';
    fetch('https://docs.google.com/forms/d/e/' + form.getAttribute('data-nform') + '/formResponse', { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() })
      .then(function () {
        store('lastForm', Date.now()); haptic('medium');
        form.innerHTML = '<div class="nform__done"><span class="illo illo--teal" aria-hidden="true"><i class="illo__a"></i><i class="illo__b"></i><i class="illo__c"></i><span class="illo__card">' + icon('check') + '</span></span><h2 class="nform__t">Sent</h2><p>' + esc(f.thanks) + '</p></div>';
      }, function () { btn.disabled = false; btn.textContent = f.button; err.textContent = 'This needs a connection. Check your signal and try again.'; });
  });
  function entriesPanel(e) {
    return '<section class="block" style="margin-top:8px">' +
      embedCard('Teams entered', '', e.entries.pubUrl, e.entries.height, 'list') +
      '</section>';
  }
  function drawPanel(e) {
    var ls = e.liveScoring || {};
    var h = '<section class="block" style="margin-top:8px"><h2>Draw</h2>';
    if (ls.gated) return h + '<div id="gated">' + loading() + '</div></section>';
    if (ls.sheets && ls.sheets.length) {
      h += ls.sheets.map(function (s) { return embedCard(s.label || 'Draw', 'The draw from the tournament’s Google Sheet. Needs a connection.', s.url, s.height, 'draw'); }).join('');
    } else {
      h += embedCard('Draw', 'The draw from the tournament’s Google Sheet. Needs a connection.', ls.pubUrl, ls.height, 'draw');
    }
    return h + '</section>';
  }
  function loadGated(id) {
    fetch('/api/live-scoring?id=' + encodeURIComponent(id), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      var box = document.getElementById('gated'); if (!box) return;
      if (d && d.sheets && d.sheets.length) {
        box.innerHTML = d.sheets.map(function (s) { return embedCard(s.label || 'Draw', 'The draw from the tournament’s Google Sheet.', s.url, s.height, 'draw'); }).join('');
      } else {
        box.innerHTML = '<p>The draw will appear here once it is published.</p>';
      }
    }).catch(function () {
      var box = document.getElementById('gated');
      if (box) box.innerHTML = '<p>The draw needs a connection. Try again when you have a signal.</p>';
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
    var root = view;
    return Promise.all([loadResults(), standingsLink()]).then(function (all) {
      if (root !== view) return;
      var list = all[0], standLink = all[1];
      var f = { q: params.get('q') || '', cat: params.get('cat') || '', year: params.get('year') || '' };
      var years = {}; list.forEach(function (r) { if (r.year) years[r.year] = 1; });
      function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>'; }
      view.innerHTML = pageHead('Results', '') +
        champStrip(list) + standLink +
        '<section class="section" aria-labelledby="h-latest">' + sectionHead('h-latest', 'Recent results') +
        '<div class="chips" role="group" aria-label="Filter results">' + catChips('data-cat', f.cat) + (Object.keys(years).length > 1 ? '<label class="chip chip--select"><span class="sr-only">Year</span><select id="f-year">' + opt('', 'All years', f.year) + Object.keys(years).sort().reverse().map(function (y) { return opt(y, y, f.year); }).join('') + '</select></label>' : '<input type="hidden" id="f-year" value="">') + '</div>' +
        '<input type="hidden" id="f-cat" value="' + esc(f.cat) + '">' +
        '<label class="search search--list">' + icon('search') + '<span class="sr-only">Search results or players</span>' +
        '<input type="search" id="q" placeholder="Search results or players" value="' + esc(f.q) + '" autocomplete="off" enterkeyhint="search"></label>' +
        '<div id="res-list"></div></section>' +
        '<ul class="rows" style="margin-top:24px">' + linkRow('/archive', 'doc', '2022–2025 results', 'The results archive', { ext: true }) + '</ul>' +
        '';
      wireDecks(view);
      view.querySelectorAll('img[data-hide-on-error]').forEach(function (img) { img.addEventListener('error', function () { img.hidden = true; }); });
      function apply() {
        if (root !== view) return;
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
        var rKey = [cat, year, q].join('|'); if (rKey !== rLastKey) { rLimit = 8; rLastKey = rKey; }
        var cap = rLimit, shown = out.slice(0, cap);
        document.getElementById('res-list').innerHTML = '<p class="sr-only" aria-live="polite">' + out.length + ' result' + (out.length === 1 ? '' : 's') + '</p>' + (out.length
          ? '<ul class="list list--plain">' + shown.map(resultRow).join('') + '</ul>' +
            (out.length > cap ? '<button class="btn btn--ghost btn--wide" type="button" data-showall>Show ' + Math.min(8, out.length - cap) + ' more (' + (out.length - cap) + ' left)</button>'
              : filtered ? '<p class="count">' + out.length + ' result' + (out.length === 1 ? '' : 's') + ' <button class="clear" type="button" data-clear>Clear filters</button></p>' : '')
          : state('empty', 'No results match', 'Try a different name or clear the filters.', '<button class="btn btn--ghost" type="button" data-clear>Clear filters</button>'));
        var u = new URLSearchParams();
        if (q) u.set('q', qRaw); if (cat) u.set('cat', cat); if (year) u.set('year', year);
        history.replaceState(history.state, '', '/app/results' + (u.toString() ? '?' + u : ''));
      }
      var t, rLimit = 8, rLastKey = '';
      document.getElementById('q').addEventListener('input', function () { clearTimeout(t); t = setTimeout(apply, 150); });
      var yr = document.getElementById('f-year'); if (yr) yr.addEventListener('change', apply);
      view.addEventListener('click', function (ev) {
        var ch = ev.target.closest('[data-cat]');
        if (ch) { document.getElementById('f-cat').value = ch.getAttribute('data-cat'); apply(); return; }
        if (ev.target.closest('[data-showall]')) { rLimit += 8; apply(); return; }
        if (ev.target.closest('[data-clear]')) {
          document.getElementById('q').value = ''; document.getElementById('f-cat').value = ''; document.getElementById('f-year').value = ''; rLimit = 8; apply();
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
        (r.t.divisions && r.t.divisions.length > 1 ? '<p class="muted divhint">' + r.t.divisions.length + ' events in this tournament. Tap one to see its results.</p>' : '') +
        awardsHtml(r.t) + divisionsHtml(r.t, params.get('division') || '') +
        '<div class="actions" style="margin-top:24px">' + shareBtn(r.t.title + ' — results', '/app/results/' + r.id) + '</div>' +
        (r.eventId ? '<ul class="rows" style="margin-top:16px">' + linkRow('/app/events/' + encodeURIComponent(r.eventId), 'cal', 'Event details') + '</ul>' : '');
      wireDecks(view);
      var want = params.get('division') && document.getElementById('div-' + params.get('division'));
      if (want) setTimeout(function () { want.scrollIntoView({ block: 'start' }); }, 60);
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
        segReveal(view);
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
    // Tournament awards (results-data.json: "awards": [{ "title": "Player of the Tournament", "names": "...", "photo": "...", "note": "..." }])
  function awardsHtml(t) {
    var a = (t.awards || []).filter(function (x) { return x && x.title && x.names; });
    if (!a.length) return '';
    return '<section class="awards" aria-label="Awards">' + a.map(function (x) {
      return '<div class="award"><span class="award__ic" aria-hidden="true">' + icon('medal') + '</span><span class="award__body"><span class="award__title">' + esc(x.title) + '</span>' +
        '<span class="award__who">' + esc(x.names) + '</span>' + (x.note ? '<span class="award__note">' + esc(x.note) + '</span>' : '') + '</span>' +
        (safeUrl(x.photo) ? '<img class="place__photo" src="' + esc(x.photo) + '" alt="' + esc(x.names) + '" loading="lazy">' : '') + '</div>';
    }).join('') + '</section>';
  }
  function divSlug(dv) { return dv.slug || slugify(dv.label || 'results'); }
  // Swipeable deck (one big card at a time). Used for champions and podium photos.
  function deckShell(slides, label) {
    return '<div class="cdeck" role="group" aria-roledescription="carousel" aria-label="' + esc(label) + '">' +
      '<div class="cdeck__bar"><span class="cdeck__count" aria-live="polite">1 of ' + slides.length + '</span>' + (slides.length > 1 ? '<span class="cdeck__arrows"><button class="circbtn" type="button" data-deck="-1" aria-label="Previous">' + icon('back') + '</button><button class="circbtn" type="button" data-deck="1" aria-label="Next">' + icon('chev') + '</button></span>' : '') + '</div>' +
      '<ul class="cdeck__track" tabindex="0" aria-label="' + esc(label) + '">' + slides.map(function (h, i) {
        return '<li class="cdeck__slide" role="group" aria-roledescription="slide" aria-label="' + (i + 1) + ' of ' + slides.length + '">' + h + '</li>'; }).join('') + '</ul></div>';
  }
  function wireDecks(root) {
    root.querySelectorAll('.cdeck').forEach(function (dk) {
      if (dk.dataset.wired) return; dk.dataset.wired = '1';
      var tr = dk.querySelector('.cdeck__track'), cn = dk.querySelector('.cdeck__count'), n = tr.children.length;
      function w() { var sl = tr.querySelector('.cdeck__slide'); return sl ? sl.getBoundingClientRect().width + 14 : 1; }
      function cur() { if (tr.scrollLeft + tr.clientWidth >= tr.scrollWidth - 2) return n - 1; return Math.max(0, Math.min(n - 1, Math.round(tr.scrollLeft / w()))); }
      function step(d) { tr.scrollTo({ left: (cur() + d) * w(), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
      tr.addEventListener('scroll', function () { cn.textContent = (cur() + 1) + ' of ' + n; }, { passive: true });
      window.addEventListener('resize', function () { if (cn && cn.isConnected) cn.textContent = (cur() + 1) + ' of ' + n; });
      tr.addEventListener('keydown', function (ev) { if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') { ev.preventDefault(); step(ev.key === 'ArrowRight' ? 1 : -1); } });
      dk.querySelectorAll('[data-deck]').forEach(function (b) { b.addEventListener('click', function () { step(+b.getAttribute('data-deck')); }); });
    });
  }
  // Podium as big swipeable photo cards (1st, 2nd, 3rd)
  function podiumDeck(podium, label, winnerLabel) {
    return deckShell(podium.map(function (p) {
      var n = +p.rank, cls = n === 1 ? 'plc--1' : n === 2 ? 'plc--2' : n === 3 ? 'plc--3' : 'plc--n', ph = safeUrl(p.photo);
      return '<article class="kcard kcard--pod"><div class="kcard__photo"' + (ph ? ' style="--ph:url(\'' + esc(ph) + '\')"' : '') + '>' +
        '<span class="kcard__place plc ' + cls + '">' + (n ? '<b>' + n + '</b><small>' + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th') + '</small>' : icon('trophy')) + '</span></div>' +
        '<div class="kcard__body"><h3 class="kcard__name">' + esc(p.names || '') + '</h3>' + (n === 1 ? '<p class="kcard__city">' + esc(winnerLabel || 'Champions') + '</p>' : (p.rankLabel && !/place$/i.test(p.rankLabel) ? '<p class="kcard__city">' + esc(p.rankLabel) + '</p>' : '')) + '</div></article>';
    }), (label || 'Results') + ' podium');
  }
  function divisionsHtml(t, openSlug) {
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
      var multi = divs.length > 1, isOpen = multi && openSlug && divSlug(dv) === openSlug;
      var lead = podium[0] && podium[0].names ? '1st: ' + podium[0].names : '';
      var html = (multi ? '<details class="divcard" id="div-' + esc(divSlug(dv)) + '"' + (isOpen ? ' open' : '') + '><summary><span class="divcard__main"><span class="divcard__name">' + esc(dv.label || 'Results') + '</span>' +
        (lead ? '<span class="divcard__lead">' + esc(lead) + '</span>' : '') + '</span>' + CHEV + '</summary>' : '') +
        '<section class="division' + (multi ? ' division--in' : '') + '">' + (multi ? '' : '<h2 class="division__title">' + esc(dv.label || 'Results') + '</h2>') +
        (dv.venue ? '<p class="division__venue">' + esc(dv.venue) + '</p>' : '') +
        (groups.length > 1 && groups[0].label ? '<h3 class="flight">' + esc(groups[0].label) + '</h3>' : '') +
        (podium.some(function (p) { return safeUrl(p.photo); }) ? podiumDeck(podium, dv.label, winnerLabel) : '<ol class="places" aria-label="' + esc(dv.label || '') + ' top places">' + podium.map(item).join('') + '</ol>');
      if (total > podium.length) {
        html += '<details class="fold"><summary><span>Complete standings</span><span class="row__meta">' + total + ' places' +
          (groups.length > 1 ? ' · ' + groups.length + ' flights' : '') + '</span>' + CHEV + '</summary>' +
          groups.map(function (g) {
            return (g.label ? '<h3 class="flight">' + esc(g.label) + '</h3>' : '') +
              '<ol class="places" aria-label="' + esc((dv.label || '') + ' ' + (g.label || '')) + ' standings">' + byRank(g.places).map(item).join('') + '</ol>';
          }).join('') + '</details>';
      }
      if (dv.eventUrl) html += '<ul class="rows">' + linkRow(dv.eventUrl, '', 'Full breakdown on the website', '', { ext: true }) + '</ul>';
      return html + '</section>' + (multi ? '</details>' : '');
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
      var played = events.filter(function (x) { return eventPhase(x, today) === 'past' && x.e.status !== 'cancelled' && x.e.status !== 'postponed'; }).length;
      var upcoming = events.filter(function (x) { var ph = eventPhase(x, today); return (ph === 'upcoming' || ph === 'now') && x.e.status !== 'postponed'; }).length;
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
      view.innerHTML = '<h1 class="sr-only">More</h1>' +
        '<section class="hub" aria-label="Southwest Bowls Division"><span class="logo-plate hub__logo"><img src="/assets/app/swd-logo.png" alt="" width="64" height="75"></span>' +
        '<div class="hub__text"><span class="hub__name">Southwest Bowls Division</span><span class="hub__sub">Lawn bowls across Southern California</span></div>' +
        '<div class="hub__stats">' + metric('more-clubs', nClubs, 'Clubs', 'in the Division') + metric('more-ahead', upcoming, 'Tournaments', 'coming up') + metric('more-played', played, 'Tournaments', 'played this season') + '</div></section>' +
        group('Explore', [
          mrow('/app/more/clubs', 'pin', 'Clubs', nClubs ? nClubs + ' clubs, on a map or in a list' : 'Map and list', 'blue'),
          mrow('/app/more/news', 'news', 'News', news[0] ? news[0].title : '', 'blue'),
          mrow('/app/more/play', 'flag', 'Learn bowls', 'Learn to bowl, coaching, umpires, markers', 'blue'),
          mrow('/app/watch', 'tv', 'Southwest TV', 'Livestreams and replays', 'blue'),
          mrow('/app/more/resources', 'doc', 'Resources', '', 'blue')]) +
        group('About', [
          mrow('/app/page/about-us', 'info', 'About Southwest', '', 'blush'),
          mrow('/app/page/contact-us', 'mail', 'Help and contact', '', 'blush'),
          mrow('/', 'globe', 'Southwest website', 'swlawnbowls.org', 'blush'),
          mrow(FACEBOOK_URL, 'facebook', 'Facebook', 'Follow Southwest', 'blush')]) +
        group('This app', [
          mrow('/app/more/settings', 'sliders', 'App settings', 'Appearance, text size, offline copies', 'orange')].concat(hubOn() ? [mrow('/app/td', 'flag', 'Director console', 'Preview for tournament directors', 'orange')] : []));
      rollIn(view);
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
    var root = view;
    return getJSON('/news-data.json').then(function (d) {
      if (root !== view) return;
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
    var root = view;
    return getJSON('/news-data.json').then(function (d) {
      if (root !== view) return;
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
        (X(+c.lng) / W * 100).toFixed(2) + '%;top:' + (Y(+c.lat) / H * 100).toFixed(2) + '%" aria-label="' + esc(c.name + ', ' + c.city + (on ? ', following' : '')) + '"><span>' + (on ? '★' : '') + '</span></button>';
    }).join('') + '</div>';
  }
  function clubCard(c) {
    if (!c) return '<p class="cmap__hint">Tap a pin to see the club.</p>';
    var id = c.id || slugify(c.name);
    var photo = c.image && /^\/photos\//.test(c.image) && !c.imageNeedsReview ? c.image : '';
    return '<a class="ccard" href="/app/more/clubs/' + encodeURIComponent(id) + '">' + (photo ? '<img class="ccard__img" src="' + esc(photo) + '" alt="" width="72" height="72" loading="lazy" data-hide-on-error>' : '') +
      '<span class="ccard__body"><span class="ccard__title">' + esc(c.name) + '</span><span class="ccard__meta">' + esc(c.city + (c.status === 'private' ? ' · Private club' : '')) + '</span></span>' + CHEV + '</a>';
  }
  // ---- Real map for Clubs: MapLibre GL (pinned, integrity-checked) with free OpenFreeMap tiles (no key, attribution shown).
  // Loaded only when the Map view opens. Offline or blocked: the List view still works.
  var GL = { ver: '5.0.0', js: 'sha384-uzH6alJI5hB1hqml80DtV/R/SB8mRrfGK9TiH7uGTQ618rNgn0lnsBg51nkjXs0C', css: 'sha384-cyKFz9GetByk44KXH2w9xiOp2bD58WKp/8MZYUSlksGVIVVP92OnWJ8uwsEvF2gP' };
  var glPromise = null;
  function loadMapLibre() {
    if (window.maplibregl) return Promise.resolve(window.maplibregl);
    if (glPromise) return glPromise;
    glPromise = new Promise(function (resolve, reject) {
      if (!navigator.onLine) { glPromise = null; return reject(new Error('offline')); }
      var base = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/' + GL.ver + '/';
      var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = base + 'maplibre-gl.css'; l.integrity = GL.css; l.crossOrigin = 'anonymous'; document.head.appendChild(l);
      var sc = document.createElement('script'); sc.src = base + 'maplibre-gl.js'; sc.integrity = GL.js; sc.crossOrigin = 'anonymous';
      sc.onload = function () { window.maplibregl ? resolve(window.maplibregl) : (glPromise = null, reject(new Error('maplibre missing'))); };
      sc.onerror = function () { glPromise = null; reject(new Error('maplibre blocked')); };
      document.head.appendChild(sc);
    });
    return glPromise;
  }
  function clubPhotoOf(c) { return c.image && /^\/photos\//.test(c.image) && !c.imageNeedsReview ? c.image : ''; }
  function clubsList(params) {
    setTitle('Clubs');
    var root = view;
    return Promise.all([getJSON('/clubs-data.json'), loadEvents().catch(function () { return []; })]).then(function (all) {
      if (root !== view) return;
      var d = all[0], clubs = d.clubs || [], evAll = all[1], todayC = todayISO();
      function upcomingAt(id) { return evAll.filter(function (x) { return (x.clubIds || []).indexOf(id) >= 0 && eventPhase(x, todayC) !== 'past'; }).length; }
      var q0 = params.get('q') || '', cview = params.get('view') === 'list' ? 'list' : params.get('view') === 'map' ? 'map' : 'cards', selId = '';
      var map = null, markers = [];
      var cchip = 'all';
      view.innerHTML = backLink('/app/more', 'More') + '<div class="chead"><h1 class="chead__t">Find a <b>club</b></h1><p class="chead__s">' + clubs.length + ' clubs, Cambria to Coronado</p></div>' +
        '<div class="csearch"><label class="search search--list">' + icon('search') + '<span class="sr-only">Search clubs</span>' +
        '<input type="search" id="q" placeholder="Search by club or city" value="' + esc(q0) + '" autocomplete="off"></label>' +
        '<button class="circbtn" type="button" data-cview="' + (cview === 'map' ? 'cards' : 'map') + '" id="c-toggle" aria-label="' + (cview === 'map' ? 'Show club cards' : 'Show map') + '">' + icon(cview === 'map' ? 'doc' : 'map') + '</button></div>' +
        '<div class="cchips" role="group" aria-label="Filter clubs">' + [['all', 'All'], ['open', 'Open'], ['private', 'Private'], ['following', 'Following']].map(function (k) {
          return '<button type="button" class="cchip" data-cchip="' + k[0] + '" aria-pressed="' + (k[0] === 'all') + '">' + k[1] + '</button>'; }).join('') + '</div>' +
        '<div id="c-map"></div><div id="c-list"></div>';
      function shownClubs() {
        var q = fold(document.getElementById('q').value.trim());
        return clubs.filter(function (c) {
          if (cchip === 'open' && c.status === 'private') return false;
          if (cchip === 'private' && c.status !== 'private') return false;
          if (cchip === 'following' && !isFollowing(c.id || slugify(c.name))) return false;
          return !q || fold(c.name + ' ' + c.city + ' ' + (c.summary || '')).indexOf(q) >= 0; });
      }
      function clubOf(id) { return clubs.filter(function (c) { return (c.id || slugify(c.name)) === id; })[0]; }
      function sheet(c) {
        var el = document.getElementById('c-sheet'); if (!el) return;
        if (!c) { el.hidden = true; el.innerHTML = ''; return; }
        var id = c.id || slugify(c.name), ph = clubPhotoOf(c);
        el.hidden = false;
        el.innerHTML = (ph ? '<img class="csheet__img" src="' + esc(ph) + '" alt="" width="72" height="72">' : '') +
          '<span class="csheet__body"><span class="csheet__name">' + esc(c.name) + '</span><span class="csheet__city">' + esc(c.city + (c.status === 'private' ? ' · Private club' : '')) + '</span></span>' +
          '<a class="btn btn--sm" href="/app/more/clubs/' + encodeURIComponent(id) + '">Open</a>';
      }
      function select(id, fly) {
        selId = id;
        markers.forEach(function (m) { m.el.classList.toggle('gpin--sel', m.id === id); });
        var c = clubOf(id); sheet(c);
        if (fly && map && c && c.lat) map.easeTo({ center: [+c.lng, +c.lat], duration: 450 });
      }
      function drawMarkers(gl) {
        markers.forEach(function (m) { m.marker.remove(); }); markers = [];
        var list = shownClubs(), bounds = new gl.LngLatBounds();
        list.forEach(function (c) {
          if (!c.lat || !c.lng) return;
          var id = c.id || slugify(c.name), ph = clubPhotoOf(c), on = isFollowing(id);
          var el = document.createElement('button'); el.type = 'button'; el.className = 'gpin' + (on ? ' gpin--on' : '') + (id === selId ? ' gpin--sel' : '');
          el.setAttribute('aria-label', c.name + ', ' + c.city + (on ? ', following' : ''));
          if (ph) el.style.backgroundImage = 'url("' + ph + '")';
          el.addEventListener('click', function (ev) { ev.stopPropagation(); select(id, true); });
          var mk = new gl.Marker({ element: el, anchor: 'center' }).setLngLat([+c.lng, +c.lat]).addTo(map);
          markers.push({ id: id, el: el, marker: mk }); bounds.extend([+c.lng, +c.lat]);
        });
        if (list.length) { try { map.fitBounds(bounds, { padding: { top: 56, bottom: 110, left: 40, right: 40 }, maxZoom: 11, duration: 0 }); } catch (e) {} }
        if (selId && !list.some(function (c) { return (c.id || slugify(c.name)) === selId; })) { selId = ''; sheet(null); }
      }
      function drawMap() {
        var box = document.getElementById('c-map');
        if (window.__swdMap) { try { window.__swdMap.remove(); } catch (e) {} window.__swdMap = null; map = null; markers = []; }
        if (cview !== 'map') { box.innerHTML = ''; return; }
        box.innerHTML = '<div class="mapwrap"><div id="c-gl" class="mapgl" role="region" aria-label="Map of clubs"></div><div id="c-sheet" class="csheet" aria-live="polite" hidden></div></div>';
        loadMapLibre().then(function (gl) {
          if (!document.getElementById('c-gl')) return;
          var dark = document.documentElement.getAttribute('data-theme') === 'dark';
          map = new gl.Map({ container: 'c-gl', style: 'https://tiles.openfreemap.org/styles/' + (dark ? 'dark' : 'positron'), center: [-118.2, 34.0], zoom: 7, attributionControl: { compact: true }, dragRotate: false, touchPitch: false });
          window.__swdMap = map;
          map.touchZoomRotate.disableRotation();
          map.addControl(new gl.NavigationControl({ showCompass: false }), 'top-right');
          var shownOk = false;
          map.on('load', function () { shownOk = true; drawMarkers(gl); });
          map.on('click', function () { select('', false); });
          // Safety net: if the map has not drawn after 10 s (slow network, blocked tiles), say so and offer the list
          setTimeout(function () {
            if (shownOk || !document.getElementById('c-gl') || document.getElementById('c-slow')) return;
            var w = document.querySelector('.mapwrap'); if (!w) return;
            w.insertAdjacentHTML('beforeend', '<div class="mapslow" id="c-slow" role="status"><b>The map is slow to load.</b> <button class="textlink" type="button" data-cview-go="list">Show the list instead</button></div>');
          }, 10000);
        }).catch(function () {
          box.innerHTML = state('empty', 'The map needs a connection', 'You can still browse every club in the list.', '<button class="btn" type="button" data-cview-go="list">Show the list</button>');
        });
      }
      // Cards: one big club at a time, swipe left or right. Photo on top in the phone's own shape, details below.
      function drawDeck(box, list) {
        if (!list.length) { box.innerHTML = state('empty', 'No clubs match', cchip === 'following' ? 'Follow a club and it shows up here.' : 'Try another name or city.'); return; }
        box.innerHTML = '<p class="count">' + list.length + ' club' + (list.length === 1 ? '' : 's') + '</p><ul class="clgrid">' + list.map(function (c, i) {
          var id = c.id || slugify(c.name), ph = clubPhotoOf(c), on = isFollowing(id), up = upcomingAt(id);
          return '<li class="clcard"><div class="clcard__ph clcard__ph--' + (i % 3) + (ph ? '' : ' clcard__ph--none') + '"' + (ph ? ' style="--ph:url(\'' + esc(ph) + '\')"' : '') + '>' + (ph ? '' : '<span class="ph__mark" aria-hidden="true">' + esc(String(c.name || '?').charAt(0).toUpperCase()) + '</span>') +
            '<a class="clcard__link" href="/app/more/clubs/' + encodeURIComponent(id) + '" aria-label="' + esc(c.name + ', ' + c.city) + '"></a>' +
            '<button class="iconbtn gbtn clcard__fav" type="button" data-follow="' + esc(id) + '" data-name="' + esc(c.name) + '" aria-pressed="' + on + '" aria-label="Follow ' + esc(c.name) + '">' + icon('star') + '</button>' +
            '<span class="clcard__tag' + (c.status === 'private' ? '' : ' clcard__tag--open') + '">' + (c.status === 'private' ? 'Private' : 'Open') + '</span></div>' +
            '<a class="clcard__body" href="/app/more/clubs/' + encodeURIComponent(id) + '"><b>' + esc(c.name) + '</b>' + ((fold(c.city) !== fold(c.name) || up) ? '<span><small>' + (fold(c.city) !== fold(c.name) ? esc(c.city) : '') + '</small>' + (up ? '<em>' + up + ' upcoming</em>' : '') + '</span>' : '') + '</a></li>';
        }).join('') + '</ul>';
      }
      function syncUrl() {
        var u = new URLSearchParams(), qv = document.getElementById('q').value.trim();
        if (qv) u.set('q', qv); if (cview !== 'cards') u.set('view', cview);
        history.replaceState(history.state, '', '/app/more/clubs' + (u.toString() ? '?' + u : ''));
      }
      function apply() {
        syncUrl();
        var box = document.getElementById('c-list');
        if (cview === 'map') { box.innerHTML = ''; return; }
        var list = shownClubs();
        if (cview === 'cards') { drawDeck(box, list); return; }
        box.innerHTML = list.length ? '<p class="count">' + list.length + ' club' + (list.length === 1 ? '' : 's') + '</p><ul class="ccovers">' + list.map(function (c) {
          var id = c.id || slugify(c.name), on = isFollowing(id), ph = clubPhotoOf(c);
          return '<li><a class="ccover" href="/app/more/clubs/' + encodeURIComponent(id) + '"' + (ph ? ' style="--ph:url(\'' + esc(ph) + '\')"' : '') + '>' +
            '<span class="ccover__chips">' + (c.status === 'private' ? '<span class="ccover__chip">Private club</span>' : '') + (on ? '<span class="ccover__chip ccover__chip--on">' + icon('star') + 'Following</span>' : '') + '</span>' +
            '<span class="ccover__body"><span class="ccover__name">' + esc(c.name) + '</span><span class="ccover__city">' + icon('pin', 'i--sm') + esc(c.city) + '</span></span></a></li>';
        }).join('') + '</ul>' : state('empty', 'No clubs match', 'Try another name or city.');
      }
      document.getElementById('q').addEventListener('input', function () {
        apply();
        if (cview === 'map' && map && window.maplibregl) drawMarkers(window.maplibregl);
      });
      view.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-searchtoggle]')) { var sl1 = view.querySelector('.search--list'); sl1.hidden = !sl1.hidden; sl1.dataset.open = sl1.hidden ? '' : '1'; if (!sl1.hidden) document.getElementById('q').focus(); return; }
        var ch = ev.target.closest('[data-cchip]');
        if (ch) { cchip = ch.getAttribute('data-cchip'); view.querySelectorAll('[data-cchip]').forEach(function (b) { b.setAttribute('aria-pressed', b === ch); }); apply(); if (cview === 'map' && map && window.maplibregl) drawMarkers(window.maplibregl); return; }
        var go = ev.target.closest('[data-cview-go]');
        var cv = ev.target.closest('[data-cview]') || (go && { getAttribute: function () { return go.getAttribute('data-cview-go'); } });
        if (cv) { cview = cv.getAttribute('data-cview') || cv.getAttribute('data-cview-go'); var tg = document.getElementById('c-toggle'); if (tg) { tg.setAttribute('data-cview', cview === 'map' ? 'cards' : 'map'); tg.setAttribute('aria-label', cview === 'map' ? 'Show club cards' : 'Show map'); tg.innerHTML = icon(cview === 'map' ? 'doc' : 'map'); } drawMap(); apply(); }
      });
      apply(); drawMap();
    });
  }
  function clubDetail(params, slug) {
    setTitle('Club');
    var root = view;
    return Promise.all([getJSON('/clubs-data.json'), loadEvents().catch(function () { return []; })]).then(function (all) {
      if (root !== view) return;
      var d = all[0], allEv = all[1];
      var c = (d.clubs || []).filter(function (x) { return (x.id || slugify(x.name)) === slug || slugify(x.name) === slug; })[0];
      if (!c) { view.innerHTML = backLink('/app/more/clubs', 'Clubs') + state('empty', 'Club not found', '', '<a class="btn" href="/app/more/clubs">All clubs</a>'); return; }
      setTitle(c.name);
      var cid = c.id || slugify(c.name);
      var maps = c.lat && c.lng ? 'https://www.google.com/maps/search/?api=1&query=' + c.lat + ',' + c.lng : '';
      // Only a local, unflagged photo is shown (never a hotlink, never a doubtful one)
      var photo = c.image && /^\/photos\//.test(c.image) && !c.imageNeedsReview ? c.image : '';
      // One primary action pinned at the bottom (Directions, else the website), Follow beside it
      var primary = maps ? '<a class="btn btn--wide btn--dark" href="' + maps + '" target="_blank" rel="noopener">' + icon('map') + 'Directions</a>'
        : safeUrl(c.website) ? '<a class="btn btn--wide" href="' + esc(c.website) + '" target="_blank" rel="noopener">' + icon('globe') + 'Website</a>' : '';
      var facts = [];
      if (c.phone) facts.push(menuRow(tel(c.phone), 'phone', 'Call ' + c.phone));
      if (c.email) facts.push(menuRow('mailto:' + c.email, 'mail', c.email));
      if (safeUrl(c.website) && maps) facts.push(menuRow(c.website, 'globe', 'Website'));
      var fon = isFollowing(cid), today = todayISO();
      var mine = allEv.filter(function (x) { return (x.clubIds || []).indexOf(cid) >= 0; });
      var up = mine.filter(function (x) { return eventPhase(x, today) !== 'past'; });
      var tiles = [];
      if (maps) tiles.push(['map', 'Directions', maps, true]);
      if (c.phone) tiles.push(['phone', 'Call', tel(c.phone), false]);
      if (c.email) tiles.push(['mail', 'Email', 'mailto:' + c.email, false]);
      if (safeUrl(c.website)) tiles.push(['globe', 'Website', c.website, true]);
      var cFrom = history.state && history.state.from, cBack = cFrom && cFrom.split('?')[0] !== location.pathname && /^\/app(\/|$|\?)/.test(cFrom) ? cFrom : '/app/more/clubs';
      view.innerHTML = '<div class="dhead"><a class="circbtn" href="' + esc(cBack) + '" data-back aria-label="Back">' + icon('back') + '</a><span class="dhead__t">Club details</span>' + shareBtnIcon(c.name, '/app/more/clubs/' + cid) + '</div>' +
        '<div class="dframe"><div class="dframe__ph' + (photo ? '' : ' dframe__ph--none') + '"' + (photo ? ' style="--ph:url(\'' + esc(photo) + '\')" role="img" aria-label="' + esc(c.name) + ' lawn bowling club"' : '') + '>' + (photo ? '' : '<span class="ph__mark ph__mark--lg" aria-hidden="true">' + esc(String(c.name || '?').charAt(0).toUpperCase()) + '</span>') +
          '<button class="iconbtn gbtn dframe__fav" type="button" data-follow="' + esc(cid) + '" data-name="' + esc(c.name) + '" aria-pressed="' + fon + '" aria-label="Follow ' + esc(c.name) + '">' + icon('star') + '</button>' +
          '<span class="clcard__tag' + (c.status === 'private' ? '' : ' clcard__tag--open') + '">' + (c.status === 'private' ? 'Private club' : 'Open club') + '</span></div></div>' +
        '<p class="dlabel">' + esc(c.city) + ' · ' + (c.status === 'private' ? 'Private club' : 'Open club') + '</p>' +
        '<div class="dtitle"><h1>' + esc(c.name) + '</h1>' + (up.length ? '<span class="dbadge">' + up.length + ' upcoming</span>' : '') + '</div>' +
        (tiles.length ? '<div class="dfacts" role="list">' + tiles.map(function (t) { return '<a role="listitem" class="dfact" href="' + esc(t[2]) + '"' + (t[3] ? ' target="_blank" rel="noopener"' : '') + '><span class="dfact__ic" aria-hidden="true">' + icon(t[0]) + '</span><span class="dfact__l">' + t[1] + '</span></a>'; }).join('') + '</div>' : '') +
        ((c.details || c.summary) ? '<h2 class="dh2">About</h2><p class="dtext">' + esc(c.details || c.summary) + '</p>' : '') +
        (up.length ? '<h2 class="dh2">Upcoming events</h2><ul class="list list--cards">' + up.slice(0, 4).map(function (x) { return eventRow(x, today); }).join('') + '</ul>' : '') +
        '<div class="actionbar actionbar--club">' + followBtn(cid, c.name) + (primary || '') + '</div>';
      view.querySelectorAll('img[data-hide-on-error]').forEach(function (img) { img.addEventListener('error', function () { img.hidden = true; }); });
    });
  }

  function settings() {
    setTitle('App settings');
    var root = view;
    var standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    var n = saved().length;
    view.innerHTML = backLink('/app/more', 'More') + '<div class="intro"><h1>App settings</h1></div>' +
      '<section class="settings" aria-labelledby="h-appear"><h2 id="h-appear">Appearance</h2>' + themeChoices() + '</section>' +
      '<section class="settings" aria-labelledby="h-text"><h2 id="h-text">Text size</h2>' + textChoices() + '</section>' +
      '<section class="settings" aria-labelledby="h-motion"><h2 id="h-motion">Animation</h2>' + motionChoices() + '</section>' +
      '<section class="settings" aria-labelledby="h-off"><h2 id="h-off">Offline copies</h2><p>Pages you open are kept so they work without a signal. Clearing them frees space; they come back as you browse.</p>' +
      '<div class="actions"><button class="btn btn--ghost" type="button" data-clear-cache>Clear offline copies</button></div></section>' +
      '<section class="settings" aria-labelledby="h-fc"><h2 id="h-fc">Followed clubs</h2><div id="fc-list"></div></section>' +
      '<section class="settings settings--danger" aria-labelledby="h-del"><h2 id="h-del">Delete my account and data</h2>' +
        '<p>' + (memberSession() ? 'This deletes your sign-in account and everything kept for it, and clears this phone. It cannot be undone.' : 'You are using the app without an account. This clears your saved events, followed clubs, profile and photo from this phone. It cannot be undone.') + '</p>' +
        '<div id="del-box"><div class="actions"><button class="btn btn--ghost btn--danger" type="button" data-del-start>Delete my ' + (memberSession() ? 'account and data' : 'data from this phone') + '</button></div></div>' +
        '<p class="footnote">Published tournament results stay public. They are the Division’s record and are not part of your account.</p></section>' +
      (!standalone ? '<section class="settings" aria-labelledby="h-inst"><h2 id="h-inst">Add to your home screen</h2><p>Get the Southwest Bowls icon on your phone.</p><div class="actions"><a class="btn" href="/get-the-app" target="_blank" rel="noopener">How to add it</a></div></section>' : '') +
      '<section class="settings" aria-labelledby="h-legal"><h2 id="h-legal">Privacy and terms</h2><ul class="rows rows--cards">' + linkRow('/app/privacy', 'lock', 'Privacy Policy', 'What we keep and why') + linkRow('/app/terms', 'doc', 'Terms of Use', 'The simple rules') + '</ul></section>' +
      '<p class="footnote">Southwest Bowls app · information from swlawnbowls.org</p>';
    // Followed clubs list (names from clubs-data.json); unfollow in place
    getJSON('/clubs-data.json').then(function (d) {
      if (root !== view) return;
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
      if (ev.target.closest('[data-del-start]')) {
        var db = document.getElementById('del-box');
        db.innerHTML = '<p role="alert"><b>Are you sure?</b> ' + (memberSession() ? 'Your account will be deleted.' : 'Your data on this phone will be cleared.') + '</p><div class="actions"><button class="btn btn--danger" type="button" data-del-go>Yes, delete</button><button class="btn btn--ghost" type="button" data-del-cancel>Keep my data</button></div>';
        db.querySelector('[data-del-cancel]').focus(); return;
      }
      if (ev.target.closest('[data-del-cancel]')) { render(); return; }
      if (ev.target.closest('[data-del-go]')) {
        var wipe = function () {
          try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('swd:') === 0) localStorage.removeItem(k); }); sessionStorage.clear(); } catch (e) {}
          (window.caches ? caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }) : Promise.resolve()).then(function () {
            toast('Deleted'); go('/app', true);
          });
        };
        if (!memberSession()) { wipe(); return; }
        // Signed in: ask the server to delete the account first; only then clear the phone
        memberRpc('delete_my_account').then(wipe, function () {
          var db2 = document.getElementById('del-box');
          db2.innerHTML = '<div class="note" role="alert"><b>We couldn’t delete the account just now.</b>Try again in a minute. If it keeps failing, email webmaster@swlawnbowls.org from your sign-in address and we will delete it for you.</div><div class="actions"><button class="btn btn--ghost" type="button" data-del-start>Try again</button></div>';
        });
        return;
      }
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
        '<li><b>Your email isn’t recognized.</b> The roster may have an older address, or none. Tell the Division your name, club and the email you want to use.</li>' +
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
  var SIGNUP_OPEN = true;   // safe: Supabase decides. Until sign-ups are switched on there, and while the roster gate (member-platform/supabase/0006) is active, only roster emails can create an account
  function signInScreen(params) {
    setTitle('Sign in');
    var email = '', timer = null, root = view;
    function live() { if (view === root) return true; clearInterval(timer); return false; }
    var MAIL_ART = '<svg class="signin__art" viewBox="0 0 120 90" aria-hidden="true" focusable="false"><rect x="14" y="22" width="92" height="58" rx="10" class="sa-body"/>' +
      '<path d="M18 28 60 58l42-30" class="sa-flap"/><circle cx="96" cy="22" r="11" class="sa-dot"/><path d="m91 22 4 4 7-8" class="sa-tick"/></svg>';
    function shell(step, inner, backTo) {
      view.innerHTML = '<div class="signin"><div class="signin__top"><button class="circbtn" type="button" data-sback aria-label="Back">' + icon('back') + '</button>' +
        '<span class="signin__step">Step ' + step + ' of 2</span></div>' +
        '<div class="sbrand"><div class="sbrand__photo" style="--ph:url(\'/photos/clubs/santa-barbara.jpg\')"></div><span class="sbrand__logo"><img src="/assets/app/swd-logo.png" alt="Southwest Bowls Division" width="56" height="66"></span></div>' +
        inner + '<img class="signin__tagline" src="/photos/home/tagline-sport-for-life.png" alt="Lawn Bowls: A Sport for Life!" width="140" height="66" loading="lazy"></div>';
      view.querySelector('[data-sback]').addEventListener('click', function () {
        if (backTo) { backTo(); return; }
        if (step === 1 && !params.get('step')) { landingStep(); return; }
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
      shell(1, '<h1 class="signin__h">Log in or create an account</h1><p class="signin__sub">Enter your email and we’ll send you a code.</p><p class="signin__hint">' + icon('info', 'i--sm') + '<span>Use the email your club gave the Division. If you’re not sure which, try your main one, then your others.</span></p><p class="signin__hint signin__legal"><span>By continuing you agree to the <button type="button" class="linkbtn" data-legal="terms">Terms</button> and <button type="button" class="linkbtn" data-legal="privacy">Privacy Policy</button>.</span></p>' +
        (msg ? '<div class="note" role="alert">' + esc(msg) + '</div>' : '') +
        '<form class="mform" id="s-form" novalidate><label class="mfield mfield--icon mfield--pill"><span>Email</span><span class="mfield__box">' + icon('mail') +
        '<input id="s-email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" value="' + esc(email) + '" required></span></label>' +
        '<p class="mform__err" id="s-err" role="alert"></p><div class="actions"><button class="btn btn--wide" type="submit">Send me a code</button></div></form>' +
        '<p class="signin__foot">No account needed to browse. <a class="textlink" href="/app">Continue as a guest</a></p>' + memberHelpHtml(false));
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
        '<p class="signin__again"><span id="c-timer"></span></p>' +
        '<div class="signin__nocode"><b>No email after a minute?</b><ul><li>Look in your spam or promotions folder.</li><li>Sign-in works only with the email the Division has on your membership. Try another address you may have used, like an old or work email, with “Change it” below.</li><li>Not a member yet, or still stuck? You can keep browsing as a guest.</li></ul></div>' +
        '<p class="signin__foot">Wrong email? <button class="textlink" type="button" id="c-edit">Change it</button> · <a class="textlink" href="/app">Continue as a guest</a></p>' + memberHelpHtml(false), emailStep);
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
    function landingStep() {
      clearInterval(timer);
      view.innerHTML = authLanding('/photos/clubs/long-beach.jpg', true);
      view.querySelector('.auth').addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-auth]'); if (!b) return; var k = b.getAttribute('data-auth'); haptic();
        if (k === 'guest') { navDir = 'back'; go('/app', true); return; }
        if ((k === 'email' || k === 'apple' || k === 'google') && !authGate(view.querySelector('.auth'))) return;
        if (k === 'email') emailStep();
        else if (k === 'back') { if (history.state && history.state.from) history.back(); else { navDir = 'back'; go('/app/my', true); } }
        else toast((k === 'apple' ? 'Continue with Apple' : 'Continue with Google') + ' switches on with the store release.');
      });
    }
    if (params.get('step') === 'email' && termsOk()) emailStep(); else landingStep();
    return Promise.resolve();
  }

  // My results: every published place where the name on this phone appears (exact full-name match,
  // split on commas, "&", "/" and "and"). Matching is local; nothing is sent anywhere. Names are
  // never corrected, so a spelling variant in a result will not match until the Division fixes it.
  function splitNames(str) {
    var parts = String(str || '').split(/\s*(?:,|&|\/|\band\b)\s*/i).map(fold).map(function (x) { return x.trim(); }).filter(Boolean);
    // "Joanne & Wilf Steckler": the first names share the surname written once at the end
    var last = parts.length > 1 ? parts[parts.length - 1].split(/\s+/) : [];
    if (last.length > 1 && parts.slice(0, -1).every(function (x) { return x.indexOf(' ') < 0; })) {
      var sur = last[last.length - 1];
      parts = parts.map(function (x, i) { return i < parts.length - 1 ? x + ' ' + sur : x; });
    }
    return parts;
  }
  function myResults(list, name) {
    var me = fold(name).trim(); if (!me || me.indexOf(' ') < 0) return [];   // a first name alone would match every "Joanne" in the results
    var out = [];
    list.forEach(function (r) {
      (r.t.divisions || []).forEach(function (dv) {
        divisionPlaces(dv).forEach(function (g) {
          g.places.forEach(function (pl) {
            if (splitNames(pl.names).indexOf(me) < 0) return;
            var partners = String(pl.names).split(/\s*(?:,|&|\/|\band\b)\s*/i).filter(function (n) { var f = fold(n).trim(); return f !== me && me.indexOf(f + ' ') !== 0; });
            out.push({ r: r, rank: pl.rank, rankLabel: pl.rankLabel || '', slug: (r.t.divisions || []).length > 1 ? divSlug(dv) : '', divLabel: dv.label || '', div: [dv.label, g.label].filter(Boolean).join(' · '), partners: partners });
          });
        });
      });
    });
    out.sort(function (a, b) { var da = resultDate(a.r), db = resultDate(b.r); return da < db ? 1 : da > db ? -1 : 0; });
    return out;
  }
  function placeChip(m) {
    var n = +m.rank, cls = n === 1 ? 'plc--1' : n === 2 ? 'plc--2' : n === 3 ? 'plc--3' : 'plc--n';
    return '<span class="plc ' + cls + '" aria-hidden="true">' + (n ? '<b>' + n + '</b><small>' + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th') + '</small>' : icon('trophy')) + '</span>';
  }
  function myResultRow(m) {
    var d = resultDate(m.r);
    return '<li><a class="rcard" href="/app/results/' + encodeURIComponent(m.r.id) + (m.slug ? '?division=' + encodeURIComponent(m.slug) : '') + '">' + placeChip(m) + '<span class="rcard__body"><span class="rcard__title">' + esc(m.slug && m.divLabel ? shortTitle(m.r.t.title) + ': ' + m.divLabel : shortTitle(m.r.t.title)) + '</span>' +
      '<span class="rcard__meta">' + esc([d ? fmt(d, { month: 'short', day: 'numeric' }) : '', m.rankLabel && !+m.rank ? m.rankLabel : '', m.slug ? m.div.replace(m.divLabel, '').replace(/^ · /, '') : m.div, m.partners.length ? 'with ' + m.partners.join(', ') : ''].filter(Boolean).join(' · ')) + '</span></span>' + CHEV + '</a></li>';
  }
  function placeWord(n) { n = +n; return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n ? n + 'th' : ''; }
  /* ===============================================================
     PRACTICE MODE (entry, payment choice, receipt, My entries, TD console)
     Hidden behind ?practice=1 (?hub=1 still works) and never sent anywhere: entries are kept on this phone only,
     no email is sent, no card is charged. It exists so the Division can try the screens
     before the database and PayPal wiring are built (see docs/entries/).
     =============================================================== */
  function hubOn() { return !!store('hubPreview'); }
  function hubBanner() { return '<p class="hubbanner" role="note"><b>Practice mode.</b> Nothing is sent to anyone and nothing is charged. This only shows how entering will work.</p>'; }
  var HUB_ROLES = { singles: ['Player'], pairs: ['Skip', 'Lead'], triples: ['Skip', 'Vice', 'Lead'], fours: ['Skip', 'Vice', 'Second', 'Lead'], rinks: ['Skip', 'Vice', 'Second', 'Lead'], '2+2': ['Player 1', 'Player 2', 'Player 3', 'Player 4'] };
  function hubRoles(e) {
    var pl = e.paypal && e.paypal.playerLabels;
    if (pl && pl.length) return pl;
    return HUB_ROLES[String(e.format || '').toLowerCase()] || ['Player 1', 'Player 2'];
  }
  var HUB_STATUS = { pending_payment: ['Payment pending', 'warn'], paid: ['Paid', 'ok'], waitlisted: ['Waitlisted', 'warn'], withdraw_requested: ['Withdrawal requested', 'warn'], withdrawn: ['Withdrawn', 'mute'], refunded: ['Withdrawn · refund in PayPal', 'mute'], checked_in: ['Checked in', 'ok'] };
  function statusChip(s) { var m = HUB_STATUS[s] || [s, 'mute']; return '<span class="schip schip--' + m[1] + '">' + esc(m[0]) + '</span>'; }
  function hubEntries() { return store('hubEntries') || []; }
  function hubSave(list) { store('hubEntries', list); }

  // Enter a tournament: 3 steps (team, how to pay, review), then a confirmation. PRACTICE ONLY.
  function feeText(e) { var f = String(e.fee || '').trim(); return !f || /^tbd/i.test(f) ? 'to be confirmed' : f; }
  function enterScreen(params, id) {
    setTitle('Enter');
    if (!hubOn()) { return go('/app/events/' + encodeURIComponent(id), true); }
    return Promise.all([loadEvents(), getJSON('/clubs-data.json').catch(function () { return {}; })]).then(function (all) {
      var x = all[0].filter(function (y) { return y.id === id; })[0], clubs = (all[1].clubs || []).map(function (c) { return c.name; }).sort();
      if (!x) { view.innerHTML = backLink('/app/events', 'Events') + state('empty', 'We couldn’t find that event', ''); return; }
      var e = x.e, c = e.contact || {}, st = entryStatus(x, todayISO()), phase = eventPhase(x, todayISO());
      if (phase === 'past' || (st && (st.kind === 'closed' || st.kind === 'cancelled' || st.kind === 'postponed'))) {
        view.innerHTML = backLink('/app/events/' + encodeURIComponent(id), 'Event') + state('empty', 'Entries are not open', st ? st.label : '', '<a class="btn" href="/app/events/' + encodeURIComponent(id) + '">Back to the event</a>'); return;
      }
      var roles = hubRoles(e).slice(), canAdd = !HUB_ROLES[String(e.format || '').toLowerCase()] && !(e.paypal && e.paypal.playerLabels && e.paypal.playerLabels.length);
      var onlineOk = !!(e.paypal && e.paypal.system && e.paypal.system !== 'none');
      var data = { players: roles.map(function () { return { name: '', club: '' }; }), email: '', phone: '', method: '' };
      var prof = store('profile') || {};
      if (prof.name) { data.players[0].name = prof.name; data.players[0].club = prof.club || ''; }
      function head(n) {
        return backLink('/app/events/' + encodeURIComponent(id), 'Event') + hubBanner() + '<p class="eyebrow">Step ' + n + ' of 3 · ' + esc(x.short) + '</p>';
      }
      function arrived() { window.scrollTo(0, 0); var h = view.querySelector('h1'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } }
      function backTo(fn) { var b = view.querySelector('[data-stepback]'); if (b) b.addEventListener('click', fn); }
      function clubSelect(i) {
        return '<select id="h-club-' + i + '" data-club="' + i + '"><option value="">Choose…</option>' + clubs.map(function (n) { return '<option' + (n === data.players[i].club ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') +
          '<option value="__other"' + (data.players[i].club && clubs.indexOf(data.players[i].club) < 0 ? ' selected' : '') + '>Another club or country</option></select>';
      }
      function playerBlock(i) {
        var other = data.players[i].club && clubs.indexOf(data.players[i].club) < 0;
        return '<fieldset class="hplayer"><legend>' + esc(roles[i]) + '</legend>' +
          '<label class="mfield mfield--icon mfield--pill"><span>Full name (required)</span><span class="mfield__box">' + icon('person') + '<input id="h-name-' + i + '" data-name="' + i + '" type="text" autocomplete="name" aria-describedby="h-err" value="' + esc(data.players[i].name) + '"></span></label>' +
          '<label class="mfield mfield--icon"><span>Club</span><span class="mfield__box">' + icon('people') + clubSelect(i) + '</span></label>' +
          '<label class="mfield mfield--pill" data-other="' + i + '"' + (other ? '' : ' hidden') + '><span>Club or country name</span><input data-otherclub="' + i + '" type="text" value="' + esc(other ? data.players[i].club : '') + '"></label></fieldset>';
      }
      function readPlayers(f) {
        roles.forEach(function (r, i) {
          data.players[i].name = f.querySelector('[data-name="' + i + '"]').value.trim();
          var sel = f.querySelector('[data-club="' + i + '"]').value;
          data.players[i].club = sel === '__other' ? f.querySelector('[data-otherclub="' + i + '"]').value.trim() : sel;
        });
        data.email = f.querySelector('#h-email').value.trim(); data.phone = f.querySelector('#h-phone').value.trim();
      }
      function stepTeam(err, focusSel) {
        view.innerHTML = head(1) + '<h1 class="signin__h">Your team</h1><p class="signin__sub">' + (e.format ? esc(cap(e.format)) + ' · ' : '') + 'entry fee ' + esc(feeText(e)) + '. Players from any division or country can enter unless the flyer says otherwise.</p>' +
          '<div class="note" role="alert" id="h-err"' + (err ? '' : ' hidden') + '>' + esc(err || '') + '</div>' +
          '<form class="mform" id="h-form" novalidate>' + roles.map(function (r, i) { return playerBlock(i); }).join('') +
          (canAdd && roles.length < 6 ? '<button class="btn btn--ghost" type="button" id="h-add">Add another player</button>' : '') +
          '<fieldset class="hplayer"><legend>Who should we contact?</legend>' +
            '<label class="mfield mfield--icon mfield--pill"><span>Email (required)</span><span class="mfield__box">' + icon('mail') + '<input id="h-email" type="email" autocomplete="email" inputmode="email" aria-describedby="h-err" value="' + esc(data.email) + '"></span></label>' +
            '<label class="mfield mfield--icon mfield--pill"><span>Phone (optional)</span><span class="mfield__box">' + icon('phone') + '<input id="h-phone" type="tel" autocomplete="tel" inputmode="tel" value="' + esc(data.phone) + '"></span></label></fieldset>' +
          '<div class="actions"><button class="btn btn--wide" type="submit">Continue</button></div></form>';
        var f = view.querySelector('#h-form');
        if (err && focusSel) { var bad = f.querySelector(focusSel); if (bad) { bad.setAttribute('aria-invalid', 'true'); bad.focus(); } } else if (!err) arrived();
        f.addEventListener('focusout', function (ev) {
          var t0 = ev.target; if (!t0.matches || !t0.matches('[data-name], #h-email')) return;
          var bad = t0.id === 'h-email' ? !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t0.value.trim()) : !t0.value.trim();
          var box = t0.closest('label'), m = box.querySelector('.fielderr');
          if (bad && (t0.value !== '' || t0.dataset.touched)) {
            if (!m) { m = document.createElement('span'); m.className = 'fielderr'; m.id = t0.id + '-err'; m.setAttribute('role', 'alert'); box.appendChild(m); }
            m.textContent = t0.id === 'h-email' ? 'Check the email address.' : 'Enter a name.'; t0.setAttribute('aria-invalid', 'true'); t0.setAttribute('aria-describedby', m.id);
          } else { if (m) m.remove(); t0.removeAttribute('aria-invalid'); }
          t0.dataset.touched = '1';
        });
        f.addEventListener('change', function (ev) {
          var sIdx = ev.target.getAttribute('data-club'); if (sIdx === null) return;
          f.querySelector('[data-other="' + sIdx + '"]').hidden = ev.target.value !== '__other';
        });
        var add = f.querySelector('#h-add');
        if (add) add.addEventListener('click', function () { readPlayers(f); roles.push('Player ' + (roles.length + 1)); data.players.push({ name: '', club: '' }); stepTeam(); var n = view.querySelector('#h-name-' + (roles.length - 1)); if (n) n.focus(); });
        f.addEventListener('submit', function (ev) {
          ev.preventDefault(); readPlayers(f);
          for (var i = 0; i < data.players.length; i++) if (!data.players[i].name) return stepTeam('Enter a name for the ' + roles[i] + '.', '#h-name-' + i);
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) return stepTeam('Enter an email address so we can confirm your entry.', '#h-email');
          stepPay();
        });
      }
      function payOption(val, ic, title, meta) {
        return '<label class="payopt"><input type="radio" name="pay" value="' + val + '"' + (data.method === val ? ' checked' : '') + '><span class="payopt__box"><span class="payopt__ic">' + icon(ic) + '</span><span class="payopt__main"><b>' + esc(title) + '</b><span>' + esc(meta) + '</span></span><span class="payopt__tick" aria-hidden="true">' + icon('check') + '</span></span></label>';
      }
      function stepPay(err) {
        var payee = c.mailTo || '', ask = c.email || c.phone ? 'Ask the organizer for the address (' + [c.email, c.phone].filter(Boolean).join(' or ') + ').' : 'Ask the organizer for the address.';
        view.innerHTML = head(2) + '<h1 class="signin__h">How will you pay?</h1><p class="signin__sub">Entry fee: ' + esc(feeText(e)) + '.</p>' +
          '<div class="note" role="alert" id="h-err"' + (err ? '' : ' hidden') + '>' + esc(err || '') + '</div>' +
          '<form class="mform" id="h-pay" novalidate><fieldset class="payopts"><legend class="sr-only">How will you pay?</legend>' +
          (onlineOk ? payOption('online', 'lock', 'Pay now online', 'PayPal, Apple Pay or Google Pay. Your entry is confirmed straight away.') : '') +
          payOption('check', 'doc', 'Pay by check', payee ? 'Mail it to: ' + payee : ask) +
          payOption('cash', 'flag', 'Pay cash at the green', 'Your entry is held until the organizer receives your payment.') + '</fieldset>' +
          '<p class="footnote">Can’t use online payment? Choose check or cash. The tournament organizer is told, and marks you as paid when it arrives.</p>' +
          '<div class="actions"><button class="btn btn--wide" type="submit">Review your entry</button><button class="btn btn--ghost btn--wide" type="button" data-stepback>Back</button></div></form>';
        backTo(function () { readPlayers && 0; stepTeam(); });
        var f = view.querySelector('#h-pay');
        if (err) { var first = f.querySelector('input[name=pay]'); if (first) first.focus(); } else arrived();
        f.addEventListener('submit', function (ev) {
          ev.preventDefault();
          var sel = f.querySelector('input[name=pay]:checked'); if (!sel) return stepPay('Choose how you will pay.');
          data.method = sel.value; stepReview();
        });
      }
      function stepReview() {
        view.innerHTML = head(3) + '<h1 class="signin__h">Check your entry</h1>' +
          '<section class="block"><h2>' + esc(x.short) + '</h2><p>' + esc(e.date || '') + '</p><ul class="rows">' + data.players.map(function (p, i) {
            return '<li><div class="row"><span class="row__main"><span class="row__title"><b>' + esc(roles[i]) + '</b>: ' + esc(p.name) + '</span>' + (p.club ? '<span class="row__meta">' + esc(p.club) + '</span>' : '') + '</span></div></li>'; }).join('') + '</ul></section>' +
          '<section class="block"><h2>Payment</h2><p>' + (e.fee && feeText(e) !== 'to be confirmed' ? esc(e.fee) + ' · ' : '') + (data.method === 'online' ? 'Pay now online' : data.method === 'check' ? 'Pay by check' : 'Pay cash at the green') + '</p></section>' +
          '<section class="block"><h2>Contact</h2><p>' + esc(data.email) + (data.phone ? ' · ' + esc(data.phone) : '') + '</p></section>' +
          (e.livestreamNotice ? '<p class="footnote">' + esc(e.livestreamNotice) + '</p>' : '') +
          '<div class="actions"><button class="btn btn--wide" type="button" id="h-go">Save practice entry</button><button class="btn btn--ghost btn--wide" type="button" data-stepback>Change something</button></div>' +
          '<p class="footnote">Practice only: this saves on your phone. The organizer is not told and nothing is charged.</p>';
        arrived(); backTo(function () { stepTeam(); });
        view.querySelector('#h-go').addEventListener('click', function () {
          var ref = 'PRACTICE-' + Math.random().toString(36).slice(2, 7).toUpperCase();
          var entry = { id: ref, eventId: id, title: x.short, date: e.date || '', players: data.players.map(function (p, i) { return { role: roles[i], name: p.name, club: p.club }; }), email: data.email, phone: data.phone, method: data.method,
            status: data.method === 'online' ? 'paid' : 'pending_payment', created: todayISO() };
          var list = hubEntries(); list.unshift(entry); hubSave(list);
          done(entry);
        });
      }
      function done(en) {
        view.innerHTML = hubBanner() + '<div class="signin"><svg class="signin__art" viewBox="0 0 120 90" aria-hidden="true" focusable="false"><circle cx="60" cy="45" r="36" class="sa-dot"/><path d="m44 46 12 12 22-26" class="sa-tick"/></svg>' +
          '<h1 class="signin__h">Practice entry saved</h1>' +
          '<p class="signin__sub">This is how it will look for <b>' + esc(en.title) + '</b>. No email was sent, nobody was told and nothing was charged.</p>' +
          '<ul class="rows rows--cards"><li><div class="row"><span class="row__main"><span class="row__title">Reference ' + esc(en.id) + '</span><span class="row__meta">With real entry, a confirmation would go to ' + esc(en.email) + '</span></span>' + statusChip(en.status) + '</div></li></ul>' +
          '<div class="actions"><a class="btn btn--wide" href="/app/receipt/' + encodeURIComponent(en.id) + '">View your receipt</a><a class="btn btn--ghost btn--wide" href="/app/my">See my entries</a></div><p class="signin__foot"><a class="textlink" href="/app/events">Back to events</a></p></div>';
        arrived();
      }
      stepTeam();
    });
  }
  // Receipt: what the player sees after paying (or entering by check or cash). It stays on screen so it can be
  // screenshotted or printed. PRACTICE: built from the entry saved on this phone.
  function receiptScreen(params, ref) {
    setTitle('Receipt');
    if (!hubOn()) return go('/app', true);
    var en = hubEntries().filter(function (x) { return x.id === ref; })[0];
    if (!en) { view.innerHTML = backLink('/app/my', 'My SWD') + state('empty', 'We couldn’t find that receipt', 'It may have been cleared from this phone.', '<a class="btn" href="/app/my">See my entries</a>'); return Promise.resolve(); }
    return Promise.all([loadEvents(), getJSON('/clubs-data.json').catch(function () { return {}; })]).then(function (all) {
      var x = all[0].filter(function (y) { return y.id === en.eventId; })[0], e = x ? x.e : {};
      var club = e.club && e.club.name || '', addr = e.club && e.club.address || '';
      var paid = en.status === 'paid' || en.status === 'checked_in';
      var how = en.method === 'online' ? 'PayPal (card, Apple Pay or Google Pay)' : en.method === 'check' ? 'Check, mailed to the organizer' : 'Cash at the green';
      var row = function (k, v) { return v ? '<div class="rcpt__row"><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>' : ''; };
      view.innerHTML = backLink('/app/my', 'My SWD') + hubBanner() +
        '<article class="rcpt" aria-label="Receipt">' +
          '<header class="rcpt__head"><span class="logo-plate rcpt__logo"><img src="/assets/app/swd-logo.png" alt="" width="64" height="75"></span>' +
          '<div><b class="rcpt__org">Southwest Bowls Division</b><img class="rcpt__tagimg" src="/photos/home/tagline-sport-for-life.png" alt="Lawn Bowls: A Sport for Life!" width="341" height="160"></div></header>' +
          '<div class="rcpt__status rcpt__status--' + (paid ? 'ok' : 'wait') + '">' + (paid ? 'Payment received' : 'Entry received, payment pending') + '</div>' +
          '<h1 class="rcpt__title">' + esc(en.title) + '</h1>' +
          '<dl class="rcpt__list">' + row('Date', en.date) + row('Venue', [club, addr].filter(Boolean).join(', ')) + row('Entry fee', e.fee || '') + row('Paid with', how) +
            row('Status', paid ? 'Paid' : 'Payment pending') + row('Receipt number', en.id) + row('Issued', en.created) + '</dl>' +
          '<h2 class="rcpt__sub">Team</h2><ul class="rcpt__team">' + en.players.map(function (p) { return '<li><b>' + esc(p.role) + '</b> ' + esc(p.name) + (p.club ? ' <span class="muted">· ' + esc(p.club) + '</span>' : '') + '</li>'; }).join('') + '</ul>' +
          (en.method !== 'online' ? '<p class="rcpt__note">' + (en.method === 'check' ? 'Mail your check to: ' + esc((e.contact && e.contact.mailTo) || 'the tournament organizer') + '. ' : 'Bring cash to the green. ') + 'Your place is held. You will show as paid once the organizer receives it.</p>' : '') +
          '<p class="rcpt__foot">Keep this page for your records: take a screenshot or use Share. A confirmation would also be emailed to ' + esc(en.email) + '.</p></article>' +
        '<div class="actions"><a class="btn btn--wide" href="/app">Back to the app</a>' + (x && x.dates ? '<a class="btn btn--ghost btn--wide" href="' + icsHref(x) + '" download="' + esc(x.id) + '.ics">' + icon('cal') + 'Add to my calendar</a>' : '') + (x ? '<a class="btn btn--ghost btn--wide" href="/app/events/' + encodeURIComponent(x.id) + '">View the tournament</a>' : '') + shareBtn(en.title + ' receipt ' + en.id, '/app/my') + '</div>';
      window.scrollTo(0, 0);
    });
  }
  // My entries (on My SWD): what I entered, its status, and a withdrawal request
  function myEntriesHtml() {
    var list = hubEntries(); if (!hubOn()) return '';
    return '<section class="section mysec" aria-labelledby="h-ent"><div class="section__head"><h2 class="section__title" id="h-ent">My entries</h2><span class="tag tag--preview">Preview</span></div>' +
      (list.length ? '<ul class="list list--plain">' + list.map(function (en) {
        return '<li><div class="rcard rcard--col"><span class="rcard__body"><span class="rcard__title"><a href="/app/receipt/' + encodeURIComponent(en.id) + '">' + esc(en.title) + '</a></span><span class="rcard__meta">' + esc(en.players.map(function (p) { return p.name; }).join(', ')) + '</span></span>' + statusChip(en.status) +
          (en.status === 'paid' || en.status === 'pending_payment' ? '<button class="btn btn--ghost btn--sm" type="button" data-withdraw="' + esc(en.id) + '" aria-label="Request withdrawal from ' + esc(en.title) + '">Request withdrawal</button>' : '') + '</div></li>'; }).join('') + '</ul>'
        : '<p class="muted">No entries yet. Open an event and tap Enter.</p>') + '<p class="footnote">' + (memberSession() ? '' : 'Kept on this phone. Sign in with the email you entered with to keep them safe. ') + 'Preview only. Withdrawals are approved and refunded by the tournament organizer.</p></section>';
  }
  // Tournament director console (preview with made-up demo teams)
  function demoEntries(eventId) {
    var key = 'hubTd:' + eventId, saved = store(key); if (saved) return saved;
    var names = ['Demo Team A', 'Demo Team B', 'Demo Team C', 'Demo Team D', 'Demo Team E', 'Demo Team F'], st = ['paid', 'paid', 'pending_payment', 'pending_payment', 'withdraw_requested', 'paid'];
    var m = ['online', 'online', 'check', 'cash', 'online', 'online'];
    var list = names.map(function (n, i) { return { id: 'DEMO-' + (i + 1), team: n, status: st[i], method: m[i] }; }); store(key, list); return list;
  }
  function tdScreen(params) {
    setTitle('Director console');
    if (!hubOn()) return go('/app/more', true);
    return loadEvents().then(function (events) {
      var live = events.filter(function (x) { var p = eventPhase(x, todayISO()); return p === 'upcoming' || p === 'now'; }).slice(0, 12);
      var cur = params.get('event'); if (!cur || !live.some(function (y) { return y.id === cur; })) cur = live[0] && live[0].id; if (!cur) { view.innerHTML = backLink('/app/more', 'More') + state('empty', 'No upcoming events', ''); return; }
      var x = events.filter(function (y) { return y.id === cur; })[0] || live[0];
      var list = demoEntries(cur), mine = hubEntries().filter(function (en) { return en.eventId === cur; }).map(function (en) { return { id: en.id, team: en.players.map(function (p) { return p.name; }).join(' / '), status: en.status, method: en.method, real: true }; });
      var rows = mine.concat(list);
      function count(s) { return rows.filter(function (r) { return r.status === s; }).length; }
      view.innerHTML = backLink('/app/more', 'More') + hubBanner() + '<h1 class="mtitle">Director console</h1>' +
        '<label class="mfield"><span class="sr-only">Event</span><select id="td-ev">' + live.map(function (y) { return '<option value="' + esc(y.id) + '"' + (y.id === cur ? ' selected' : '') + '>' + esc(y.short) + '</option>'; }).join('') + '</select></label>' +
        '<div class="hub__stats tdstats"><span class="hub__stat"><b>' + rows.length + '</b><span>Entered</span></span><span class="hub__stat"><b>' + (count('paid') + count('checked_in')) + '</b><span>Paid</span></span><span class="hub__stat"><b>' + count('pending_payment') + '</b><span>To collect</span></span></div>' +
        '<ul class="list list--plain">' + rows.map(function (r, i) {
          var act = r.status === 'pending_payment' ? '<button class="btn btn--sm" type="button" data-td="paid" data-i="' + i + '" aria-label="Mark ' + (r.method === 'check' ? 'check' : 'cash') + ' received for ' + esc(r.team) + '">Mark ' + esc(r.method === 'check' ? 'check' : 'cash') + ' received</button>'
            : r.status === 'withdraw_requested' ? '<button class="btn btn--sm" type="button" data-td="refunded" data-i="' + i + '" aria-label="Approve withdrawal for ' + esc(r.team) + '">Approve withdrawal</button>'
            : r.status === 'paid' ? '<button class="btn btn--ghost btn--sm" type="button" data-td="checked_in" data-i="' + i + '" aria-label="Check in ' + esc(r.team) + '">Check in</button>' : '';
          return '<li><div class="rcard rcard--col"><span class="rcard__body"><span class="rcard__title">' + esc(r.team) + (r.real ? ' (your entry)' : '') + '</span><span class="rcard__meta">' + esc(r.id) + ' · ' + esc(r.method) + '</span></span>' + statusChip(r.status) + act + '</div></li>'; }).join('') + '</ul>' +
        '<p class="footnote">Made-up teams for the preview. Changes stay on this phone.</p>';
      view.querySelector('#td-ev').addEventListener('change', function (ev) { go('/app/td?event=' + encodeURIComponent(ev.target.value), true); });
      view.onclick = function (ev) {
        var b = ev.target.closest('[data-td]'); if (!b) return;
        var r = rows[+b.getAttribute('data-i')], next = b.getAttribute('data-td'), prev = r.status;
        if (next === 'refunded' && b.getAttribute('data-sure') !== '1') { b.setAttribute('data-sure', '1'); b.textContent = 'Tap again: approve withdrawal for ' + r.team; return; }
        r.status = next;
        if (r.real) { var all = hubEntries(); all.forEach(function (en) { if (en.id === r.id) en.status = r.status; }); hubSave(all); } else { store('hubTd:' + cur, list); }
        toast(r.status === 'refunded' ? 'Withdrawal approved. Refund it in PayPal, then it is done (practice)' : 'Updated (practice)', r.team, function () {
          r.status = prev;
          if (r.real) { var all2 = hubEntries(); all2.forEach(function (en) { if (en.id === r.id) en.status = prev; }); hubSave(all2); } else { store('hubTd:' + cur, list); }
          tdScreen(params);
        }); tdScreen(params);
      };
    });
  }

  // About Southwest: a native screen built from content/about-us.json and partners-data.json
  function aboutScreen() {
    setTitle('About Southwest');
    return Promise.all([getJSON('/content/about-us.json'), getJSON('/partners-data.json').catch(function () { return {}; })]).then(function (all) {
      var d = all[0], pd = all[1], secs = d.sections || [];
      function byHead(h) { return secs.filter(function (x) { return x.heading === h; })[0]; }
      var what = byHead('What SWD Does'), board = byHead('Board of Directors'), intro = byHead('About the Southwest Bowls Division');
      var lead = intro && intro.body && intro.body[0] || '';
      function logoGroup(title, list) {
        if (!list.length) return '';
        return '<section class="mgroup"' + (title === 'Our partners' ? ' id="partners"' : '') + '><h2 class="mgroup__label">' + esc(title) + '</h2><ul class="logogrid">' + list.map(function (o) {
          var img = '<img src="' + esc(o.logo) + '" alt="' + esc(o.name) + '" decoding="async">';
          return '<li>' + (safeUrl(o.url) ? '<a class="logochip' + (/world bowls/i.test(o.name) ? ' logochip--dark' : '') + '" href="' + esc(o.url) + '" target="_blank" rel="noopener" aria-label="' + esc(o.name) + ', opens their website">' + img + '</a>' : '<span class="logochip' + (/world bowls/i.test(o.name) ? ' logochip--dark' : '') + '">' + img + '</span>') + '</li>'; }).join('') + '</ul></section>';
      }
      view.innerHTML = backLink('/app/more', 'More') +
        '<section class="hub" aria-label="Southwest Bowls Division"><span class="logo-plate hub__logo"><img src="/assets/app/swd-logo.png" alt="" width="64" height="75"></span>' +
        '<div class="hub__text"><h1 class="hub__name">About Southwest</h1><span class="hub__sub">A volunteer-led division</span></div>' + (lead ? '<p class="about__lead">' + esc(lead) + '</p>' : '') + '</section>' +
        (what ? '<section class="mgroup"><h2 class="mgroup__label">What we do</h2><ul class="dolist">' + what.items.map(function (t) { return '<li>' + icon('check', 'i--sm') + '<span>' + esc(t) + '</span></li>'; }).join('') + '</ul></section>' : '') +
        (board ? '<section class="mgroup"><h2 class="mgroup__label">Board of directors</h2><ul class="bgrid">' + board.items.map(function (m) {
          var em = /^mailto:/.test(m.link || '') ? m.link : '';
          var inner = '<span class="bgrid__av">' + esc(initials(m.title)) + '</span><span class="bgrid__name">' + esc(m.title) + '</span><span class="bgrid__role">' + esc(m.meta || '') + '</span>';
          return '<li>' + (em ? '<a class="bcard" href="' + esc(em) + '" aria-label="Email ' + esc(m.title) + ', ' + esc(m.meta || '') + '">' + inner + '</a>' : '<div class="bcard">' + inner + '</div>') + '</li>'; }).join('') + '</ul><p class="footnote">Tap a name to send an email.</p></section>' : '') +
        '<div id="partners">' + logoCard(pd, true) + '</div>' +
        '<div class="actions"><a class="btn btn--wide" href="/app/page/contact-us">Contact Southwest</a></div>';
      if (location.hash === '#partners') { var g = view.querySelector('#partners'); if (g) g.scrollIntoView(); }
    });
  }

  // Identity header: everyone can use the app without an account, including
  // players from other divisions and other countries. The optional details
  // behind it stay on this phone; nothing is sent anywhere.
  var DIVISIONS = ['Southwest (SWD)', 'Pacific Inter-Mountain (PIMD)', 'Northwest', 'South Central', 'Central', 'Northeast', 'Southeast', 'International (outside the U.S.)'];
  function initials(name) {
    var w = String(name || '').trim().split(/\s+/).filter(Boolean);
    return w.length ? (w[0].charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : '')).toUpperCase() : '';
  }
  function profileHeader() {
    var p = store('profile') || {};
    var first = String(p.name || '').trim().split(/\s+/)[0];
    var chips = [p.division, p.club].filter(Boolean).map(function (c) { return '<span class="idhead__chip">' + esc(c) + '</span>'; }).join('');
    return '<a class="idhead" href="/app/my/profile" aria-label="Open my profile">' +
      '<span class="idhead__avatar" aria-hidden="true">' + (initials(p.name) ? esc(initials(p.name)) : icon('person')) + '</span>' +
      '<span class="idhead__text"><span class="idhead__name">' + (first ? 'Hi, ' + esc(first) : 'Welcome to Southwest Bowls') + '</span>' +
      (chips ? '<span class="idhead__chips">' + chips + '</span>' : '<span class="idhead__meta">Guest · Tap to add details</span>') + '</span>' +
      icon('chev', 'i--sm') + '</a>';
  }
  // Things a player can tick on their own profile. Kept on this phone; the player decides what to show.
  var BADGES = [['team-usa', 'Team USA member'], ['national', 'National champion'], ['division', 'Division champion'], ['coach', 'Coach'], ['umpire', 'Umpire'],
    ['marker', 'Marker'], ['officer', 'Club or Division officer'], ['novice', 'Novice player']];
  function badgeLabel(id) { return (BADGES.filter(function (b) { return b[0] === id; })[0] || [0, ''])[1]; }
  // My profile page: all on this phone. Bio and honors are typed by the player; the season numbers and
  // timeline come from the published results; the photo is resized and kept here, never uploaded.
  function profilePage() {
    setTitle('My profile');
    var p = store('profile') || {};
    return loadResults().catch(function () { return []; }).then(function (list) {
      var mine = p.name ? myResults(list, p.name) : [];
      var tourns = new Set(mine.map(function (m) { return m.r.id; })).size;
      var pod = mine.filter(function (m) { return +m.rank >= 1 && +m.rank <= 3; }).length, wins = mine.filter(function (m) { return +m.rank === 1; }).length;
      var photo = store('memberPhoto:self');
      var awards = []; list.forEach(function (r) { (r.t.awards || []).forEach(function (a) { if (p.name && fold(p.name).trim().indexOf(' ') >= 0 && splitNames(a.names).indexOf(fold(p.name).trim()) >= 0) awards.push({ r: r, a: a }); }); });
      var honours = (p.honours || []).slice().sort(function (a, b) { return String(b.year) > String(a.year) ? 1 : -1; });
      // Partners played with most
      var pc = {}; mine.forEach(function (m) { m.partners.forEach(function (n) { n = n.trim(); if (n) pc[n] = (pc[n] || 0) + 1; }); });
      var partners = Object.keys(pc).sort(function (a, b) { return pc[b] - pc[a]; }).filter(function (n) { return pc[n] > 1; }).slice(0, 5);
      view.innerHTML = backLink('/app/my', 'My SWD') +
        '<section class="pro"><button class="pro__photo" type="button" data-photo aria-label="' + (photo ? 'Change photo' : 'Add a photo') + '">' +
          (photo ? '<img src="' + esc(photo) + '" alt="" width="96" height="120">' : (initials(p.name) ? esc(initials(p.name)) : icon('person'))) + '</button>' +
          '<input type="file" id="pro-photo" accept="image/*" hidden>' +
          '<div class="pro__text"><h1 class="pro__name">' + esc(p.name || 'Your name') + '</h1>' +
          '<div class="idhead__chips">' + [p.country || p.division, p.club].filter(Boolean).map(function (c) { return '<span class="idhead__chip">' + esc(c) + '</span>'; }).join('') + '</div></div>' +
          '<button class="btn btn--ghost btn--sm pro__edit" type="button" data-edit-profile>Edit</button></section>' +
        ((p.badges || []).length ? '<ul class="badges" aria-label="About me">' + p.badges.map(function (b) { return '<li class="badge">' + icon('check', 'i--sm') + esc(badgeLabel(b)) + '</li>'; }).join('') + '</ul>' : '') +
        '<p class="pro__bio">' + (p.bio ? esc(p.bio).replace(/\n/g, '<br>') : '<span class="muted">Add a short bio with Edit.</span>') + '</p>' +
        (p.name ? '<div class="hub__stats mystats">' + metric('pro-t', tourns, 'Tournaments', 'With a result') + metric('pro-p', pod, 'Podiums', 'Top three') + metric('pro-w', wins, 'Wins', 'First places') + '</div>' : '') +
        (awards.length ? '<section class="block"><h2>Awards</h2><ul class="honours">' + awards.map(function (x) { return '<li><span class="honours__yr">' + esc(x.r.year || '') + '</span><a href="/app/results/' + encodeURIComponent(x.r.id) + '">' + esc(x.a.title + ' · ' + shortTitle(x.r.t.title)) + '</a></li>'; }).join('') + '</ul></section>' : '') +
        '<section class="block"><h2>Other honors</h2>' + (honours.length ? '<ul class="honours">' + honours.map(function (h) { return '<li><span class="honours__yr">' + esc(h.year || '') + '</span><span>' + esc(h.text) + '</span></li>'; }).join('') + '</ul>'
          : '<p class="muted">Anything else you want to list, such as a title from another division or year. Add it with Edit.</p>') + '</section>' +
        (partners.length ? '<section class="block"><h2>Played most with</h2><p>' + partners.map(esc).join(' · ') + '</p></section>' : '') +
        '<section class="block"><h2>Results' + (mine.length ? ' (' + mine.length + ')' : '') + '</h2>' +
          (mine.length ? '<ul class="list list--plain">' + mine.map(myResultRow).join('') + '</ul>'
            : '<p class="muted">' + (p.name ? (String(p.name).trim().indexOf(' ') < 0 ? 'To see your published results, add your first and last name with Edit, exactly as the Division publishes it.' : 'No published results under “' + esc(p.name) + '”. Results match the full name exactly as the Division published it.') : 'Add your name with Edit to see your published results.') + '</p>') + '</section>' +
        '<p class="footnote">Everything on this page is kept on this phone only. Results come from the Division’s published results and are matched by name.</p>';
      rollIn(view);
      var inp = view.querySelector('#pro-photo');
      view.querySelector('[data-photo]').addEventListener('click', function () { inp.click(); });
      inp.addEventListener('change', function () { if (!inp.files[0]) return; savePhoto(inp.files[0], 'self').then(function () { profilePage(); toast('Photo saved on this phone'); }, function () { toast('That photo couldn’t be used. Try another.'); }); });
      view.querySelector('[data-edit-profile]').addEventListener('click', function () { editProfileSheet(function () { profilePage(); }); });
    });
  }
  function editProfileSheet(done) {
    getJSON('/clubs-data.json').catch(function () { return {}; }).then(function (cd) {
      openProfileSheet(done, (cd.clubs || []).map(function (c) { return c.name; }).sort());
    });
  }
  function openProfileSheet(done, clubNames) {
    var p = Object.assign({}, store('profile') || {}), mc = store('memberCache') || {};
    if (!p.name && mc.name) p.name = mc.name;
    if (!p.club && mc.club) p.club = mc.club;
    if (!p.division && p.club && clubNames.indexOf(p.club) >= 0) p.division = 'Southwest (SWD)';
    var hon = (p.honours || []).map(function (h) { return (h.year ? h.year + ' ' : '') + h.text; }).join('\n');
    openDialog('Edit profile',
      '<p class="muted">Kept on this phone only.</p><form class="mform" id="g-form" novalidate>' +
      '<label class="mfield mfield--icon"><span>Your name</span><span class="mfield__box">' + icon('person') + '<input id="g-name" type="text" autocomplete="name" value="' + esc(p.name || '') + '"></span></label>' +
      '<p class="muted" style="margin:-4px 0 8px">Use your first and last name as the Division publishes it. That is how we find your results, so a nickname alone will not match.</p>' +
      '<label class="mfield mfield--icon"><span>Home division</span><span class="mfield__box">' + icon('pin') + '<select id="g-div"><option value="">Choose…</option>' + DIVISIONS.map(function (d) { return '<option' + (d === p.division ? ' selected' : '') + '>' + esc(d) + '</option>'; }).join('') + '</select></span></label>' +
      '<label class="mfield mfield--icon" id="g-country-row"' + (/^International/.test(p.division || '') ? '' : ' hidden') + '><span>Country</span><span class="mfield__box">' + icon('pin') + '<input id="g-country" type="text" autocomplete="country-name" value="' + esc(p.country || '') + '"></span></label>' +
      '<label class="mfield mfield--icon"><span>Home club</span><span class="mfield__box">' + icon('people') + '<select id="g-club"><option value="">Choose…</option>' + clubNames.map(function (n) { return '<option' + (n === p.club ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '<option value="__other"' + (p.club && clubNames.indexOf(p.club) < 0 ? ' selected' : '') + '>Another club (not listed)</option></select></span></label>' +
      '<label class="mfield mfield--icon" id="g-other-row"' + (p.club && clubNames.indexOf(p.club) < 0 ? '' : ' hidden') + '><span>Club name</span><span class="mfield__box">' + icon('people') + '<input id="g-other" type="text" value="' + esc(p.club && clubNames.indexOf(p.club) < 0 ? p.club : '') + '"></span></label>' +
      '<fieldset class="ticks"><legend>More about me</legend>' + BADGES.map(function (b) {
        return '<label class="tick"><input type="checkbox" name="badge" value="' + b[0] + '"' + ((p.badges || []).indexOf(b[0]) >= 0 ? ' checked' : '') + '><span>' + esc(b[1]) + '</span></label>'; }).join('') + '</fieldset>' +
      '<label class="mfield"><span>Bio</span><textarea id="g-bio" rows="4" maxlength="600">' + esc(p.bio || '') + '</textarea></label>' +
      '<label class="mfield"><span>Other honors (one per line, start with the year)</span><textarea id="g-hon" rows="5" maxlength="1500" placeholder="2024 Team USA, ...">' + esc(hon) + '</textarea></label>' +
      '<div class="actions"><button class="btn btn--wide" type="submit">Save</button></div></form>');
    var gdiv = document.getElementById('g-div'), gclub = document.getElementById('g-club');
    gdiv.addEventListener('change', function () { document.getElementById('g-country-row').hidden = !/^International/.test(gdiv.value); });
    gclub.addEventListener('change', function () { document.getElementById('g-other-row').hidden = gclub.value !== '__other'; });
    document.getElementById('g-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var f = ev.target;
      var club = f.querySelector('#g-club').value === '__other' ? f.querySelector('#g-other').value.trim() : f.querySelector('#g-club').value;
      var honours = f.querySelector('#g-hon').value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) { var m = /^((?:19|20)\d{2})\b[\s:,.\-–—]*(.*)$/.exec(l); return m && m[2] ? { year: m[1], text: m[2] } : { year: '', text: l }; });
      store('profile', { name: f.querySelector('#g-name').value.trim(), division: f.querySelector('#g-div').value, country: /^International/.test(f.querySelector('#g-div').value) ? f.querySelector('#g-country').value.trim() : '', club: club, bio: f.querySelector('#g-bio').value.trim(), honours: honours,
        badges: Array.prototype.map.call(f.querySelectorAll('input[name=badge]:checked'), function (c) { return c.value; }) });
      closeDialog(); toast('Saved'); if (done) done();
    });
  }
  function wireProfile() {}
  // My SWD: membership (sign-in, preview while testing), then the things
  // kept on this phone — saved events and followed clubs — which never need
  // an account. Entries and personal results appear here once they exist.
  // Hidden director tools: switched on once with ?run=1 (off with ?run=0), and only shown to addresses in link_admins.
  function runEntry(root) {
    if (!store('run') || !memberSession()) return;
    memberRpc('is_link_admin').then(function (ok) {
      var el = root.querySelector('#run-entry'); if (ok !== true || !el || root !== view) return;
      el.innerHTML = '<section class="block"><h2>Director tools <span class="muted">(beta)</span></h2><ul class="list list--plain"><li><a class="rcard" href="/app/run/womens-vet-novice-pairs-2026"><span class="rcard__body"><span class="rcard__title">Run: Women’s Vet/Novice Pairs</span><span class="rcard__meta">Teams, draw, scores and standings</span></span></a></li></ul></section>';
    }, function () {});
  }
  function mySwd(params) {
    setTitle('My SWD');
    if (params.get('preview') === '1') { store('memberPreview', true); history.replaceState(history.state, '', location.pathname); }
    var err = store('signinError'); if (err) { try { localStorage.removeItem('swd:signinError'); } catch (e) {} }
    var preview = !!store('memberPreview') || !!memberSession();
    var today = todayISO();

    var pf = store('profile') || {}, pphoto = store('memberPhoto:self') || (function () { try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('swd:memberPhoto:') === 0) return JSON.parse(localStorage.getItem(k)); } } catch (e) {} return null; })(), nSaved = saved().length, nFol = followed().length;
    function prow(href, ic, title, meta) { return '<a class="prow" href="' + href + '"><span class="prow__ic" aria-hidden="true">' + icon(ic) + '</span><span class="prow__t"><b>' + esc(title) + '</b>' + (meta ? '<small>' + esc(meta) + '</small>' : '') + '</span><span class="prow__go" aria-hidden="true">' + icon('chev', 'i--sm') + '</span></a>'; }
    view.innerHTML = '<header class="phero' + (store('look') ? ' phero--card' : '') + '"' + (store('look') ? ' data-pal="' + look().palette + '" data-sty="' + look().style + '"' : '') + '><span class="phero__brand"><img src="/assets/app/swd-logo.png" alt="" width="22" height="26">Southwest Bowls Division</span><a class="phero__av" href="/app/my/profile" aria-label="Open my profile">' + (pphoto ? '<img src="' + esc(pphoto) + '" alt="">' : (initials(pf.name) ? esc(initials(pf.name)) : icon('person'))) + '</a>' +
        '<h1 class="phero__name">' + (pf.name ? esc(pf.name) : 'Welcome') + '</h1>' +
        '<p class="phero__sub">' + (memberSession() ? 'Signed in' + ([pf.division, pf.club].filter(Boolean).length ? ' · ' : '') : (pf.name ? '' : 'Guest') ) + ([pf.division, pf.club].filter(Boolean).length ? [pf.division, pf.club].filter(Boolean).map(esc).join(' · ') : (memberSession() || pf.name ? '' : ' · Tap the circle to add your details')) + '</p></header>' +
      setupCard() +
      (preview ? '<section class="section mysec mysec--top" aria-labelledby="h-member"><div class="section__head"><h2 class="section__title" id="h-member">Membership</h2>' +
        (memberSession() ? '' : '<span class="tag tag--preview">Preview</span>') + '</div><div id="m-box">' + loading() + '</div></section>' : '') +
      '<div class="psheet">' +
        (memberSession() ? '' : '<a class="pbanner" href="/app/signin"><span class="pbanner__t"><b>Sign in or create an account</b><small>Enter tournaments and keep your details</small></span><span class="pbanner__art" aria-hidden="true">' + icon('person') + '</span></a>') +
        '<div class="pgroup">' + prow('/app/my/profile', 'person', 'My profile', pf.name ? 'Bio, honors and results' : 'Add your name and bio') + prow('/app/more/clubs', 'star', 'Followed clubs', nFol ? nFol + ' following' : 'Find a club to follow') + '</div>' +
        '<div class="pgroup"><button type="button" class="prow prow--btn" data-open-interests><span class="prow__ic" aria-hidden="true">' + icon('star') + '</span><span class="prow__t"><b>My interests</b><small>' + (interests() && (interests().topics || []).length ? (interests().topics.length + ' picked') : 'Choose what you want first') + '</small></span><span class="prow__go" aria-hidden="true">' + icon('chev', 'i--sm') + '</span></button>' + prow('/app/more/settings', 'sliders', 'App settings', 'Appearance, text size, offline') + '</div>' +
      '</div>' +
      '<div id="my-res"></div><div id="run-entry"></div>' + myEntriesHtml();
    runEntry(view);
    (function () {   // hidden switch for directors: tap your name five times on My SWD
      var nm = view.querySelector('.phero__name'); if (!nm || !memberSession()) return;
      var taps = 0, last = 0;
      nm.addEventListener('click', function () { var now = Date.now(); taps = now - last < 2500 ? taps + 1 : 1; last = now; if (taps >= 5) { taps = 0; store('run', true); runEntry(view); toast('Director tools switched on'); } });
    })();
    var box = view.querySelector('#m-box');
    wireProfile();
    view.onclick = function (ev) {
      if (ev.target.closest('[data-open-interests]')) { openInterests(function () { render(); }); return; }
      var w = ev.target.closest('[data-withdraw]'); if (!w) return;
      if (w.getAttribute('data-sure') !== '1') { w.setAttribute('data-sure', '1'); w.textContent = 'Tap again to confirm'; return; }
      var all = hubEntries(); all.forEach(function (en) { if (en.id === w.getAttribute('data-withdraw')) en.status = 'withdraw_requested'; }); hubSave(all);
      toast('Withdrawal requested (practice)'); mySwd(params);
    };
    // My results: from the published results, matched by the name entered on this phone
    var prof0 = store('profile') || {};
    if (prof0.name) loadResults().then(function (list) {
      var mine = myResults(list, prof0.name), el = view.querySelector('#my-res'); if (!el) return;
      var gold = mine.filter(function (m) { return +m.rank === 1; }).length, pod = mine.filter(function (m) { return +m.rank >= 1 && +m.rank <= 3; }).length;
      el.innerHTML = '<section class="section mysec" aria-labelledby="h-myres"><div class="section__head"><h2 class="section__title" id="h-myres">My results</h2></div>' +
        (mine.length ? '<div class="hub__stats mystats">' + metric('my-t', new Set(mine.map(function (m) { return m.r.id; })).size, 'Tournaments', 'With a result') + metric('my-p', pod, 'Podiums', 'Top three') + metric('my-w', gold, 'Wins', 'First places') + '</div>' +
          '<ul class="list list--plain">' + mine.slice(0, 3).map(myResultRow).join('') + '</ul>' + '<a class="textlink" href="/app/my/profile">See all ' + mine.length + ' on my profile' + icon('chev', 'i--sm') + '</a>'
          : '<p class="muted">No published results under “' + esc(prof0.name) + '” yet. Results match the full name exactly as the Division published it.</p>') +
        '<p class="footnote">Matched on this phone from published results. Nothing is sent anywhere.</p></section>';
      rollIn(el);
    }).catch(function () {});

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
        '<h3 class="signin__title">Sign in</h3><p class="signin__sub">We’ll email you a link.</p>' +
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
      setMemberSession(null);
      // The card photo is a picture of the member: do not leave it on the phone.
      try {
        for (var i = localStorage.length - 1; i >= 0; i--) {
          var k = localStorage.key(i);
          if (k && k.indexOf('swd:memberPhoto:') === 0) localStorage.removeItem(k);
        }
      } catch (e) {}
      // A fresh guest: everything personal goes (profile, photo, interests, design, saved events, followed clubs, practice entries). Theme and text size stay.
      // Clear everything personal on this phone. Only the look of the app (theme, text size) and "already welcomed" stay.
      try {
        var KEEP = ['swd:welcomed', 'swd:theme', 'swd:text'];
        for (var q = localStorage.length - 1; q >= 0; q--) { var kk = localStorage.key(q); if (kk && kk.indexOf('swd:') === 0 && KEEP.indexOf(kk) < 0) localStorage.removeItem(kk); }
        sessionStorage.clear();
      } catch (e) {}
      store('memberPreview', false);
      toast('Signed out'); render();   // redraw the whole page as signed out
    }
    var foot = '';
    // Sign out sits at the very bottom of the page, quietly, not inside the membership card
    if (memberSession()) {
      view.insertAdjacentHTML('beforeend', '<div class="signout-bottom"><button class="btn btn--ghost" type="button">Sign out</button></div>');
      view.querySelector('.signout-bottom button').addEventListener('click', function () { signOut(); });
    }
    function draw(res) {
      if (res.state === 'linked') {
        return getJSON('/clubs-data.json').catch(function () { return { clubs: [] }; }).then(function (cd) {
          var m = res.member, club = m.club && (cd.clubs || []).filter(function (c) { return c.id === m.club.id; })[0];
          try {
            var mcName = m.club && (club && club.name || m.club.name) || '';
            store('memberCache', { name: m.name || '', club: mcName });
            var pr0 = store('profile') || {};
            if (m.name) {   // smart default: fill any of name, division and club you have not typed yet from your membership
              var np = Object.assign({ country: '', bio: '', badges: [], honours: [] }, pr0), added = false;
              if (!np.name) { np.name = m.name; added = true; }
              if (!np.division && !/^International/.test(np.division || '')) { np.division = 'Southwest (SWD)'; added = true; }
              if (!np.club && mcName) { np.club = mcName; added = true; }
              if (added) { store('profile', np); toast('We added your name and club from your membership.'); }
            }
          } catch (e) {}
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
    var root = view;
    var page = getJSON('/content/' + encodeURIComponent(id) + '.json').catch(function (e) { if (e && e.message === 'HTTP 404') return null; throw e; });
    return Promise.all([page, partners]).then(function (all) {
      if (root !== view) return;
      var d = all[0], pd = all[1];
      if (!d) {
        view.innerHTML = backLink('/app/more', 'More') + state('empty', 'We couldn’t find that page', 'It may have been moved or removed.', '<a class="btn" href="/app/more">More</a>');
        return;
      }
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
          var nf = form && nativeForm(url); if (nf) return nf;
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
    [/^\/app\/events\/([^/]+)\/enter\/?$/, enterScreen, 'events'],
    [/^\/app\/events\/([^/]+)\/doc\/(flyer|conditions)\/?$/, docScreen, 'events'],
    [/^\/app\/td\/?$/, tdScreen, 'more'],
    [/^\/app\/receipt\/([A-Za-z0-9-]+)\/?$/, receiptScreen, 'my'],
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
    [/^\/app\/my\/profile\/?$/, profilePage, 'my'],
    [/^\/app\/search\/?$/, searchScreen, 'home'],
    [/^\/app\/page\/about-us\/?$/, aboutScreen, 'more'],
    [/^\/app\/(privacy|terms)\/?$/, legalScreen, 'more'],
    [/^\/app\/run\/([a-z0-9-]+)\/?$/, runPage, 'my'],
    [/^\/app\/page\/([a-z0-9-]+)\/?$/, infoPage, 'more']
  ];
  var scrollMemory = {};
  var renderToken = 0;
  var restoring = false;
  var navDir = null;      // how the next screen arrives: 'fwd', 'back' or 'tab' (null on first load)

  // Scroll a tab strip so its selected tab is in view (horizontal only, never moves the page)
  function segReveal(root) {
    (root || document).querySelectorAll('.segmented').forEach(function (seg) {
      var b = seg.querySelector('[aria-selected="true"], [aria-pressed="true"]');
      if (b && seg.scrollWidth > seg.clientWidth) seg.scrollLeft = Math.max(0, b.offsetLeft - (seg.clientWidth - b.offsetWidth) / 2);
    });
  }
  function render() {
    if (window.__swdMap) { try { window.__swdMap.remove(); } catch (e) {} window.__swdMap = null; }
    var path = location.pathname, params = new URLSearchParams(location.search);
    var match = null, route = null;
    for (var i = 0; i < ROUTES.length; i++) { match = ROUTES[i][0].exec(path); if (match) { route = ROUTES[i]; break; } }
    if (!route) { history.replaceState(null, '', '/app'); return render(); }
    document.querySelectorAll('.tabbar a').forEach(function (a) {
      if (a.getAttribute('data-tab') === route[2]) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    var token = ++renderToken, cameVia = navDir;
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
    try { p = route[1](params, match[1] && decodeURIComponent(match[1]), match[2]); } catch (e) { p = Promise.reject(e); }
    return Promise.resolve(p).catch(function (err) {
      if (token !== renderToken) return;
      view.innerHTML = err instanceof URIError
        ? backLink('/app', 'Home') + state('empty', 'We couldn’t find that page', '', '<a class="btn" href="/app">Home</a>')
        : errorState(err);
    }).then(function () {
      if (token !== renderToken) return;
      // Every screen gets the soft blurred photo behind it (Home and event pages bring their own)
      if (!view.querySelector('.hbg, .escene__bg')) {
        var BD = { events: 'newport-harbor', results: 'the-groves', my: 'coronado', more: 'beverly-hills' };
        view.insertAdjacentHTML('afterbegin', '<div class="hbg" aria-hidden="true" style="--ph:url(\'/photos/clubs/' + (BD[route[2]] || 'laguna-woods') + '.jpg\')"></div>');
      }
      var key = path + location.search;
      var y = (history.state && history.state.y) || scrollMemory[key] || 0;
      window.scrollTo(0, restoring ? y : 0);
      // A link to a section of a screen (e.g. About → #partners) lands on it
      var target = !restoring && location.hash && document.getElementById(location.hash.slice(1));
      if (target) { target.scrollIntoView({ block: 'start' }); target.focus({ preventScroll: true }); }
      restoring = false;
      // Arrived from another screen (Search, My SWD, ...) and this screen has no back link of its own: add one
      (function () {
        var from = history.state && history.state.from;
        if (!from || cameVia === 'tab' || cameVia === 'back' || restoring || view.querySelector('.back, .searchbar, .signin, .welcome, .auth, .dhead')) return;
        var fp = from.split('?')[0];
        if (fp === location.pathname || fp === '/app') return;
        var hit = BACK_NAMES.filter(function (b) { return b[0].test(fp); })[0];
        if (hit) view.insertAdjacentHTML('afterbegin', backLink(location.pathname, hit[1]));
      })();
      setupNavTitle(); blurUp(view); segReveal(view);
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

  var ignorePop = false;
  window.addEventListener('popstate', function () {
    if (ignorePop) { ignorePop = false; return; }
    // Back with a sheet open only closes the sheet: step forward again so the screen and its history stay put
    if (dlg.open) {
      closeDialog(); ignorePop = true; setTimeout(function () { ignorePop = false; }, 600);
      history.go(1); return;
    }
    restoring = true; navDir = 'back';
    render().then(function () { view.focus({ preventScroll: true }); });
  });

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
    var mo = ev.target.closest('[data-motion]:not(html)');
    if (mo) { store('motion', mo.getAttribute('data-motion')); document.documentElement.setAttribute('data-motion', mo.getAttribute('data-motion')); markChecked('data-motion', mo.getAttribute('data-motion')); if (mo.getAttribute('data-motion') === 'on') { Object.keys(rolledKeys).forEach(function (k) { delete rolledKeys[k]; }); toast('Numbers will roll when a page opens'); } return; }
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
    // A tapped event card grows into the event page (where the browser supports it)
    if (!tab && /^\/app\/events\/[^/?#]+$/.test(href.split('?')[0]) && a.matches('a.pcard, a.tcard') && document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      a.style.viewTransitionName = 'hero'; navDir = 'tab';
      document.startViewTransition(function () {
        return go(href).then(function () { var eh = view.querySelector('.ehero'); if (eh) eh.style.viewTransitionName = 'hero'; });
      });
      return;
    }
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


  /* ---------------------------------------------------------------
     Polish: haptics, collapsing title, pull to refresh, edge swipe back,
     long-press menu, bottom-sheet drag, offline pill, first-run welcome
     --------------------------------------------------------------- */
  // Sign-in landing: real photo fading into white, Apple on top, Google and Email beneath, guest link
  var APPLE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.2.8 1.1 1.700 2.300 2.900 2.300 1.200 0 1.600-.7 3-.7s1.800.7 3 .7c1.300 0 2.100-1.100 2.800-2.200.9-1.300 1.300-2.500 1.300-2.600-.1 0-2.500-1-2.500-3.800ZM14.200 5.800c.6-.8 1.100-1.800 1-2.900-.9 0-2 .6-2.700 1.400-.6.700-1.100 1.800-1 2.800 1 .1 2-.5 2.700-1.300Z"/></svg>', GOOGLE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.300-.2-1.900H12v3.700h5.400c-.2 1.200-.9 2.300-2 3v2.500h3.200c1.900-1.700 3-4.300 3-7.300Z"/><path fill="#34A853" d="M12 22c2.700 0 5-.9 6.600-2.400l-3.200-2.500c-.9.600-2 .9-3.400.9-2.600 0-4.800-1.800-5.600-4.100H3.100v2.600C4.700 19.800 8.100 22 12 22Z"/><path fill="#FBBC05" d="M6.400 14c-.2-.6-.3-1.300-.3-2s.1-1.400.3-2V7.400H3.100C2.400 8.800 2 10.400 2 12s.4 3.200 1.100 4.600L6.400 14Z"/><path fill="#EA4335" d="M12 5.900c1.500 0 2.800.5 3.800 1.500l2.900-2.900C17 2.900 14.700 2 12 2 8.100 2 4.700 4.200 3.100 7.400L6.400 10C7.200 7.700 9.400 5.900 12 5.900Z"/></svg>';
  function authLanding(photo, back) {
    return '<section class="auth">' + '<div class="auth__photo"' + (photo ? ' style="--ph:url(\'' + esc(photo) + '\')"' : '') + '></div>' +
      (back ? '<button class="iconbtn gbtn auth__back" type="button" data-auth="back" aria-label="Back">' + icon('back') + '</button>' : '') +
      '<div class="auth__body"><span class="auth__logo"><img src="/assets/app/swd-logo.png" alt="Southwest Bowls Division" width="64" height="75"></span><h1 class="auth__t">Welcome to Southwest Bowls</h1>' +
      '<p class="auth__s">Sign in to enter tournaments and keep your details. Browsing needs no account.</p>' +
      '<label class="auth__terms"><input type="checkbox" data-terms' + (store('termsAccepted') ? ' checked' : '') + '><span>I’ve read and agree with the <button type="button" class="linkbtn" data-legal="terms">Terms</button> and <button type="button" class="linkbtn" data-legal="privacy">Privacy Policy</button>.</span></label>' +
      '<button class="auth__apple" type="button" data-auth="apple" aria-disabled="' + (store('termsAccepted') ? 'false' : 'true') + '">' + APPLE_SVG + 'Continue with Apple<small>Soon</small></button>' +
      '<div class="auth__row"><button class="auth__alt" type="button" data-auth="google" aria-disabled="' + (store('termsAccepted') ? 'false' : 'true') + '">' + GOOGLE_SVG + 'Google<small>Soon</small></button>' +
      '<button class="auth__alt" type="button" data-auth="email" aria-disabled="' + (store('termsAccepted') ? 'false' : 'true') + '">' + icon('mail') + 'Email</button></div>' +
      '<p class="auth__login">Already have an account? <button type="button" class="linkbtn" data-auth="email" aria-disabled="' + (store('termsAccepted') ? 'false' : 'true') + '">Log in here</button></p>' +
      '<button class="auth__guest" type="button" data-auth="guest">Continue as a guest</button>' +
      '<p class="auth__fine">Your email is only used to sign you in.</p><img class="auth__tag" src="/photos/home/tagline-sport-for-life.png" alt="Lawn Bowls: A Sport for Life!" width="150" height="70" loading="lazy"></div></section>';
  }
  function haptic(kind) {
    try {
      var H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
      if (H && H.impact) { H.impact({ style: kind === 'medium' ? 'MEDIUM' : 'LIGHT' }); return; }
      if (navigator.vibrate) navigator.vibrate(kind === 'medium' ? 14 : 8);
    } catch (e) {}
  }
  document.addEventListener('click', function (ev) {
    if (ev.target.closest('[data-follow], [data-save], .tabbar a, .segmented button, .cchip, .wday')) haptic();
  }, true);

  // Collapsing title: when the screen's big heading scrolls away, a small frosted bar carries it
  var navbar = document.createElement('div'); navbar.className = 'navtitle'; navbar.setAttribute('aria-hidden', 'true'); navbar.innerHTML = '<span></span>'; document.body.appendChild(navbar);
  var navObs = null;
  function setupNavTitle() {
    if (navObs) { navObs.disconnect(); navObs = null; }
    navbar.classList.remove('navtitle--on');
    var h = view.querySelector('h1'); if (!h || location.pathname === '/app' || !('IntersectionObserver' in window)) return;
    h.classList.add('ltitle'); navbar.firstChild.textContent = h.textContent.replace(/\s+/g, ' ').trim();
    navObs = new IntersectionObserver(function (en) {
      var e0 = en[0]; navbar.classList.toggle('navtitle--on', !e0.isIntersecting && e0.boundingClientRect.top < 0);
    }, { rootMargin: '-56px 0px 0px 0px', threshold: 0 });
    navObs.observe(h);
  }

  // Large title shrinks a little as you scroll, then the small bar takes over
  (function () {
    var tick = false;
    window.addEventListener('scroll', function () {
      if (tick) return; tick = true;
      requestAnimationFrame(function () { tick = false; document.documentElement.style.setProperty('--tp', Math.min(Math.max(window.scrollY, 0) / 70, 1).toFixed(3)); });
    }, { passive: true });
  })();
  // Photos: show a tiny blurred copy first, swap in the sharp one when it has loaded
  var LQIP = null;
  fetch('/assets/app/lqip.json').then(function (r) { return r.json(); }).then(function (j) { LQIP = j; blurUp(view); }).catch(function () {});
  function blurUp(root) {
    if (!LQIP || !root) return;
    root.querySelectorAll('[style*="--ph:url("]').forEach(function (el) {
      if (el.__bu) return; el.__bu = 1;
      var m = /--ph:\s*url\(['"]?([^'")]+)/.exec(el.getAttribute('style') || ''); if (!m || !LQIP[m[1]]) return;
      var full = m[1], im = new Image();
      if (el.getBoundingClientRect().top > window.innerHeight * 2) return;
      el.style.setProperty('--ph', 'url(' + LQIP[full] + ')');
      im.onload = function () { el.style.setProperty('--ph', 'url("' + full + '")'); }; im.onerror = im.onload; im.src = full;
    });
  }
  // Pull down at the top to refresh
  (function () {
    var ptr = document.createElement('div'); ptr.className = 'ptr'; ptr.setAttribute('aria-hidden', 'true'); ptr.innerHTML = '<span class="spinner"></span>'; document.body.appendChild(ptr);
    var y0 = null, dy = 0;
    document.addEventListener('touchstart', function (ev) { y0 = (window.scrollY <= 0 && ev.touches.length === 1 && !dlg.open && !ev.target.closest('dialog, .wstrip, .hscroll, .cdeck__track, .deck__track, .chips, .cchips, .schips, .cstrip, .stage, .logostrip, .dtiles2, .tablewrap, .mapgl, form, input, textarea, select, [contenteditable], .welcome, .signin, .auth, .entry') && !/^\/app\/(signin|my\/profile)\/?$|\/enter\/?$/.test(location.pathname) && !(document.activeElement && document.activeElement.matches && document.activeElement.matches('input, textarea, select, [contenteditable]'))) ? ev.touches[0].clientY : null; dy = 0; }, { passive: true });
    document.addEventListener('touchmove', function (ev) {
      if (y0 === null) return; dy = ev.touches[0].clientY - y0;
      if (dy > 0 && window.scrollY <= 0) { ptr.style.transform = 'translate(-50%,' + Math.min(dy * .5, 56) + 'px)'; ptr.style.opacity = Math.min(dy / 90, 1); } else { ptr.style.opacity = 0; }
    }, { passive: true });
    document.addEventListener('touchcancel', function () {
      if (y0 === null) return;
      y0 = null; dy = 0; ptr.style.transform = 'translate(-50%,-48px)'; ptr.style.opacity = 0;
    }, { passive: true });
    document.addEventListener('touchend', function () {
      if (y0 === null) return;
      var go2 = dy > 96; ptr.style.transform = 'translate(-50%,-48px)'; ptr.style.opacity = 0; y0 = null;
      if (go2) { haptic('medium'); cache = {}; EVENTS = null; render(); }
    }, { passive: true });
  })();

  // Swipe in from the left edge to go back
  (function () {
    var x0 = null, yy0 = 0;
    document.addEventListener('touchstart', function (ev) { var t = ev.touches[0]; x0 = (t.clientX < 22 && ev.touches.length === 1) ? t.clientX : null; yy0 = t.clientY; }, { passive: true });
    document.addEventListener('touchend', function (ev) {
      if (x0 === null) return; var t = ev.changedTouches[0], dx = t.clientX - x0, dyy = Math.abs(t.clientY - yy0); x0 = null;
      if (dx > 90 && dyy < 60 && history.state && history.state.depth > 0) { if (dlg.open) closeDialog(); else history.back(); }
    }, { passive: true });
  })();

  // Bottom sheet: drag the handle (or the top of the sheet) down to close
  (function () {
    var y0 = null, dy = 0;
    dlg.addEventListener('touchstart', function (ev) { var r = dlg.getBoundingClientRect(); y0 = (ev.touches[0].clientY - r.top < 44 || dlg.scrollTop <= 0) ? ev.touches[0].clientY : null; dy = 0; }, { passive: true });
    dlg.addEventListener('touchmove', function (ev) { if (y0 === null) return; dy = ev.touches[0].clientY - y0; if (dy > 0 && dlg.scrollTop <= 0) { dlg.style.transition = 'none'; dlg.style.transform = 'translateY(' + dy + 'px)'; } }, { passive: true });
    dlg.addEventListener('touchend', function () { if (y0 === null) return; dlg.style.transition = ''; if (dy > 110) closeDialog(); dlg.style.transform = ''; y0 = null; }, { passive: true });
    dlg.addEventListener('touchcancel', function () { if (y0 === null) return; dlg.style.transition = ''; dlg.style.transform = ''; y0 = null; }, { passive: true });
  })();

  // Long-press an event card for quick actions
  (function () {
    var timer = null, hit = null, fired = false;
    function cancel() { clearTimeout(timer); timer = null; }
    document.addEventListener('touchstart', function (ev) {
      var a = ev.target.closest('a.tcard, a.pcard'); if (!a || ev.touches.length !== 1) return;
      var m = /\/app\/events\/([^/?#]+)/.exec(a.getAttribute('href') || ''); if (!m) return;
      hit = decodeURIComponent(m[1]); fired = false; cancel();
      timer = setTimeout(function () {
        fired = true; haptic('medium'); dlgHold = true;
        loadEvents().then(function (list) {
          var x = list.filter(function (q) { return q.id === hit; })[0]; if (!x) { dlgHold = false; return; }
          var on = isSaved(x.id), maps = x.e.club && safeUrl(x.e.club.mapUrl) ? x.e.club.mapUrl : '';
          openDialog(x.short, '<div class="qmenu">' +
            '<a class="qmenu__i" href="/app/events/' + encodeURIComponent(x.id) + '" data-close-dlg>' + icon('chev') + 'Open event</a>' +
            '<button class="qmenu__i" type="button" data-share="/app/events/' + esc(x.id) + '" data-share-title="' + esc(x.e.title) + '">' + icon('share') + 'Share</button>' +
            (maps ? '<a class="qmenu__i" href="' + esc(maps) + '" target="_blank" rel="noopener">' + icon('map') + 'Directions</a>' : '') + '</div>');
        });
      }, 480);
    }, { passive: true });
    ['touchend', 'touchmove', 'touchcancel'].forEach(function (n) { document.addEventListener(n, cancel, { passive: true }); });
    // The release of a long-press must not close the sheet it just opened, and the stuck flag is cleared shortly after
    ['touchend', 'touchcancel'].forEach(function (n) {
      document.addEventListener(n, function () {
        if (dlgHold) setTimeout(function () { dlgHold = false; }, 450);
        if (fired) setTimeout(function () { fired = false; }, 450);
      }, { passive: true });
    });
    document.addEventListener('contextmenu', function (ev) { if (ev.target.closest && ev.target.closest('a.tcard, a.pcard')) ev.preventDefault(); });
    document.addEventListener('click', function (ev) { if (fired && ev.target.closest('a.tcard, a.pcard')) { ev.preventDefault(); ev.stopPropagation(); fired = false; } }, true);
    document.addEventListener('click', function (ev) { if (ev.target.closest('[data-close-dlg], .qmenu [data-save]')) setTimeout(closeDialog, 60); });
  })();

  // Offline pill
  (function () {
    var pill = document.createElement('div'); pill.className = 'offpill'; pill.setAttribute('role', 'status'); pill.hidden = true; pill.textContent = 'You’re offline. Showing saved pages.'; document.body.appendChild(pill);
    function upd() { pill.hidden = navigator.onLine || !netbar.hidden; }   // the in-page banner says the same thing
    if (window.MutationObserver) new MutationObserver(upd).observe(netbar, { attributes: true, attributeFilter: ['hidden'] });
    window.addEventListener('online', upd); window.addEventListener('offline', upd); upd();
  })();

  // First run: three photo screens, then the sign-in choices
  // Terms and Privacy: shown in a sheet (from the sign-up screen) or as pages
  var LEGAL = null;
  function legalHtml(kind) {
    var d = LEGAL && LEGAL[kind]; if (!d) return '<p>This couldn’t load. Try again with a connection.</p>';
    return '<p class="muted">' + esc(d.updated) + '. The Division is reviewing this text.</p>' + d.sections.map(function (sec) {
      return '<section class="legal__s"><h2>' + esc(sec.h) + '</h2>' + sec.p.map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('') + '</section>'; }).join('');
  }
  function loadLegal() { return LEGAL ? Promise.resolve(LEGAL) : getJSON('/legal-data.json').then(function (d) { LEGAL = d; return d; }); }
  function legalScreen(params, id, kind) {
    var k = id === 'terms' ? 'terms' : 'privacy', root = view;
    return loadLegal().catch(function () {}).then(function () {
      if (root !== view) return;
      var t = (LEGAL && LEGAL[k] && LEGAL[k].title) || (k === 'terms' ? 'Terms of Use' : 'Privacy Policy'); setTitle(t);
      view.innerHTML = backLink('/app/more/settings', 'Settings') + '<div class="intro"><h1>' + esc(t) + '</h1></div><div class="legal">' + legalHtml(k) + '</div>';
    });
  }
  /* ---------------------------------------------------------------
     Sliding highlight for every segmented control (event tabs, filters, director tabs): the dark or colored pill glides
     from one button to the next instead of switching at once. Skipped when the selected button has no background.
     --------------------------------------------------------------- */
  (function () {
    function selected(bar) { return bar.querySelector(':scope > [aria-selected="true"], :scope > [aria-pressed="true"]'); }
    function move(bar, animate) {
      var pill = bar.__seg, on = selected(bar); if (!pill) return;
      if (!on) { pill.style.opacity = '0'; return; }
      pill.style.opacity = '1';
      if (!animate) pill.style.transition = 'none';
      pill.style.width = on.offsetWidth + 'px'; pill.style.height = on.offsetHeight + 'px';
      pill.style.transform = 'translate(' + on.offsetLeft + 'px,' + on.offsetTop + 'px)';
      if (!animate) { void pill.offsetWidth; pill.style.transition = ''; }
    }
    function setup(bar) {
      if (bar.__seg || bar.querySelector(':scope > .seg__pill')) return;
      var on = selected(bar); if (!on) return;
      var cs = getComputedStyle(on), bg = cs.backgroundColor;
      if (!bg || bg === 'transparent' || /,\s*0\)$/.test(bg)) return;
      var pill = document.createElement('span'); pill.className = 'seg__pill'; pill.setAttribute('aria-hidden', 'true');
      pill.style.background = bg; pill.style.borderRadius = cs.borderRadius;
      bar.insertBefore(pill, bar.firstChild); bar.style.setProperty('--seg-on', cs.color); bar.classList.add('seg--anim'); bar.__seg = pill;
      move(bar, false);
    }
    var mo = new MutationObserver(function (list) {
      var bars = [];
      list.forEach(function (m) {
        if (m.type === 'attributes') { var b = m.target.closest && m.target.closest('.segmented'); if (b && bars.indexOf(b) < 0) bars.push(b); }
        else m.addedNodes.forEach(function (n) { if (n.nodeType !== 1) return; if (n.matches && n.matches('.segmented') && bars.indexOf(n) < 0) bars.push(n); if (n.querySelectorAll) n.querySelectorAll('.segmented').forEach(function (x) { if (bars.indexOf(x) < 0) bars.push(x); }); });
      });
      bars.forEach(function (b) { if (!b.__seg) setup(b); else move(b, true); });
    });
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-selected', 'aria-pressed'] });
    document.querySelectorAll('.segmented').forEach(setup);
    window.addEventListener('resize', function () { document.querySelectorAll('.segmented').forEach(function (b) { if (b.__seg) move(b, false); }); });
  })();
  /* ---------------------------------------------------------------
     RUN THIS EVENT (directors only, hidden): team names, draw, scores and standings kept in the database
     instead of a Google Sheet. Address: /app/run/<event id>. Needs a signed-in address listed in link_admins.
     Standings: win 3, tie 1, loss 0; plus points = points for minus points against.
     --------------------------------------------------------------- */
  function restReq(method, path, body, token, prefer) {
    var h = { apikey: MEMBERS_API.key, authorization: 'Bearer ' + token, 'content-type': 'application/json' };
    if (prefer) h.prefer = prefer;
    return fetch(MEMBERS_API.url + '/rest/v1/' + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) { var err = new Error((j && (j.message || j.hint || j.details)) || ('HTTP ' + r.status)); err.status = r.status; throw err; }
        return j;
      });
    });
  }
  function runStandings(teams, games) {
    var t = {};
    teams.forEach(function (x) { t[x.team_no] = { no: x.team_no, name: x.name || '', green: x.green || '', p: 0, w: 0, d: 0, l: 0, pts: 0, pf: 0, pa: 0 }; });
    games.forEach(function (g) {
      if (g.score_a == null || g.score_b == null) return;
      var a = t[g.team_a], b = t[g.team_b]; if (!a || !b) return;
      a.p++; b.p++; a.pf += g.score_a; a.pa += g.score_b; b.pf += g.score_b; b.pa += g.score_a;
      if (g.score_a > g.score_b) { a.w++; a.pts += 3; b.l++; }
      else if (g.score_a < g.score_b) { b.w++; b.pts += 3; a.l++; }
      else { a.d++; b.d++; a.pts += 1; b.pts += 1; }
    });
    return Object.keys(t).map(function (k) { return t[k]; }).sort(function (x, y) {
      return (y.pts - x.pts) || ((y.pf - y.pa) - (x.pf - x.pa)) || (x.pa - y.pa) || (x.no - y.no);
    });
  }
  function jwtEmail(tok) { try { return JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email || ''; } catch (e) { return ''; } }
  function runPage(params, id) {
    var root = view, evId = id, S = { teams: [], games: [], entries: [], certOnly: false, tab: 'scores', round: 1, tok: '', who: '', evTitle: '' };
    setTitle('Run this event');
    function shell(inner) { return backLink('/app/my', 'My SWD') + '<div class="intro"><h1>Run this event</h1><p class="muted">' + esc(S.evTitle || evId) + '</p></div>' + inner; }
    view.innerHTML = shell('<p class="muted">Loading…</p>');
    function load() {
      var q = 'event_id=eq.' + encodeURIComponent(evId);
      return Promise.all([restReq('GET', 'run_teams?' + q + '&order=team_no', null, S.tok), restReq('GET', 'run_games?' + q + '&order=round,rink', null, S.tok), getJSON('/events-data.json').catch(function () { return null; }), restReq('GET', 'run_entries?' + q + '&order=id', null, S.tok).catch(function () { return []; })]).then(function (r) {
        S.teams = r[0] || []; S.games = r[1] || []; S.entries = r[3] || [];
        var evs = r[2] && (Array.isArray(r[2]) ? r[2] : r[2].events) || [];
        var e = evs.filter(function (x) { return x.id === evId; })[0]; S.evTitle = e ? e.title : evId;
        var rounds = S.games.map(function (g) { return g.round; }); if (rounds.length && rounds.indexOf(S.round) < 0) S.round = Math.min.apply(null, rounds);
      });
    }
    function teamOf(n) { return S.teams.filter(function (x) { return x.team_no === n; })[0]; }
    function gameProblems(g) {
      var out = [], a = teamOf(g.team_a), b = teamOf(g.team_b);
      if (g.score_a == null || g.score_b == null) out.push('Enter both scores');
      if (g.team_a === g.team_b) out.push('A team cannot play itself');
      if (!a || !a.name || !b || !b.name) out.push('Pick both team names first');
      if (a && b && a.green && b.green && a.green !== b.green) out.push('The two teams are on different greens');
      S.games.forEach(function (o) { if (o !== g && o.round === g.round && (o.team_a === g.team_a || o.team_b === g.team_a || o.team_a === g.team_b || o.team_b === g.team_b)) out.push('A team is also in rink ' + o.rink + ' in this game'); });
      return out.filter(function (x, i) { return out.indexOf(x) === i; });
    }
    function runChecks() {
      var bad = [], warn = [], ok = [], games = S.games;
      var P = function (list, t, h, g) { list.push({ t: t, h: h, round: g && g.round, rink: g && g.rink }); };
      var where = function (g) { return 'Game ' + g.round + ', rink ' + g.rink; };
      var rounds = {}; games.forEach(function (g) { (rounds[g.round] = rounds[g.round] || []).push(g); });
      Object.keys(rounds).forEach(function (r) { var seen = {}; rounds[r].forEach(function (g) { [g.team_a, g.team_b].forEach(function (n) { (seen[n] = seen[n] || []).push(g); }); }); Object.keys(seen).forEach(function (n) { if (seen[n].length > 1) seen[n].forEach(function (g) { P(bad, where(g) + ': team ' + n + ' is in two games in game ' + r, 'A team plays once per game number. One of these cards has a wrong team number. Compare them with the paper cards.', g); }); }); });
      games.forEach(function (g) {
        var a = teamOf(g.team_a), b = teamOf(g.team_b), w = where(g);
        if (g.team_a === g.team_b) P(bad, w + ': a team plays itself', 'One of the two team numbers on this card is wrong. Check the paper card.', g);
        if (a && b && a.green && b.green && a.green !== b.green) P(bad, w + ': the teams are on different greens', 'A and B green teams do not play each other. Check both team numbers against the card.', g);
        if ((g.score_a == null) !== (g.score_b == null)) P(bad, w + ': only one score is entered', 'The other score is missing. Look at the card for this rink, then enter it.', g);
        if ((g.score_a != null || g.score_b != null) && (!a || !a.name || !b || !b.name)) P(bad, w + ': scores entered but a team has no name', 'Pick the team names in the Teams tab, so the result is attached to the right pair.', g);
      });
      var played = games.filter(function (g) { return g.score_a != null && g.score_b != null; });
      // plausibility: things that are possible but worth a second look at the card
      var tots = played.map(function (g) { return g.score_a + g.score_b; }).sort(function (x, y) { return x - y; }), med = tots.length ? tots[Math.floor(tots.length / 2)] : 0;
      played.forEach(function (g) {
        if (g.forfeit) return;   // forfeit scores are entered by hand: no plausibility warnings
        var w = where(g), d = Math.abs(g.score_a - g.score_b), t = g.score_a + g.score_b;
        if (t === 0) P(warn, w + ': 0 to 0', 'Was this game played? Check the card, a missing score is often typed as 0.', g);
        else if (d >= 20) P(warn, w + ': a very large margin (' + d + ')', 'Re-read both scores on the card. A digit may be wrong, or a plus-point cap may apply.', g);
        else if (tots.length >= 4 && med > 0 && (t > 2 * med || t < med / 2)) P(warn, w + ': total ' + t + ' is far from the other games (usually about ' + med + ')', 'One of the two scores may have a wrong digit. Check the card.', g);
      });
      // averages: a team whose average points for or against is far from the field's may have a mistyped score
      (function () {
        var tt = {}, tp = 0, tn = 0;
        played.forEach(function (g) { if (g.forfeit) return; [[g.team_a, g.score_a, g.score_b], [g.team_b, g.score_b, g.score_a]].forEach(function (x) { var o = tt[x[0]] = tt[x[0]] || { f: 0, a: 0, n: 0 }; o.f += x[1]; o.a += x[2]; o.n++; tp += x[1]; tn++; }); });
        var field = tn ? tp / tn : 0; if (!field || tn < 8) return;
        Object.keys(tt).forEach(function (k) {
          var o = tt[k]; if (o.n < 2) return; var af = o.f / o.n, aa = o.a / o.n, nm = '#' + k + (teamOf(+k) && teamOf(+k).name ? ' ' + teamOf(+k).name : '');
          if (af > 1.6 * field || af < 0.4 * field) P(warn, nm + ' averages ' + af.toFixed(1) + ' points for (field average ' + field.toFixed(1) + ')', 'Re-read this team\u2019s cards. One score may have a wrong digit.');
          if (aa > 1.6 * field || aa < 0.4 * field) P(warn, nm + ' averages ' + aa.toFixed(1) + ' points against (field average ' + field.toFixed(1) + ')', 'Re-read the cards of this team\u2019s opponents. One score may have a wrong digit.');
        });
        if (field) ok.push('Average points per team per game: ' + field.toFixed(1));
      })();
      var met = {}; games.forEach(function (g) { var k = Math.min(g.team_a, g.team_b) + ' and ' + Math.max(g.team_a, g.team_b); (met[k] = met[k] || []).push(g); }); Object.keys(met).forEach(function (k) { if (met[k].length > 1) P(warn, 'Teams ' + k + ' meet more than once', 'Normal only in a double round robin. Otherwise one card has a wrong team number.', met[k][1]); });
      var rk = {}; games.forEach(function (g) { [g.team_a, g.team_b].forEach(function (n) { var k = n + '|' + g.rink; (rk[k] = rk[k] || []).push(g); }); }); Object.keys(rk).forEach(function (k) { if (rk[k].length > 1) P(warn, 'Team ' + k.split('|')[0] + ' plays rink ' + k.split('|')[1] + ' more than once', 'Avoid this if you can: swap rinks with another game in that round.', rk[k][1]); });
      var tf = 0, ta = 0, st = runStandings(S.teams, played); st.forEach(function (x) { tf += x.pf; ta += x.pa; });
      var sumGames = played.reduce(function (n, g) { return n + g.score_a + g.score_b; }, 0);   // all points scored in all games: teams' points for, and also their points against, must each equal this
      if (tf !== ta) P(bad, 'Points for (' + tf + ') and against (' + ta + ') across all teams do not match', 'Reload the page. If it stays, a score was not saved correctly: re-enter the latest scores.'); else ok.push('Points for and against match across all teams (' + tf + ')');
      if (tf !== sumGames || ta !== sumGames) P(bad, 'Team totals (for ' + tf + ', against ' + ta + ') do not match the scores entered (' + sumGames + ' points in all)', 'A team may be missing from the Teams tab or listed in the wrong game. Check the Grid for gaps.'); else ok.push('Team totals add up to the scores entered');
      var ties = played.filter(function (g) { return g.score_a === g.score_b; }).length, expected = 3 * (played.length - ties) + 2 * ties, got = st.reduce(function (n, x) { return n + x.pts; }, 0);
      if (got !== expected) P(bad, 'Game points (' + got + ') should be ' + expected, 'Reload the page; if it stays, check for a game with a team missing.'); else ok.push('Game points add up (' + got + ')');
      if (st.reduce(function (n, x) { return n + x.w; }, 0) !== st.reduce(function (n, x) { return n + x.l; }, 0)) P(bad, 'Wins and losses do not match', 'Reload the page; a game may be missing a team.'); else ok.push('Wins equal losses');
      var unc = played.filter(function (g) { return !g.certified_at; }).length; if (unc) P(warn, unc + ' game' + (unc === 1 ? '' : 's') + ' with scores not certified yet', 'Certify each game once you have checked its card.');
      var open = games.filter(function (g) { return g.score_a == null && g.score_b == null; }).length; if (open) P(warn, open + ' game' + (open === 1 ? '' : 's') + ' still to be played', '');
      return { bad: bad, warn: warn, ok: ok };
    }
    function li(cls, x) { return '<li class="' + cls + '">' + esc(x.t) + (x.h ? '<small>' + esc(x.h) + '</small>' : '') + '</li>'; }
    function checksStatusHtml() {
      var c = runChecks(), n = c.warn.length;
      return '<div class="run__checks run__status' + (c.bad.length ? ' is-bad' : '') + '" role="status"><b>' + (c.bad.length ? c.bad.length + ' problem' + (c.bad.length === 1 ? '' : 's') + ' to fix' : '\u2713 No errors found') + '</b>' +
        (n ? ' <button type="button" class="textlink" data-run-tab="checks">' + n + ' worth a second look \u203a</button>' : (c.bad.length ? ' <button type="button" class="textlink" data-run-tab="checks">See details \u203a</button>' : '')) + '</div>';
    }
    function checksPageHtml() {
      var c = runChecks();
      return '<p class="muted">Every check the app runs on the draw and the scores. <b>Problems</b> must be fixed before results are certified. <b>Worth a second look</b> is not an error: it is something unusual that is worth a glance before you certify.</p>' + checksHtml();
    }
    function checksHtml() {
      var c = runChecks();
      return '<div class="run__checks' + (c.bad.length ? ' is-bad' : '') + '" role="status"><b>' + (c.bad.length ? c.bad.length + ' problem' + (c.bad.length === 1 ? '' : 's') + ' to fix' : 'No errors found') + '</b>' +
        (c.bad.length ? '<ul>' + c.bad.map(function (x) { return li('run__x-bad', x); }).join('') + '</ul>' : '') +
        (c.warn.length ? '<p class="run__sub">Worth a second look</p><ul>' + c.warn.map(function (x) { return li('run__x-warn', x); }).join('') + '</ul>' : '') +
        (!c.bad.length && c.ok.length ? '<ul>' + c.ok.map(function (x) { return '<li class="run__x-ok">' + esc(x) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
    }
    function refreshLive() {   // after a score is saved: update each card's hints and Certify button without redrawing the inputs
      var cc = runChecks(), why = {}; cc.bad.concat(cc.warn).forEach(function (x) { if (x.round != null) (why[x.round + '|' + x.rink] = why[x.round + '|' + x.rink] || []).push(x); });
      view.querySelectorAll('.run__game').forEach(function (card) {
        var g = S.games.filter(function (x) { return x.round === +card.dataset.round && x.rink === +card.dataset.rink; })[0]; if (!g) return;
        var items = why[g.round + '|' + g.rink] || [], el = card.querySelector('.run__why');
        var html = items.map(function (x) { return '<p><b>' + esc(x.t.replace(/^Game \d+, rink \d+: /, '')) + '.</b> ' + esc(x.h) + '</p>'; }).join('');
        if (html) { if (!el) { el = document.createElement('div'); el.className = 'run__why'; card.insertBefore(el, card.querySelector('.run__certbtn, .run__cert')); } el.innerHTML = html; } else if (el) el.remove();
        var cb = card.querySelector('[data-cert]'); if (cb) { if (g.score_a == null || g.score_b == null) cb.setAttribute('aria-disabled', 'true'); else cb.removeAttribute('aria-disabled'); }
      });
    }
    function teamLabel(n) { var t = S.teams.filter(function (x) { return x.team_no === n; })[0]; return '#' + n + (t && t.green ? ' (' + t.green + ')' : '') + (t && t.name ? ' ' + t.name : ''); }
    function teamOpts(sel) { return S.teams.map(function (t) { return '<option value="' + t.team_no + '"' + (t.team_no === sel ? ' selected' : '') + '>' + esc(teamLabel(t.team_no)) + '</option>'; }).join(''); }
    function tabsHtml() { return '<div class="segmented run__tabs" role="tablist">' + [['teams', 'Teams'], ['draw', 'Draw'], ['scores', 'Scores'], ['grid', 'Grid'], ['standings', 'Standings'], ['checks', 'Checks']].map(function (t) { return '<button type="button" role="tab" aria-selected="' + (S.tab === t[0]) + '" data-run-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>'; }
    function bodyHtml() { return S.tab === 'teams' ? teamsHtml() : S.tab === 'draw' ? drawSheetHtml() : S.tab === 'scores' ? scoresHtml() : S.tab === 'grid' ? gridHtml() : S.tab === 'checks' ? checksPageHtml() : standingsHtml(); }
    function switchTab(name) {
      if (name === S.tab) return;
      S.tab = name;
      view.querySelectorAll('.run__tabs [role="tab"]').forEach(function (x) { x.setAttribute('aria-selected', x.getAttribute('data-run-tab') === name ? 'true' : 'false'); });
      var body = view.querySelector('#run-body'); if (!body) { draw(); return; }
      body.style.opacity = '0';
      var show = function () { if (root !== view) return; body.innerHTML = bodyHtml(); body.style.opacity = '1'; };
      setTimeout(function () { if (name === 'standings' || name === 'grid' || name === 'draw' || name === 'checks') load().then(show, show); else show(); }, 140);
    }
    function teamsHtml() {
      return '<p class="muted">After the card draw, pick each team from the entered teams. Names always come from the entry list, so nothing is typed here by mistake.</p>' + [['A', 'Green A'], ['B', 'Green B'], ['', 'Green not set']].map(function (gp) {
        var grp = S.teams.filter(function (t) { return (t.green || '') === gp[0]; });
        if (!grp.length) return '';
        return '<h2 class="run__h run__gh">' + gp[1] + ' <span class="muted">· ' + grp.length + ' team' + (grp.length === 1 ? '' : 's') + '</span></h2><ul class="run__list">' + grp.map(teamRow).join('') + '</ul>'; }).join('') +
        '<div class="actions"><button class="btn btn--ghost" type="button" data-team-add>Add a team slot</button></div>' +
        '<h2 class="run__h">Late entry</h2><p class="muted">A team that is not on the list? Add it once here, on purpose. It then appears in the drop-downs.</p>' +
        '<form class="run__addentry" data-entry-form><input class="run__name" type="text" name="n" placeholder="Names, e.g. Ann Lee &amp; Sue Kim" autocomplete="off" required><select class="run__green" name="g" aria-label="Green"><option value="A">A</option><option value="B">B</option></select><button class="btn btn--ghost" type="submit">Add</button></form>' + resetHtml();
    }
    function resetHtml() {
      var scored = S.games.filter(function (g) { return g.score_a != null || g.score_b != null; }).length, cert = S.games.filter(function (g) { return g.certified_at; }).length, named = S.teams.filter(function (t) { return t.name; }).length;
      var head = '<h2 class="run__h run__dz">\u26a0 Danger zone</h2>';
      if (!S.resetAsk) return head + '<p class="muted">Start over: clears everything entered for this event, for example after practicing. Maverick would want a second confirmation, so it asks twice.</p><div class="actions"><button class="btn btn--ghost run__dangerline" type="button" data-reset-open>Reset this event\u2026</button></div>';
      if (S.resetAsk === 1) return head + '<div class="run__reset" role="alertdialog" aria-label="Reset this event"><p><b>Reset this event?</b> This cannot be undone.</p><ul>' +
        '<li>Clears <b>' + scored + '</b> score' + (scored === 1 ? '' : 's') + (cert ? ', including <b>' + cert + ' certified</b> result' + (cert === 1 ? '' : 's') : '') + ' and all forfeits</li>' +
        '<li>Clears <b>' + named + '</b> team name' + (named === 1 ? '' : 's') + ' (the greens stay)</li>' +
        '<li>Rebuilds the standard draw for any green that has one (12 teams, or 4 teams), so removed games come back</li>' +
        '<li>Keeps the entered teams list</li></ul>' +
        '<div class="actions"><button class="btn run__danger" type="button" data-reset-next>Continue\u2026</button><button class="btn btn--ghost" type="button" data-reset-cancel>Cancel</button></div></div>';
      return head + '<div class="run__reset" role="alertdialog" aria-label="Final confirmation"><p><b>Final confirmation.</b> ' + scored + ' score' + (scored === 1 ? '' : 's') + (cert ? ' (' + cert + ' certified)' : '') + ' and ' + named + ' team name' + (named === 1 ? '' : 's') + ' will be erased for good. Are you sure?</p>' +
        '<div class="actions"><button class="btn run__danger" type="button" data-reset-go disabled>Wait 3\u2026</button><button class="btn btn--ghost" type="button" data-reset-cancel>No, keep everything</button></div></div>';
    }
    function teamRow(t) {
      return (function () {
        var used = S.teams.filter(function (x) { return x.team_no !== t.team_no; }).map(function (x) { return x.name; });
        var opts = S.entries.filter(function (e) { return (!t.green || !e.green || e.green === t.green) && (e.name === t.name || used.indexOf(e.name) < 0); }).map(function (e) { return '<option value="' + e.id + '"' + (e.name === t.name ? ' selected' : '') + '>' + esc(e.name) + '</option>'; }).join('');
        var stray = t.name && !S.entries.some(function (e) { return e.name === t.name; }) ? '<option value="" selected>' + esc(t.name) + ' (not on the entry list)</option>' : '';
        return '<li class="run__team"><b class="run__no">' + t.team_no + '</b><select class="run__name" data-pick="' + t.team_no + '" aria-label="Team ' + t.team_no + '"><option value="">Pick a team…</option>' + stray + opts + '</select>' +
          '<select class="run__green" data-green="' + t.team_no + '" aria-label="Green for team ' + t.team_no + '"><option value="">–</option><option value="A"' + (t.green === 'A' ? ' selected' : '') + '>A</option><option value="B"' + (t.green === 'B' ? ' selected' : '') + '>B</option></select>' +
          '<button class="run__x" type="button" data-team-del="' + t.team_no + '" aria-label="Remove team ' + t.team_no + '">×</button></li>'; })();
    }
    function scoresHtml() {
      var rounds = []; S.games.forEach(function (g) { if (rounds.indexOf(g.round) < 0) rounds.push(g.round); }); rounds.sort(function (a, b) { return a - b; });
      if (rounds.indexOf(S.round) < 0) rounds.push(S.round); rounds.sort(function (a, b) { return a - b; });
      var chips = '<div class="run__rounds">' + rounds.map(function (r) { return '<button type="button" class="run__chip" aria-pressed="' + (r === S.round) + '" data-round="' + r + '">Game ' + r + '</button>'; }).join('') + '<button type="button" class="run__chip run__chip--add" data-round-add>+ Game ' + (Math.max.apply(null, rounds) + 1) + '</button></div>';
      var gs = S.games.filter(function (g) { return g.round === S.round; });
      var cc = runChecks(), why = {}; cc.bad.concat(cc.warn).forEach(function (x) { if (x.round != null) (why[x.round + '|' + x.rink] = why[x.round + '|' + x.rink] || []).push(x); });
      var cardHtml = function (g) {
        var cert = !!g.certified_at, dis = cert ? ' disabled' : '';
        return '<div class="run__game' + (cert ? ' is-cert' : '') + '" data-round="' + g.round + '" data-rink="' + g.rink + '"><div class="run__rink"><label>Rink <input class="run__rinkin" type="number" inputmode="numeric" min="1" max="30" value="' + g.rink + '" data-f="rink"' + dis + '></label>' +
          (cert ? '' : '<button class="textlink run__del" type="button" data-game-del>Remove</button>') + '</div>' +
          '<div class="run__side"><select data-f="team_a" aria-label="Team A"' + dis + '>' + teamOpts(g.team_a) + '</select><input class="run__score" type="number" inputmode="numeric" min="0" max="99" value="' + (g.score_a == null ? '' : g.score_a) + '" data-f="score_a" aria-label="Score A"' + dis + '></div>' +
          '<div class="run__vs">vs</div>' +
          '<div class="run__side"><select data-f="team_b" aria-label="Team B"' + dis + '>' + teamOpts(g.team_b) + '</select><input class="run__score" type="number" inputmode="numeric" min="0" max="99" value="' + (g.score_b == null ? '' : g.score_b) + '" data-f="score_b" aria-label="Score B"' + dis + '></div>' +
          '<label class="run__ff"><input type="checkbox" data-ff' + (g.forfeit ? ' checked' : '') + dis + '> Forfeit: enter the score by hand</label>' +
          (why[g.round + '|' + g.rink] ? '<div class="run__why">' + why[g.round + '|' + g.rink].map(function (x) { return '<p><b>' + esc(x.t.replace(/^Game \d+, rink \d+: /, '')) + '.</b> ' + esc(x.h) + '</p>'; }).join('') + '</div>' : '') +
          (cert ? '<div class="run__cert"><span>Certified ✓ ' + new Date(g.certified_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '</span><button class="textlink" type="button" data-uncert>Reopen</button></div>'
            : '<button class="btn btn--sm run__certbtn" type="button" data-cert' + (g.score_a == null || g.score_b == null ? ' aria-disabled="true"' : '') + '>Certify result</button>') +
          '<span class="run__saved" aria-live="polite"></span></div>'; };
      var gOf = function (g) { var t = S.teams.filter(function (x) { return x.team_no === g.team_a; })[0]; return (t && t.green) || ''; };
      var groups = ['A', 'B', ''].filter(function (k) { return gs.some(function (g) { return gOf(g) === k; }); });
      var cards = !gs.length ? '<p class="muted">No games in this round yet.</p>' : groups.map(function (k) {
        return (groups.length > 1 || k ? '<h2 class="run__h">' + (k ? 'Green ' + k : 'Green not set') + '</h2>' : '') + gs.filter(function (g) { return gOf(g) === k; }).map(cardHtml).join('');
      }).join('');
      var inRound = gs.length, certN = gs.filter(function (g) { return g.certified_at; }).length, c0 = runChecks();
      var head = '<div class="run__bar"><span>' + certN + ' of ' + inRound + ' certified in game ' + S.round + '</span><button class="btn btn--ghost btn--sm" type="button" data-round-cert>Certify all complete games</button></div>' + (c0.bad.length ? '<div class="run__checks is-bad"><b>' + c0.bad.length + ' problem' + (c0.bad.length === 1 ? '' : 's') + ' to fix</b><ul>' + c0.bad.slice(0, 3).map(function (x) { return li('run__x-bad', x); }).join('') + '</ul></div>' : '');
      return head + '<p class="muted">Enter scores as games finish. You can change the rink or the teams, add or remove a game if the draw changes.</p>' + chips + cards + '<h2 class="run__h">Add a game</h2><form class="run__addgame" data-game-form><input class="run__rinkin" type="number" inputmode="numeric" min="1" max="30" name="rink" placeholder="Rink" required><select name="a" required aria-label="Team A"><option value="">Team A…</option>' + teamOpts(0) + '</select><select name="b" required aria-label="Team B"><option value="">Team B…</option>' + teamOpts(0) + '</select><button class="btn btn--ghost" type="submit">Add</button></form>';
    }
    // Fixed draws by number of teams on a green. Fixed tables are [game, rink, position a, position b].
    // 12 teams x 4 games is Anne's sheet; 4 teams is a plain 3-game round robin whose rinks start at a rink the director sets.
    var DRAWS = {
      12: { label: '12 teams, 4 games (from Anne\u2019s sheet)', fixed: [[1,2,1,4],[1,3,11,12],[1,4,5,10],[1,5,6,9],[1,6,7,8],[1,7,2,3],[2,1,5,7],[2,2,9,11],[2,5,3,4],[2,6,2,10],[2,7,1,12],[2,8,6,8],[3,1,4,12],[3,2,8,10],[3,3,6,7],[3,4,2,11],[3,7,5,9],[3,8,1,3],[4,1,10,11],[4,4,3,12],[4,5,5,8],[4,6,1,6],[4,7,4,7],[4,8,2,9]] },
      4: { label: '4 teams, 3 games, everyone plays everyone', rr: [[[1,2],[3,4]], [[1,3],[2,4]], [[1,4],[2,3]]] }
    };
    function drawBuild(nos, startRink) {
      var d = DRAWS[nos.length], out = []; if (!d) return null;
      if (d.fixed) d.fixed.forEach(function (r) { out.push({ round: r[0], rink: r[1], team_a: nos[r[2] - 1], team_b: nos[r[3] - 1] }); });
      else d.rr.forEach(function (pairs, i) { pairs.forEach(function (pr, j) { out.push({ round: i + 1, rink: startRink + j, team_a: nos[pr[0] - 1], team_b: nos[pr[1] - 1] }); }); });
      return out;
    }
    function drawToolsHtml() {
      var cards = ['A', 'B', ''].map(function (k) {
        var ts = S.teams.filter(function (t) { return (t.green || '') === k; }); if (!ts.length) return '';
        var nm = k ? 'Green ' + k : 'Green not set', has = S.games.filter(function (g) { return ts.some(function (t) { return t.team_no === g.team_a; }); }), scored = has.some(function (g) { return g.score_a != null || g.score_b != null || g.certified_at; });
        var d = DRAWS[ts.length];
        if (!k) return '<div class="run__gen"><b>' + nm + '</b><p class="muted">Set the green for these teams first (Teams tab).</p></div>';
        if (!d) return '<div class="run__gen"><b>' + nm + ' · ' + ts.length + ' teams</b><p class="muted">There is no standard draw for ' + ts.length + ' teams yet. Add the games by hand in Scores.</p></div>';
        return '<div class="run__gen" data-gen="' + k + '"><b>' + nm + ' · ' + d.label + '</b>' +
          (d.rr ? '<label class="muted">First rink <input class="run__rinkin" type="number" inputmode="numeric" min="1" max="29" value="' + (k === 'B' ? 9 : 1) + '" data-gen-rink></label>' : '') +
          '<p class="muted">Team numbers on this green, lowest first, take places 1 to ' + ts.length + '. ' + (has.length ? (scored ? 'Scores are already entered here, so the draw is locked.' : 'This replaces the ' + has.length + ' games it has now.') : 'No games yet.') + '</p>' +
          '<button class="btn btn--ghost" type="button" data-gen-go="' + k + '"' + (scored ? ' disabled' : '') + '>' + (has.length ? 'Replace the draw' : 'Create the draw') + '</button></div>';
      }).join('');
      return '<h2 class="run__h">Create the whole draw</h2><p class="muted">After the card draw and the team numbers are set, one tap builds every game for a green.</p>' + cards;
    }
    function drawSheetHtml() {
      var rounds = []; S.games.forEach(function (g) { if (rounds.indexOf(g.round) < 0) rounds.push(g.round); }); rounds.sort(function (a, b) { return a - b; });
      var tm = function (n) { var t = S.teams.filter(function (x) { return x.team_no === n; })[0]; return '<b>#' + n + '</b> ' + (t && t.name ? esc(t.name) : '<span class="muted">name not set</span>'); };
      var gOf = function (g) { var t = S.teams.filter(function (x) { return x.team_no === g.team_a; })[0]; return (t && t.green) || ''; };
      if (!rounds.length) return '<p class="muted">No games yet. Open <b>Scores</b>, choose a game and use <b>Add a game</b>: a rink and two teams for each match. Once you add them, the rink sheet appears here for the director to read.</p>' + drawToolsHtml();
      var greens = ['A', 'B', ''].filter(function (k) { return S.games.some(function (g) { return gOf(g) === k; }); });
      return '<p class="muted">The whole draw on one page: a row for each rink, a column for each game, and the two team numbers that play there. Tap a box to open that game.</p>' + greens.map(function (k) {
        var gs = S.games.filter(function (g) { return gOf(g) === k; }), rinks = [], ts = S.teams.filter(function (t) { return (t.green || '') === k; });
        gs.forEach(function (g) { if (rinks.indexOf(g.rink) < 0) rinks.push(g.rink); }); rinks.sort(function (x, y) { return x - y; });
        var cell = function (r, rk) {
          var g = gs.filter(function (x) { return x.round === r && x.rink === rk; })[0];
          if (!g) return '<td class="run__c run__c--bye">\u2013</td>';
          var done = g.score_a != null && g.score_b != null;
          return '<td class="run__c ' + (done ? 'is-done' : '') + '" data-goto="' + r + '" data-goto-rink="' + rk + '" role="button" tabindex="0"><b>' + g.team_a + ' v ' + g.team_b + '</b>' + (done ? '<small>' + g.score_a + '\u2013' + g.score_b + '</small>' : '') + '</td>';
        };
        var head = '<tr><th>Rink</th>' + rounds.map(function (r) { return '<th>Game ' + r + '</th>'; }).join('') + '</tr>';
        return (greens.length > 1 || k ? '<h2 class="run__h">' + (k ? 'Green ' + k : 'Green not set') + '</h2>' : '') +
          '<div class="run__scroll"><table class="run__grid run__drawgrid"><thead>' + head + '</thead><tbody>' + rinks.map(function (rk) { return '<tr><td><b>' + rk + '</b></td>' + rounds.map(function (r) { return cell(r, rk); }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' +
          '<details class="run__key"><summary>Team numbers and names</summary><ul>' + ts.map(function (t) { return '<li><b>' + t.team_no + '</b> ' + (t.name ? esc(t.name) : '<span class="muted">name not set</span>') + '</li>'; }).join('') + '</ul></details>';
      }).join('') + '<div class="actions"><button class="btn btn--ghost" type="button" data-draw-print>Print or save as PDF</button></div>' + drawToolsHtml();
    }
    function gridHtml() {
      var rounds = []; S.games.forEach(function (g) { if (rounds.indexOf(g.round) < 0) rounds.push(g.round); }); rounds.sort(function (x, y) { return x - y; });
      var greens = ['A', 'B', ''].filter(function (k) { return S.teams.some(function (t) { return (t.green || '') === k; }); });
      var bad = {}, tip = {}; runChecks().bad.forEach(function (x) { if (x.round != null) { bad[x.round + '|' + x.rink] = 1; (tip[x.round + '|' + x.rink] = tip[x.round + '|' + x.rink] || []).push(x.t.replace(/^Game \d+, rink \d+: /, '') + '. ' + x.h); } });
      function cell(t, r) {
        var gs = S.games.filter(function (g) { return g.round === r && (g.team_a === t.team_no || g.team_b === t.team_no); });
        if (!gs.length) return '<td class="run__c run__c--bye">–</td>';
        if (gs.length > 1) return '<td class="run__c is-bad" data-goto="' + r + '">2 games!</td>';
        var g = gs[0], mine = g.team_a === t.team_no, opp = mine ? g.team_b : g.team_a, f = mine ? g.score_a : g.score_b, ag = mine ? g.score_b : g.score_a, done = f != null && ag != null;
        var cls = !done ? 'is-wait' : f > ag ? 'is-win' : f < ag ? 'is-loss' : 'is-tie';
        if (bad[g.round + '|' + g.rink] || (!done && (f != null || ag != null))) cls = 'is-bad';
        return '<td class="run__c ' + cls + '" data-goto="' + r + '" data-goto-rink="' + g.rink + '" role="button" tabindex="0" title="' + esc((tip[g.round + '|' + g.rink] || []).join(' ')) + '"><small>Rink ' + g.rink + ' v ' + opp + '</small><b>' + (done ? f + '–' + ag : '·') + '</b>' + (g.forfeit ? '<i>F</i>' : '') + (g.certified_at ? '<i>✓</i>' : '') + '</td>';
      }
      return '<p class="muted">One row per team, one column per game. Tap a cell to open that game.</p><div class="run__legend"><p><b>How to read a cell</b></p><div class="run__ex"><span class="run__c is-win"><small>Rink 2 v 4</small><b>12–7</b></span><span>= played on <b>rink 2</b> <b>versus team 4</b>, won 12 to 7.</span></div><ul><li><span class="run__dot is-win"></span> Won</li><li><span class="run__dot is-loss"></span> Lost</li><li><span class="run__dot is-tie"></span> Tied</li><li><span class="run__dot is-wait"></span> Waiting for a score</li><li><span class="run__dot is-bad"></span> Red outline: a problem to fix</li><li><b>F</b> forfeit · <b>✓</b> certified · <b>–</b> no game (bye)</li></ul><p class="run__legnote"><b>Bottom row:</b> for each game, how many of that green\u2019s games have a score entered, and the <b>total points scored</b> in them by both teams added together (every score on the cards). It is a quick check against the cards: if the numbers on the cards add up to something different, a score was keyed in wrongly.</p></div>' + greens.map(function (k) {
        var ts = S.teams.filter(function (t) { return (t.green || '') === k; }), ids = ts.map(function (t) { return t.team_no; });
        var foot = rounds.map(function (r) {
          var mine = S.games.filter(function (g) { return g.round === r && (ids.indexOf(g.team_a) >= 0 || ids.indexOf(g.team_b) >= 0); }), pts = 0, n = 0;
          mine.forEach(function (g) { if (g.score_a != null && g.score_b != null) { n++; pts += g.score_a + g.score_b; } });
          return '<td class="run__c run__c--sum"><small>' + n + ' of ' + mine.length + ' games in</small><b>' + pts + '</b></td>';
        }).join('');
        return (greens.length > 1 || k ? '<h2 class="run__h">' + (k ? 'Green ' + k : 'Green not set') + '</h2>' : '') + '<div class="run__scroll"><table class="run__grid"><thead><tr><th>#</th><th>Team</th>' + rounds.map(function (r) { return '<th>G' + r + '</th>'; }).join('') + '</tr></thead><tbody>' +
          ts.map(function (t) { return '<tr><td><b>' + t.team_no + '</b></td><td class="run__gname">' + esc(t.name || '—') + '</td>' + rounds.map(function (r) { return cell(t, r); }).join('') + '</tr>'; }).join('') +
          '<tr class="run__sumrow"><td></td><td class="run__gname">Points scored in the game</td>' + foot + '</tr></tbody></table></div>';
      }).join('');
    }
    function standingsHtml() {
      var base = S.certOnly ? S.games.filter(function (g) { return g.certified_at; }) : S.games, all = runStandings(S.teams, base), greens = ['A', 'B', ''].filter(function (g) { return all.some(function (x) { return x.green === g; }); });
      var multi = greens.length > 1 || (greens.length === 1 && greens[0] !== '');
      var tbl = function (rows, title) {
        return (title ? '<h2 class="run__h">' + title + '</h2>' : '') + '<div class="run__scroll"><table class="run__table"><thead><tr><th>#</th><th>Team</th><th>P</th><th>W-T-L</th><th>Pts</th><th>+/−</th><th>For</th><th>Ag</th><th>Avg F/A</th></tr></thead><tbody>' + rows.map(function (r, i) {
          var diff = r.pf - r.pa; return '<tr><td>' + (i + 1) + '</td><td><b>' + r.no + '</b> ' + esc(r.name) + '</td><td>' + r.p + '</td><td>' + r.w + '-' + r.d + '-' + r.l + '</td><td><b>' + r.pts + '</b></td><td>' + (diff > 0 ? '+' : '') + diff + '</td><td>' + r.pf + '</td><td>' + r.pa + '</td><td>' + (r.p ? (r.pf / r.p).toFixed(1) + ' / ' + (r.pa / r.p).toFixed(1) : '–') + '</td></tr>'; }).join('') + '</tbody></table></div>';
      };
      var body = multi ? greens.map(function (g) { return tbl(all.filter(function (x) { return x.green === g; }), g ? g + ' green' : 'No green set'); }).join('') : tbl(all, '');
      var cn = S.games.filter(function (g) { return g.certified_at; }).length, pn = S.games.filter(function (g) { return g.score_a != null && g.score_b != null; }).length;
      return checksStatusHtml() + '<p class="muted">' + (cn < pn ? 'Provisional: ' : '') + cn + ' of ' + pn + ' played games certified. Win 3, tie 1, loss 0. Ties on points go to plus points (for minus against), then fewest points against.</p><label class="run__tog"><input type="checkbox" data-cert-only' + (S.certOnly ? ' checked' : '') + '> Count certified games only</label>' + body + '<div class="actions"><button class="btn btn--ghost" type="button" data-run-refresh>Refresh from the database</button></div>';
    }
    function draw() {
      view.innerHTML = shell(tabsHtml() + '<div id="run-body">' + bodyHtml() + '</div><p class="footnote">Signed in as ' + esc(S.who) + '. Only directors can see this page.</p>');
    }
    function say(el, msg, bad) { if (!el) return; el.textContent = msg; el.className = 'run__saved' + (bad ? ' is-bad' : ''); }
    function numOrNull(v) { v = String(v).trim(); if (v === '') return null; return /^\d{1,2}$/.test(v) ? parseInt(v, 10) : NaN; }   // whole numbers 0 to 99 only; blank stays blank, never a default
    var q = function (g) { return 'run_games?event_id=eq.' + encodeURIComponent(evId) + '&round=eq.' + g.round + '&rink=eq.' + g.rink; };
    view.addEventListener('change', function (ev) {
      if (root !== view) return;
      var el = ev.target, card = el.closest('.run__game');
      if (card) {
        var g = S.games.filter(function (x) { return x.round === +card.dataset.round && x.rink === +card.dataset.rink; })[0]; if (!g) return;
        if (el.hasAttribute('data-ff')) {
        var fg = S.games.filter(function (x) { return x.round === +card.dataset.round && x.rink === +card.dataset.rink; })[0]; if (!fg) return;
        restReq('PATCH', q(fg), { forfeit: el.checked, updated_at: new Date().toISOString(), updated_by: S.who }, S.tok).then(function () { fg.forfeit = el.checked; draw(); toast(el.checked ? 'Marked as a forfeit' : 'Forfeit removed'); }, function (e) { el.checked = !el.checked; toast('Not saved', e.message); });
        return;
      }
      var f = el.getAttribute('data-f'), val = (f === 'score_a' || f === 'score_b') ? numOrNull(el.value) : (/^\d{1,2}$/.test(String(el.value).trim()) ? parseInt(el.value, 10) : NaN), st = card.querySelector('.run__saved');
        if (val === null && f !== 'score_a' && f !== 'score_b') { say(st, 'Enter a rink number', true); el.value = g[f]; return; }
        if (val !== null && (isNaN(val) || val < 0 || (f === 'rink' && val < 1))) { say(st, 'Enter a whole number', true); if (f === 'rink') el.value = g.rink; return; }
        if (f === 'rink' && S.games.some(function (x) { return x.round === g.round && x.rink === val; })) { var oc = S.games.filter(function (x) { return x.round === g.round && x.rink === val; })[0]; say(st, 'That rink is already used in this game', true); toast('Rink ' + val + ' is already taken in game ' + g.round, 'Team ' + oc.team_a + ' v ' + oc.team_b + ' are on it. Change their rink first, or move them to a free rink.'); el.value = g.rink; return; }
        var patch = {}; patch[f] = val; patch.updated_at = new Date().toISOString(); patch.updated_by = S.who;
        say(st, 'Saving…');
        restReq('PATCH', q(g), patch, S.tok).then(function () {
          var oldRink = g.rink; g[f] = val; if (f === 'rink') { card.dataset.rink = val; }
          say(st, 'Saved ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })); refreshLive();
          if (f === 'rink') {
            S.games.sort(function (a, b) { return a.round - b.round || a.rink - b.rink; });
            draw();
            var mv = view.querySelector('.run__game[data-round="' + g.round + '"][data-rink="' + val + '"]');
            if (mv) { mv.scrollIntoView({ block: 'center' }); mv.classList.add('is-focus'); setTimeout(function () { mv.classList.remove('is-focus'); }, 2200); }
            toast('Moved to rink ' + val, 'Games are listed by rink, so it now sits in that place.');
          }
        }, function (e) { say(st, 'Not saved: ' + (e.message || 'try again'), true); });
        return;
      }
      var pk = el.getAttribute('data-pick');
      if (pk) {
        var tp = S.teams.filter(function (x) { return x.team_no === +pk; })[0]; if (!tp) return;
        var en = S.entries.filter(function (x) { return String(x.id) === el.value; })[0];
        var pp = en ? { name: en.name, green: en.green || tp.green || null } : { name: '' }; pp.updated_at = new Date().toISOString();
        restReq('PATCH', 'run_teams?event_id=eq.' + encodeURIComponent(evId) + '&team_no=eq.' + tp.team_no, pp, S.tok).then(function () { Object.assign(tp, pp); draw(); toast('Saved'); }, function (e) { toast('Not saved', e.message || 'Try again.'); });
        return;
      }
      var tn = el.getAttribute('data-team') || el.getAttribute('data-green'); if (!tn) return;
      var t = S.teams.filter(function (x) { return x.team_no === +tn; })[0]; if (!t) return;
      var p2 = el.hasAttribute('data-team') ? { name: el.value.trim() } : { green: el.value || null }; p2.updated_at = new Date().toISOString();
      restReq('PATCH', 'run_teams?event_id=eq.' + encodeURIComponent(evId) + '&team_no=eq.' + t.team_no, p2, S.tok).then(function () { Object.assign(t, p2); toast('Saved'); }, function (e) { toast('Not saved', e.message || 'Try again.'); });
    });
    view.addEventListener('submit', function (ev) {
      var gf = ev.target.closest('[data-game-form]'); if (!gf || root !== view) return;
      ev.preventDefault();
      var rk = gf.elements.rink.value.trim(), ta = parseInt(gf.elements.a.value, 10), tb = parseInt(gf.elements.b.value, 10);
      if (!/^\d{1,2}$/.test(rk) || +rk < 1) { toast('Enter a rink number'); return; }
      if (!ta || !tb) { toast('Pick both teams'); return; }
      var ng = { event_id: evId, round: S.round, rink: +rk, team_a: ta, team_b: tb, updated_by: S.who };
      if (S.games.some(function (g) { return g.round === ng.round && g.rink === ng.rink; })) { toast('That rink is already used in this game'); return; }
      var pr = gameProblems(Object.assign({ score_a: 0, score_b: 0 }, ng)).filter(function (x) { return x !== 'Enter both scores'; });
      if (pr.length) { toast('Cannot add this game', pr[0]); return; }
      restReq('POST', 'run_games', ng, S.tok).then(function () { ng.score_a = null; ng.score_b = null; S.games.push(ng); S.games.sort(function (x, y) { return x.round - y.round || x.rink - y.rink; }); draw(); toast('Game added'); }, function (e) { toast('Could not add', e.message); });
    });
    view.addEventListener('submit', function (ev) {
      var f = ev.target.closest('[data-entry-form]'); if (!f || root !== view) return;
      ev.preventDefault();
      var nm = f.elements.n.value.trim().replace(/\s+/g, ' '); if (!nm) return;
      if (S.entries.some(function (e) { return e.name.toLowerCase() === nm.toLowerCase(); })) { toast('Already on the list', nm); return; }
      var ne = { event_id: evId, name: nm, green: f.elements.g.value };
      restReq('POST', 'run_entries', ne, S.tok, 'return=representation').then(function (r) { S.entries.push((r && r[0]) || ne); draw(); toast('Added to the entered teams'); }, function (e) { toast('Could not add', e.message); });
    });
    view.addEventListener('change', function (ev) { if (ev.target.hasAttribute && ev.target.hasAttribute('data-cert-only')) { S.certOnly = ev.target.checked; draw(); } });
    view.addEventListener('click', function (ev) {
      if (root !== view) return;
      var gc = ev.target.closest('[data-goto]'); if (gc) {
        S.round = +gc.getAttribute('data-goto'); S.tab = 'scores'; var gr = gc.getAttribute('data-goto-rink'); draw();
        var card = gr && view.querySelector('.run__game[data-round="' + S.round + '"][data-rink="' + gr + '"]');
        if (card) { card.scrollIntoView({ block: 'center' }); card.classList.add('is-focus'); setTimeout(function () { card.classList.remove('is-focus'); }, 2200); var sc = card.querySelector('[data-f="score_a"]:not([disabled])'); if (sc) sc.focus({ preventScroll: true }); } else window.scrollTo(0, 0);
        return; }
      var b = ev.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-reset-open')) { S.resetAsk = 1; draw(); return; }
      if (b.hasAttribute('data-reset-next')) {
        S.resetAsk = 2; draw();
        var left = 3, tick = function () { var go = view.querySelector('[data-reset-go]'); if (!go || S.resetAsk !== 2) return; if (--left > 0) { go.textContent = 'Wait ' + left + '\u2026'; setTimeout(tick, 1000); } else { go.disabled = false; go.textContent = 'Yes, erase it all'; } };
        setTimeout(tick, 1000); return;
      }
      if (b.hasAttribute('data-reset-cancel')) { S.resetAsk = false; draw(); return; }
      if (b.hasAttribute('data-reset-go')) {
        b.disabled = true; b.textContent = 'Resetting\u2026';
        var clean = { score_a: null, score_b: null, forfeit: false, certified_at: null, certified_by: null, updated_at: new Date().toISOString(), updated_by: S.who }, rows = [];
        ['A', 'B', ''].forEach(function (gk) {
          var tn = S.teams.filter(function (t) { return (t.green || '') === gk; }).map(function (t) { return t.team_no; }).sort(function (x, y) { return x - y; });
          var mine = S.games.filter(function (g) { return tn.indexOf(g.team_a) >= 0; });
          var std = gk && DRAWS[tn.length] ? drawBuild(tn, Math.min.apply(null, mine.map(function (g) { return g.rink; }).concat([gk === 'B' ? 9 : 1]))) : null;
          (std || mine).forEach(function (g) { rows.push(Object.assign({ event_id: evId, round: g.round, rink: g.rink, team_a: g.team_a, team_b: g.team_b }, clean)); });
        });
        var keep = {}; rows.forEach(function (r) { keep[r.round + '|' + r.rink] = 1; });
        var extra = S.games.filter(function (g) { return !keep[g.round + '|' + g.rink]; });
        restReq('POST', 'run_games?on_conflict=event_id,round,rink', rows, S.tok, 'resolution=merge-duplicates,return=minimal')
          .then(function () { return Promise.all(extra.map(function (g) { return restReq('DELETE', q(g), null, S.tok); })); })
          .then(function () { return restReq('PATCH', 'run_teams?event_id=eq.' + encodeURIComponent(evId), { name: '', updated_at: new Date().toISOString() }, S.tok); })
          .then(function () { S.resetAsk = false; S.round = 1; return load(); })
          .then(function () { draw(); toast('Event reset', 'Scores and names are cleared and the draw is rebuilt.'); }, function (e) { S.resetAsk = false; load().then(draw, draw); toast('Could not finish the reset', e.message); });
        return;
      }
      if (b.hasAttribute('data-gen-go')) {
        var gk = b.getAttribute('data-gen-go'), gts = S.teams.filter(function (t) { return (t.green || '') === gk; }).map(function (t) { return t.team_no; }).sort(function (x, y) { return x - y; });
        var gbox = b.closest('[data-gen]'), gri = gbox && gbox.querySelector('[data-gen-rink]'), sr = gri ? parseInt(gri.value, 10) : 1;
        if (!(sr >= 1 && sr <= 29)) { toast('Enter the first rink'); return; }
        var old = S.games.filter(function (g) { return gts.indexOf(g.team_a) >= 0; });
        if (old.some(function (g) { return g.score_a != null || g.score_b != null || g.certified_at; })) { toast('Scores are already entered', 'Remove them first.'); return; }
        var clash = drawBuild(gts, sr).filter(function (n) { return S.games.some(function (g) { return old.indexOf(g) < 0 && g.round === n.round && g.rink === n.rink; }); })[0];
        if (clash) { toast('Rink ' + clash.rink + ' is already used in game ' + clash.round, 'Choose a different first rink.'); return; }
        if (!b.dataset.sure) { b.dataset.sure = '1'; var t0 = b.textContent; b.textContent = 'Tap again to confirm'; setTimeout(function () { b.dataset.sure = ''; b.textContent = t0; }, 4000); return; }
        var made = drawBuild(gts, sr).map(function (g) { return Object.assign({ event_id: evId, updated_by: S.who }, g); });
        b.disabled = true;
        Promise.all(old.map(function (g) { return restReq('DELETE', q(g), null, S.tok); })).then(function () { return restReq('POST', 'run_games', made, S.tok); }).then(function () {
          S.games = S.games.filter(function (g) { return old.indexOf(g) < 0; }).concat(made.map(function (g) { return Object.assign({ score_a: null, score_b: null }, g); })); S.games.sort(function (x, y) { return x.round - y.round || x.rink - y.rink; });
          draw(); toast('Draw created', made.length + ' games for Green ' + gk);
        }, function (e) { b.disabled = false; load().then(draw, draw); toast('Could not create the draw', e.message); });
        return;
      }
      if (b.hasAttribute('data-draw-print')) { window.print(); return; }
      if (b.hasAttribute('data-run-tab')) { switchTab(b.getAttribute('data-run-tab')); return; }
      if (b.hasAttribute('data-run-refresh')) { load().then(function () { if (root === view) { draw(); toast('Refreshed'); } }, function (e) { toast('Could not refresh', e.message); }); return; }
      if (b.hasAttribute('data-cert')) {
        var cd = b.closest('.run__game'), cg = S.games.filter(function (x) { return x.round === +cd.dataset.round && x.rink === +cd.dataset.rink; })[0]; if (!cg) return;
        var pr = gameProblems(cg); if (pr.length) { toast('Cannot certify yet', pr[0]); return; }
        var cp = { certified_at: new Date().toISOString(), certified_by: S.who };
        restReq('PATCH', q(cg), cp, S.tok).then(function () { Object.assign(cg, cp); draw(); toast('Certified'); }, function (e) { toast('Not certified', e.message); });
        return;
      }
      if (b.hasAttribute('data-uncert')) {
        var ud = b.closest('.run__game'), ug = S.games.filter(function (x) { return x.round === +ud.dataset.round && x.rink === +ud.dataset.rink; })[0]; if (!ug) return;
        if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Tap again to reopen'; setTimeout(function () { b.dataset.sure = ''; b.textContent = 'Reopen'; }, 3500); return; }
        var up = { certified_at: null, certified_by: null };
        restReq('PATCH', q(ug), up, S.tok).then(function () { Object.assign(ug, up); draw(); toast('Reopened for changes'); }, function (e) { toast('Could not reopen', e.message); });
        return;
      }
      if (b.hasAttribute('data-round-cert')) {
        var todo = S.games.filter(function (g) { return g.round === S.round && !g.certified_at && g.score_a != null && g.score_b != null && !gameProblems(g).length; });
        var skipped = S.games.filter(function (g) { return g.round === S.round && !g.certified_at && g.score_a != null && g.score_b != null && gameProblems(g).length; }).length;
        if (!todo.length) { toast('Nothing to certify', skipped ? skipped + ' game(s) have problems to fix first' : 'No complete games waiting'); return; }
        var stamp = { certified_at: new Date().toISOString(), certified_by: S.who };
        Promise.all(todo.map(function (g) { return restReq('PATCH', q(g), stamp, S.tok).then(function () { Object.assign(g, stamp); }); })).then(function () { draw(); toast('Certified ' + todo.length + ' game' + (todo.length === 1 ? '' : 's'), skipped ? skipped + ' skipped: fix the problems first' : ''); }, function (e) { draw(); toast('Some were not certified', e.message); });
        return;
      }
      if (b.hasAttribute('data-round')) { S.round = +b.getAttribute('data-round'); draw(); return; }
      if (b.hasAttribute('data-round-add')) { var mx = Math.max.apply(null, S.games.map(function (g) { return g.round; }).concat([0])); S.round = mx + 1; draw(); return; }
      if (b.hasAttribute('data-game-del')) {
        var card = b.closest('.run__game'), g = S.games.filter(function (x) { return x.round === +card.dataset.round && x.rink === +card.dataset.rink; })[0]; if (!g) return;
        if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Tap again to remove'; setTimeout(function () { b.dataset.sure = ''; b.textContent = 'Remove'; }, 3500); return; }
        restReq('DELETE', q(g), null, S.tok).then(function () { S.games = S.games.filter(function (x) { return x !== g; }); draw(); toast('Game removed'); }, function (e) { toast('Could not remove', e.message); });
        return;
      }
      if (b.hasAttribute('data-team-add')) {
        var nx = Math.max.apply(null, S.teams.map(function (t) { return t.team_no; }).concat([0])) + 1, nt = { event_id: evId, team_no: nx, name: '', green: null };
        restReq('POST', 'run_teams', nt, S.tok).then(function () { S.teams.push(nt); draw(); }, function (e) { toast('Could not add', e.message); });
        return;
      }
      if (b.hasAttribute('data-team-del')) {
        var n = +b.getAttribute('data-team-del');
        if (S.games.some(function (g) { return g.team_a === n || g.team_b === n; })) { toast('That team is in a game', 'Change or remove its games first.'); return; }
        if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = '?'; setTimeout(function () { b.dataset.sure = ''; b.textContent = '×'; }, 3000); return; }
        restReq('DELETE', 'run_teams?event_id=eq.' + encodeURIComponent(evId) + '&team_no=eq.' + n, null, S.tok).then(function () { S.teams = S.teams.filter(function (t) { return t.team_no !== n; }); draw(); }, function (e) { toast('Could not remove', e.message); });
      }
    });
    return freshToken().then(function (tok) {
      if (root !== view) return;
      if (!tok) { store('afterSignIn', location.pathname); view.innerHTML = shell('<p>Sign in with your director address to continue.</p><div class="actions"><a class="btn btn--wide" href="/app/signin">Sign in</a></div>'); return; }
      S.tok = tok; S.who = jwtEmail(tok);
      return memberRpc('is_link_admin').then(function (ok) {
        if (root !== view) return;
        if (ok !== true) { view.innerHTML = shell('<p>This page is for tournament directors.</p>'); return; }
        return load().then(function () { if (root === view) draw(); });
      });
    }).catch(function (e) { if (root === view) view.innerHTML = shell('<div class="note" role="alert"><b>Could not open.</b>' + esc(e.message || 'Try again.') + '</div>'); });
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-legal]'); if (!b) return;
    ev.preventDefault(); var k = b.getAttribute('data-legal');
    loadLegal().catch(function () {}).then(function () { openDialog((LEGAL && LEGAL[k] && LEGAL[k].title) || 'Details', legalHtml(k)); });
  });
  // The sign-up buttons need the box ticked. Tapping them without it explains why instead of doing nothing.
  function termsOk() { return !!store('termsAccepted'); }
  function authGate(root) {
    if (termsOk()) return true;
    var lab = root.querySelector('.auth__terms'); if (lab) { lab.classList.remove('is-nudge'); void lab.offsetWidth; lab.classList.add('is-nudge'); var cb = lab.querySelector('input'); if (cb) cb.focus(); }
    toast('Please tick the box to agree to the Terms and Privacy Policy first.');
    return false;
  }
  document.addEventListener('change', function (ev) {
    var cb = ev.target.closest && ev.target.closest('[data-terms]'); if (!cb) return;
    if (cb.checked) store('termsAccepted', new Date().toISOString().slice(0, 10)); else { try { localStorage.removeItem('swd:termsAccepted'); } catch (e) {} }
    var root = cb.closest('.auth'); if (root) root.querySelectorAll('[data-auth="apple"], [data-auth="google"], [data-auth="email"]').forEach(function (b) { b.setAttribute('aria-disabled', cb.checked ? 'false' : 'true'); });
    haptic();
  });

  function welcome() {
    if (store('welcomed')) return;
    if (/^\/app\/(privacy|terms|signin)/.test(location.pathname)) return;   // never cover a page someone opened on purpose
    var SCENES = [
      { k: 'details', h: 'Every tournament detail, one tap away', s: 'Dates, fees, deadlines and flyers for the whole Southwest Division.' },
      { k: 'results', h: 'Results and champions, always at hand', s: 'Podiums, standings and winners from every tournament.' },
      { k: 'follow', h: 'Follow your clubs', s: 'Their events come first. Kept on your phone, no account needed.' },
      { k: 'calendar', h: 'Never miss a tournament day', s: 'A calendar of every event and a countdown to the next one.' }
    ];
    var steps = SCENES.map(function (sc) { return { t: 'scene', sc: sc }; }).concat([{ t: 'fact' }, { t: 'wiz', n: 0 }, { t: 'wiz', n: 1 }, { t: 'wiz', n: 2 }, { t: 'wiz', n: 3 }, { t: 'custom' }, { t: 'auth' }]);
    var i = 0, timer = null, facts = [], goingBack = false, lastNav = 0, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var el = document.createElement('div'); el.className = 'welcome'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Welcome');
    // Facts: two come from our own data (so they are always true), two are well-known
    var HIST = 'The Old Bowling Green in Southampton, England, dates from 1299 and is believed to be the oldest in the world still in use.';
    var WORLD = 'World Bowls, the sport’s world federation, has 67 member countries.';
    facts = [HIST, WORLD];
    Promise.all([getJSON('/clubs-data.json').catch(function () { return {}; }), getJSON('/events-data.json').catch(function () { return {}; })]).then(function (all) {
      var nc = (all[0].clubs || []).length, ne = (all[1].events || []).filter(function (e) { return e.id && !/^paypal-test/.test(e.id); }).length;
      if (nc) facts.unshift('The Southwest Division has ' + nc + ' clubs, from Cambria to Coronado.');
      if (ne) facts.push('There are ' + ne + ' tournaments on the 2026 Southwest calendar.');
    });
    var wizState = { topics: (interests() || {}).topics || [], cats: (interests() || {}).cats || [], name: (store('profile') || {}).name || '', look: look() };
    function wizCollect(step) {
      if (step === 0) wizState.topics = readInterests(el).topics;
      if (step === 1) wizState.cats = readInterests(el).cats;
      if (step === 3) { var nm = el.querySelector('#wz-name'); wizState.name = nm ? nm.value.trim() : ''; wizState.look = readLook(el) || wizState.look; }
    }
    function bars() {
      return '<div class="sc__bars" aria-hidden="true">' + steps.map(function (_, k) { return '<i class="' + (k < i ? 'is-done' : k === i ? 'is-now' : '') + '"' + (k === i && !reduce ? ' style="--dur:5200ms"' : '') + '></i>'; }).join('') + '</div>';
    }
    function mock(k) {
      if (k === 'details') return '<div class="mk mk--details"><div class="mk__card cat--w"><b>Women’s Vet/Novice Pairs</b><span>Long Beach LBC · Sat, Oct 17</span></div>' +
        '<div class="mk__chips"><span class="mk__chip" style="--n:0">' + icon('doc', 'i--sm') + 'Flyer</span><span class="mk__chip" style="--n:1">' + icon('clock', 'i--sm') + '8:15 AM</span><span class="mk__chip" style="--n:2"><b>$</b>Entry fee</span></div>' +
        '<div class="mk__pill" style="--n:3">' + icon('hourglass', 'i--sm') + 'Entries close tomorrow</div></div>';
      if (k === 'results') return '<div class="mk mk--results"><div class="mk__pod"><div class="mk__col mk__col--2" style="--n:1"><i>2</i></div><div class="mk__col mk__col--1" style="--n:0"><i>1</i></div><div class="mk__col mk__col--3" style="--n:2"><i>3</i></div></div>' +
        '<div class="mk__names"><span style="--n:4">Silver</span><span style="--n:3">Gold</span><span style="--n:5">Bronze</span></div></div>';
      if (k === 'follow') return '<div class="mk mk--follow"><div class="mk__club"><span class="mk__ph"></span><b>Coronado</b><span class="mk__star">' + icon('star') + '</span></div>' +
        '<div class="mk__list"><div class="mk__row cat--m" style="--n:0"><b>Men’s Triples</b><small>Coronado · Sat</small></div><div class="mk__row cat--w" style="--n:1"><b>Women’s Pairs</b><small>Coronado · Sun</small></div></div></div>';
      return '<div class="mk mk--cal"><div class="mk__week">' + ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(function (d, n) { return '<span class="' + (n === 5 ? 'is-pick' : '') + '"><small>' + d + '</small><b>' + (12 + n) + '</b>' + (n === 5 ? '<i></i>' : '') + '</span>'; }).join('') + '</div>' +
        '<div class="mk__count"><span class="mk__num"><b>3</b><b>2</b></span><small>days to go</small></div></div>';
    }
    function drawScene(sc) {
      el.className = 'welcome welcome--scene';
      el.setAttribute('data-scene', sc.k);
      el.innerHTML = '<div class="sc__top">' + bars() + '<button class="wiz__skip" type="button" data-w-skip>Skip</button></div><div class="sc__stage" data-w-next-tap>' + mock(sc.k) + '</div>' +
        '<div class="sc__text"><h1 class="sc__h" tabindex="-1">' + esc(sc.h) + '</h1><p class="sc__s">' + esc(sc.s) + '</p></div><div class="wiz__foot"><button class="btn btn--wide btn--dark" type="button" data-w-next>Next</button></div>';
      // No auto-advance: people move on with Next when they are ready (Anne's feedback)
    }
    function drawFact() {
      el.className = 'welcome welcome--scene welcome--fact'; el.setAttribute('data-scene', 'fact');
      var f = facts[Math.floor(Date.now() / 86400000) % facts.length];
      el.innerHTML = '<div class="sc__top">' + bars() + '<button class="wiz__skip" type="button" data-w-skip>Skip</button></div><div class="sc__stage"><div class="fact"><span class="fact__orb" aria-hidden="true">' + icon('bowl') + '</span><b class="fact__k">Did you know?</b><p class="fact__t">' + esc(f) + '</p></div></div>' +
        '<div class="sc__text"><h1 class="sc__h" tabindex="-1">A little lawn bowls</h1><p class="sc__s">Now let’s make the app yours.</p></div><div class="wiz__foot"><button class="btn btn--wide btn--dark" type="button" data-w-next>Continue</button></div>';
    }
    function drawWiz(step) {
      el.className = 'welcome welcome--wiz'; el.removeAttribute('data-scene');
      var top = '<div class="wiz__top"><button class="wiz__back" type="button" data-w-prev aria-label="Back">' + icon('back') + '</button><div class="wiz__bar" role="progressbar" aria-valuemin="0" aria-valuemax="4" aria-valuenow="' + (step + 1) + '" aria-label="Step ' + (step + 1) + ' of 4"><i style="width:' + Math.round((step + 1) / 4 * 100) + '%"></i></div><button class="wiz__skip" type="button" data-w-skip>Skip</button></div>';
      var rows = function (list) { return '<div class="wrows">' + list.join('') + '</div>'; };
      var body;
      if (step === 0) body = '<h1 class="wiz__h" tabindex="-1">What are you here for?</h1><p class="wiz__s">Pick all that apply. We’ll put these first.</p>' + rows(TOPICS.map(function (t) {
        return '<button type="button" class="wrow" data-itopic="' + t[0] + '" aria-pressed="' + (wizState.topics.indexOf(t[0]) >= 0) + '"><span class="wrow__ic" aria-hidden="true">' + icon(t[1]) + '</span><span class="wrow__l">' + esc(t[2]) + '</span><span class="wrow__ck" aria-hidden="true">' + icon('check', 'i--sm') + '</span></button>'; }));
      else if (step === 1) body = '<h1 class="wiz__h" tabindex="-1">Which events?</h1><p class="wiz__s">Choose the ones you follow most.</p>' + rows(CAT_PICKS.map(function (c) {
        return '<button type="button" class="wrow" data-icat="' + esc(c) + '" aria-pressed="' + (wizState.cats.indexOf(c) >= 0) + '"><span class="wrow__ic" aria-hidden="true"><i class="chip__dot ' + CAT_DOT[c] + '"></i></span><span class="wrow__l">' + esc(c) + '</span><span class="wrow__ck" aria-hidden="true">' + icon('check', 'i--sm') + '</span></button>'; }));
      else if (step === 2) body = '<h1 class="wiz__h" tabindex="-1">Text size</h1><p class="wiz__s">Pick what’s comfortable to read. The screen changes as you choose. You can change it later in Settings.</p>' + rows([['standard', 'Standard'], ['large', 'Large'], ['xlarge', 'Larger'], ['xxlarge', 'Extra large']].map(function (z) {
        return '<button type="button" class="wrow" data-wsize="' + z[0] + '" aria-pressed="' + ((store('text') || 'standard') === z[0]) + '"><span class="wrow__l">' + z[1] + '</span><span class="wrow__ck" aria-hidden="true">' + icon('check', 'i--sm') + '</span></button>'; }));
      else body = '<h1 class="wiz__h" tabindex="-1">Design your profile</h1><p class="wiz__s">Make the app yours. You can change it later.</p>' + lookForm(wizState.look, wizState.name) +
        '<label class="mfield" style="margin-top:14px"><span>Your name (optional)</span><input id="wz-name" type="text" autocomplete="name" value="' + esc(wizState.name) + '" placeholder="Your name"></label>';
      el.innerHTML = top + '<div class="wiz__body">' + body + '</div><div class="wiz__foot"><button class="btn btn--wide btn--dark" type="button" data-w-int>Continue</button></div>';
      if (step === 3) { var nm = el.querySelector('#wz-name'), card = el.querySelector('[data-lookcard] .lookcard__n'); nm.addEventListener('input', function () { card.textContent = nm.value.trim() || 'Your name'; }); }
    }
    function drawCustom() {
      el.className = 'welcome welcome--custom'; el.removeAttribute('data-scene');
      var p = look().palette;
      el.innerHTML = '<div class="cust" data-pal="' + p + '"><span class="cust__orb" aria-hidden="true"></span><h1 class="cust__t" tabindex="-1">Customizing your app…</h1><p class="cust__s" aria-live="polite">Putting your interests first</p></div>';
      timer = setTimeout(function () { if (document.body.contains(el)) { i++; draw(); } }, reduce ? 900 : 2200);
    }
    function draw() {
      clearTimeout(timer);
      var st = steps[i]; if (!st) { done(); return; }
      if (st.t === 'scene') drawScene(st.sc);
      else if (st.t === 'fact') drawFact();
      else if (st.t === 'wiz') drawWiz(st.n);
      else if (st.t === 'custom') drawCustom();
      else { el.className = 'welcome welcome--auth'; el.removeAttribute('data-scene'); el.innerHTML = authLanding('/photos/clubs/long-beach.jpg', true); }
      goingBack = false;
    }
    // Modal behaviour: the page behind is inert, focus stays inside, Escape = skip, focus goes back when it closes
    var behind = Array.prototype.slice.call(document.querySelectorAll('#view, .tabbar, .skip'));
    function focusIn() {
      var t = el.querySelector('.sc__h, .wiz__h, .cust__t, .auth__terms input') || el.querySelector('h1') || el.querySelector('button');
      if (t) { if (!t.hasAttribute('tabindex') && !/^(BUTTON|A|INPUT)$/.test(t.tagName)) t.setAttribute('tabindex', '-1'); try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); } }
    }
    function done() {
      clearTimeout(timer); store('welcomed', true); el.remove(); document.removeEventListener('keydown', onKey, true);
      behind.forEach(function (n) { n.removeAttribute('inert'); n.removeAttribute('aria-hidden'); });
      var back = document.getElementById('view'); if (back) back.focus({ preventScroll: true });
    }
    function onKey(ev) {
      if (dlg.open) return;   // the Terms / Privacy sheet has its own focus
      if (ev.key === 'Escape') { ev.preventDefault(); done(); return; }
      if (ev.key !== 'Tab') return;
      var f = Array.prototype.slice.call(el.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(function (n) { return !n.disabled && n.offsetParent !== null; });
      if (!f.length) { ev.preventDefault(); return; }
      var first = f[0], last = f[f.length - 1];
      if (!el.contains(document.activeElement)) { ev.preventDefault(); first.focus(); }
      else if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
    el.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-w-skip]')) { done(); return; }
      var navNow = Date.now(), quick = navNow - lastNav < 350;
      if (ev.target.closest('[data-w-next], [data-w-next-tap]')) { if (quick) return; lastNav = navNow; haptic(); i++; draw(); focusIn(); return; }
      var wsz = ev.target.closest('[data-wsize]');
      if (wsz) { store('text', wsz.getAttribute('data-wsize')); applyTextSize(); el.querySelectorAll('[data-wsize]').forEach(function (b) { b.setAttribute('aria-pressed', b === wsz); }); haptic(); return; }
      if (ev.target.closest('[data-w-prev]')) { if (quick) return; lastNav = navNow; haptic(); var cs = steps[i]; if (cs && cs.t === 'wiz') wizCollect(cs.n); goingBack = true; i = Math.max(0, i - 1); while (i > 0 && (steps[i].t === 'custom' || steps[i].t === 'fact')) i--; draw(); focusIn(); return; }
      if (ev.target.closest('[data-auth="back"]')) { haptic(); goingBack = true; i = steps.length - 3; draw(); focusIn(); return; }
      if (ev.target.closest('[data-w-int]')) {
        if (quick) return; lastNav = navNow;
        haptic(); var cur = steps[i]; wizCollect(cur.n);
        if (cur.n === 3) {   // finished: keep the choices on this phone, nothing is sent anywhere
          if (wizState.topics.length || wizState.cats.length) store('interests', { topics: wizState.topics, cats: wizState.cats, at: Date.now() });
          store('look', wizState.look);
          if (wizState.name) store('profile', Object.assign({}, store('profile') || {}, { name: wizState.name }));
        }
        i++; draw(); focusIn(); return;
      }
      var b = ev.target.closest('[data-auth]'); if (!b) return; var k = b.getAttribute('data-auth'); haptic();
      if (k === 'guest') { done(); return; }
      if (!authGate(el)) return;
      if (k === 'email') { done(); go('/app/signin?step=email'); }
      else toast((k === 'apple' ? 'Continue with Apple' : 'Continue with Google') + ' switches on with the store release.');
    });
    el.addEventListener('pointerdown', function () { clearTimeout(timer); });   // touching the screen pauses the auto-advance
    wireLook(el); document.body.appendChild(el); draw();
    behind.forEach(function (n) { n.setAttribute('inert', ''); n.setAttribute('aria-hidden', 'true'); });
    document.addEventListener('keydown', onKey, true);
    focusIn();
  }

  document.documentElement.setAttribute('data-motion', store('motion') === 'on' ? 'on' : 'system');
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
  if (/[?&]run=1\b/.test(location.search)) store('run', true); else if (/[?&]run=0\b/.test(location.search)) { try { localStorage.removeItem('swd:run'); } catch (e) {} }
  captureSignIn();
  (function () {
    var q = new URLSearchParams(location.search), h = q.get('practice') || q.get('hub');
    if (h !== '1' && h !== '0') return;
    if (h === '1') store('hubPreview', true);
    else { try { Object.keys(localStorage).forEach(function (k) { if (k === 'swd:hubPreview' || k === 'swd:hubEntries' || k.indexOf('swd:hubTd:') === 0) localStorage.removeItem(k); }); } catch (e) {} }
    q.delete('hub'); q.delete('practice'); history.replaceState(history.state, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
  })();
  if (!history.state) history.replaceState({ depth: 0 }, '');
  render();
  setTimeout(welcome, 600);

  // Offline helper (network-first: new versions always win when online)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  }
})();

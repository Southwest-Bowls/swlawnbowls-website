/* ============================================================
   app-logic.js — small pure rules the phone app relies on, kept
   apart from the screens so they can be tested on their own
   (tests/app-logic.test.js, run with `npm test`).

   Loaded by app.html before app.js; available as window.SWDLogic.
   ============================================================ */
(function (root) {
  'use strict';

  var TZ = 'America/Los_Angeles';
  // The public address shared links point to. Every link in this repo
  // uses it (see CLAUDE.md); it is not a temporary preview address.
  var CANONICAL_ORIGIN = 'https://swlawnbowls-website.vercel.app';

  // Offset (ms) of California time from UTC at a given instant.
  function laOffset(ms) {
    var p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms));
    var v = {}; p.forEach(function (x) { v[x.type] = +x.value; });
    return Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second) - Math.floor(ms / 1000) * 1000;
  }
  // The last millisecond of a calendar day in California, as a UTC instant.
  // A date-only deadline means "until the end of that day where we play".
  function endOfDayLA(isoDate) {
    var p = isoDate.split('-');
    var guess = Date.UTC(+p[0], +p[1] - 1, +p[2], 23, 59, 59, 999);
    var t = guess - laOffset(guess);
    return t - (laOffset(t) - laOffset(guess));   // settle across a daylight-saving change
  }
  // When an 'expires' value ends: a date (end of day, California) or an
  // exact ISO time with an offset. Anything else: no expiry (never guess).
  function expiryTime(expires) {
    if (!expires) return null;
    var s = String(expires).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return endOfDayLA(s);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s)) return Date.parse(s);
    return null;
  }
  // Only items marked as notices expire; stories stay current forever.
  function isExpiredNotice(item, nowMs) {
    if (!item || item.kind !== 'notice') return false;
    var t = expiryTime(item.expires);
    return t != null && nowMs > t;
  }

  // A short, stable fingerprint of a piece of text (djb2).
  function hash(s) {
    var h = 5381; s = String(s || '');
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  // An update's version: the event plus what the update says. When the
  // organizer changes the wording, it is a new version and unread again.
  function updateVersion(eventId, label, text) { return eventId + ':' + hash((label || '') + '\n' + (text || '')); }

  function slugify(s) {
    return String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  var CLUB_SUFFIX = /\s+(lawn\s+bowl(?:ing|s)?\s+clubs?|lbc)$/i;
  // Club ids for an event's venue. "Newport Harbor LBC / Laguna Beach LBC"
  // is two clubs. Spellings that differ from the club list are mapped
  // explicitly through clubs-data.json 'aliases', never guessed.
  function clubIdsForVenue(name, aliasMap) {
    if (!name) return [];
    aliasMap = aliasMap || {};
    var whole = String(name).trim().replace(/\s+/g, ' ');
    if (aliasMap[whole.toLowerCase()]) return [aliasMap[whole.toLowerCase()]];
    return whole.split(/\s*\/\s*|\s+&\s+/).filter(Boolean).map(function (part) {
      return aliasMap[part.toLowerCase()] || slugify(part.replace(CLUB_SUFFIX, ''));
    });
  }
  function aliasMapFrom(clubs) {
    var m = {};
    (clubs || []).forEach(function (c) {
      (c.aliases || []).forEach(function (a) { m[String(a).trim().replace(/\s+/g, ' ').toLowerCase()] = c.id; });
    });
    return m;
  }

  // Discovery order: events from followed clubs first (by date), then the
  // rest (by date). Nothing is removed.
  function preferFollowed(list, followed, dateOf) {
    var f = {}; (followed || []).forEach(function (id) { f[id] = 1; });
    var mine = [], rest = [];
    list.forEach(function (x) { ((x.clubIds || []).some(function (id) { return f[id]; }) ? mine : rest).push(x); });
    var by = function (a, b) { var da = dateOf(a) || '9', db = dateOf(b) || '9'; return da < db ? -1 : da > db ? 1 : 0; };
    return mine.sort(by).concat(rest.sort(by));
  }

  // The public link for an app screen: the canonical origin plus the path
  // and only the query parameters that describe content.
  var SHAREABLE_PARAMS = ['tab', 'show', 'q', 'cat', 'club', 'month', 'year'];
  function canonicalUrl(path) {
    var u = new URL(path, CANONICAL_ORIGIN);
    var out = new URL(u.pathname, CANONICAL_ORIGIN);
    SHAREABLE_PARAMS.forEach(function (k) { if (u.searchParams.has(k)) out.searchParams.set(k, u.searchParams.get(k)); });
    return out.toString();
  }

  // A calendar (.ics) file: escape TEXT values, fold lines at 75 octets
  // (UTF-8, never splitting a character), CRLF after every line.
  function icsText(v) {
    return String(v || '').replace(/[\\,;]/g, function (c) { return '\\' + c; }).replace(/\r\n|\r|\n/g, '\\n');
  }
  function icsFold(line) {
    var out = [], cur = '', bytes = 0, limit = 75;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      var cp = line.codePointAt(i);
      if (cp > 0xffff) { ch = line.slice(i, i + 2); i++; }
      var n = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
      if (bytes + n > limit) { out.push(cur); cur = ' '; bytes = 1; limit = 75; }
      cur += ch; bytes += n;
    }
    out.push(cur);
    return out.join('\r\n');
  }
  function icsDocument(lines) { return lines.map(icsFold).join('\r\n') + '\r\n'; }

  // ---- Season standings (the Division's published Google Sheets) --------
  // A published sheet's embed link → the same sheet as CSV (null if not one)
  function standingsCsvUrl(embedUrl) {
    var m = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/([A-Za-z0-9_-]+)\/pubhtml/.exec(embedUrl || '');
    return m ? 'https://docs.google.com/spreadsheets/d/e/' + m[1] + '/pub?output=csv' : null;
  }
  // RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes
  function parseCsv(text) {
    var rows = [], row = [], f = '', q = false, i, c;
    text = String(text || '').replace(/^\uFEFF/, '');
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(f); rows.push(row); row = []; f = '';
      } else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  // Sheet layout: an optional title row, then "Player, Ranking, Total Points,
  // <one column per event>". Names are kept exactly as written; rows without
  // a name are skipped; events where a player scored 0 are left out.
  function standingsFromCsv(text) {
    var rows = parseCsv(text), h = -1, i;
    for (i = 0; i < rows.length; i++) if (/^\s*player\s*$/i.test(rows[i][0] || '')) { h = i; break; }
    if (h < 0) return null;
    var head = rows[h].map(function (x) { return x.trim(); });
    var title = h > 0 ? rows.slice(0, h).map(function (r) { return r.join(' ').trim(); }).filter(Boolean)[0] || '' : '';
    var rk = head.findIndex(function (x) { return /^rank/i.test(x); });
    var tp = head.findIndex(function (x) { return /total/i.test(x); });
    var players = [];
    rows.slice(h + 1).forEach(function (r) {
      var name = (r[0] || '').trim();
      if (!name) return;
      var events = [];
      head.forEach(function (label, j) {
        if (j === 0 || j === rk || j === tp || !label) return;
        var v = parseFloat(r[j]);
        if (v) events.push({ event: label, points: v });
      });
      players.push({ name: name, rank: parseInt(r[rk], 10) || null, points: parseFloat(r[tp]) || 0, events: events });
    });
    players.sort(function (a, b) { return (a.rank || 1e9) - (b.rank || 1e9) || b.points - a.points; });
    var counts = {};
    players.forEach(function (p) { if (p.rank) counts[p.rank] = (counts[p.rank] || 0) + 1; });
    players.forEach(function (p) { p.tied = !!p.rank && counts[p.rank] > 1; });
    return { title: title, events: head.filter(function (x, j) { return j > 0 && j !== rk && j !== tp && x; }), players: players };
  }

  var api = {
    TZ: TZ, CANONICAL_ORIGIN: CANONICAL_ORIGIN,
    endOfDayLA: endOfDayLA, expiryTime: expiryTime, isExpiredNotice: isExpiredNotice,
    updateVersion: updateVersion, clubIdsForVenue: clubIdsForVenue, aliasMapFrom: aliasMapFrom,
    preferFollowed: preferFollowed, canonicalUrl: canonicalUrl, slugify: slugify,
    icsText: icsText, icsFold: icsFold, icsDocument: icsDocument,
    standingsCsvUrl: standingsCsvUrl, parseCsv: parseCsv, standingsFromCsv: standingsFromCsv
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SWDLogic = api;
})(this);

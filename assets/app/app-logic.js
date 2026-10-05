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

  var api = {
    TZ: TZ, CANONICAL_ORIGIN: CANONICAL_ORIGIN,
    endOfDayLA: endOfDayLA, expiryTime: expiryTime, isExpiredNotice: isExpiredNotice,
    updateVersion: updateVersion, clubIdsForVenue: clubIdsForVenue, aliasMapFrom: aliasMapFrom,
    preferFollowed: preferFollowed, canonicalUrl: canonicalUrl, slugify: slugify,
    icsText: icsText, icsFold: icsFold, icsDocument: icsDocument
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SWDLogic = api;
})(this);

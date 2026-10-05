// Focused tests for the phone app's rules (assets/app/app-logic.js).
// Run with: npm test
const test = require('node:test');
const assert = require('node:assert');
const L = require('../assets/app/app-logic.js');
const news = require('../news-data.json');
const clubs = require('../clubs-data.json');
const events = require('../events-data.json');

test('a date-only expiry lasts to the end of that day in California', () => {
  // Sept 12, 2026 is daylight time (UTC-7): end of day = Sept 13 06:59:59.999Z
  assert.strictEqual(new Date(L.endOfDayLA('2026-09-12')).toISOString(), '2026-09-13T06:59:59.999Z');
  // Dec 1, 2026 is standard time (UTC-8)
  assert.strictEqual(new Date(L.endOfDayLA('2026-12-01')).toISOString(), '2026-12-02T07:59:59.999Z');
  // The day daylight time ends (Nov 1, 2026) still ends at local midnight
  assert.strictEqual(new Date(L.endOfDayLA('2026-11-01')).toISOString(), '2026-11-02T07:59:59.999Z');
});

test('a notice expires exactly after its deadline, judged in California time', () => {
  const n = { kind: 'notice', expires: '2026-09-12' };
  // 11:59 PM California on Sept 12 is already Sept 13 in UTC — still current
  assert.strictEqual(L.isExpiredNotice(n, Date.parse('2026-09-13T06:59:00Z')), false);
  assert.strictEqual(L.isExpiredNotice(n, Date.parse('2026-09-13T07:00:00Z')), true);
  const timed = { kind: 'notice', expires: '2026-09-12T10:00:00-07:00' };
  assert.strictEqual(L.isExpiredNotice(timed, Date.parse('2026-09-12T16:59:59Z')), false);
  assert.strictEqual(L.isExpiredNotice(timed, Date.parse('2026-09-12T17:00:01Z')), true);
});

test('stories never expire, and unclear expiry values are ignored', () => {
  assert.strictEqual(L.isExpiredNotice({ kind: 'story', expires: '2020-01-01' }, Date.now()), false);
  assert.strictEqual(L.isExpiredNotice({ date: '2020-01-01', title: 'Old result' }, Date.now()), false);
  assert.strictEqual(L.isExpiredNotice({ kind: 'notice', expires: 'next Saturday' }, Date.now()), false);
});

test('news data: every item has a unique id; the shirt store notice has expired', () => {
  const ids = news.items.map((i) => i.id);
  assert.ok(ids.every(Boolean));
  assert.strictEqual(new Set(ids).size, ids.length);
  const shirt = news.items.find((i) => /Shirt Store/.test(i.title));
  assert.strictEqual(shirt.kind, 'notice');
  assert.strictEqual(L.isExpiredNotice(shirt, Date.parse('2026-10-04T12:00:00-07:00')), true);
  assert.strictEqual(news.items.filter((i) => i.kind === 'notice').length, 1, 'only real notices are marked');
});

test('update versions change when the wording changes, and only then', () => {
  const a = L.updateVersion('ca-bears', 'Change of Venue', 'Moved to Laguna Woods.');
  assert.strictEqual(a, L.updateVersion('ca-bears', 'Change of Venue', 'Moved to Laguna Woods.'));
  assert.notStrictEqual(a, L.updateVersion('ca-bears', 'Change of Venue', 'Moved to Laguna Woods, Gate 12.'));
  assert.notStrictEqual(a, L.updateVersion('other-event', 'Change of Venue', 'Moved to Laguna Woods.'));
});

test('every tournament venue maps to real club ids (explicit aliases, no guessing)', () => {
  const ids = new Set(clubs.clubs.map((c) => c.id));
  const aliases = L.aliasMapFrom(clubs.clubs);
  const venues = new Set(events.events.filter((e) => !/^paypal-test/.test(e.id)).map((e) => (e.club || {}).name).filter(Boolean));
  for (const v of venues) {
    for (const id of L.clubIdsForVenue(v, aliases)) assert.ok(ids.has(id), `${v} → ${id}`);
  }
  assert.deepStrictEqual(L.clubIdsForVenue('Oxnard Lawn Bowls Club', aliases), ['oxnard-joslyn']);
  assert.deepStrictEqual(L.clubIdsForVenue('Newport Harbor LBC / Laguna Beach LBC', aliases), ['newport-harbor', 'laguna-beach']);
});

test('followed clubs come first; nothing else is hidden', () => {
  const list = [
    { id: 'a', clubIds: ['x'], d: '2026-10-20' },
    { id: 'b', clubIds: ['y'], d: '2026-10-10' },
    { id: 'c', clubIds: ['y', 'z'], d: '2026-10-30' },
    { id: 'd', clubIds: ['x'], d: '2026-10-05' }
  ];
  const out = L.preferFollowed(list, ['y'], (x) => x.d).map((x) => x.id);
  assert.deepStrictEqual(out, ['b', 'c', 'd', 'a']);
  assert.deepStrictEqual(L.preferFollowed(list, [], (x) => x.d).map((x) => x.id), ['d', 'b', 'a', 'c']);
});

test('shared links use the public address and drop non-content parameters', () => {
  assert.strictEqual(L.canonicalUrl('/app/events/ca-bears?tab=entry&token=abc'), 'https://swlawnbowls-website.vercel.app/app/events/ca-bears?tab=entry');
  assert.strictEqual(L.canonicalUrl('/app/news/x'), 'https://swlawnbowls-website.vercel.app/app/news/x');
});

test('calendar files: escaped text, lines folded at 75 octets, CRLF throughout', () => {
  assert.strictEqual(L.icsText('a, b; c\\d\r\ne'), 'a\\, b\\; c\\\\d\\ne');
  const long = 'DESCRIPTION:' + 'Entry $120 per team · 9:00 AM start – '.repeat(6);
  const doc = L.icsDocument(['BEGIN:VCALENDAR', long, 'END:VCALENDAR']);
  assert.ok(doc.endsWith('END:VCALENDAR\r\n'));
  for (const physical of doc.split('\r\n')) assert.ok(Buffer.byteLength(physical, 'utf8') <= 75, physical);
  // Unfolding (remove CRLF + one space) gives the original line back
  assert.strictEqual(doc.split('\r\n')[1] + doc.split('\r\n').slice(2, -2).map((l) => l.slice(1)).join(''), long);
  assert.ok(!/\r(?!\n)/.test(doc));
});

test('standings: sheet link becomes its CSV; only real published sheets qualify', () => {
  const page = require('../content/standings.json');
  const urls = page.sections.filter((s) => s.type === 'embed').map((s) => L.standingsCsvUrl(s.url));
  assert.strictEqual(urls.length, 2);
  urls.forEach((u) => assert.match(u, /^https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/[\w-]+\/pub\?output=csv$/));
  assert.strictEqual(L.standingsCsvUrl('https://evil.example/spreadsheets/d/e/x/pubhtml'), null);
});

test('standings: ranks, ties, totals and per-event points read exactly as published', () => {
  const csv = '2026 Test Standings,,,,\r\nPlayer,Ranking,Total Points,"Pairs, Open",Singles\r\n' +
    'B Player,2,20,10,10\r\n"Smith, ""Jo""",1,25,25,0\r\nC Player,2,20,0,20\r\n,,,,\r\n';
  const s = L.standingsFromCsv(csv);
  assert.strictEqual(s.title, '2026 Test Standings');
  assert.deepStrictEqual(s.events, ['Pairs, Open', 'Singles']);
  assert.deepStrictEqual(s.players.map((p) => [p.name, p.rank, p.points, p.tied]),
    [['Smith, "Jo"', 1, 25, false], ['B Player', 2, 20, true], ['C Player', 2, 20, true]]);
  assert.deepStrictEqual(s.players[0].events, [{ event: 'Pairs, Open', points: 25 }], 'zero-point events left out');
  assert.strictEqual(L.standingsFromCsv('no header here'), null);
});

test('about page: board cards and a contact list of the same people become one list', () => {
  const page = require('../content/about-us.json');
  const before = page.sections.length;
  const out = L.mergeRepeatedContacts(page.sections);
  assert.strictEqual(out.length, before - 1, 'the repeated contact section is dropped');
  assert.ok(!out.some((s) => s.type === 'contact'));
  const board = out.find((s) => s.type === 'cards' && s.people);
  assert.ok(board, 'board cards marked as people');
  board.items.forEach((p) => { assert.match(p.email, /@swlawnbowls\.org$/); assert.ok(p.meta && p.body); assert.ok(!p.link, 'email shown once, not also as the row link'); });
  assert.strictEqual(page.sections.find((s) => s.type === 'contact').items.length, 6, 'source data untouched');
  // A contact list with someone not in the cards is kept as it is
  const mixed = [{ type: 'cards', items: [{ title: 'A' }] }, { type: 'contact', items: [{ name: 'A', email: 'a@x' }, { name: 'B', email: 'b@x' }] }];
  assert.strictEqual(L.mergeRepeatedContacts(mixed).length, 2);
});

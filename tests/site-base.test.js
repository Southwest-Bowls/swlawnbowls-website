// Guards the "site base" setting in assets/app/app.js: every request to our own site goes through
// siteUrl(), so the store app (which bundles these screens) can point them at the live website.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const src = fs.readFileSync(require('node:path').join(__dirname, '..', 'assets/app/app.js'), 'utf8');

test('no fetch() of a site-relative path bypasses siteUrl()', () => {
  const bad = src.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /fetch\(\s*['"]\//.test(l));
  assert.deepEqual(bad, [], 'fetch of "/..." must be wrapped in siteUrl(): lines ' + bad.map((b) => b[0]).join(', '));
});

test('sign-in return address and calendar links use the site origin, not location.origin', () => {
  const uses = src.split('\n').filter((l) => /location\.origin/.test(l));
  // only the definition of SITE_ORIGIN and the isExternal() check may mention it
  assert.equal(uses.length, 2, 'unexpected location.origin uses: ' + uses.join(' | ').slice(0, 300));
});

test('the setting is empty by default (the website behaves exactly as before)', () => {
  assert.match(src, /var SITE = String\(window\.SWD_SITE_BASE \|\| ''\)/);
});

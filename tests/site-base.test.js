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

test('store app: no service worker, and the address-fixing code only runs when the site base is set', () => {
  assert.match(src, /'serviceWorker' in navigator && !SITE/);
  assert.match(src, /if \(SITE\) \{\s*\n\s*var BUNDLED/);
});

test('CORS: the data files and live-scoring endpoint can be read by the store app', () => {
  const v = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '..', 'vercel.json'), 'utf8'));
  const has = (source) => (v.headers.find((h) => h.source === source) || { headers: [] }).headers.some((h) => h.key === 'Access-Control-Allow-Origin' && h.value === '*');
  assert.ok(has('/(.*)\\.json'));
  assert.ok(has('/api/live-scoring'));
});

test('store app: last good copy of each data file is kept and used only when the connection fails', () => {
  assert.match(src, /function saveCopy\(url, d\)/);
  assert.match(src, /\^HTTP \/\.test\(err\.message\)/);
});

test('store app: iframes (flyer PDFs) are re-pointed, and "Clear offline copies" also removes the saved data copies', () => {
  assert.match(src, /iframe\[src\]/);
  assert.match(src, /t === 'IFRAME'/);
  assert.match(src, /function clearCopies\(\)/);
  assert.match(src, /clearCopies\(\); toast\('Offline copies cleared'\)/);
});

test('alerts: the settings section only shows in the store app for signed-in members, and uses the two device functions', () => {
  assert.match(src, /function pushSection\(\) \{\s*\n\s*if \(!pushPlugin\(\) \|\| !memberSession\(\)\) return '';/);
  assert.match(src, /memberRpc\('register_device'/);
  assert.match(src, /memberRpc\('unregister_device'/);
});

test('alerts: turning off keeps the token until the server confirms; sign out removes the phone first', () => {
  assert.match(src, /function pushTurnOff\(\)[\s\S]*?memberRpc\('unregister_device'[\s\S]*?\.then\(function \(\) \{\s*\n\s*store\('pushToken', null\)/);
  assert.match(src, /function signOut\(\) \{[\s\S]*?unregister_device[\s\S]*?finishSignOut/);
});

test('reviewer sign-in: a password screen exists only behind ?review=1 and uses the password grant', () => {
  assert.match(src, /params\.get\('review'\) === '1'/);
  assert.match(src, /\/auth\/v1\/token\?grant_type=password/);
  assert.match(src, /href="\/app\/signin\?review=1"/);
});

test('alerts: saved events are sent to the server when they change, and a slow token refresh cannot undo a sign-out', () => {
  assert.match(src, /function syncDeviceEvents\(onlyIfPending\)/);
  assert.match(src, /store\('saved', s\);\s*\n\s*syncDeviceEvents\(\);/);
  assert.match(src, /store\('pushToken', t\.value\); syncDeviceEvents\(\);/);
  assert.match(src, /if \(ep !== sessionEpoch\) return null;/);
  assert.match(src, /function finishSignOut\(\) \{\s*\n\s*sessionEpoch\+\+;/);
});

test('a failed alert-subscription update is remembered and retried', () => {
  assert.match(src, /store\('pushSyncPending', true\)/);
  assert.match(src, /window\.addEventListener\('online', function \(\) \{\s*\n\s*syncDeviceEvents\(true\);/);
  assert.match(src, /syncDeviceEvents\(true\);\s*\n\s*render\(\);\s*\n\s*setTimeout\(welcome/);
});

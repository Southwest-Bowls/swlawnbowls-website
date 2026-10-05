// Checks "My membership" against the live Supabase project using the
// made-up TEST accounts only (supabase/test-members.sql). Sign-in codes are
// generated with the admin key, so no email is ever sent.
// Keys come from member-platform/.data/supabase.env (git-ignored).
// Run: node member-platform/scripts/live-check.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '..', '.data', 'supabase.env'), 'utf8')
  .split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const URL_ = env.SUPABASE_URL, PUB = env.SUPABASE_PUBLISHABLE_KEY, SECRET = env.SUPABASE_SECRET_KEY;

async function call(method, p, body, headers) {
  const r = await fetch(URL_ + p, { method, headers: Object.assign({ apikey: PUB, 'content-type': 'application/json' }, headers), body: body && JSON.stringify(body) });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch (e) { json = text; }
  return { status: r.status, json };
}
const admin = { apikey: SECRET };   // new-style secret keys go in apikey only

async function ensureUser(email) {
  const r = await call('POST', '/auth/v1/admin/users', { email, email_confirm: true }, admin);
  if (r.status !== 200 && !/already/i.test(JSON.stringify(r.json))) throw new Error('create user ' + r.status + ' ' + JSON.stringify(r.json));
}
async function signIn(email) {
  const g = await call('POST', '/auth/v1/admin/generate_link', { type: 'magiclink', email }, admin);
  assert.strictEqual(g.status, 200, 'generate_link ' + JSON.stringify(g.json));
  const v = await call('POST', '/auth/v1/verify', { type: 'magiclink', token_hash: g.json.hashed_token || g.json.properties.hashed_token });
  assert.strictEqual(v.status, 200, 'verify ' + JSON.stringify(v.json));
  return { authorization: 'Bearer ' + v.json.access_token };
}
const rpc = (fn, args, who) => call('POST', '/rest/v1/rpc/' + fn, args || {}, who);

(async () => {
  const results = [];
  const ok = (name) => results.push('PASS ' + name);

  // 1. Nobody signed in: cannot read anything, cannot reach private tables
  let r = await rpc('my_membership', {}, {});
  assert.ok(r.status === 401 || r.status === 403 || r.status === 404, 'anon my_membership ' + r.status);
  r = await call('GET', '/rest/v1/members?select=*', null, {});
  assert.ok(r.status >= 400, 'anon members table ' + r.status);
  ok('signed-out visitors get nothing; private tables are not on the API');

  // 2. Public sign-up is off
  r = await call('POST', '/auth/v1/signup', { email: 'test.stranger@example.com', password: 'Not-a-real-pass-123' });
  assert.ok(r.status >= 400 && /signup_disabled/.test(JSON.stringify(r.json)), 'password signup should be refused, got ' + r.status + ' ' + JSON.stringify(r.json));
  r = await call('POST', '/auth/v1/otp', { email: 'test.stranger@example.com', create_user: true });
  assert.ok(r.status >= 400 && /signup_disabled/.test(JSON.stringify(r.json)), 'email-link signup should be refused, got ' + r.status + ' ' + JSON.stringify(r.json));
  r = await call('POST', '/auth/v1/otp', { email: 'test.stranger@example.com', create_user: false });
  assert.ok(r.status >= 400, 'unknown email must not get a sign-in email, got ' + r.status);
  const list = await fetch(URL_ + '/auth/v1/admin/users?per_page=1000', { headers: admin }).then((x) => x.json());
  assert.ok(!(list.users || []).some((u) => u.email === 'test.stranger@example.com'), 'stranger account must not exist');
  ok('new sign-ups are refused (password and email-link), unknown emails get no email, no account created');

  for (const e of ['test.solo@example.com', 'test.household@example.com', 'test.nobody@example.com', 'test.notallowed@example.com']) await ensureUser(e);

  // 3. Signed in but not on the allow-list: "not open yet"
  r = await rpc('my_membership', {}, await signIn('test.notallowed@example.com'));
  assert.deepStrictEqual(r.json, { state: 'not_open' });
  ok('a signed-in account not on the test list sees "not open yet"');

  // 4. Email not on the roster
  r = await rpc('my_membership', {}, await signIn('test.nobody@example.com'));
  assert.strictEqual(r.json.state, 'not_found');
  ok('an email not on the roster is told so (no guessing)');

  // 5. One member with this email: choose → linked straight away
  const solo = await signIn('test.solo@example.com');
  r = await rpc('my_membership', {}, solo);
  if (r.json.state === 'choose') {
    assert.strictEqual(r.json.candidates.length, 1);
    assert.strictEqual(r.json.shared, false);
    r = await rpc('claim_member', { p_member: r.json.candidates[0].id }, solo);
  }
  assert.strictEqual(r.json.state, 'linked');
  const m = r.json.member;
  assert.strictEqual(m.name, 'Tess Example');
  assert.strictEqual(m.club.id, 'laguna-woods');
  assert.strictEqual(m.swDuesPaid, true);
  assert.strictEqual(m.usaDuesPaid, true);
  assert.strictEqual(m.begnovMonth, '2025-03-01');
  assert.strictEqual(m.noviceUntil, '2027-02-28');
  ok('one-member email links on "This is me" and shows club, dues and novice date');

  // 6. Suggest a fix: stored for review, not applied
  r = await rpc('request_contact_change', { p_kind: 'phone', p_value: 'not a phone' }, solo);
  assert.ok(r.status >= 400, 'bad phone accepted');
  r = await rpc('request_contact_change', { p_kind: 'phone', p_value: '(555) 010-0002' }, solo);
  assert.strictEqual(r.json.state, 'linked');
  assert.ok(r.json.member.pendingChanges.some((c) => c.value === '(555) 010-0002'));
  assert.strictEqual(r.json.member.phone, '(555) 010-0001', 'roster phone must not change');
  ok('a suggested phone waits for review; the roster value is unchanged');

  // 7. Shared household email: shows both, and claiming waits for approval
  const hh = await signIn('test.household@example.com');
  r = await rpc('my_membership', {}, hh);
  if (r.json.state === 'choose') {
    assert.strictEqual(r.json.shared, true);
    assert.deepStrictEqual(r.json.candidates.map((c) => c.name).sort(), ['Alex Sample', 'Sam Sample']);
    assert.ok(!('email' in r.json.candidates[0]) && !('phone' in r.json.candidates[0]), 'no contact details in the list');
    r = await rpc('claim_member', { p_member: r.json.candidates[0].id }, hh);
  }
  assert.strictEqual(r.json.state, 'pending');
  ok('a shared household email never links automatically; it waits for approval');

  // 8. Cannot claim someone else's record
  r = await rpc('claim_member', { p_member: m.id }, await signIn('test.nobody@example.com'));
  assert.ok(r.status >= 400, 'claimed another person: ' + r.status);
  ok('nobody can claim a record that is not under their email');

  console.log(results.join('\n'));
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });

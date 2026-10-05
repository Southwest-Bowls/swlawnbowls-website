// Import and database rules, tested on a small MADE-UP roster (no real
// member data ever appears in tests). Run: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDb } = require('../src/db');
const { importRoster } = require('../src/import-roster');

const { fixture } = require('./fixture');
const count = async (db, t) => (await db.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;

test('stages every row exactly as received, with provenance; creates no members, accounts or merges', async () => {
  const db = await openDb(':memory:');
  const s = await importRoster(db, { dir: fixture(), operator: 'tester' });
  assert.strictEqual(s.result, 'staged');
  assert.strictEqual(await count(db, 'staged_member_rows'), 6);
  const r3 = (await db.query(`SELECT raw, source_sheet FROM staged_member_rows WHERE source_row = 3`)).rows[0];
  assert.strictEqual(r3.raw['dues sw man'], '', 'blank dues stays blank (not "unpaid")');
  assert.strictEqual(r3.raw['dues sw woman'], 'X', 'raw marker kept as-is');
  assert.strictEqual(r3.source_sheet, '2026 ROSTER');
  const r5 = (await db.query(`SELECT raw FROM staged_member_rows WHERE source_row = 5`)).rows[0];
  assert.strictEqual(r5.raw.email, ' HOME@example.test ', 'original value kept, not normalized');
  for (const t of ['members', 'member_contacts', 'member_source_links', 'account_member_links', 'membership_records']) {
    assert.strictEqual(await count(db, t), 0, t + ' must stay empty until approval');
  }
});

test('repeated names and shared emails stay separate rows and become review items', async () => {
  const db = await openDb(':memory:');
  await importRoster(db, { dir: fixture(), operator: 'tester' });
  const items = (await db.query(`SELECT kind, group_key, (SELECT count(*)::int FROM review_issue_rows x WHERE x.issue_id = i.id) AS n FROM review_issues i ORDER BY kind, group_key`)).rows;
  assert.deepStrictEqual(items.find((i) => i.kind === 'repeated_name'), { kind: 'repeated_name', group_key: 'repeated_name_1', n: 2 });
  assert.deepStrictEqual(items.find((i) => i.kind === 'shared_email'), { kind: 'shared_email', group_key: 'shared_email_1', n: 2 });
  assert.ok(items.find((i) => i.kind === 'multiple_or_ambiguous_club_codes' && i.group_key === 'row 6 (club2)'));
  assert.strictEqual((await db.query(`SELECT count(*)::int AS n FROM staged_member_rows WHERE source_row IN (2,3)`)).rows[0].n, 2);
});

test('dry run writes nothing; re-importing the same files changes nothing', async () => {
  const db = await openDb(':memory:');
  const dir = fixture();
  const d = await importRoster(db, { dir, dryRun: true, operator: 'tester' });
  assert.match(d.result, /dry run/);
  assert.strictEqual(await count(db, 'import_batches'), 0);
  await importRoster(db, { dir, operator: 'tester' });
  const again = await importRoster(db, { dir, operator: 'tester' });
  assert.match(again.result, /already staged/);
  assert.strictEqual(await count(db, 'import_batches'), 1);
  assert.strictEqual(await count(db, 'staged_member_rows'), 6);
});

test('a file that disagrees with its audit is rejected; nothing is staged', async () => {
  const db = await openDb(':memory:');
  const s = await importRoster(db, { dir: fixture({ count: 999 }), operator: 'tester' });
  assert.match(s.result, /rejected/);
  assert.strictEqual(await count(db, 'staged_member_rows'), 0);
});

test('a failure part-way through rolls the whole import back', async () => {
  const db = await openDb(':memory:');
  const dir = fixture();
  // A review item pointing at a row that is not in the file makes the insert fail mid-transaction
  fs.appendFileSync(path.join(dir, 'review-issues.csv'), '99,missing_email,,Retain\n');
  await assert.rejects(importRoster(db, { dir, operator: 'tester' }));
  for (const t of ['import_batches', 'staged_member_rows', 'review_issues', 'club_crosswalk', 'audit_events']) assert.strictEqual(await count(db, t), 0, t);
});

test('staged source values cannot be edited; decisions and audit events are append-only', async () => {
  const db = await openDb(':memory:');
  await importRoster(db, { dir: fixture(), operator: 'tester' });
  await assert.rejects(db.query(`UPDATE staged_member_rows SET raw = '{}'::jsonb WHERE source_row = 2`), /immutable/);
  await db.query(`UPDATE staged_member_rows SET review_status = 'kept_separate' WHERE source_row = 2`);   // status may change
  const issue = (await db.query(`SELECT id FROM review_issues WHERE kind = 'repeated_name'`)).rows[0].id;
  await assert.rejects(db.query(`INSERT INTO review_decisions (issue_id, decision, reason, decided_by) VALUES ($1,'keep_separate','','t')`, [issue]), /check/i);
  const d = await db.query(`INSERT INTO review_decisions (issue_id, decision, reason, decided_by) VALUES ($1,'keep_separate','Different people','t') RETURNING id`, [issue]);
  await assert.rejects(db.query(`UPDATE review_decisions SET reason = 'x' WHERE id = $1`, [d.rows[0].id]), /append-only/);
  await assert.rejects(db.query(`DELETE FROM review_decisions WHERE id = $1`, [d.rows[0].id]), /append-only/);
  await assert.rejects(db.query(`DELETE FROM audit_events`), /append-only/);
});

test('a club mapping cannot be approved without a club, a reviewer and a reason', async () => {
  const db = await openDb(':memory:');
  await importRoster(db, { dir: fixture(), operator: 'tester' });
  await db.query(`INSERT INTO clubs (id, name) VALUES ('testville', 'Testville') ON CONFLICT DO NOTHING`);
  const id = (await db.query(`SELECT id FROM club_crosswalk WHERE home_club_raw = 'Testville'`)).rows[0].id;
  await assert.rejects(db.query(`UPDATE club_crosswalk SET status = 'approved' WHERE id = $1`, [id]), /check/i);
  await db.query(`UPDATE club_crosswalk SET status = 'approved', approved_club_id = 'testville', decided_by = 't', reason = 'Same club' WHERE id = $1`, [id]);
});

test('only one program can open a database folder; a backup is made before opening', async () => {
  const { DbBusyError } = require('../src/db');
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'swd-db-')), 'local-db');
  const a = await openDb(dir);
  await assert.rejects(openDb(dir), (e) => e instanceof DbBusyError);
  await a.close();
  const b = await openDb(dir);   // after a clean close it opens again…
  await b.close();
  const backups = fs.readdirSync(path.join(path.dirname(dir), 'backups'));
  assert.ok(backups.length >= 1, '…and the second open made a backup first');
  assert.ok(!fs.existsSync(dir + '.lock'), 'lock released on close');
});

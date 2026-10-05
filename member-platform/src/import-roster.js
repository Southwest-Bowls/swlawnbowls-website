// import-roster.js — stage a roster snapshot into restricted tables.
//
//   node src/import-roster.js --dry-run     report only, write nothing
//   node src/import-roster.js               stage (idempotent: same files → no change)
//
// Options: --dir <handoff folder>  (default ~/Downloads/Southwest-Member-Platform)
//          --source <original .xlsx> (verifies the audited fingerprint)
//          --operator <name>        (who ran it; default $SWD_OPERATOR or "GG")
//          --db <dir|:memory:>
//
// It never creates members, accounts or invitations and never merges rows.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const R = require('./roster');
const { openDb } = require('./db');

const EXPECTED_COLUMNS = ['source_sheet', 'source_row', 'sexcalc m', 'sexcalc w', 'dues sw man', 'dues sw woman',
  'dues us man', 'dues us woman', 'Novices', 'name_Last', 'name_First', 'add_St', 'unit', 'city', 'add_state',
  'add_zip', 'Area-code-Phone-#', 'sex', 'Home Club', 'email', 'begnov', 'club1', 'club2', 'club3'];

function loadInputs(dir, sourcePath) {
  const f = (n) => path.join(dir, n);
  const stagingBuf = fs.readFileSync(f('roster-staging.csv'));
  const roster = R.parseCsv(stagingBuf.toString('utf8'));
  const issues = R.readCsv(f('review-issues.csv')).records;
  const clubMap = R.readCsv(f('club-mapping-review.csv')).records;
  const audit = JSON.parse(fs.readFileSync(f('audit-summary.json'), 'utf8'));
  let sourceCheck = null;
  if (sourcePath && fs.existsSync(sourcePath)) {
    const got = R.sha256(fs.readFileSync(sourcePath));
    sourceCheck = { file: path.basename(sourcePath), matches: got === audit.source_sha256 };
  }
  return { roster, stagingSha: R.sha256(stagingBuf), issues, clubMap, audit, sourceCheck };
}

function validate(inp) {
  const problems = [];
  const { header, records } = inp.roster;
  const missing = EXPECTED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) problems.push('missing columns: ' + missing.join(', '));
  if (records.length !== inp.audit.source_records) problems.push(`row count ${records.length} ≠ audit ${inp.audit.source_records}`);
  const rows = records.map((r) => +r.source_row);
  if (new Set(rows).size !== rows.length) problems.push('duplicate source_row values');
  if (rows.some((n) => !Number.isInteger(n) || n < 2)) problems.push('invalid source_row values');
  if (inp.sourceCheck && !inp.sourceCheck.matches) problems.push('original Excel fingerprint does not match the audit');
  return problems;
}

// Turn review-issues.csv into review items: grouped issues share a group;
// per-row issues (blank group, or a column name) are one item per row.
function issueItems(issues) {
  const items = new Map();
  for (const r of issues) {
    const grouped = /^(repeated_name|shared_email)_\d+$/.test(r.group);
    const key = grouped ? r.group : `row ${r.source_row}` + (r.group ? ` (${r.group})` : '');
    const id = r.issue + '|' + key;
    if (!items.has(id)) items.set(id, { kind: r.issue, key, rows: [] });
    items.get(id).rows.push(+r.source_row);
  }
  return [...items.values()];
}

function summarize(inp, items, clubsList) {
  const rc = R.recheck(inp.roster.records);
  const byKind = {};
  items.forEach((i) => { byKind[i.kind] = byKind[i.kind] || { items: 0, rows: 0 }; byKind[i.kind].items++; byKind[i.kind].rows += i.rows.length; });
  const sameGroups = (a, b) => JSON.stringify(a.map((g) => g.join('/')).sort()) === JSON.stringify(b.map((g) => g.join('/')).sort());
  const auditNames = inp.audit.name_groups.map((g) => g.slice().sort((x, y) => x - y));
  const auditEmails = inp.audit.shared_email_groups.map((g) => g.slice().sort((x, y) => x - y));
  const aliases = {};
  clubsList.forEach((c) => (c.aliases || []).forEach((a) => { aliases[R.fold(a).replace(/\s+lawn bowl.*$/, '')] = c.id; }));
  // Which label each club code mostly appears with — a code used with a
  // different club's label is flagged, never silently resolved.
  const codeLabel = {};
  inp.clubMap.forEach((m) => {
    const base = R.suggestClub(m.home_club_raw, clubsList, aliases).base;
    const c = codeLabel[m.club1_raw] = codeLabel[m.club1_raw] || {};
    c[base] = (c[base] || 0) + (+m.record_count);
  });
  const dominant = (code) => Object.entries(codeLabel[code] || {}).sort((x, y) => y[1] - x[1])[0][0];
  const crosswalk = inp.clubMap.map((m) => {
    const s = R.suggestClub(m.home_club_raw, clubsList, aliases);
    const usual = dominant(m.club1_raw);
    return { ...m, suggested: s.clubId, suffix: s.suffix, codeConflict: usual !== s.base ? usual : null };
  });
  return {
    file: { rows: inp.roster.records.length, columns: inp.roster.header.length - 2, stagingSha256: inp.stagingSha, sourceCheck: inp.sourceCheck },
    issues: byKind,
    crossCheck: {
      repeatedNameGroups: { audit: auditNames.length, recheck: rc.repeatedName.length, same: sameGroups(auditNames, rc.repeatedName) },
      sharedEmailGroups: { audit: auditEmails.length, recheck: rc.sharedEmail.length, same: sameGroups(auditEmails, rc.sharedEmail) },
      missingEmail: { audit: inp.audit.missing_email, recheck: rc.missingEmail.length },
      emailSyntax: { audit: inp.audit.issue_counts.email_syntax_review, recheck: rc.emailSyntax.length },
      begnovFormat: { audit: inp.audit.issue_counts.begnov_format_review, recheck: rc.begnov.length }
    },
    clubs: {
      combinations: crosswalk.length,
      withSuggestion: crosswalk.filter((c) => c.suggested).length,
      noWebsiteClub: crosswalk.filter((c) => !c.suggested).map((c) => c.home_club_raw),
      divisionSuffix: crosswalk.filter((c) => c.suffix).length,
      labelCodeConflicts: crosswalk.filter((c) => c.codeConflict).map((c) => `${c.home_club_raw} + ${c.club1_raw} (${c.club1_raw} is usually ${c.codeConflict})`)
    },
    crosswalk,
    created: { members: 0, accounts: 0, invitations: 0, merges: 0 }
  };
}

async function importRoster(db, opts) {
  const inp = loadInputs(opts.dir, opts.source);
  const problems = validate(inp);
  const clubsList = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'clubs-data.json'), 'utf8')).clubs;
  const items = issueItems(inp.issues);
  const summary = summarize(inp, items, clubsList);
  summary.problems = problems;
  if (problems.length) { summary.result = 'rejected — nothing staged'; return summary; }

  const existing = await db.query('SELECT id, created_at FROM import_batches WHERE source_sha256 = $1 AND staging_file_sha256 = $2',
    [inp.audit.source_sha256, inp.stagingSha]);
  if (existing.rows.length) { summary.result = 'already staged — no changes (batch ' + existing.rows[0].id + ')'; summary.batchId = existing.rows[0].id; return summary; }
  if (opts.dryRun) { summary.result = 'dry run — nothing written'; return summary; }

  const operator = opts.operator || 'GG';
  await db.transaction(async (tx) => {
    for (const c of clubsList) await tx.query('INSERT INTO clubs (id, name, city) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING', [c.id, c.name, c.city || null]);
    const snap = /(\d{2})(\d{2})(\d{2})\.xlsx$/.exec(opts.sourceName || '');
    const b = await tx.query(`INSERT INTO import_batches (source_file, source_sha256, source_sheet, snapshot_date, staging_file_sha256, row_count, created_by, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [opts.sourceName || '2026 SWD Alpha list of membership 072726.xlsx', inp.audit.source_sha256, inp.audit.sheet,
       snap ? `20${snap[3]}-${snap[1]}-${snap[2]}` : null, inp.stagingSha, inp.roster.records.length, operator,
       'Dated snapshot; not a live eligibility register.']);
    const batchId = b.rows[0].id;
    const rowIds = new Map();
    const flagsByRow = new Map();
    items.forEach((i) => i.rows.forEach((r) => (flagsByRow.get(r) || flagsByRow.set(r, []).get(r)).push(i.kind)));
    for (const rec of inp.roster.records) {
      const r = await tx.query(`INSERT INTO staged_member_rows (batch_id, source_sheet, source_row, row_checksum, raw, validation_flags)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [batchId, rec.source_sheet, +rec.source_row, R.rowChecksum(inp.roster.header, rec), R.rawValues(inp.roster.header, rec), [...new Set(flagsByRow.get(+rec.source_row) || [])]]);
      rowIds.set(+rec.source_row, r.rows[0].id);
    }
    for (const i of items) {
      const iss = await tx.query('INSERT INTO review_issues (batch_id, kind, group_key) VALUES ($1,$2,$3) RETURNING id', [batchId, i.kind, i.key]);
      for (const row of [...new Set(i.rows)]) await tx.query('INSERT INTO review_issue_rows (issue_id, staged_row_id) VALUES ($1,$2)', [iss.rows[0].id, rowIds.get(row)]);
    }
    for (const c of summary.crosswalk) {
      await tx.query(`INSERT INTO club_crosswalk (batch_id, home_club_raw, club1_raw, record_count, suggested_club_id, code_conflict) VALUES ($1,$2,$3,$4,$5,$6)`,
        [batchId, c.home_club_raw, c.club1_raw, +c.record_count, c.suggested, c.codeConflict]);
    }
    await tx.query(`INSERT INTO audit_events (actor, action, entity, entity_id, summary) VALUES ($1,'roster.staged','import_batches',$2,$3)`,
      [operator, batchId, { rows: inp.roster.records.length, reviewItems: items.length, clubCombinations: summary.crosswalk.length }]);
    summary.batchId = batchId;
  });
  summary.result = 'staged';
  return summary;
}

function printSummary(s) {
  const n = (x) => String(x).padStart(5);
  console.log('\nRoster import — ' + s.result);
  if (s.problems && s.problems.length) console.log('PROBLEMS:\n  ' + s.problems.join('\n  '));
  console.log(`\nSource rows staged as received: ${s.file.rows} (${s.file.columns} source columns + sheet/row provenance)`);
  if (s.file.sourceCheck) console.log(`Original Excel fingerprint matches the audit: ${s.file.sourceCheck.matches ? 'yes' : 'NO'}`);
  console.log('\nReview queue (nothing merged; each needs a recorded decision):');
  Object.entries(s.issues).forEach(([k, v]) => console.log(`  ${k.padEnd(34)} ${n(v.items)} item${v.items === 1 ? ' ' : 's'} · ${n(v.rows)} rows`));
  console.log('\nIndependent re-check of the audit:');
  Object.entries(s.crossCheck).forEach(([k, v]) => console.log(`  ${k.padEnd(20)} audit ${n(v.audit)} · recheck ${n(v.recheck)}${v.same === undefined ? '' : v.same ? ' · same groups' : ' · GROUPS DIFFER'}`));
  console.log(`\nClub crosswalk: ${s.clubs.combinations} label/code combinations to approve · ${s.clubs.withSuggestion} with a suggestion · ${s.clubs.divisionSuffix} with a division suffix`);
  if (s.clubs.noWebsiteClub.length) console.log('  No matching website club: ' + [...new Set(s.clubs.noWebsiteClub)].join(', '));
  if (s.clubs.labelCodeConflicts.length) console.log('  Label and code disagree:\n    ' + s.clubs.labelCodeConflicts.join('\n    '));
  console.log(`\nCreated: members ${s.created.members} · accounts ${s.created.accounts} · invitations ${s.created.invitations} · merges ${s.created.merges}\n`);
}

if (require.main === module) {
  const a = process.argv.slice(2);
  const arg = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const dir = arg('--dir', path.join(os.homedir(), 'Downloads', 'Southwest-Member-Platform'));
  const source = arg('--source', path.join(os.homedir(), 'Downloads', '2026 SWD Alpha list of membership 072726.xlsx'));
  (async () => {
    const db = await openDb(arg('--db'));
    const s = await importRoster(db, { dir, source, sourceName: path.basename(source), dryRun: a.includes('--dry-run'), operator: arg('--operator', process.env.SWD_OPERATOR || 'GG') });
    printSummary(s);
    await db.close();
    process.exitCode = s.problems && s.problems.length ? 1 : 0;
  })().catch((e) => { console.error('Import failed — nothing was staged (transaction rolled back):', e.message); process.exitCode = 1; });
}

module.exports = { importRoster, issueItems, validate, loadInputs, summarize };

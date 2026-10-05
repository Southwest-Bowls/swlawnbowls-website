// A small MADE-UP roster for tests and the demo database. No real member data.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const HEADER = ['source_sheet', 'source_row', 'sexcalc m', 'sexcalc w', 'dues sw man', 'dues sw woman', 'dues us man', 'dues us woman',
  'Novices', 'name_Last', 'name_First', 'add_St', 'unit', 'city', 'add_state', 'add_zip', 'Area-code-Phone-#', 'sex', 'Home Club',
  'email', 'begnov', 'club1', 'club2', 'club3'];
// rows 2..7: two people share a name (2,3); a household shares an inbox (4,5); a blank email (6); odd begnov (7)
const PEOPLE = [
  [2, 'Doe', 'Alex', 'x', '', 'a1@example.test', '2025/03', 'Testville', 'TSTV', ''],
  [3, 'Doe', 'Alex', '', 'X', 'a2@example.test', '', 'Testville', 'TSTV', 'OTHR'],
  [4, 'Roe', 'Sam', 'x', '', 'home@example.test', '', 'Otherton (SCD)', 'OTHR', ''],
  [5, 'Roe', 'Kim', '', 'x', ' HOME@example.test ', 'N', 'Otherton', 'OTHR', ''],
  [6, 'Poe', 'Lee', 'x', '', '', '', 'Testville', 'TSTV', 'tstv othr'],
  [7, 'Moe', 'Pat', 'X', '', 'pat@example.test', '25-Mar', 'Testville', 'TSTV', '']
];
const csvCell = (v) => /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;

function fixture(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swd-roster-'));
  const rows = (overrides.people || PEOPLE).map((p) => {
    const r = Object.fromEntries(HEADER.map((h) => [h, '']));
    Object.assign(r, { source_sheet: '2026 ROSTER', source_row: String(p[0]), name_Last: p[1], name_First: p[2],
      'dues sw man': p[3], 'dues sw woman': p[4], email: p[5], begnov: p[6], 'Home Club': p[7], club1: p[8], club2: p[9] });
    return HEADER.map((h) => csvCell(r[h])).join(',');
  });
  fs.writeFileSync(path.join(dir, 'roster-staging.csv'), [HEADER.join(','), ...rows].join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'review-issues.csv'), ['source_row,issue,group,action',
    '2,repeated_name,repeated_name_1,Review', '3,repeated_name,repeated_name_1,Review',
    '4,shared_email,shared_email_1,Review', '5,shared_email,shared_email_1,Review',
    '6,missing_email,,Retain', '7,begnov_format_review,,Preserve', '6,multiple_or_ambiguous_club_codes,club2,Review'].join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'club-mapping-review.csv'), 'home_club_raw,club1_raw,record_count,canonical_club_id,review_decision\nTestville,TSTV,4,,\nOtherton (SCD),OTHR,1,,\nOtherton,OTHR,1,,\n');
  fs.writeFileSync(path.join(dir, 'audit-summary.json'), JSON.stringify({
    source_sha256: 'f'.repeat(64), sheet: '2026 ROSTER', source_records: overrides.count || PEOPLE.length,
    name_groups: [[2, 3]], shared_email_groups: [[4, 5]], missing_email: 1,
    issue_counts: { email_syntax_review: 0, begnov_format_review: 1 }
  }));
  return dir;
}
module.exports = { fixture, HEADER, PEOPLE };

// server.js — the admin review screen for staged roster records.
//
//   npm run review          then open http://localhost:8790
//
// Local and private: listens on 127.0.0.1 only, refuses other hosts and
// cross-site requests, masks contact details unless an operator asks to
// see one record's details (which is logged). It records decisions; it
// never merges records, creates members or accounts, or sends anything.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { openDb } = require('./db');

const PORT = +(process.env.SWD_REVIEW_PORT || 8790);
const OPERATOR = process.env.SWD_OPERATOR || 'GG';
const ROOT = path.join(__dirname, '..', '..');            // the website repo (for the app's shared styles)
const ADMIN = path.join(__dirname, '..', 'admin');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

const KIND_DECISIONS = {
  repeated_name: ['keep_separate', 'same_person_pending_approval', 'needs_info'],
  shared_email: ['shared_household_contact', 'keep_separate', 'same_person_pending_approval', 'needs_info'],
  begnov_format_review: ['value_confirmed', 'needs_info'],
  email_syntax_review: ['value_confirmed', 'needs_info'],
  missing_email: ['value_confirmed', 'needs_info'],
  multiple_or_ambiguous_club_codes: ['value_confirmed', 'needs_info']
};

const maskEmail = (e) => { e = String(e || '').trim(); if (!e) return ''; const [u, d] = e.split('@'); return d ? u.slice(0, 1) + '•••@' + d : e.slice(0, 1) + '•••'; };
const maskPhone = (p) => { const d = String(p || '').replace(/\D/g, ''); return d ? '•••-' + d.slice(-4) : ''; };

function rowView(r) {
  const x = r.raw;
  return {
    sourceRow: r.source_row, firstName: x.name_First, lastName: x.name_Last,
    homeClub: x['Home Club'], club1: x.club1, club2: x.club2, club3: x.club3, sex: x.sex,
    dues: { swMan: x['dues sw man'], swWoman: x['dues sw woman'], usMan: x['dues us man'], usWoman: x['dues us woman'] },
    novice: x.Novices, begnov: x.begnov, city: x.city,
    email: maskEmail(x.email), phone: maskPhone(x['Area-code-Phone-#']), hasEmail: !!String(x.email || '').trim(),
    flags: r.validation_flags, reviewStatus: r.review_status
  };
}

async function main() {
  const db = await openDb(process.env.SWD_DB_DIR);   // default: the private local database
  const q = (s, p) => db.query(s, p).then((r) => r.rows);

  async function summary() {
    const [b] = await q(`SELECT id, source_file, snapshot_date, row_count, created_at, created_by FROM import_batches WHERE status = 'staged' ORDER BY created_at DESC LIMIT 1`);
    if (!b) return { batch: null };
    const kinds = await q(`SELECT kind, count(*)::int AS items, count(*) FILTER (WHERE status = 'open')::int AS open,
      (SELECT count(*)::int FROM review_issue_rows x JOIN review_issues i2 ON i2.id = x.issue_id WHERE i2.kind = i.kind AND i2.batch_id = $1) AS rows
      FROM review_issues i WHERE batch_id = $1 GROUP BY kind ORDER BY kind`, [b.id]);
    const [clubs] = await q(`SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'pending')::int AS pending,
      count(*) FILTER (WHERE code_conflict IS NOT NULL)::int AS conflicts, count(*) FILTER (WHERE suggested_club_id IS NULL)::int AS nomatch FROM club_crosswalk WHERE batch_id = $1`, [b.id]);
    const [rows] = await q(`SELECT count(*)::int AS staged, count(*) FILTER (WHERE cardinality(validation_flags) > 0)::int AS flagged FROM staged_member_rows WHERE batch_id = $1`, [b.id]);
    const [made] = await q(`SELECT (SELECT count(*) FROM members)::int AS members, (SELECT count(*) FROM account_member_links)::int AS accounts,
      (SELECT count(*) FROM member_source_links)::int AS links, (SELECT count(*) FROM review_decisions)::int AS decisions`);
    return { batch: b, kinds, clubs, rows, created: { ...made, invitations: 0, merges: 0 }, operator: OPERATOR };
  }

  async function issues(kind, status) {
    const list = await q(`SELECT i.id, i.kind, i.group_key, i.status, i.resolution FROM review_issues i
      JOIN import_batches b ON b.id = i.batch_id AND b.status = 'staged'
      WHERE ($1::text IS NULL OR i.kind = ANY(string_to_array($1, ','))) AND ($2::text IS NULL OR i.status = $2)
      ORDER BY i.kind, (SELECT min(s.source_row) FROM review_issue_rows x JOIN staged_member_rows s ON s.id = x.staged_row_id WHERE x.issue_id = i.id)`, [kind || null, status || null]);
    if (!list.length) return [];
    const rows = await q(`SELECT x.issue_id, s.source_row, s.raw, s.validation_flags, s.review_status FROM review_issue_rows x
      JOIN staged_member_rows s ON s.id = x.staged_row_id WHERE x.issue_id = ANY($1) ORDER BY s.source_row`, [list.map((i) => i.id)]);
    const last = await q(`SELECT DISTINCT ON (issue_id) issue_id, decision, reason, decided_by, decided_at FROM review_decisions
      WHERE issue_id = ANY($1) ORDER BY issue_id, decided_at DESC`, [list.map((i) => i.id)]);
    return list.map((i) => ({ ...i, choices: KIND_DECISIONS[i.kind],
      rows: rows.filter((r) => r.issue_id === i.id).map(rowView),
      lastDecision: last.find((d) => d.issue_id === i.id) || null }));
  }

  async function decide(issueId, body) {
    const [iss] = await q('SELECT id, kind FROM review_issues WHERE id = $1', [issueId]);
    if (!iss) return [404, { error: 'Not found' }];
    const allowed = KIND_DECISIONS[iss.kind].concat('reopen');
    if (!allowed.includes(body.decision)) return [400, { error: 'That decision does not apply to this item.' }];
    if (!body.reason || String(body.reason).trim().length < 3) return [400, { error: 'Please give a short reason.' }];
    await db.transaction(async (tx) => {
      await tx.query('INSERT INTO review_decisions (issue_id, decision, reason, decided_by) VALUES ($1,$2,$3,$4)', [issueId, body.decision, String(body.reason).trim(), OPERATOR]);
      const open = body.decision === 'needs_info' || body.decision === 'reopen';
      await tx.query('UPDATE review_issues SET status = $2, resolution = $3 WHERE id = $1', [issueId, open ? 'open' : 'resolved', body.decision === 'reopen' ? null : body.decision]);
      const rowStatus = { keep_separate: 'kept_separate', shared_household_contact: 'kept_separate', needs_info: 'needs_info', reopen: 'pending' }[body.decision];
      if (rowStatus) await tx.query(`UPDATE staged_member_rows SET review_status = $2 WHERE id IN (SELECT staged_row_id FROM review_issue_rows WHERE issue_id = $1)`, [issueId, rowStatus]);
      await tx.query(`INSERT INTO audit_events (actor, action, entity, entity_id, summary) VALUES ($1,'review.decision','review_issues',$2,$3)`,
        [OPERATOR, issueId, { kind: iss.kind, decision: body.decision }]);
    });
    return [200, { ok: true }];
  }

  async function contacts(issueId) {
    const rows = await q(`SELECT s.source_row, s.raw->>'email' AS email, s.raw->>'Area-code-Phone-#' AS phone FROM review_issue_rows x
      JOIN staged_member_rows s ON s.id = x.staged_row_id WHERE x.issue_id = $1 ORDER BY s.source_row`, [issueId]);
    await q(`INSERT INTO audit_events (actor, action, entity, entity_id, summary) VALUES ($1,'contacts.viewed','review_issues',$2,$3)`, [OPERATOR, issueId, { rows: rows.length }]);
    return rows;
  }

  async function clubs() {
    const map = await q(`SELECT c.id, c.home_club_raw, c.club1_raw, c.record_count, c.suggested_club_id, c.approved_club_id, c.code_conflict, c.status, c.decided_by, c.decided_at, c.reason
      FROM club_crosswalk c JOIN import_batches b ON b.id = c.batch_id AND b.status = 'staged' ORDER BY c.home_club_raw, c.club1_raw`);
    return { map, clubs: await q('SELECT id, name FROM clubs ORDER BY name') };
  }
  async function decideClub(id, body) {
    if (!['approved', 'no_match', 'needs_info', 'pending'].includes(body.status)) return [400, { error: 'Unknown status' }];
    if (!body.reason || String(body.reason).trim().length < 3) return [400, { error: 'Please give a short reason.' }];
    if (body.status === 'approved' && !body.clubId) return [400, { error: 'Choose the club.' }];
    await db.transaction(async (tx) => {
      await tx.query(`UPDATE club_crosswalk SET status = $2, approved_club_id = $3, decided_by = $4, decided_at = now(), reason = $5 WHERE id = $1`,
        [id, body.status, body.status === 'approved' ? body.clubId : null, OPERATOR, String(body.reason).trim()]);
      await tx.query(`INSERT INTO audit_events (actor, action, entity, entity_id, summary) VALUES ($1,'club.mapping','club_crosswalk',$2,$3)`,
        [OPERATOR, id, { status: body.status, club: body.clubId || null }]);
    });
    return [200, { ok: true }];
  }
  async function history(issueId) {
    return q('SELECT decision, reason, decided_by, decided_at FROM review_decisions WHERE issue_id = $1 ORDER BY decided_at DESC', [issueId]);
  }

  const send = (res, code, body, type) => {
    res.writeHead(code, { 'content-type': type || 'application/json; charset=utf-8', 'cache-control': 'no-store',
      'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY' });
    res.end(type ? body : JSON.stringify(body));
  };
  const readBody = (req) => new Promise((ok, bad) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > 1e5) req.destroy(); }); req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch (e) { bad(e); } }); });

  http.createServer(async (req, res) => {
    try {
      // Local-only: right host, and no cross-site writes
      const host = req.headers.host || '';
      if (!/^(localhost|127\.0\.0\.1):\d+$/.test(host)) return send(res, 403, { error: 'Local access only' });
      if (req.method !== 'GET' && req.headers.origin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(req.headers.origin)) return send(res, 403, { error: 'Cross-site request refused' });
      if (req.method !== 'GET' && req.headers['x-swd-admin'] !== '1') return send(res, 403, { error: 'Missing admin header' });
      const u = new URL(req.url, 'http://localhost');
      let m;
      if (u.pathname === '/api/summary') return send(res, 200, await summary());
      if (u.pathname === '/api/issues') return send(res, 200, await issues(u.searchParams.get('kind'), u.searchParams.get('status')));
      if ((m = /^\/api\/issues\/([0-9a-f-]{36})\/decisions$/.exec(u.pathname))) {
        if (req.method === 'POST') { const [c, b] = await decide(m[1], await readBody(req)); return send(res, c, b); }
        return send(res, 200, await history(m[1]));
      }
      if ((m = /^\/api\/issues\/([0-9a-f-]{36})\/contacts$/.exec(u.pathname)) && req.method === 'POST') return send(res, 200, await contacts(m[1]));
      if (u.pathname === '/api/clubs') return send(res, 200, await clubs());
      if ((m = /^\/api\/clubs\/([0-9a-f-]{36})$/.exec(u.pathname)) && req.method === 'POST') { const [c, b] = await decideClub(m[1], await readBody(req)); return send(res, c, b); }
      // Static: the review screen, plus the app's shared styles and logo
      let file;
      if (u.pathname === '/' || u.pathname === '/review') file = path.join(ADMIN, 'review.html');
      else if (u.pathname.startsWith('/admin/')) file = path.join(ADMIN, path.normalize(u.pathname.slice(7)));
      else if (u.pathname.startsWith('/assets/app/')) file = path.join(ROOT, path.normalize(u.pathname));
      if (!file || !file.startsWith(ADMIN) && !file.startsWith(path.join(ROOT, 'assets', 'app')) || !fs.existsSync(file)) return send(res, 404, 'Not found', 'text/plain');
      return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
    } catch (e) {
      console.error(e.message);
      send(res, 500, { error: 'Something went wrong. Nothing was changed.' });
    }
  }).listen(PORT, '127.0.0.1', () => console.log(`Roster review (local, private): http://localhost:${PORT}  — reviewing as ${OPERATOR}`));
}

if (require.main === module) main();

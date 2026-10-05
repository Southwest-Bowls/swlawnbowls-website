// roster.js — pure helpers for the roster import (no database, no I/O
// beyond reading files). Kept separate so they can be tested on their own.
'use strict';
const crypto = require('crypto');
const fs = require('fs');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes.
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);   // UTF-8 BOM
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  while (rows.length && rows[rows.length - 1].every((v) => v === '')) rows.pop();
  const header = rows.shift();
  return { header, records: rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] === undefined ? '' : r[i]]))) };
}
function readCsv(path) { return parseCsv(fs.readFileSync(path, 'utf8')); }

// The columns staged as raw source values (everything except provenance)
const PROVENANCE = ['source_sheet', 'source_row'];
function rawValues(header, rec) {
  const raw = {};
  header.filter((h) => !PROVENANCE.includes(h)).forEach((h) => { raw[h] = rec[h]; });
  return raw;
}
// Checksum of the raw values in column order, so any change is detectable
function rowChecksum(header, rec) {
  return sha256(JSON.stringify(header.filter((h) => !PROVENANCE.includes(h)).map((h) => rec[h])));
}

// Independent re-check of the audit's flags (used to cross-check the
// supplied review-issues.csv, never to merge anything).
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
function recheck(records) {
  const byName = new Map(), byEmail = new Map();
  const missingEmail = [], emailSyntax = [], begnov = [];
  for (const r of records) {
    const row = +r.source_row;
    const name = fold(r.name_First) + '|' + fold(r.name_Last);
    if (fold(r.name_First) || fold(r.name_Last)) (byName.get(name) || byName.set(name, []).get(name)).push(row);
    const email = String(r.email || '').trim().toLowerCase();
    if (!email) missingEmail.push(row);
    else {
      (byEmail.get(email) || byEmail.set(email, []).get(email)).push(row);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) emailSyntax.push(row);
    }
    const b = String(r.begnov || '').trim();
    if (b && !/^\d{4}\/\d{2}$/.test(b)) begnov.push(row);
  }
  const groups = (m) => [...m.values()].filter((g) => g.length > 1).map((g) => g.sort((a, b) => a - b));
  return { repeatedName: groups(byName), sharedEmail: groups(byEmail), missingEmail, emailSyntax, begnov };
}

// A club suggestion from the website's club list — exact name match on the
// label with any division suffix removed. A suggestion only: every mapping
// still needs an operator's approval. Label/code disagreements are flagged.
function suggestClub(homeLabel, clubs, aliases) {
  const base = String(homeLabel || '').replace(/\s*\([A-Z]+\)\s*$/, '').trim();
  const hit = clubs.find((c) => fold(c.name) === fold(base)) ||
    clubs.find((c) => (aliases[fold(base)] || '') === c.id);
  return { base, suffix: (/\(([A-Z]+)\)\s*$/.exec(homeLabel || '') || [])[1] || '', clubId: hit ? hit.id : null };
}

module.exports = { sha256, parseCsv, readCsv, rawValues, rowChecksum, recheck, suggestClub, fold, PROVENANCE };

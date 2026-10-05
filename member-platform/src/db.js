// db.js — opens the member database and applies migrations in order.
// Local-first: an embedded PostgreSQL (PGlite) stored in member-platform/.data
// (git-ignored, never deployed). The same SQL migrations run unchanged on a
// hosted PostgreSQL later.
'use strict';
const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');

const DEFAULT_DIR = path.join(__dirname, '..', '.data', 'local-db');
const MIGRATIONS = path.join(__dirname, '..', 'migrations');

async function openDb(dir) {
  // dir === ':memory:' gives a throwaway database (tests)
  if (dir !== ':memory:') fs.mkdirSync(path.dirname(dir || DEFAULT_DIR), { recursive: true });
  const db = dir === ':memory:' ? new PGlite() : new PGlite(dir || DEFAULT_DIR);
  await db.waitReady;
  await migrate(db);
  return db;
}

async function migrate(db) {
  const has = (await db.query(`SELECT to_regclass('public.schema_migrations') AS t`)).rows[0].t;
  const done = new Set(has ? (await db.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version) : []);
  for (const f of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    const version = f.replace(/\.sql$/, '');
    if (done.has(version)) continue;
    await db.transaction(async (tx) => { await tx.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8')); });
  }
}

module.exports = { openDb, DEFAULT_DIR };

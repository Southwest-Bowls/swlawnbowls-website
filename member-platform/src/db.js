// db.js — opens the member database and applies migrations in order.
// Local-first: an embedded PostgreSQL (PGlite) stored in member-platform/.data
// (git-ignored, never deployed). The same SQL migrations run unchanged on a
// hosted PostgreSQL later.
//
// Safety, because this folder will hold review decisions:
//   * Only one program may open the database at a time (a lock file).
//     Two at once can corrupt it.
//   * Before opening, a backup copy is made in .data/backups (last 10 kept).
//   * close() releases the lock; callers close on Ctrl+C / stop signals.
'use strict';
const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');

const DATA = path.join(__dirname, '..', '.data');
const DEFAULT_DIR = path.join(DATA, 'local-db');
const MIGRATIONS = path.join(__dirname, '..', 'migrations');
const KEEP_BACKUPS = 10;

class DbBusyError extends Error {}

function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }

// Exclusive lock beside the database folder: <dir>.lock holding our pid
function lock(dir) {
  const file = dir + '.lock';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
      return () => { try { if (fs.readFileSync(file, 'utf8') === String(process.pid)) fs.unlinkSync(file); } catch (e) {} };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const pid = +fs.readFileSync(file, 'utf8') || 0;
      if (pid && pid !== process.pid && alive(pid)) {
        throw new DbBusyError(`The member database is already open in another program (process ${pid}). ` +
          'Close the other review screen or import first (Ctrl+C in its window), then try again.');
      }
      fs.unlinkSync(file);   // stale lock from a program that has stopped
    }
  }
  throw new DbBusyError('Could not lock the member database.');
}

// Copy the database folder to .data/backups/<name>-<timestamp>, keep the newest 10
function backup(dir) {
  if (!fs.existsSync(path.join(dir, 'PG_VERSION'))) return null;
  const root = path.join(path.dirname(dir), 'backups');
  fs.mkdirSync(root, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(root, path.basename(dir) + '-' + stamp);
  fs.cpSync(dir, dest, { recursive: true });
  const old = fs.readdirSync(root).filter((n) => n.startsWith(path.basename(dir) + '-')).sort();
  old.slice(0, Math.max(0, old.length - KEEP_BACKUPS)).forEach((n) => fs.rmSync(path.join(root, n), { recursive: true, force: true }));
  return dest;
}

async function openDb(dir, opts) {
  opts = opts || {};
  // dir === ':memory:' gives a throwaway database (tests) — no lock or backup
  if (dir === ':memory:') { const db = new PGlite(); await db.waitReady; await migrate(db); return db; }
  dir = dir || DEFAULT_DIR;
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const unlock = lock(dir);
  try {
    if (opts.backup !== false) backup(dir);
    const db = new PGlite(dir);
    await db.waitReady;
    await migrate(db);
    const close = db.close.bind(db);
    let closed = false;
    db.close = async () => { if (closed) return; closed = true; try { await close(); } finally { unlock(); } };
    return db;
  } catch (e) {
    unlock();
    if (e instanceof DbBusyError) throw e;
    throw new Error('The member database could not be opened (' + (e.message || e) + '). ' +
      'Backups are in member-platform/.data/backups — see README "If the database won\'t open".');
  }
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

// Close cleanly on Ctrl+C or a stop signal (prevents a half-written database)
function closeOnExit(db, label) {
  let stopping = false;
  const stop = async (sig) => {
    if (stopping) return; stopping = true;
    try { await db.close(); } catch (e) {}
    if (label) console.log(`\n${label} stopped — database closed safely.`);
    process.exit(sig === 'SIGINT' ? 0 : 0);
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGHUP', () => stop('SIGHUP'));
}

module.exports = { openDb, closeOnExit, DbBusyError, DEFAULT_DIR, DATA };

// demo-db.js — builds a demo database from the MADE-UP test roster, so the
// review screen can be shown or tested without any real member data.
//   node src/demo-db.js <dir>   then   SWD_DB_DIR=<dir> npm run review
'use strict';
const { openDb } = require('./db');
const { importRoster } = require('./import-roster');
const { fixture } = require('../tests/fixture');
(async () => {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node src/demo-db.js <dir>'); process.exit(1); }
  const db = await openDb(dir);
  const s = await importRoster(db, { dir: fixture(), operator: 'demo' });
  console.log('Demo database:', s.result, '·', s.file.rows, 'made-up rows');
  await db.close();
})();

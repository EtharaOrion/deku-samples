/** Applies the schema and seeds the database. Idempotent. */
import { seed } from './seed.mjs';
import { default as db } from '../src/lib/db.js';

try {
  await seed();
  console.log(JSON.stringify({ level: 'info', msg: 'migrate_and_seed_complete' }));
} catch (err) {
  console.error(JSON.stringify({ level: 'error', msg: 'migrate_failed', error: String(err) }));
  process.exitCode = 1;
} finally {
  await db.pool.end();
}


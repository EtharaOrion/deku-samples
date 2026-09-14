import pg from 'pg';

let pool = null;

export function getDb() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000
    });
    pool.on('error', (err) => console.error('pg pool error', err.message));
  }
  return pool;
}

const ADVISORY_LOCK_KEY = 918273645;

// Applies the schema and runs the seed exactly once across concurrent processes.
export async function migrateAndSeed(seedFn) {
  const db = getDb();
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    const t = await client.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'");
    if (t.rows[0].n === 0) {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const schema = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql'), 'utf8');
      await client.query(schema);
    }
    const seeded = await client.query('SELECT count(*)::int AS n FROM site');
    if (seeded.rows[0].n === 0) {
      await seedFn(client);
    }
  } finally {
    try { await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]); } catch (e) { /* ignore */ }
    client.release();
  }
}

// Sequential reference allocator, used for gapless per-prefix references.
const REF_LOCK = 551002;
export async function nextReference(db, prefix, pad = 4) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [REF_LOCK]);
    const r = await client.query('SELECT count(*)::int AS n FROM app_reference WHERE prefix=$1', [prefix]);
    let n;
    if (r.rows[0].n === 0) {
      await client.query('INSERT INTO app_reference (prefix,last_n) VALUES ($1,1)', [prefix]);
      n = 1;
    } else {
      const u = await client.query('UPDATE app_reference SET last_n=last_n+1 WHERE prefix=$1 RETURNING last_n', [prefix]);
      n = u.rows[0].last_n;
    }
    await client.query('COMMIT');
    return `${prefix}${String(n).padStart(pad, '0')}`;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

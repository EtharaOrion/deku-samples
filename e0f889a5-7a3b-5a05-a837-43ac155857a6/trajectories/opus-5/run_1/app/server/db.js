import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Return integers for int8 rather than strings.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1700, (v) => v); // numeric stays a string; no float money
// A date stays the plain YYYY-MM-DD it is in the column, rather than becoming a
// Date in the server's own zone, which would shift the day.
pg.types.setTypeParser(1082, (v) => v);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

export const pool = new pg.Pool({
  connectionString,
  max: Number(process.env.DB_POOL_MAX || 12),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.log(JSON.stringify({ level: 'error', msg: 'pg_pool_error', error: String(err && err.message) }));
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function one(text, params) {
  const r = await pool.query(text, params);
  return r.rows[0] || null;
}

export async function many(text, params) {
  const r = await pool.query(text, params);
  return r.rows;
}

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection already gone */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function waitForDatabase(attempts = 60) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastErr;
}

export async function applySchema() {
  const path = fileURLToPath(new URL('./schema.sql', import.meta.url));
  const sql = await readFile(path, 'utf8');
  // Advisory lock so two container replicas cannot race the DDL.
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [815123001]);
    await client.query(sql);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [815123001]).catch(() => {});
    client.release();
  }
}

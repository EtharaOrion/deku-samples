import pg from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Integers arrive from postgres as strings for bigint; the product is integer-only,
// so bigint and numeric are parsed back to Number deliberately.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

const connectionString = process.env.DATABASE_URL || process.env.DB_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

export const pool = new pg.Pool({ connectionString, max: 12 });

export async function q(text, params) {
  const r = await pool.query(text, params);
  return r.rows;
}
export async function one(text, params) {
  const r = await pool.query(text, params);
  return r.rows[0] || null;
}
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export async function waitForDb(attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (e) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('database never became reachable');
}

// The schema is additive and idempotent. The advisory lock serialises two
// containers starting at the same moment against the same database.
export async function applySchema() {
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(8712340000)');
    await client.query(sql);
  } finally {
    try { await client.query('SELECT pg_advisory_unlock(8712340000)'); } catch {}
    client.release();
  }
}

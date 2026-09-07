import pg from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// bigint columns come back as JS numbers: every mass here is well inside 2^53.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

export const pool = new pg.Pool({ connectionString, max: 10 });

export async function q(text, params) {
  const res = await pool.query(text, params);
  return res.rows;
}

export async function one(text, params) {
  const rows = await q(text, params);
  return rows[0] || null;
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

/**
 * Applies the schema and then runs `fn` (the seed) under one advisory lock, so two
 * containers starting against one fresh database do not both create the seeded rows.
 * Every statement in schema.sql is IF NOT EXISTS, and the seed checks before it writes.
 */
export async function migrate(fn) {
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(529871342)');
    await client.query(sql);
    if (fn) return await fn();
  } finally {
    await client.query('SELECT pg_advisory_unlock(529871342)').catch(() => {});
    client.release();
  }
}

export async function waitForDatabase(attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

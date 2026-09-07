import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// Integers arrive as integers, never as strings, and never as floats.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

const url = process.env.DATABASE_URL || process.env.DB_URL;
if (!url) throw new Error('DATABASE_URL is not set');

export const pool = new pg.Pool({ connectionString: url, max: 12 });

export const query = (text, params) => pool.query(text, params);

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* connection already gone */ }
    throw e;
  } finally {
    client.release();
  }
}

export async function one(text, params) {
  const r = await query(text, params);
  return r.rows[0] || null;
}

export async function all(text, params) {
  const r = await query(text, params);
  return r.rows;
}

export async function waitForDatabase(attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      await pool.query('select 1');
      return;
    } catch (e) {
      if (i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

export async function migrate() {
  const sql = await readFile(join(here, '..', 'db', 'schema.sql'), 'utf8');
  // One advisory lock so two containers starting together apply this once.
  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock(818231)');
    await client.query(sql);
    await client.query(
      "insert into schema_migration(id) values ('0001_initial') on conflict do nothing",
    );
  } finally {
    await client.query('select pg_advisory_unlock(818231)');
    client.release();
  }
}

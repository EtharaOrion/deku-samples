import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

const connectionString = process.env.DATABASE_URL || process.env.DB_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

export const pool = new pg.Pool({ connectionString, max: 12 });

export async function query(text, params) {
  const res = await pool.query(text, params);
  return res.rows;
}

export async function one(text, params) {
  const rows = await query(text, params);
  return rows[0] || null;
}

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

export async function waitForDatabase(attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (e) {
      if (i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

export async function migrate() {
  const sql = await readFile(join(here, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

export async function nextCounter(client, name, width = 4, prefix = '') {
  const r = await client.query(
    `INSERT INTO counter (name, value) VALUES ($1, 1)
     ON CONFLICT (name) DO UPDATE SET value = counter.value + 1
     RETURNING value`,
    [name]
  );
  const n = Number(r.rows[0].value);
  return prefix + String(n).padStart(width, '0');
}

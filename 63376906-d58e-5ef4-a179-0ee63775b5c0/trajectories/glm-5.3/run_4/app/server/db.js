import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = new URL(process.env.DATABASE_URL);
const sslmode = url.searchParams.get('sslmode') || url.searchParams.get('ssl');

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 12,
  ssl: sslmode && sslmode !== 'disable' ? { rejectUnauthorized: false } : undefined
});

export function q(text, params) {
  return pool.query(text, params);
}

export function sha256(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

export function nowIso() {
  return new Date().toISOString();
}

export function today() {
  return nowIso().slice(0, 10);
}

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn({
      query: (t, p) => client.query(t, p)
    });
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export function readSql(file) {
  return fs.readFileSync(path.join(__dirname, 'db', file), 'utf8');
}

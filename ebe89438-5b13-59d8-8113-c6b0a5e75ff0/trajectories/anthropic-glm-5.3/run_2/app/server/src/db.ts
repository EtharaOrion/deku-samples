import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { DATABASE_URL } from './config.js';

export const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 20 });

export interface Txn {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
}
export type DB = Txn;

export async function withTxn<T>(fn: (tx: Txn) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tx: Txn = {
      async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
        const res = await client.query(sql, params);
        return res.rows;
      },
    };
    const out = await fn(tx);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function migrate(): Promise<void> {
  // The schema directory is found wherever the server actually lives.
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.DB_DIR,
    join(process.cwd(), 'db'),
    join(here, '..', 'db'),
    join(here, '..', '..', 'server', 'db'),
  ].filter((d): d is string => !!d);
  let dir: string | null = null;
  for (const c of candidates) {
    try { readdirSync(c); dir = c; break; } catch { /* keep looking */ }
  }
  if (!dir) throw new Error('Could not locate the database schema directory.');
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = readFileSync(join(dir, f), 'utf8');
    await pool.query(sql);
  }
}

export function isUniqueViolation(e: any): boolean {
  return e?.code === '23505';
}
export function isSeatViolation(e: any): boolean {
  return e?.code === 'P0001' && String(e?.message ?? '').includes('event_full');
}

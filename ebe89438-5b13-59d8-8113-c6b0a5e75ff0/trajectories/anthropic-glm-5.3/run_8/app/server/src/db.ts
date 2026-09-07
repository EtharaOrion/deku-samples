import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { Pool, PoolClient } from 'pg';
import { config, log, pool } from './config.js';

export async function migrate(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const candidates = [
    process.env.MIGRATIONS_DIR,
    join(config.appRoot, 'src', 'migrations'),
    join(config.appRoot, 'server', 'src', 'migrations'),
  ].filter(Boolean) as string[];
  const dir = candidates.find((d) => existsSync(d)) ?? candidates[candidates.length - 1]!;
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  } catch {
    files = [];
  }
  const applied = new Set(
    (await pool.query<{ name: string }>(`SELECT name FROM schema_migrations`)).rows.map((r) => r.name),
  );
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
      await client.query('COMMIT');
      log('migration_applied', { name: file });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

export async function withTransaction<T>(fn: (tx: PoolClient) => Promise<T>): Promise<T> {
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    const out = await fn(tx);
    await tx.query('COMMIT');
    return out;
  } catch (err) {
    try {
      await tx.query('ROLLBACK');
    } catch {
      /* connection already gone */
    }
    throw err;
  } finally {
    tx.release();
  }
}

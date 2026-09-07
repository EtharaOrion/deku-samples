import pg from 'pg';
import { env } from './env.js';
import { log } from './log.js';

// Identity columns are bigint, which node-postgres hands back as a string to
// protect precision. Every id this app issues is far inside the safe integer
// range, so they cross the API as numbers rather than as quoted digits.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => log.error('pg pool error', { err: String(err) }));

export type Client = pg.PoolClient;

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as any[]);
}

/** Run fn inside a transaction; retries once on serialization/deadlock failures. */
export async function tx<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (err: any) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      lastErr = err;
      const code = err?.code;
      if (code === '40001' || code === '40P01') {
        await new Promise((r) => setTimeout(r, 15 * (attempt + 1)));
        continue;
      }
      throw err;
    } finally {
      client.release();
    }
  }
  throw lastErr;
}

export async function waitForDatabase(timeoutMs = 60_000): Promise<void> {
  const started = Date.now();
  for (;;) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (Date.now() - started > timeoutMs) throw err;
      log.warn('database not ready, retrying', { err: String(err) });
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

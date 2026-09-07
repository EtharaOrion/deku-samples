import pg from 'pg';
import { env } from './env.js';
import { log } from './log.js';

// Return bigint/numeric counts as numbers.
pg.types.setTypeParser(20, (v: string) => parseInt(v, 10));
// Return timestamptz as ISO-8601 UTC strings with a trailing Z.
pg.types.setTypeParser(1184, (v: string) => new Date(v + (/[Z+-]\d*$/.test(v) ? '' : 'Z')).toISOString());
pg.types.setTypeParser(1114, (v: string) => new Date(v + 'Z').toISOString());

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => log.error('pg pool error', { err: String(err) }));

export type Db = pg.PoolClient | pg.Pool;

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params: unknown[] = [],
  client: Db = pool,
): Promise<pg.QueryResult<T>> {
  return client.query<T>(text, params as any[]);
}

export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* connection already gone */
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function waitForDb(attempts = 60): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query('select 1');
      log.info('database ready');
      return;
    } catch (e) {
      log.warn('database not ready, retrying', { attempt: i, err: String(e) });
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('database never became ready');
}

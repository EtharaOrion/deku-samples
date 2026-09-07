import pg from 'pg';
import { env } from './env.js';

// timestamptz -> RFC3339 with trailing Z, always UTC on the wire
pg.types.setTypeParser(1184, (v: string) => (v === null ? null : new Date(v).toISOString()));
pg.types.setTypeParser(1114, (v: string) => (v === null ? null : new Date(v + 'Z').toISOString()));

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export type Client = pg.PoolClient;

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params: unknown[] = []
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as any[]);
}

export async function tx<T>(fn: (c: Client) => Promise<T>): Promise<T> {
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

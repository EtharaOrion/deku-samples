import { Pool, PoolClient } from 'pg';
import { ALL_SCHEMA } from './schema_extra.js';
import { seed } from './seed.js';
import { log } from './log.js';

export function makePool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX || 12),
    idleTimeoutMillis: 30000,
  });
}

/**
 * Applies the schema and seeds fixture rows. Guarded by an advisory lock so
 * concurrent starts (or overlapping restarts) cannot interleave.
 */
export async function migrate(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(918273645)');
    await client.query(ALL_SCHEMA);
    await client.query('BEGIN');
    try {
      await seed(client);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(918273645)').catch(() => undefined);
    client.release();
  }
}

/** One serialisable unit of work; the pool hands the client back either way. */
export async function withTransaction<T>(pool: Pool, fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    try {
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    }
  } finally {
    client.release();
  }
}

import pg from 'pg';

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : d;
};

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: num(process.env.PGPOOL_MAX, 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
});

export type Tx = pg.PoolClient;

/**
 * Registration, approval and check-in run inside SERIALIZABLE transactions so
 * the capacity invariant is enforced by the database engine, not by an
 * application-level check two concurrent requests can both pass.
 */
export async function tx<T>(fn: (client: Tx) => Promise<T>, isolation: 'SERIALIZABLE' | 'READ COMMITTED' = 'SERIALIZABLE'): Promise<T> {
  const client = await pool.connect();
  let result: T;
  try {
    await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
    try {
      result = await fn(client);
      await client.query('COMMIT');
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* already aborted */ }
      throw e;
    }
  } finally {
    client.release();
  }
  return result;
}

import pg from 'pg';
import { config } from './config.ts';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 12,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 8_000,
});

pg.types.setTypeParser(20, (v) => Number(v)); // int8 -> number

export type Tx = pg.PoolClient;

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const r = await pool.query(sql, params);
  return r.rows as T[];
}

export async function withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    const out = await fn(tx);
    await tx.query('COMMIT');
    return out;
  } catch (e) {
    try {
      await tx.query('ROLLBACK');
    } catch {
      /* connection already broken */
    }
    throw e;
  } finally {
    tx.release();
  }
}

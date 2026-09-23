import pg from 'pg';
import { config } from '../config.js';

// Value coercion happens once, here. int8 and numeric arrive as numbers; dates as
// calendar strings; timestamps as ISO strings with zone.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString());
pg.types.setTypeParser(1114, (v) => new Date(v + 'Z').toISOString());

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 8 });

export type Row = Record<string, unknown>;
export type Queryable = pg.PoolClient | pg.Pool;

export async function query<T extends Row = Row>(text: string, params: unknown[] = [], q: Queryable = pool): Promise<T[]> {
  const result = await q.query(text, params);
  return result.rows as T[];
}

export async function one<T extends Row = Row>(text: string, params: unknown[] = [], q: Queryable = pool): Promise<T | null> {
  const rows = await query<T>(text, params, q);
  return rows[0] ?? null;
}

export async function transaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

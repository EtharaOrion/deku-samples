import pg from 'pg';

const cn = (() => {
  try { return JSON.parse(process.env.PG_OPTIONS || '{}'); } catch { return {}; }
})();

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 8,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ...cn,
});

export type Q = (sql: string, params?: unknown[]) => Promise<any>;
export const q: Q = (sql, params = []) => guardedQuery(sql, params);

/** Set when the schema is missing so the app re-runs its migration and seed. */
let onMissingSchema: (() => void) | null = null;
export function setMissingSchemaHandler(fn: () => void) { onMissingSchema = fn; }

async function guardedQuery(sql: string, params: any[] = []) {
  try {
    return await pool.query(sql, params);
  } catch (err: any) {
    if (err && (err.code === '42P01' || err.code === '3F000')) onMissingSchema?.();
    throw err;
  }
}

import pg from 'pg';

const p = new pg.Pool({
  connectionString: (process.env.DATABASE_URL || process.env.DB_URL || '').trim(),
  max: 8,
  idleTimeoutMillis: 30000
});

p.on('error', () => {});

export const q = async (text, params, cl) => (await (cl || p).query(text, params)).rows;
export const one = async (text, params, cl) => (await (cl || p).query(text, params)).rows[0];
export const exec = async (text, params, cl) => (await (cl || p).query(text, params));
export const client = async () => p.connect();
export const pool = p;
export default { q, one, exec, client, pool };

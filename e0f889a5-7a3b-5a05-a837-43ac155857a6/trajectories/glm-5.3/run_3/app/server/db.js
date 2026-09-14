import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || process.env.DB_URL,
  max: 10,
  idleTimeoutMillis: 30000
});

pool.on('error', (err) => console.error(JSON.stringify({ level: 'error', scope: 'pg', message: err.message })));

export const q = (text, params) => pool.query(text, params);
export const one = async (text, params) => (await pool.query(text, params)).rows[0] || null;
export const rows = async (text, params) => (await pool.query(text, params)).rows;
export default pool;

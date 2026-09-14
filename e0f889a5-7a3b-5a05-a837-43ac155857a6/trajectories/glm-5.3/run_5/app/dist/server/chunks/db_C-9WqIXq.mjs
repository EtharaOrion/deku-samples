import pg from "pg";
const { Pool } = pg;
const pool = global.__velaPool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 12,
  idleTimeoutMillis: 3e4
});
pg.types.setTypeParser(1700, (v) => v === null ? null : Number(v));
pg.types.setTypeParser(20, (v) => v === null ? null : Number(v));
pg.types.setTypeParser(1082, (v) => v);
if (!global.__velaPool) global.__velaPool = pool;
async function q(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}
async function one(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] ?? null;
}
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
    }
    throw err;
  } finally {
    client.release();
  }
}
function isUniqueViolation(err) {
  return typeof err === "object" && err !== null && err.code === "23505";
}
export {
  isUniqueViolation as i,
  one as o,
  q,
  tx as t
};

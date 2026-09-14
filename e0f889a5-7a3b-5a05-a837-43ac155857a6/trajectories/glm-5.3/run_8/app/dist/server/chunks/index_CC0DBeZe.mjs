import pg from "pg";
pg.types.setTypeParser(20, (v) => parseInt(v, 10));
pg.types.setTypeParser(21, (v) => parseInt(v, 10));
pg.types.setTypeParser(23, (v) => parseInt(v, 10));
const {
  Pool
} = pg;
const sslLike = /(sslmode=require|ssl=true)/i.test(process.env.DATABASE_URL || "");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  ...sslLike ? {
    ssl: {
      rejectUnauthorized: false
    }
  } : {}
});
async function q(text, params = []) {
  const res = await pool.query(text, params);
  return res.rows;
}
async function one(text, params = []) {
  const rows = await q(text, params);
  return rows[0] || null;
}
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await fn({
      query: async (text, params = []) => (await client.query(text, params)).rows,
      one: async (text, params = []) => (await client.query(text, params)).rows[0] || null
    });
    await client.query("COMMIT");
    return r;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
    }
    throw e;
  } finally {
    client.release();
  }
}
export {
  one,
  pool,
  q,
  tx
};

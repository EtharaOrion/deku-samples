import pg from "pg";
const cn = (() => {
  try {
    return JSON.parse(process.env.PG_OPTIONS || "{}");
  } catch {
    return {};
  }
})();
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 8,
  idleTimeoutMillis: 3e4,
  connectionTimeoutMillis: 1e4,
  ...cn
});
const q = (sql, params = []) => guardedQuery(sql, params);
let onMissingSchema = null;
function setMissingSchemaHandler(fn) {
  onMissingSchema = fn;
}
async function guardedQuery(sql, params = []) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    if (err && (err.code === "42P01" || err.code === "3F000")) onMissingSchema?.();
    throw err;
  }
}
export {
  pool,
  q,
  setMissingSchemaHandler
};

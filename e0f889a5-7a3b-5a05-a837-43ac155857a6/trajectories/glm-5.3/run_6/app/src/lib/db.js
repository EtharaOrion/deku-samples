import postgres from 'postgres';
import { env } from '../env.js';

let sql = null;

// Counting columns such as ids are read back as JavaScript numbers so money and
// identifiers stay integers end to end.
const bigintType = {
  to: 20,
  serialize: (x) => String(x),
  parse: (x) => Number(x)
};

export function db() {
  if (!sql) {
    sql = postgres(env.databaseUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      transform: postgres.camel,
      types: { bigint: bigintType }
    });
  }
  return sql;
}

export async function tx(fn) {
  return db().begin(fn);
}

export async function closeDb() {
  if (sql) { await sql.end({ timeout: 5 }); sql = null; }
}

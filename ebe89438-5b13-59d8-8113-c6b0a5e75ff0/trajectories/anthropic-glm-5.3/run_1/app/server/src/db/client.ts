import pg from 'pg';

const cs = process.env.DATABASE_URL ?? '';
const u = new URL(cs);

export const db = new pg.Pool({
  host: u.hostname,
  port: Number(u.port || 5432),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.replace(/^\//, ''),
  max: 10,
  idleTimeoutMillis: 30_000,
});

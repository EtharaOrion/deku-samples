import pg from 'pg';

// Dates cross the wire as YYYY-MM-DD and timestamps as ISO with a Z, never as
// a JS Date re-serialised into something with milliseconds in it.
pg.types.setTypeParser(1082, (v: string) => v);
pg.types.setTypeParser(1114, (v: string) => v);
pg.types.setTypeParser(1184, (v: string) => new Date(v).toISOString());

export const db = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000
});

export type Pool = pg.Pool;

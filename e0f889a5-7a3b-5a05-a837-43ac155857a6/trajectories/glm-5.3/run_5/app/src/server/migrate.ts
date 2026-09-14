import { pool } from './db.js';
import { logEvent } from './log.js';


export async function migrate(): Promise<void> {
  const { SCHEMA_SQL } = await import('./schema.js');
  await pool.query(SCHEMA_SQL);
  logEvent('db.migrated');
}

export async function waitForDatabase(retries = 40, delayMs = 500): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

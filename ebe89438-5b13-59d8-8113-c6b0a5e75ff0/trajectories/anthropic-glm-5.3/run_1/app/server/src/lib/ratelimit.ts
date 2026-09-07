import { db } from '../db/client.js';

/**
 * Fixed window, one row per key, held in PostgreSQL (the only datastore in
 * this environment). 10 requests per minute for registration and login.
 */
export async function rateLimit(key: string, limit = 10, windowSeconds = 60): Promise<boolean> {
  const { rows } = await db.query<{ allowed: boolean }>(
    `SELECT (
       SELECT count(*) FROM rate_limits
        WHERE key = $1 AND at > now() - ($2 * interval '1 second')
     ) < $3 AS allowed`,
    [key, windowSeconds, limit]
  );
  if (!rows[0].allowed) return false;
  await db.query(`INSERT INTO rate_limits (key, at) VALUES ($1, now())`, [key]);
  return true;
}

export const RATE_LIMIT_MESSAGE = `Too many attempts. Please wait a minute before trying again. The limit is 10 requests per minute.`;

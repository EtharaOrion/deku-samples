import { query } from './db.js';
import { AppError } from './errors.js';

/**
 * At most `limit` requests per minute per account, counted in Postgres so the
 * limit holds across every process serving the app.
 */
export async function rateLimit(bucket: string, limit: number) {
  await query(`DELETE FROM rate_limit_hits WHERE hit_at < now() - interval '5 minutes'`);
  // Only an accepted request is recorded. Were a rejected one counted too, a
  // caller that kept retrying would keep its own window full and never recover.
  const r = await query<{ accepted: boolean }>(
    `WITH win AS (
       SELECT count(*) AS n FROM rate_limit_hits
        WHERE bucket = $1 AND hit_at > now() - interval '1 minute'
     ), ins AS (
       INSERT INTO rate_limit_hits (bucket)
       SELECT $1 FROM win WHERE win.n < $2
       RETURNING 1
     )
     SELECT EXISTS (SELECT 1 FROM ins) AS accepted`,
    [bucket, limit],
  );
  if (!r.rows[0].accepted) {
    throw new AppError(429, `Too many attempts. This endpoint accepts at most ${limit} requests per minute per account. Wait a minute and try again.`, {
      code: 'rate_limited',
      extra: { limit, window_seconds: 60 },
    });
  }
}

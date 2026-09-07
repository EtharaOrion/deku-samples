import { pool } from './db.js';
import { sha256, stableStringify, fail } from './util.js';

/**
 * An Idempotency-Key is scoped to the route it was sent to and to the body it
 * was sent with. A write with no key at all is refused, so a retry can never be
 * indistinguishable from a second act.
 */
export async function withIdempotency(c, handler) {
  const key = c.req.header('idempotency-key');
  const route = c.req.method + ' ' + new URL(c.req.url).pathname;
  if (!key || !key.trim()) {
    return c.json(
      {
        error: 'idempotency_key_required',
        message:
          'Every write carries an Idempotency-Key header, so a retry is never indistinguishable from a second act.',
      },
      400
    );
  }
  let body = null;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const hash = sha256(stableStringify(body ?? {}));

  const existing = await pool.query(
    'SELECT * FROM idempotency WHERE key = $1 AND route = $2',
    [key, route]
  );
  if (existing.rows.length) {
    const row = existing.rows[0];
    if (row.body_hash !== hash) {
      return c.json(
        {
          error: 'idempotency_key_reuse',
          message:
            'This key was used for a different body on this route. A key is a promise about one act, not a licence to replace it.',
        },
        409
      );
    }
    return c.json(row.response, row.status);
  }

  const result = await handler(body);
  const status = result.status ?? 200;
  if (status < 400) {
    await pool.query(
      `INSERT INTO idempotency (key, route, body_hash, status, response)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (key, route) DO NOTHING`,
      [key, route, hash, status, result.body]
    );
  }
  return c.json(result.body, status);
}

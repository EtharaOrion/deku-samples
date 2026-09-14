import { sha256, canon } from './record.js';
import { HttpError } from './auth.js';

export function bodyHash(body) {
  return sha256(canon(body === undefined ? null : body));
}

// Every mutating route passes through here. A write with no Idempotency-Key is refused.
export async function idemGuard(c, req, routeKey, body) {
  const key = req.header('idempotency-key');
  if (!key || !key.trim()) throw new HttpError(400, 'idempotency_key_required', {
    message: 'Every write must carry an Idempotency-Key header.'
  });
  const h = bodyHash(body);
  const existing = (await c.query(`SELECT status, response, body_hash FROM idempotency WHERE key=$1 AND route=$2 FOR UPDATE`, [key, routeKey])).rows;
  if (existing.length) {
    if (existing[0].body_hash !== h) {
      throw new HttpError(409, 'idempotency_key_reuse', {
        message: 'This Idempotency-Key was used with a different body on this route.'
      });
    }
    return { replay: true, status: existing[0].status, response: existing[0].response };
  }
  return { replay: false, key, route: routeKey, hash: h };
}

export async function idemStore(c, guard, status, response) {
  if (guard.replay) return;
  await c.query(`INSERT INTO idempotency (key, route, body_hash, status, response) VALUES ($1,$2,$3,$4,$5)`,
    [guard.key, guard.route, guard.hash, status, JSON.stringify(response)]);
}

export function refusePagination(query) {
  for (const p of ['page', 'limit', 'offset', 'cursor']) {
    if (query[p] !== undefined) {
      throw new HttpError(400, 'pagination_refused', {
        message: `This route returns a complete set and refuses the '${p}' parameter.`
      });
    }
  }
}

import { sha256 } from './units.js';

// An Idempotency-Key is scoped to the route and to the body it was sent with.
export function idempotencyError(code, message) {
  return Response.json({ error: code, message: message || code }, { status: code === 'idempotency_key_reuse' ? 409 : 400 });
}

export async function withIdempotency(c, handler) {
  const db = c.get('db');
  const key = c.req.header('idempotency-key');
  if (!key) {
    return Response.json({
      error: 'idempotency_key_required',
      message: 'A write that arrives with no Idempotency-Key is refused, so a retry can never be indistinguishable from a second act.'
    }, { status: 400 });
  }
  const route = c.req.path;
  const raw = await c.req.raw.clone().text();
  const bodyHash = sha256(raw || '');
  const existing = await db.query(
    'SELECT * FROM idempotency_key WHERE key=$1 AND route=$2', [key, route]);
  if (existing.rows.length) {
    const row = existing.rows[0];
    if (row.body_hash !== bodyHash) {
      return Response.json({
        error: 'idempotency_key_reuse',
        message: 'The key was sent with a different body. A key is a promise about one act.'
      }, { status: 409 });
    }
    return Response.json(row.response, { status: row.status });
  }
  const result = await handler();
  if (result && result.__recorded !== false) {
    const status = result.status || 200;
    let body = null;
    try { body = await result.clone?.().json(); } catch (e) { body = null; }
    if (body) {
      await db.query(
        `INSERT INTO idempotency_key (key,route,body_hash,status,response,created_at) VALUES ($1,$2,$3,$4,$5,now())
         ON CONFLICT (key, route) DO NOTHING`, [key, route, bodyHash, status, JSON.stringify(body)]);
    }
  }
  return result;
}

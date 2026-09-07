import { createHash } from 'node:crypto';
import { pool } from './db.js';
import { readSession, hasRole } from './auth.js';
import { append } from './record.js';

/** An Idempotency-Key is scoped to the route it was sent to and to the body it was sent with. */
function bodyHash(body) {
  return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex');
}

export async function withIdempotency(c, routeKey, body, handler) {
  const key = c.req.header('Idempotency-Key');
  // A write that arrives with no key at all is refused, so a retry can never be
  // indistinguishable from a second act.
  if (!key) {
    return c.json({
      error: 'idempotency_key_required',
      rule: 'Every write carries a client-supplied Idempotency-Key header so a retry is never a second act.'
    }, 400);
  }
  const hash = bodyHash(body);
  const existing = await pool.query(
    'SELECT body_hash, status, response FROM idempotency WHERE key = $1 AND route = $2',
    [key, routeKey]
  );
  if (existing.rows.length) {
    const row = existing.rows[0];
    if (row.body_hash !== hash) {
      // A key is a promise about one act, not a licence to replace it.
      return c.json({
        error: 'idempotency_key_reuse',
        rule: 'This key was used on this route with a different body. A key is a promise about one act.'
      }, 409);
    }
    return c.json(row.response, row.status);
  }
  const result = await handler();
  const status = result.status || 200;
  await pool.query(
    `INSERT INTO idempotency (key, route, body_hash, status, response) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (key, route) DO NOTHING`,
    [key, routeKey, hash, status, JSON.stringify(result.body)]
  );
  return c.json(result.body, status);
}

export function ok(body, status = 200) {
  return { body, status };
}

/** Authorization is decided on the server for every mutating route. */
export async function requireSession(c) {
  const session = await readSession(c.req.header('Authorization'));
  if (!session) {
    return { error: c.json({ error: 'authentication_required', rule: 'This route needs a session.' }, 401) };
  }
  return { session };
}

export async function requireRole(c, ...roles) {
  const got = await requireSession(c);
  if (got.error) return got;
  if (!hasRole(got.session, ...roles)) {
    await append(null, {
      act: 'authorisation_refused',
      person: got.session.email,
      person_id: got.session.person_id,
      object_kind: 'route',
      object_ref: `${c.req.method} ${new URL(c.req.url).pathname}`,
      outcome: 'refused',
      content: { required_roles: roles, held_roles: got.session.roles }
    });
    return {
      error: c.json({
        error: 'not_permitted',
        required_roles: roles,
        held_roles: got.session.roles,
        rule: `This act is reserved to ${roles.join(' or ')}. A denied request leaves the protected state unchanged.`
      }, 403)
    };
  }
  return got;
}

/** Four answers are complete sets by contract and refuse a page. */
export function refusePagination(c) {
  const url = new URL(c.req.url);
  for (const p of ['page', 'limit', 'offset', 'cursor']) {
    if (url.searchParams.has(p)) {
      return c.json({
        error: 'pagination_refused',
        parameter: p,
        rule: 'This answer is a complete set by contract. A caller handed a page resolves a page and believes the work is finished.'
      }, 400);
    }
  }
  return null;
}

export function refused(c, body, status = 409) {
  return c.json(body, status);
}

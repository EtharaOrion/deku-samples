import { verifyToken, sessionFor } from './auth.js';
import { pool, tx } from '../db/pool.js';
import { appendEntry, hashBody } from './record.js';

/** A refusal is an ordinary answer with a shape: what was refused and what
 *  would change it. The client renders it as an inline banner.
 *
 *  A refusal is recorded as well as a success, but it cannot be recorded inside
 *  the transaction that refused: that transaction rolls back and takes the
 *  entry with it. So the entry rides on the refusal and is appended afterwards,
 *  in a transaction of its own, by the error handler. */
export class Refusal extends Error {
  constructor(status, body) {
    super(body.error || 'refused');
    this.status = status;
    this.body = body;
    this.entry = null;
  }

  /** Attach the record entry this refusal should leave behind. */
  recording(entry) {
    this.entry = { outcome: 'refused', ...entry };
    return this;
  }
}

export function refuse(status, error, detail, extra = {}) {
  return new Refusal(status, { error, detail, ...extra });
}

export async function attachSession(c, next) {
  const header = c.req.header('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null;
  const claims = verifyToken(token);
  if (claims?.email) {
    const session = await sessionFor(claims.email, claims.roles);
    if (session) c.set('session', session);
  }
  await next();
}

export function requireSession(c) {
  const s = c.get('session');
  if (!s) throw refuse(401, 'authentication_required', 'This route needs a session. Sign in first.');
  return s;
}

/** Authorization is decided on the server for every mutating route, and a
 *  denied request leaves the protected state unchanged: the check runs before
 *  the transaction opens, never inside it. */
export function requireRole(c, ...roles) {
  const s = requireSession(c);
  if (!roles.some((r) => s.roles.includes(r))) {
    throw refuse(403, 'role_required', `This act is reserved for ${roles.join(' or ')}. Your roles: ${s.roles.join(', ') || 'none'}.`, {
      required_roles: roles,
      held_roles: s.roles
    });
  }
  return s;
}

/** An auditor reads everything inside an agreed scope, exports and annotates,
 *  and writes no operational record at any route. */
export function refuseAuditorWrite(c) {
  const s = c.get('session');
  if (s && s.roles.includes('auditor') && s.roles.length === 1) {
    throw refuse(403, 'auditor_reads_only', 'An auditor reads, exports and annotates, and writes no operational record at any route.');
  }
}

export function requireSite(session, site) {
  if (!session.sites.includes(site)) {
    throw refuse(403, 'site_out_of_scope', `Your grant does not cover ${site}. It covers ${session.sites.join(', ') || 'no site'}.`, {
      site, scope: session.sites
    });
  }
}

/** An Idempotency-Key is scoped to the route it was sent to and to the body it
 *  was sent with. A write with no key at all is refused, so a retry can never
 *  be indistinguishable from a second act. */
export async function idempotent(c, routeKey, body, work) {
  const key = c.req.header('idempotency-key');
  if (!key) {
    throw refuse(400, 'idempotency_key_required',
      'Every write carries an Idempotency-Key header, so a retry is never indistinguishable from a second act.');
  }
  const bodyHash = hashBody(body ?? {});
  const existing = await pool.query(
    'SELECT body_hash, status, response FROM idempotency WHERE key = $1 AND route = $2', [key, routeKey]
  );
  if (existing.rows.length) {
    const row = existing.rows[0];
    if (row.body_hash !== bodyHash) {
      // A key is a promise about one act, not a licence to replace it.
      throw refuse(409, 'idempotency_key_reuse',
        'This Idempotency-Key was already used on this route with a different body. Nothing was created.');
    }
    return { status: row.status, body: row.response, replayed: true };
  }
  const result = await work();
  await pool.query(
    `INSERT INTO idempotency (key, route, body_hash, status, response) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (key, route) DO NOTHING`,
    [key, routeKey, bodyHash, result.status, JSON.stringify(result.body)]
  );
  return result;
}

/** A refusal is recorded as well as a success, and it is recorded in a
 *  transaction of its own. An entry written inside the transaction that refused
 *  would roll back with it, so the refusal would be invisible and the sequence
 *  would gain a gap where the rolled-back act had been. */
export async function recordRefusal(entry) {
  try {
    await tx((client) => appendEntry(client, { ...entry, outcome: 'refused' }));
  } catch (e) {
    // The record must not turn a refusal into a five hundred.
    console.error('[record] a refusal could not be recorded', e?.message);
  }
}

export function nowIso() {
  return new Date().toISOString();
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

/** A scoped read answers read_at, the moment the read saw, so a reader knows
 *  which state was consistent. */
export async function consistentRead(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const out = await fn(client);
    const at = await client.query('SELECT now() AS n');
    await client.query('COMMIT');
    return { ...out, read_at: at.rows[0].n.toISOString() };
  } finally {
    client.release();
  }
}

/** Four answers are complete sets by contract, and each refuses a paging
 *  parameter rather than honouring it or ignoring it. A caller handed a page
 *  resolves a page and believes the work is finished. */
export function refusePaging(c) {
  const url = new URL(c.req.url);
  for (const p of ['page', 'limit', 'offset', 'cursor']) {
    if (url.searchParams.has(p)) {
      throw refuse(400, 'complete_set_only',
        `This answer is a complete set by contract and does not page. Remove the "${p}" parameter.`, { parameter: p });
    }
  }
}

/** No route accepts a recycled-content percentage, a carbon value or a loss
 *  figure from a caller. Every one of them is computed. */
const COMPUTED_ONLY = [
  'content_bp', 'recycled_content_bp', 'percentage', 'percent', 'losses_g', 'loss_g',
  'value_mg_per_kg', 'carbon_mg_per_kg', 'emissions_mg_per_kg', 'credits_available_g',
  'dry_mass_g', 'share_bp', 'claim_share_g', 'emissions_share_mg', 'yield_bp',
  'primary_share_bp', 'required_remaining_bp', 'running_content_bp', 'uncommitted_kg'
];

export function refuseComputedInputs(body) {
  if (!body || typeof body !== 'object') return;
  for (const field of COMPUTED_ONLY) {
    if (field in body) {
      throw refuse(400, 'figure_is_computed',
        `${field} is computed from the record and is never accepted from a caller.`, { field });
    }
  }
}

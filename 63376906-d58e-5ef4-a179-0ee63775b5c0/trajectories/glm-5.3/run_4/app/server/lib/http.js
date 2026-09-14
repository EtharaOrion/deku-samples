// Shared HTTP helpers: idempotency, record entries, auth context.
import { q } from '../db.js';
import { sha256, nowIso } from './util.js';
import { withRecordLock, appendEntry } from './record.js';

export class Refused extends Error {
  constructor(status, body) {
    super(typeof body === 'string' ? body : (body.error || 'refused'));
    this.status = status;
    this.body = body;
  }
}

export function refuse(status, error, extra = {}) {
  throw new Refused(status, { error, ...extra });
}

export async function readBody(c) {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
}

// Idempotency: a key is scoped to route + body.
export async function idempotent(c, fn, status = 201) {
  const key = c.req.header('idempotency-key');
  const route = c.req.path;
  const body = await c.req.raw.clone().text().catch(() => '');
  if (!key) refuse(400, 'idempotency_key_required', { message: 'A write without an Idempotency-Key is refused, so a retry can never be indistinguishable from a second act.' });
  const bodyHash = sha256(body);
  const existing = await q('SELECT * FROM idempotency WHERE key=$1 AND route=$2', [key, route]);
  if (existing.rows.length) {
    const row = existing.rows[0];
    if (row.body_hash !== bodyHash) {
      refuse(409, 'idempotency_key_reuse', { message: 'A key is a promise about one act, not a licence to replace it.' });
    }
    return c.json(row.response, row.status);
  }
  let result;
  try {
    result = await fn();
  } catch (e) {
    throw e;
  }
  await q('INSERT INTO idempotency (key, route, body_hash, status, response) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
    [key, route, bodyHash, status, JSON.stringify(result)]);
  return c.json(result, status);
}

export async function record(c, fields) {
  const user = c.get('user');
  return withRecordLock(() =>
    appendEntry({
      person: user ? user.email : (fields.person || 'anonymous'),
      site: fields.site || null,
      object: fields.object || null,
      act: fields.act,
      payload: fields.payload || {},
      event_at: fields.event_at || nowIso(),
      effective_on: fields.effective_on || nowIso().slice(0, 10),
      kind: fields.kind || 'act',
      refused: fields.refused || false,
      outcome: fields.outcome || null
    })
  );
}

export async function recordTx(client, fields) {
  const user = fields.user;
  return appendEntry({
    person: (user && user.email) || fields.person || 'system',
    site: fields.site || null,
    object: fields.object || null,
    act: fields.act,
    payload: fields.payload || {},
    event_at: fields.event_at || nowIso(),
    effective_on: fields.effective_on || nowIso().slice(0, 10),
    kind: fields.kind || 'act',
    refused: fields.refused || false,
    outcome: fields.outcome || null
  }, client);
}

export function user(c) {
  return c.get('user');
}

export function requireKeys(body, keys) {
  for (const k of keys) {
    if (body[k] === undefined || body[k] === null || body[k] === '') {
      refuse(400, 'missing_field', { field: k });
    }
  }
}

export function intOr(v, dflt = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : dflt;
}

// Reject any pagination on complete-set routes.
export function refusePagination(c) {
  for (const p of ['page', 'limit', 'offset', 'cursor']) {
    if (c.req.query(p) !== undefined) refuse(400, 'pagination_refused', { parameter: p, message: 'This query answers a complete set.' });
  }
}

export function readAt() {
  return nowIso();
}

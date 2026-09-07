import crypto from 'node:crypto';
import { pool, one } from './db.js';
import { appendEntry } from './record.js';
import { stableStringify } from './record.js';

export class Refusal extends Error {
  constructor(status, rule, extra) {
    super(rule);
    this.status = status;
    this.rule = rule;
    this.extra = extra || {};
  }
}

export const refuse = (status, rule, extra) => {
  throw new Refusal(status, rule, extra);
};

export function requireSession(c) {
  const s = c.get('session');
  if (!s) refuse(401, 'authentication_required', { message: 'This act requires a session.' });
  return s;
}

export function requireRole(c, ...roles) {
  const s = requireSession(c);
  if (!roles.includes(s.role)) {
    refuse(403, 'role_not_permitted', {
      message: `This act is reserved for ${roles.join(' or ')}. The session holds ${s.role}.`,
      required_roles: roles,
      held_role: s.role,
    });
  }
  return s;
}

// An auditor writes no operational record, at any route.
export function refuseAuditorWrite(c) {
  const s = c.get('session');
  if (s && s.role === 'auditor') {
    refuse(403, 'auditor_writes_no_operational_record', {
      message: 'An auditor reads, exports and annotates, and writes no operational record at any route.',
    });
  }
}

export const bodyHash = (body) =>
  crypto.createHash('sha256').update(stableStringify(body ?? {})).digest('hex');

// An Idempotency-Key is scoped to the route it was sent to and to the body it
// was sent with. A write with no key at all is refused.
export async function idempotent(c, body, handler) {
  const key = c.req.header('idempotency-key');
  const route = new URL(c.req.url).pathname;
  if (!key) {
    refuse(400, 'idempotency_key_required', {
      message: 'Every write carries an Idempotency-Key header, so a retry can never be indistinguishable from a second act.',
    });
  }
  const hash = bodyHash(body);
  const existing = await one('SELECT * FROM idempotency WHERE key = $1 AND route = $2', [key, route]);
  if (existing) {
    if (existing.body_hash !== hash) {
      refuse(409, 'idempotency_key_reuse', {
        message: 'A key is a promise about one act, not a licence to replace it. This key was sent with a different body.',
      });
    }
    return { status: existing.status, body: existing.response, replayed: true };
  }
  const result = await handler();
  await pool.query(
    `INSERT INTO idempotency (key, route, body_hash, status, response) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (key, route) DO NOTHING`,
    [key, route, hash, result.status || 201, JSON.stringify(result.body)]
  );
  return result;
}

export async function record(c, e) {
  const s = c.get('session');
  return appendEntry(null, {
    actor: e.actor || s?.identifier || s?.email || 'anonymous',
    site: e.site ?? null,
    action: e.action,
    object_kind: e.object_kind,
    object_ref: e.object_ref,
    outcome: e.outcome || 'success',
    content: e.content || {},
  });
}

export function refuseParams(c) {
  const url = new URL(c.req.url);
  for (const p of ['page', 'limit', 'offset', 'cursor']) {
    if (url.searchParams.has(p)) {
      refuse(400, 'complete_set_is_not_paginated', {
        message: `This answer is a complete set by contract and refuses ${p}. A caller handed a page resolves a page and believes the work is finished.`,
        parameter: p,
      });
    }
  }
}

// No route accepts a percentage, a carbon value or a loss figure from a caller.
const FORBIDDEN_INPUT = [
  'content_bp', 'recycled_content_bp', 'percentage', 'percent', 'recycled_content',
  'value_mg_per_kg', 'carbon_value', 'carbon_mg_per_kg', 'losses_g', 'loss_g',
  'yield_bp', 'share_bp', 'credit_granted_g', 'dry_mass_g',
];
export function refuseComputedInput(body, allow = []) {
  const walk = (v, path) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
    for (const [k, val] of Object.entries(v)) {
      if (FORBIDDEN_INPUT.includes(k) && !allow.includes(k)) {
        refuse(400, 'computed_figure_not_accepted', {
          message: `No route accepts ${k} from a caller. Every one of them is computed.`,
          field: k,
        });
      }
      walk(val, path ? `${path}.${k}` : k);
    }
  };
  walk(body, '');
}

export function requireInteger(body, field, { min = 0, required = true } = {}) {
  const v = body?.[field];
  if (v === undefined || v === null) {
    if (required) refuse(400, 'field_required', { message: `${field} is required.`, field });
    return null;
  }
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    refuse(400, 'integer_required', {
      message: `${field} is an integer; no figure crosses the wire as a decimal.`, field,
    });
  }
  if (v < min) refuse(400, 'out_of_range', { message: `${field} must be at least ${min}.`, field });
  return v;
}

export function requireOneOf(body, field, values, { required = true } = {}) {
  const v = body?.[field];
  if (v === undefined || v === null || v === '') {
    if (required) refuse(400, 'field_required', {
      message: `${field} is required and has no default.`, field, permitted: values,
    });
    return null;
  }
  if (!values.includes(v)) {
    refuse(400, 'value_not_permitted', {
      message: `${field} must be one of ${values.join(', ')}.`, field, permitted: values,
    });
  }
  return v;
}

let counters = {};
export async function nextReference(prefix, width = 4) {
  const r = await pool.query(
    `INSERT INTO app_meta (key, value) VALUES ($1, '1')
     ON CONFLICT (key) DO UPDATE SET value = (app_meta.value::bigint + 1)::text
     RETURNING value`, ['seq:' + prefix]);
  return `${prefix}-${String(r.rows[0].value).padStart(width, '0')}`;
}

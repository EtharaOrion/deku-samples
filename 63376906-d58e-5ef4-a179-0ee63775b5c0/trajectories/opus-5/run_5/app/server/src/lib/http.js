import crypto from 'node:crypto';
import { pool, withNamedLock } from './db.js';
import { appendEntry } from './record.js';
import { refuse } from './refusal.js';

export { Refusal, refuse } from './refusal.js';

export function bodyHash(body) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(body ?? null))).digest('hex');
}

function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = canonical(v[k]);
    return out;
  }
  return v;
}

// An Idempotency-Key is scoped to the route it was sent to and to the body it
// was sent with. Same key + same body replays; same key + different body is 409.
export async function withIdempotency(c, route, body, fn) {
  const key = c.req.header('idempotency-key') || c.req.header('Idempotency-Key');
  if (!key) {
    throw refuse(400, 'idempotency_key_required', 'Every write carries a client-supplied Idempotency-Key header, so a retry can never be indistinguishable from a second act.');
  }
  const hash = bodyHash(body);
  // The whole guard runs under a lock on the key and the route. Looking up the
  // key, performing the act and recording the result have to be one indivisible
  // act: a retry that arrives while the original is still in flight would
  // otherwise find nothing recorded yet and perform the work a second time,
  // which is exactly what the key exists to prevent.
  return withNamedLock(`idem:${route}:${key}`, async () => {
    const existing = await pool.query('select * from idempotency where key = $1 and route = $2', [key, route]);
    if (existing.rows.length) {
      const row = existing.rows[0];
      if (row.body_hash !== hash) {
        throw refuse(409, 'idempotency_key_reuse', 'A key is a promise about one act, not a licence to replace it. This key was already used on this route with a different body.', { key });
      }
      return { status: row.status, body: row.response, replayed: true };
    }
    const result = await fn();
    const status = result.status || 200;
    await pool.query(
      'insert into idempotency (key, route, body_hash, status, response) values ($1,$2,$3,$4,$5) on conflict (key, route) do nothing',
      [key, route, hash, status, JSON.stringify(result.body)],
    );
    return { status, body: result.body, replayed: false };
  });
}

export async function recordRefusal(session, act, objectKind, objectRef, detail, site) {
  try {
    await appendEntry(null, {
      act,
      person: session?.email || null,
      person_id: session?.person_id || null,
      site: site || null,
      object_kind: objectKind,
      object_ref: objectRef,
      outcome: 'refused',
      content: detail,
    });
  } catch {
    /* the refusal answer matters more than its entry */
  }
}

export function noPaging(c) {
  const url = new URL(c.req.url);
  for (const p of ['page', 'limit', 'offset', 'cursor']) {
    if (url.searchParams.has(p)) {
      throw refuse(400, 'paging_refused', `This answer is a complete set by contract and refuses '${p}'. A caller handed a page resolves a page and believes the work is finished.`, { parameter: p });
    }
  }
}

export function readAt() {
  return new Date().toISOString();
}

export function newRef(prefix) {
  const n = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${n}`;
}

// The next reference in a prefix's own numeric run, allocated atomically.
//
// Reading the highest existing reference and adding one is not safe when two
// acts land at once: both read the same highest value and one loses on the
// primary key. Instead a single conditional UPDATE takes the row lock,
// increments and returns, so two concurrent creates take two references.
//
// The counter is seeded on first use from the references already in the table,
// so a run that began before this existed continues rather than restarting.
// Only references that are the prefix followed by digits count, so a reference
// like CRM-TRF-0001-OUT never advances the CRM-0001 series.
export async function nextRef(prefix, table, column = 'reference', width = 4) {
  // Seeding takes no lock, deliberately. This runs inside an act that already
  // holds an idempotency lock, and asking for a second lock connection while
  // holding the first is a deadlock waiting for enough concurrent callers:
  // every connection in the lock pool ends up held by a caller waiting for one.
  //
  // No lock is needed. Two racers both read the same committed maximum and both
  // compute the same seed, so ON CONFLICT DO NOTHING makes the loser's insert a
  // no-op rather than a conflict. Only the increment below has to be atomic, and
  // it is a single statement.
  const seeded = await pool.query('select 1 from reference_sequence where prefix = $1', [prefix]);
  if (!seeded.rows.length) {
    const { rows } = await pool.query(
      `select ${column} as r from ${table} where ${column} ~ $1 order by length(${column}) desc, ${column} desc limit 1`,
      [`^${escapeRegex(prefix)}[0-9]+$`],
    );
    const last = rows[0]?.r;
    const from = last ? Number(String(last).slice(prefix.length)) : 0;
    await pool.query('insert into reference_sequence (prefix, last_n) values ($1, $2) on conflict (prefix) do nothing', [prefix, from]);
  }
  // One statement: it takes the row lock, increments and returns.
  const bumped = await pool.query('update reference_sequence set last_n = last_n + 1 where prefix = $1 returning last_n', [prefix]);
  const n = Number(bumped.rows[0].last_n);
  return `${prefix}${String(n).padStart(width, '0')}`;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

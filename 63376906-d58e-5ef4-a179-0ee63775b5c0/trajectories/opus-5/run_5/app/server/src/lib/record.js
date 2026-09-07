import crypto from 'node:crypto';
import { pool, poolRunner } from './db.js';

export const ZERO_DIGEST = '0'.repeat(64);

// The moment is canonicalised to a single ISO form, so a digest computed at
// write time and a digest recomputed on read are computed over the same bytes.
export function canonicalMoment(m) {
  if (!m) return null;
  const d = m instanceof Date ? m : new Date(m);
  return d.toISOString();
}

// Keys are sorted deeply, because postgres normalises jsonb key order and a
// digest has to survive the round trip through storage unchanged.
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
    return out;
  }
  return v;
}

export function digestOf(entry, prev_digest) {
  const canonical = JSON.stringify({
    act: entry.act,
    person: entry.person || null,
    person_id: entry.person_id || null,
    moment: canonicalMoment(entry.moment),
    site: entry.site || null,
    object_kind: entry.object_kind || null,
    object_ref: entry.object_ref || null,
    outcome: entry.outcome || 'success',
    content: sortDeep(entry.content ?? null),
  });
  return crypto.createHash('sha256').update(`${prev_digest}|${canonical}`).digest('hex');
}

const CHAIN_LOCK = 918273645;

// The chain is a chain only if reading the previous digest and writing the next
// entry are one indivisible act. A pg_advisory_xact_lock taken on the pool is
// useless: postgres wraps a lone statement in its own implicit transaction and
// releases the lock the instant that statement ends, so two concurrent appends
// would both read the same previous digest and both write it as their own
// prev_digest, breaking the chain. The lock must therefore be held inside a
// real transaction that spans the read and the insert.
async function appendLocked(client, entry) {
  await client.query(`select pg_advisory_xact_lock(${CHAIN_LOCK})`);
  const prevRow = await client.query('select digest from record_entry order by seq desc limit 1');
  const prev = prevRow.rows[0]?.digest || ZERO_DIGEST;
  const moment = entry.moment || new Date().toISOString();
  const digest = digestOf({ ...entry, moment }, prev);
  const reference = entry.reference || `REC-${crypto.randomUUID()}`;
  const res = await client.query(
    `insert into record_entry (reference, act, person, person_id, moment, site, object_kind, object_ref, outcome, content, digest, prev_digest, anchor)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning seq, digest, prev_digest, reference`,
    [
      reference,
      entry.act,
      entry.person || null,
      entry.person_id || null,
      moment,
      entry.site || null,
      entry.object_kind || null,
      entry.object_ref || null,
      entry.outcome || 'success',
      entry.content ? JSON.stringify(entry.content) : null,
      digest,
      prev,
      entry.anchor || null,
    ],
  );
  return res.rows[0];
}

// Every act is an entry. A caller already inside a transaction hands its client
// in, and the lock lives for the rest of that transaction. A caller with no
// transaction gets one of its own.
export async function appendEntry(client, entry) {
  if (client) return appendLocked(client, entry);
  const own = await pool.connect();
  try {
    await own.query('BEGIN');
    const row = await appendLocked(own, entry);
    await own.query('COMMIT');
    return row;
  } catch (e) {
    try {
      await own.query('ROLLBACK');
    } catch {
      /* the connection is already gone */
    }
    throw e;
  } finally {
    own.release();
  }
}

export async function checkChain(runner = poolRunner) {
  const { rows } = await runner.query(
    'select seq, act, person, person_id, moment, site, object_kind, object_ref, outcome, content, digest, prev_digest, content_deleted from record_entry order by seq asc',
  );
  let prev = ZERO_DIGEST;
  let expectedSeq = null;
  for (const r of rows) {
    if (expectedSeq !== null && Number(r.seq) !== expectedSeq + 1) {
      return { holds: false, first_failure: { seq: Number(r.seq), reason: 'sequence_gap', expected_seq: expectedSeq + 1 }, entries: rows.length };
    }
    expectedSeq = Number(r.seq);
    if (r.prev_digest !== prev) {
      return { holds: false, first_failure: { seq: Number(r.seq), reason: 'prev_digest_mismatch' }, entries: rows.length };
    }
    if (!r.content_deleted) {
      const recomputed = digestOf(
        {
          act: r.act,
          person: r.person,
          person_id: r.person_id,
          moment: r.moment,
          site: r.site,
          object_kind: r.object_kind,
          object_ref: r.object_ref,
          outcome: r.outcome,
          content: r.content,
        },
        prev,
      );
      if (recomputed !== r.digest) {
        return { holds: false, first_failure: { seq: Number(r.seq), reason: 'digest_mismatch' }, entries: rows.length };
      }
    }
    prev = r.digest;
  }
  return { holds: true, first_failure: null, entries: rows.length };
}

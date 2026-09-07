import crypto from 'node:crypto';
import { pool } from './db.js';

const ZERO = '0'.repeat(64);

// stable stringify: jsonb does not preserve key order, so the digest must not depend on it
function stable(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function digestOf(entry, prevDigest) {
  const canonical = stable({
    at: new Date(entry.at).toISOString(),
    person: entry.person ?? null,
    site: entry.site ?? null,
    object_kind: entry.object_kind,
    object_ref: entry.object_ref ?? null,
    action: entry.action,
    content: entry.content ?? null,
  });
  return crypto.createHash('sha256').update(prevDigest + canonical).digest('hex');
}

// The chain is a single sequence, so two appends landing at once must not read the
// same predecessor. An advisory lock serialises the read-then-write.
const CHAIN_LOCK = 8877771;

async function appendWithin(runner, entry) {
  await runner.query('SELECT pg_advisory_xact_lock($1)', [CHAIN_LOCK]);
  const prev = await runner.query('SELECT digest FROM record_entry ORDER BY seq DESC LIMIT 1');
  const prevDigest = prev.rows[0]?.digest || ZERO;
  const at = entry.at || new Date().toISOString();
  const digest = digestOf({ ...entry, at }, prevDigest);
  const r = await runner.query(
    `INSERT INTO record_entry (at, person, site, object_kind, object_ref, action, content, digest, prev_digest, scheme_months, statutory_months)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING seq, digest, prev_digest, at`,
    [at, entry.person ?? null, entry.site ?? null, entry.object_kind, entry.object_ref ?? null,
      entry.action, entry.content ?? null, digest, prevDigest, entry.scheme_months ?? 120, entry.statutory_months ?? 84]
  );
  return r.rows[0];
}

// The record is append-only. Every act — success or refusal — is an entry, and each
// digest is computed over the entry's own content and the previous entry's digest.
export async function appendEntry(client, entry) {
  if (client) return appendWithin(client, entry);
  const own = await pool.connect();
  try {
    await own.query('BEGIN');
    const row = await appendWithin(own, entry);
    await own.query('COMMIT');
    return row;
  } catch (e) {
    await own.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    own.release();
  }
}

export async function recomputeChainCheck() {
  const { rows } = await pool.query('SELECT * FROM record_entry ORDER BY seq ASC');
  let prevDigest = ZERO;
  let expectedSeq = 1;
  for (const row of rows) {
    if (Number(row.seq) !== expectedSeq) {
      return { holds: false, checked: rows.length, first_failure: { seq: Number(row.seq), reason: 'sequence_gap', expected_seq: expectedSeq } };
    }
    expectedSeq += 1;
    if (row.prev_digest !== prevDigest) {
      return { holds: false, checked: rows.length, first_failure: { seq: Number(row.seq), reason: 'prev_digest_mismatch' } };
    }
    if (!row.content_deleted) {
      const d = digestOf({
        at: row.at instanceof Date ? row.at.toISOString() : row.at,
        person: row.person, site: row.site, object_kind: row.object_kind,
        object_ref: row.object_ref, action: row.action, content: row.content,
      }, prevDigest);
      if (d !== row.digest) {
        return { holds: false, checked: rows.length, first_failure: { seq: Number(row.seq), reason: 'digest_mismatch' } };
      }
    }
    prevDigest = row.digest;
  }
  return { holds: true, checked: rows.length, first_failure: null };
}

export { ZERO as ZERO_DIGEST, digestOf };

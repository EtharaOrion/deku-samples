import { createHash } from 'node:crypto';
import { pool } from './db.js';

export const ZERO_DIGEST = '0'.repeat(64);

function canonical(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function entryDigest(entry, prevDigest) {
  const payload = canonical({
    act: entry.act,
    person: entry.person ?? null,
    at: entry.at,
    site: entry.site ?? null,
    object_kind: entry.object_kind ?? null,
    object_ref: entry.object_ref ?? null,
    content: entry.content ?? null,
    outcome: entry.outcome ?? 'success'
  });
  return createHash('sha256').update(prevDigest + '\n' + payload).digest('hex');
}

/**
 * Append one entry. Every act is an entry with the person, the moment, the site and the
 * object. A refusal is recorded as well as a success. Entries are never edited or removed.
 * Serialised on an advisory lock so the chain has one order.
 */
export async function append(client, entry) {
  // The lock, the read of the previous digest and the insert must be one transaction.
  // Taken separately, two appends landing at once read the same prev_digest and the chain
  // no longer verifies. When a caller already holds a transaction, we join theirs.
  if (client) return appendWithin(client, entry);
  const own = await pool.connect();
  try {
    await own.query('BEGIN');
    const row = await appendWithin(own, entry);
    await own.query('COMMIT');
    return row;
  } catch (err) {
    await own.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    own.release();
  }
}

async function appendWithin(runner, entry) {
  // Held to the end of the transaction, so the chain has exactly one order.
  await runner.query('SELECT pg_advisory_xact_lock(918273645)');
  const prev = await runner.query('SELECT digest FROM record_entry ORDER BY seq DESC LIMIT 1');
  const prevDigest = prev.rows[0]?.digest || ZERO_DIGEST;
  // The moment is normalised to one representation before it is digested, so the digest
  // recomputed on read is taken over the same bytes the digest on write was taken over.
  const at = new Date(entry.at || Date.now()).toISOString();
  // The content is digested as the bytes that are actually stored. A value that JSON
  // renders differently from its in-memory shape — a Date is the one that bites — would
  // otherwise digest one way on write and another on read, and the chain would not verify.
  const content = entry.content === undefined || entry.content === null
    ? null
    : JSON.parse(JSON.stringify(entry.content));
  const normalised = { ...entry, at, content };
  const digest = entryDigest(normalised, prevDigest);
  const res = await runner.query(
    `INSERT INTO record_entry (act, person, person_id, at, site, object_kind, object_ref, content, outcome, digest, prev_digest)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING seq, digest`,
    [
      normalised.act,
      normalised.person || null,
      normalised.person_id || null,
      at,
      normalised.site || null,
      normalised.object_kind || null,
      normalised.object_ref || null,
      normalised.content ? JSON.stringify(normalised.content) : null,
      normalised.outcome || 'success',
      digest,
      prevDigest
    ]
  );
  // The lock is an xact lock: it is released when the transaction ends.
  return res.rows[0];
}

/** Walks the chain and answers holds, with first_failure naming where it breaks. */
export async function checkChain() {
  const { rows } = await pool.query(
    `SELECT seq, act, person, at, site, object_kind, object_ref, content, outcome, digest,
            prev_digest, content_deleted
     FROM record_entry ORDER BY seq ASC`
  );
  let prevDigest = ZERO_DIGEST;
  let expectedSeq = null;
  for (const row of rows) {
    if (expectedSeq !== null && Number(row.seq) !== expectedSeq) {
      return { holds: false, entries: rows.length, first_failure: { seq: Number(row.seq), reason: 'sequence_gap', expected_seq: expectedSeq } };
    }
    expectedSeq = Number(row.seq) + 1;
    if (row.prev_digest !== prevDigest) {
      return { holds: false, entries: rows.length, first_failure: { seq: Number(row.seq), reason: 'prev_digest_mismatch' } };
    }
    // An expired entry keeps its position and its digest; its content is gone, so the
    // digest is taken on trust from the chain rather than recomputed from absent content.
    if (!row.content_deleted) {
      const recomputed = entryDigest(
        {
          act: row.act,
          person: row.person,
          at: new Date(row.at).toISOString(),
          site: row.site,
          object_kind: row.object_kind,
          object_ref: row.object_ref,
          content: row.content,
          outcome: row.outcome
        },
        prevDigest
      );
      if (recomputed !== row.digest) {
        return { holds: false, entries: rows.length, first_failure: { seq: Number(row.seq), reason: 'digest_mismatch' } };
      }
    }
    prevDigest = row.digest;
  }
  return { holds: true, entries: rows.length, first_failure: null };
}

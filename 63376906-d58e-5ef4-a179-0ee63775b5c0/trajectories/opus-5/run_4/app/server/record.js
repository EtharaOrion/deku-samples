import { pool } from './db.js';
import { sha256, stableStringify, ZERO_DIGEST } from './util.js';

const RECORD_LOCK = 918273645;

function digestFor(entry, prev) {
  return sha256(
    stableStringify({
      seq: entry.seq,
      act: entry.act,
      person: entry.person,
      site: entry.site ?? null,
      object_kind: entry.object_kind ?? null,
      object_ref: entry.object_ref ?? null,
      at: entry.at,
      outcome: entry.outcome,
      content: entry.content ?? null,
    }) + '|' + prev
  );
}

/**
 * Append one entry. Every act is an entry: a success and a refusal alike.
 * Runs inside the caller's client when one is given, so the entry lands with
 * the act or neither lands.
 */
export async function appendEntry(client, e) {
  if (!client) {
    // Without a caller's transaction the entry takes one of its own, so the
    // sequence number and the digest are decided under the same lock.
    const own = await pool.connect();
    try {
      await own.query('BEGIN');
      const out = await appendEntry(own, e);
      await own.query('COMMIT');
      return out;
    } catch (err) {
      await own.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      own.release();
    }
  }
  const c = client;
  await c.query('SELECT pg_advisory_xact_lock($1)', [RECORD_LOCK]);
  const { rows } = await c.query(
    'SELECT seq, digest FROM record_entry ORDER BY seq DESC LIMIT 1'
  );
  const prev = rows[0] ? rows[0].digest : ZERO_DIGEST;
  const seq = rows[0] ? Number(rows[0].seq) + 1 : 1;
  const at = e.at || new Date().toISOString();
  const entry = {
    seq,
    act: e.act,
    person: e.person || 'system',
    site: e.site ?? null,
    object_kind: e.object_kind ?? null,
    object_ref: e.object_ref ?? null,
    at: new Date(at).toISOString(),
    outcome: e.outcome || 'success',
    content: e.content ?? null,
  };
  const digest = digestFor(entry, prev);
  await c.query(
    `INSERT INTO record_entry (seq, act, person, site, object_kind, object_ref, at, outcome, content, digest, prev_digest, corrects)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      entry.seq, entry.act, entry.person, entry.site, entry.object_kind, entry.object_ref,
      entry.at, entry.outcome, entry.content, digest, prev, e.corrects ?? null,
    ]
  );
  return { ...entry, digest, prev_digest: prev };
}

export async function checkChain() {
  const { rows } = await pool.query(
    'SELECT * FROM record_entry ORDER BY seq ASC'
  );
  let prev = ZERO_DIGEST;
  let expected = 1;
  for (const r of rows) {
    if (Number(r.seq) !== expected) {
      return { holds: false, first_failure: { seq: Number(r.seq), reason: 'gap_in_sequence', expected_seq: expected }, entries: rows.length };
    }
    if (r.prev_digest !== prev) {
      return { holds: false, first_failure: { seq: Number(r.seq), reason: 'prev_digest_mismatch' }, entries: rows.length };
    }
    // An expired entry keeps its stored digest: its content is gone but its
    // position and its digest survive so the chain still holds.
    if (!r.content_deleted_on) {
      const d = digestFor(
        {
          seq: Number(r.seq), act: r.act, person: r.person, site: r.site,
          object_kind: r.object_kind, object_ref: r.object_ref,
          at: new Date(r.at).toISOString(), outcome: r.outcome, content: r.content,
        },
        prev
      );
      if (d !== r.digest) {
        return { holds: false, first_failure: { seq: Number(r.seq), reason: 'digest_does_not_verify' }, entries: rows.length };
      }
    }
    prev = r.digest;
    expected++;
  }
  return { holds: true, first_failure: null, entries: rows.length, head_digest: prev };
}

export function shapeEntry(r) {
  return {
    seq: Number(r.seq),
    act: r.act,
    person: r.person,
    site: r.site,
    object_kind: r.object_kind,
    object_ref: r.object_ref,
    at: new Date(r.at).toISOString(),
    outcome: r.outcome,
    content: r.content_deleted_on ? null : r.content,
    content_deleted_on: r.content_deleted_on ? String(r.content_deleted_on).slice(0, 10) : null,
    content_state: r.content_deleted_on
      ? `Content deleted under retention on ${String(r.content_deleted_on).slice(0, 10)}.`
      : 'present',
    corrects: r.corrects ? Number(r.corrects) : null,
    digest: r.digest,
    prev_digest: r.prev_digest,
  };
}

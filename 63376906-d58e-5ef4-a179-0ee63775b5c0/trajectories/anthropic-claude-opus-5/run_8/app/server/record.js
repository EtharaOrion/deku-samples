import { createHash } from 'node:crypto';
import { pool } from './db.js';

export const ZERO_DIGEST = '0'.repeat(64);

const canonical = (v) => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  return `{${Object.keys(v)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
    .join(',')}}`;
};

// The digest is computed over the content exactly as the column will hold it.
// A Date, a BigInt or an undefined would otherwise hash as one shape and store
// as another, and the chain would fail on its own honest rows.
export const normaliseContent = (content) =>
  content === undefined || content === null ? null : JSON.parse(JSON.stringify(content));

export function digestFor(entry, prevDigest) {
  const payload = canonical({
    act: entry.act,
    actor: entry.actor,
    site: entry.site ?? null,
    object_kind: entry.object_kind ?? null,
    object_reference: entry.object_reference ?? null,
    content: normaliseContent(entry.content),
    refused: !!entry.refused,
    occurred_at: entry.occurred_at,
  });
  return createHash('sha256').update(`${prevDigest}\n${payload}`).digest('hex');
}

// The chain is written under one lock so two acts landing together take two
// consecutive positions with no gap and no shared prev_digest.
export async function appendEntry(client, entry) {
  const runner = client || pool;
  const occurred_at = new Date(entry.occurred_at || Date.now()).toISOString();
  const own = client
    ? null
    : await pool.connect();
  const c = client || own;
  try {
    if (!client) await c.query('BEGIN');
    await c.query('select pg_advisory_xact_lock(4242)');
    const prev = await c.query(
      'select digest from record_entry order by seq desc limit 1',
    );
    const prev_digest = prev.rows[0]?.digest || ZERO_DIGEST;
    // The content is normalised once and both hashed and stored in that shape.
    const content = normaliseContent(entry.content);
    const digest = digestFor({ ...entry, content, occurred_at }, prev_digest);
    const r = await c.query(
      `insert into record_entry (act, actor, site, object_kind, object_reference, content, refused, occurred_at, digest, prev_digest)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning seq, digest, prev_digest`,
      [
        entry.act,
        entry.actor,
        entry.site ?? null,
        entry.object_kind ?? null,
        entry.object_reference ?? null,
        content,
        !!entry.refused,
        occurred_at,
        digest,
        prev_digest,
      ],
    );
    if (!client) await c.query('COMMIT');
    return r.rows[0];
  } catch (e) {
    if (!client) {
      try { await c.query('ROLLBACK'); } catch { /* already gone */ }
    }
    throw e;
  } finally {
    if (own) own.release();
  }
  void runner;
}

export async function checkChain() {
  const { rows } = await pool.query(
    'select seq, act, actor, site, object_kind, object_reference, content, refused, occurred_at, digest, prev_digest, content_deleted from record_entry order by seq asc',
  );
  let prev = ZERO_DIGEST;
  let expectedSeq = 1;
  for (const row of rows) {
    if (Number(row.seq) !== expectedSeq) {
      return {
        holds: false,
        entries: rows.length,
        first_failure: { seq: Number(row.seq), reason: 'sequence_gap', expected_seq: expectedSeq },
      };
    }
    expectedSeq += 1;
    if (row.prev_digest !== prev) {
      return {
        holds: false,
        entries: rows.length,
        first_failure: { seq: Number(row.seq), reason: 'prev_digest_mismatch' },
      };
    }
    if (!row.content_deleted) {
      const recomputed = digestFor(
        {
          act: row.act,
          actor: row.actor,
          site: row.site,
          object_kind: row.object_kind,
          object_reference: row.object_reference,
          content: row.content,
          refused: row.refused,
          occurred_at: new Date(row.occurred_at).toISOString(),
        },
        row.prev_digest,
      );
      if (recomputed !== row.digest) {
        return {
          holds: false,
          entries: rows.length,
          first_failure: { seq: Number(row.seq), reason: 'digest_mismatch' },
        };
      }
    }
    prev = row.digest;
  }
  return { holds: true, entries: rows.length, first_failure: null, checked_at: new Date().toISOString() };
}

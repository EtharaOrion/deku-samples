import { createHash } from 'node:crypto';

export const ZERO_DIGEST = '0'.repeat(64);

// Canonical form, so a digest computed at write still verifies after a jsonb round trip.
function canonical(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function normaliseMoment(v) {
  if (!v) return new Date().toISOString();
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toISOString();
}

// A digest is computed over the entry's own content and the previous entry's digest.
export function computeDigest(entry, prevDigest) {
  return createHash('sha256')
    .update(
      canonical({
        seq: Number(entry.seq),
        act: entry.act,
        person: entry.person || null,
        site: entry.site || null,
        object_kind: entry.object_kind || null,
        object_ref: entry.object_ref || null,
        outcome: entry.outcome || 'success',
        content: entry.content === undefined ? null : entry.content,
        event_at: normaliseMoment(entry.event_at),
        prev_digest: prevDigest,
      })
    )
    .digest('hex');
}

// Appends one entry. Never edits, never removes. A lock keeps the chain serial.
export async function appendEntry(client, entry) {
  await client.query('SELECT pg_advisory_xact_lock(918273645)');
  const prev = await client.query('SELECT seq, digest FROM record_entry ORDER BY seq DESC LIMIT 1');
  const prevDigest = prev.rows[0] ? prev.rows[0].digest : ZERO_DIGEST;
  const seq = prev.rows[0] ? Number(prev.rows[0].seq) + 1 : 1;
  const eventAt = normaliseMoment(entry.event_at);
  const effectiveOn = entry.effective_on || eventAt.slice(0, 10);
  const full = {
    seq,
    act: entry.act,
    person: entry.person || null,
    site: entry.site || null,
    object_kind: entry.object_kind || null,
    object_ref: entry.object_ref || null,
    outcome: entry.outcome || 'success',
    content: entry.content === undefined ? null : entry.content,
    event_at: eventAt,
  };
  const digest = computeDigest(full, prevDigest);
  await client.query(
    `INSERT INTO record_entry
       (seq, act, person, site, object_kind, object_ref, outcome, content, digest, prev_digest, event_at, effective_on, corrects)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      seq, full.act, full.person, full.site, full.object_kind, full.object_ref,
      full.outcome, full.content === null ? null : JSON.stringify(full.content),
      digest, prevDigest, eventAt, effectiveOn, entry.corrects || null,
    ]
  );
  return { seq, digest, prev_digest: prevDigest };
}

export function checkChain(rows) {
  let prevDigest = ZERO_DIGEST;
  let expectedSeq = 1;
  for (const row of rows) {
    if (Number(row.seq) !== expectedSeq) {
      return {
        holds: false,
        first_failure: { seq: Number(row.seq), reason: 'gap_in_sequence', expected_seq: expectedSeq },
      };
    }
    if (row.prev_digest !== prevDigest) {
      return { holds: false, first_failure: { seq: Number(row.seq), reason: 'prev_digest_mismatch' } };
    }
    if (!row.content_deleted) {
      const recomputed = computeDigest(
        {
          seq: Number(row.seq),
          act: row.act,
          person: row.person,
          site: row.site,
          object_kind: row.object_kind,
          object_ref: row.object_ref,
          outcome: row.outcome,
          content: row.content,
          event_at: row.event_at,
        },
        prevDigest
      );
      if (recomputed !== row.digest) {
        return { holds: false, first_failure: { seq: Number(row.seq), reason: 'digest_does_not_verify' } };
      }
    }
    prevDigest = row.digest;
    expectedSeq += 1;
  }
  return { holds: true, first_failure: null };
}

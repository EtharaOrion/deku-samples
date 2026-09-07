import crypto from 'node:crypto';

export const ZERO_DIGEST = '0'.repeat(64);

/** A digest is computed over the entry's own content and the previous entry's
 *  digest, so the chain fails visibly if any entry is edited or removed. The
 *  content is serialised with sorted keys, because a digest that depends on key
 *  order is a digest that fails for a reason nobody can explain. */
export function digestOf(entry, prevDigest) {
  const canonical = stableStringify({
    act: entry.act,
    person: entry.person ?? null,
    site: entry.site ?? null,
    object_kind: entry.object_kind ?? null,
    object_ref: entry.object_ref ?? null,
    outcome: entry.outcome ?? 'success',
    content: entry.content ?? null,
    event_at: entry.event_at,
    effective_on: entry.effective_on
  });
  return crypto.createHash('sha256').update(prevDigest + '\n' + canonical).digest('hex');
}

export function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function hashBody(body) {
  return crypto.createHash('sha256').update(stableStringify(body)).digest('hex');
}

/** A timestamp is normalised the same way at write and at read, so the digest
 *  computed over an entry is the digest that verifies over it later. Without
 *  this, "2026-01-01T08:00:00Z" and "2026-01-01T08:00:00.000Z" are the same
 *  moment and two different chains. */
export function canonicalMoment(value) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

/** Append one entry inside the caller's transaction. Every act is an entry: a
 *  refusal as well as a success.
 *
 *  The sequence number is taken explicitly under an advisory lock rather than
 *  from a serial, because a serial consumes a number even when the transaction
 *  that asked for it rolls back, and a gap in the sequence is a reportable
 *  condition. Taken this way, a rolled-back act leaves no gap behind it. */
export async function appendEntry(client, entry) {
  await client.query('SELECT pg_advisory_xact_lock(778811)');
  const prev = await client.query('SELECT seq, digest FROM record_entry ORDER BY seq DESC LIMIT 1');
  const prevDigest = prev.rows[0]?.digest || ZERO_DIGEST;
  const seq = Number(prev.rows[0]?.seq || 0) + 1;
  const eventAt = canonicalMoment(entry.event_at);
  const effectiveOn = entry.effective_on || eventAt.slice(0, 10);
  const payload = { ...entry, event_at: eventAt, effective_on: effectiveOn };
  const digest = digestOf(payload, prevDigest);
  const r = await client.query(
    `INSERT INTO record_entry (seq, act, person, site, object_kind, object_ref, outcome, content,
       digest, prev_digest, event_at, effective_on, anchor_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING seq, digest`,
    [seq, payload.act, payload.person ?? null, payload.site ?? null, payload.object_kind ?? null,
      payload.object_ref ?? null, payload.outcome ?? 'success',
      payload.content ? JSON.stringify(payload.content) : null,
      digest, prevDigest, eventAt, effectiveOn, payload.anchor_ref ?? null]
  );
  return r.rows[0];
}

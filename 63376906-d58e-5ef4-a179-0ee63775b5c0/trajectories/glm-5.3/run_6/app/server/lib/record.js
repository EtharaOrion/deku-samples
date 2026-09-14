import crypto from 'node:crypto';

export function canon(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}

export const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
export const ZERO_DIGEST = '0'.repeat(64);

export async function record(c, { kind, object_ref, actor, site, content, corrections }) {
  const prev = (await c.query(`SELECT seq, digest FROM record_entries ORDER BY seq DESC LIMIT 1`)).rows[0] || null;
  const prev_digest = prev ? prev.digest : ZERO_DIGEST;
  const payload = canon({ kind, object_ref: object_ref || null, actor: actor || null, site: site || null, content: content || {} });
  const digest = sha256(prev_digest + '\n' + payload);
  const r = await c.query(
    `INSERT INTO record_entries (actor, site, kind, object_ref, content, digest, prev_digest, corrections)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING seq, digest, prev_digest, recorded_at`,
    [actor || null, site || null, kind, object_ref || null, JSON.stringify(content || {}), digest, prev_digest, corrections || null]
  );
  return r.rows[0];
}

export function entryView(row) {
  const d = row.recorded_at instanceof Date ? row.recorded_at : new Date(row.recorded_at);
  return {
    seq: Number(row.seq),
    recorded_at: d.toISOString(),
    actor: row.actor,
    actor_identifier: row.actor,
    site: row.site,
    kind: row.kind,
    object_ref: row.object_ref,
    content: row.content_deleted
      ? { deleted: true, note: 'Content was deleted under retention on ' + isoDateOf(row.content_deleted_on) }
      : row.content,
    corrections: row.corrections || null,
    content_deleted: row.content_deleted,
    digest: row.digest,
    prev_digest: row.prev_digest
  };
}

const isoDateOf = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || '').slice(0, 10));

export async function checkChain(c) {
  const rows = (await c.query(`SELECT seq, digest, prev_digest, content, kind, object_ref, actor, site, content_deleted FROM record_entries ORDER BY seq ASC`)).rows;
  let expectedPrev = ZERO_DIGEST;
  let expectedSeq = 1;
  for (const r of rows) {
    if (Number(r.seq) !== expectedSeq) {
      return { holds: false, first_failure: { seq: expectedSeq, reason: 'gap_in_sequence' }, length: rows.length };
    }
    if (r.prev_digest !== expectedPrev) {
      return { holds: false, first_failure: { seq: Number(r.seq), reason: 'prev_digest_mismatch' }, length: rows.length };
    }
    const payload = canon({
      kind: r.kind, object_ref: r.object_ref || null, actor: r.actor || null, site: r.site || null,
      content: r.content_deleted ? { deleted: true } : r.content
    });
    if (sha256(expectedPrev + '\n' + payload) !== r.digest) {
      return { holds: false, first_failure: { seq: Number(r.seq), reason: 'digest_mismatch' }, length: rows.length };
    }
    expectedPrev = r.digest;
    expectedSeq += 1;
  }
  return { holds: true, first_failure: null, length: rows.length };
}

export async function retentionFor(c, row) {
  const hold = (await c.query(`SELECT reference FROM legal_holds WHERE seq=$1`, [row.seq])).rows[0];
  const recorded = row.recorded_at instanceof Date ? row.recorded_at : new Date(row.recorded_at);
  const scheme = new Date(recorded); scheme.setUTCMonth(scheme.getUTCMonth() + Number(row.scheme_months));
  const statutory = new Date(recorded); statutory.setUTCMonth(statutory.getUTCMonth() + Number(row.statutory_months));
  const dates = [isoDateOf(scheme), isoDateOf(statutory)];
  if (row.referenced_until) dates.push(isoDateOf(row.referenced_until));
  const retain_until = dates.sort()[dates.length - 1];
  return {
    seq: Number(row.seq),
    scheme_months: row.scheme_months,
    statutory_months: row.statutory_months,
    scheme_until: isoDateOf(scheme),
    statutory_until: isoDateOf(statutory),
    referenced_until: row.referenced_until ? isoDateOf(row.referenced_until) : null,
    retain_until,
    legal_hold: !!hold,
    legal_hold_reference: hold ? hold.reference : null,
    content_deleted: row.content_deleted
  };
}

import crypto from 'node:crypto';
import { q, one, tx } from './db.js';

export class HttpError extends Error {
  constructor(status, code, extra = {}) { super(status); this.status = status; this.code = code; this.extra = extra || {}; }
}
export const err = (status, code, extra) => { throw new HttpError(status, code, extra); };
export const digest = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
// canonical serialization: keys sorted, so a jsonb round-trip cannot change the digest input
export function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}
export const ZERO64 = '0'.repeat(64);

/** Append an entry to the append-only record. Digest over own content + previous digest. */
export async function appendEntry(kind, actorEmail, actorName, site, objectRef, summary) {
  return tx(async (x) => {
    const last = (await x(`select seq, digest from record_entry order by seq desc limit 1`))[0];
    const seq = (last ? Number(last.seq) : 0) + 1;
    const prev = last ? last.digest : ZERO64;
    const content = { kind, actor: actorEmail, actor_name: actorName || null, site: site || null, object_ref: objectRef || null, summary: summary || '' };
    const d = digest(prev + canonical(content));
    const rows = await x(
      `insert into record_entry(seq, event_at, recorded_at, effective_on, actor, actor_name, site, object_ref, kind, summary, digest, prev_digest, content)
       values ($1, now(), now(), current_date, $2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [seq, actorEmail, actorName || null, site || null, objectRef || null, kind, summary || '', d, prev, JSON.stringify(content)]
    );
    return rows[0];
  });
}
export const recordRef = (row) => 'ENT-' + String(Number(row.seq)).padStart(5, '0');

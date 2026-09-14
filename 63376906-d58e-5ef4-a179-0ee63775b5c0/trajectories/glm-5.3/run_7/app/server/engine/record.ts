// The record: append-only, digest-chained, never edited, never removed.
import type { Pool } from 'pg';
import { createHash } from 'node:crypto';

export const GENESIS = '0'.repeat(64);

// A canonical form, because postgres jsonb does not preserve key order and a
// digest must not depend on it.
export function canonicalJson(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value === undefined ? null : value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
}

export function canonicalTimestamp(v: any): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return v;
  }
  return JSON.stringify(v ?? null);
}

export function digestOf(entry: { recorded_at?: any; person?: any; site?: any; object_kind?: any; object_reference?: any; act?: any; detail?: any; prev_digest: string }): string {
  const h = createHash('sha256');
  h.update(
    canonicalJson([
      canonicalTimestamp(entry.recorded_at) || null,
      entry.person || null,
      entry.site || null,
      entry.object_kind || null,
      entry.object_reference || null,
      entry.act,
      entry.detail === undefined ? null : JSON.parse(canonicalJson(entry.detail))
    ])
  );
  h.update(entry.prev_digest);
  return h.digest('hex');
}

export async function record(
  db: Pool,
  entry: { person?: string; site?: string; object_kind?: string; object_reference?: string; act: string; detail: any; event_at?: string; effective_on?: string; kind?: string }
): Promise<{ seq: number; digest: string; prev_digest: string }> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(918273645)");
    const last = (await client.query('SELECT seq, digest FROM record_entries ORDER BY seq DESC LIMIT 1')).rows[0];
    const prev = last ? last.digest : GENESIS;
    const recorded_at = new Date().toISOString();
    const digest = digestOf({ ...entry, recorded_at, prev_digest: prev });
    const inserted = await client.query(
      `INSERT INTO record_entries (recorded_at,event_at,effective_on,person,site,object_kind,object_reference,act,detail,digest,prev_digest,kind)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING seq,digest,prev_digest`,
      [recorded_at, entry.event_at || recorded_at, entry.effective_on || null, entry.person || null, entry.site || null,
       entry.object_kind || null, entry.object_reference || null, entry.act, JSON.stringify(entry.detail), digest, prev, entry.kind || 'act']
    );
    await client.query('COMMIT');
    return inserted.rows[0];
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function checkChain(db: Pool) {
  const rows = (await db.query('SELECT seq,recorded_at,person,site,object_kind,object_reference,act,detail,digest,prev_digest FROM record_entries ORDER BY seq')).rows;
  let prev = GENESIS;
  let holds = true;
  let first_failure: number | null = null;
  let expected_seq = 1;
  for (const r of rows) {
    const seq = Number(r.seq);
    if (seq !== expected_seq) { holds = false; first_failure = first_failure ?? seq; }
    if (r.prev_digest !== prev) { holds = false; first_failure = first_failure ?? seq; }
    const recomputed = digestOf({
      recorded_at: r.recorded_at, person: r.person, site: r.site, object_kind: r.object_kind,
      object_reference: r.object_reference, act: r.act, detail: r.detail, prev_digest: r.prev_digest
    });
    if (recomputed !== r.digest) { holds = false; first_failure = first_failure ?? seq; }
    expected_seq = seq + 1;
    prev = r.digest;
  }
  return { holds, first_failure, entries: rows.length };
}

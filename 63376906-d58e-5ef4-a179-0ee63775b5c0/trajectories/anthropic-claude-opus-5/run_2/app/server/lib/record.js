import crypto from 'node:crypto';
import { pool } from './db.js';

export const ZERO_DIGEST = '0'.repeat(64);

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

export function digestFor(entry, prev_digest) {
  const payload = stableStringify({
    ts: entry.ts,
    actor: entry.actor,
    site: entry.site ?? null,
    action: entry.action,
    object_kind: entry.object_kind,
    object_ref: entry.object_ref ?? null,
    outcome: entry.outcome,
    content: entry.content ?? {},
  });
  return crypto.createHash('sha256').update(prev_digest + '\n' + payload).digest('hex');
}

// The record is append-only and serialised: every entry hashes over its own
// content and the previous entry's digest. The lock runs inside a transaction so
// two acts landing at once still produce one chain with no gap.
export async function appendEntry(client, e) {
  if (!client) {
    const own = await pool.connect();
    try {
      await own.query('BEGIN');
      const out = await appendEntry(own, e);
      await own.query('COMMIT');
      return out;
    } catch (err) {
      try { await own.query('ROLLBACK'); } catch {}
      throw err;
    } finally {
      own.release();
    }
  }
  const runner = client;
  await runner.query('LOCK TABLE record_entry IN EXCLUSIVE MODE');
  const prev = await runner.query('SELECT digest FROM record_entry ORDER BY seq DESC LIMIT 1');
  const prev_digest = prev.rows[0]?.digest || ZERO_DIGEST;
  const ts = e.ts || new Date().toISOString();
  const base = {
    ts,
    actor: e.actor || 'system',
    site: e.site ?? null,
    action: e.action,
    object_kind: e.object_kind,
    object_ref: e.object_ref ?? null,
    outcome: e.outcome || 'success',
    content: e.content || {},
  };
  const digest = digestFor(base, prev_digest);
  const r = await runner.query(
    `INSERT INTO record_entry (ts, actor, site, action, object_kind, object_ref, outcome, content, digest, prev_digest)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING seq, digest, prev_digest, ts`,
    [ts, base.actor, base.site, base.action, base.object_kind, base.object_ref, base.outcome,
      JSON.stringify(base.content), digest, prev_digest]
  );
  return r.rows[0];
}

export async function checkChain() {
  const rows = (await pool.query(
    `SELECT seq, ts, actor, site, action, object_kind, object_ref, outcome, content, digest, prev_digest, content_deleted
     FROM record_entry ORDER BY seq ASC`
  )).rows;
  let prev = ZERO_DIGEST;
  let expectedSeq = null;
  for (const r of rows) {
    if (expectedSeq !== null && Number(r.seq) !== expectedSeq) {
      return { holds: false, entries: rows.length, first_failure: { seq: Number(r.seq), kind: 'sequence_gap' } };
    }
    expectedSeq = Number(r.seq) + 1;
    if (r.prev_digest !== prev) {
      return { holds: false, entries: rows.length, first_failure: { seq: Number(r.seq), kind: 'prev_digest_mismatch' } };
    }
    if (!r.content_deleted) {
      const d = digestFor({
        ts: (r.ts instanceof Date ? r.ts.toISOString() : r.ts),
        actor: r.actor, site: r.site, action: r.action, object_kind: r.object_kind,
        object_ref: r.object_ref, outcome: r.outcome, content: r.content,
      }, r.prev_digest);
      if (d !== r.digest) {
        return { holds: false, entries: rows.length, first_failure: { seq: Number(r.seq), kind: 'digest_mismatch' } };
      }
    }
    prev = r.digest;
  }
  return { holds: true, entries: rows.length, first_failure: null };
}

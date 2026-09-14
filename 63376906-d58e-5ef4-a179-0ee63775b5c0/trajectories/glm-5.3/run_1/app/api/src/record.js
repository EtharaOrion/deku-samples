import { createHash, randomUUID } from 'node:crypto';
import { cfg } from './config.js';
import { one, exec } from './db.js';

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const ZERO_DIGEST = '0'.repeat(64);

export const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export const decodeB64url = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

const norm = (v) => {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map(norm);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = norm(v[k]);
    return o;
  }
  return v;
};

export const digestOf = (content) => sha256(JSON.stringify(norm(content)));

// Append-only entry. Runs on the row lock so the digest chain cannot fork.
export async function entry(tx, { person = null, site = null, object = null, act, content, correction_of = null }) {
  await exec('SELECT pg_advisory_xact_lock(918273645)');
  const last = await one('SELECT seq, digest FROM record_entries ORDER BY seq DESC LIMIT 1', [], tx);
  const prev = last ? last.digest : ZERO_DIGEST;
  const c = norm({ person, site, object, act, content, correction_of });
  const digest = digestOf({ content: c, prev });
  const r = await one(
    `INSERT INTO record_entries (recorded_at, person, site, object, act, content, digest, prev_digest, correction_of)
     VALUES (now(), $1,$2,$3,$4,$5,$6,$7,$8) RETURNING seq, digest, prev_digest`,
    [person, site, object, act, JSON.stringify(c), digest, prev, correction_of], tx
  );
  return { seq: Number(r.seq), digest: r.digest, prev_digest: r.prev_digest };
}

// The same entry, but with the caller's transaction resolved outside the record write.
export async function entryTop({ person = null, site = null, object = null, act, content, correction_of = null }) {
  const c = norm({ person, site, object, act, content, correction_of });
  await exec('SELECT pg_advisory_xact_lock(918273645)');
  const last = await one('SELECT seq, digest FROM record_entries ORDER BY seq DESC LIMIT 1');
  const prev = last ? last.digest : ZERO_DIGEST;
  const digest = digestOf({ content: c, prev });
  const r = await one(
    `INSERT INTO record_entries (recorded_at, person, site, object, act, content, digest, prev_digest, correction_of)
     VALUES (now(), $1,$2,$3,$4,$5,$6,$7,$8) RETURNING seq, digest, prev_digest`,
    [person, site, object, act, JSON.stringify(c), digest, prev, correction_of]
  );
  return { seq: Number(r.seq), digest: r.digest, prev_digest: r.prev_digest };
}

export const UUID = () => randomUUID();

import { q, withTx } from "./db.js";
import { sha256Hex, nowIso } from "./arithmetic.js";

export const GENESIS =
  "0000000000000000000000000000000000000000000000000000000000000000";

// The record is append-only. An entry is written with the person, the moment,
// the site and the object, and its digest is computed over its own content and
// the previous entry's digest. Nothing is edited and nothing is removed.
export async function record(tx, entry) {
  const {
    act,
    person,
    site = null,
    object_reference = null,
    kind = "act",
    content = {},
    effective_on = null,
  } = entry;
  const rows = await tx.query(
    `insert into record_entries(act, person, site, object_reference, kind, content, effective_on, created_at)
     values($1,$2,$3,$4,$5,$6,$7,coalesce($8, now())) returning seq`,
    [
      act,
      person,
      site,
      object_reference,
      kind,
      JSON.stringify(content),
      effective_on,
      nowIso(),
    ]
  );
  const seq = rows[0].seq;
  await seal(tx, seq);
  return seq;
}

// Sealing recomputes the digest of one entry against the digest of the entry
// before it. The advisory lock in withTx serialises writers per lock key so the
// chain is never forked.
export async function seal(tx, seq) {
  const prev = await tx.one(
    `select digest from record_entries where seq = $1`,
    [seq - 1]
  );
  const cur = await tx.one(
    `select * from record_entries where seq = $1`,
    [seq]
  );
  const prevDigest = prev ? prev.digest : GENESIS;
  const digest = await digestOf(cur, prevDigest);
  await tx.query(`update record_entries set digest = $2, prev_digest = $3 where seq = $1`, [
    seq,
    digest,
    prevDigest,
  ]);
}

export async function digestOf(entry, prevDigest) {
  const body = {
    seq: Number(entry.seq),
    act: entry.act,
    person: entry.person,
    site: entry.site,
    object_reference: entry.object_reference,
    kind: entry.kind,
    content: entry.content ?? {},
    created_at: entry.created_at?.toISOString?.() ?? entry.created_at,
    effective_on: entry.effective_on,
    prev_digest: prevDigest,
  };
  return sha256Hex(new TextEncoder().encode(JSON.stringify(body)));
}

// Writes an entry on the pool when no transaction is in flight.
export async function recordPool(entry) {
  return withTx(`record`, async (tx) => record(tx, entry));
}

export async function checkChain() {
  const rows = await q(`select * from record_entries order by seq`);
  let prev = GENESIS;
  let first_failure = null;
  for (const r of rows) {
    const expected = await digestOf(r, prev);
    if (r.digest !== expected) {
      first_failure = Number(r.seq);
      break;
    }
    prev = r.digest;
  }
  // A gap in the sequence is a reportable condition of its own.
  const gaps = [];
  for (let i = 1; i <= rows.length; i++) {
    if (!rows.some((r) => Number(r.seq) === i)) gaps.push(i);
  }
  const holds = Number(rows.length) > 0;
  return {
    holds: holds && first_failure === null && gaps.length === 0,
    first_failure,
    gap_positions: gaps,
    length: rows.length,
    head: rows.at(-1)?.digest ?? null,
  };
}

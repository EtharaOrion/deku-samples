import { sha256, canonicalJson } from './units.js';

// Append-only record. Every act lands here with person, moment, site and object.
export async function appendEntry(db, { kind, object_ref, person, site, content, moment }) {
  const when = moment || new Date();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [771001]);
    const tail = await client.query('SELECT seq, digest FROM record_entry ORDER BY seq DESC LIMIT 1');
    const prev = tail.rows.length ? tail.rows[0].digest : '0'.repeat(64);
    const payload = canonicalJson({
      seq: Number((tail.rows.length ? tail.rows[0].seq : 0)) + 1,
      kind, object: object_ref ?? null, person,
      moment: when instanceof Date ? when.toISOString() : when,
      site: site ?? null, content: content ?? {}
    });
    const digest = sha256(prev + '\n' + payload);
    const inserted = await client.query(
      `INSERT INTO record_entry (digest,prev_digest,person,moment,site,object_ref,kind,content)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING seq, digest, prev_digest`,
      [digest, prev, person, when, site ?? null, object_ref ?? null, kind, JSON.stringify(content ?? {})]);
    await client.query('COMMIT');
    return inserted.rows[0];
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function checkChain(db) {
  const rows = await db.query('SELECT seq, digest, prev_digest, content, kind, person, moment, site, object_ref FROM record_entry ORDER BY seq');
  let prev = '0'.repeat(64);
  let expected = 1;
  for (const row of rows.rows) {
    const seq = Number(row.seq);
    if (seq !== expected) {
      return { holds: false, first_failure: { position: expected, reason: 'gap_in_sequence' } };
    }
    if (row.prev_digest !== prev) {
      return { holds: false, first_failure: { position: seq, reason: 'prev_digest_mismatch' } };
    }
    const payload = canonicalJson({
      seq, kind: row.kind, object: row.object_ref, person: row.person,
      moment: row.moment instanceof Date ? row.moment.toISOString() : String(row.moment),
      site: row.site ?? null, content: row.content
    });
    const digest = sha256(prev + '\n' + payload);
    if (digest !== row.digest) {
      return { holds: false, first_failure: { position: seq, reason: 'digest_does_not_verify' } };
    }
    prev = row.digest;
    expected += 1;
  }
  return { holds: true, first_failure: null, entries: rows.rows.length };
}

export function entryView(row) {
  return {
    seq: Number(row.seq),
    digest: row.digest,
    prev_digest: row.prev_digest,
    person: row.person,
    moment: row.moment,
    site: row.site,
    object: row.object_ref,
    kind: row.kind,
    content: row.content_deleted
      ? { deleted: true, statement: 'Content deleted under retention on ' + (row.deleted_on || 'an unstated date') }
      : row.content,
    content_deleted: row.content_deleted,
    legal_hold: false
  };
}

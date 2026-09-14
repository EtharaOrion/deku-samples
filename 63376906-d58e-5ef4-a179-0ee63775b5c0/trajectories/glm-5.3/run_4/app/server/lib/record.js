import { q } from '../db.js';
import { sha256 } from './util.js';

let chainLock = Promise.resolve();

export function withRecordLock(fn) {
  const run = chainLock.then(() => fn());
  chainLock = run.catch(() => {});
  return run;
}

export async function appendEntry(entry, client) {
  const run = (text, params) => (client ? client.query(text, params) : q(text, params));
  const last = await run('SELECT seq, digest FROM record_entry ORDER BY seq DESC LIMIT 1');
  const prev = last.rows.length ? last.rows[0].digest : '0'.repeat(64);
  const body = JSON.stringify({
    event_at: entry.event_at || '',
    effective_on: entry.effective_on || '',
    person: entry.person || 'system',
    site: entry.site || null,
    object: entry.object || null,
    act: entry.act,
    payload: entry.payload || {},
    kind: entry.kind || 'act',
    refused: entry.refused || false,
    outcome: entry.outcome || null,
    corrects: entry.corrects === null ? undefined : (entry.corrects || null)
  });
  const digest = sha256(prev + '|' + body);
  const r = await run(
    `INSERT INTO record_entry (event_at, effective_on, person, site, object, act, payload, digest, prev_digest, corrects, kind, refused, outcome)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING seq, digest, prev_digest`,
    [entry.event_at || '', entry.effective_on || '', entry.person || 'system', entry.site || null, entry.object || null,
     entry.act, body, digest, prev, entry.corrects || null, entry.kind || 'act', entry.refused || false, entry.outcome || null]
  );
  return r.rows[0];
}

export async function recordEntry(entry) {
  return withRecordLock(() => appendEntry(entry));
}

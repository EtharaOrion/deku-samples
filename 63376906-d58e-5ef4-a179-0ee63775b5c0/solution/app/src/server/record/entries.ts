import { createHash } from 'node:crypto';
import type pg from 'pg';
import { one, query, type Row } from '../db/pool.js';

const ZERO_DIGEST = '0'.repeat(64);
const RECORD_LOCK = 4173;

interface EntryInput {
  person: string;
  at?: string;
  act: string;
  object?: string | null;
  outcome: 'recorded' | 'refused';
  content?: unknown;
  idempotency_key?: string | null;
  request_digest?: string | null;
  response_status?: number | null;
  response?: unknown;
}

export interface RecordEntry extends Row {
  seq: number;
  digest: string;
  prev_digest: string;
  person: string;
  at: string;
  act: string;
  object: string | null;
  outcome: string;
  content: Record<string, unknown> | null;
  idempotency_key: string | null;
  request_digest: string | null;
  response_status: number | null;
  response: unknown;
  deleted_on: string | null;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
}

function entryDigest(entry: {
  seq: number;
  person: string;
  at: string;
  act: string;
  object: string | null;
  outcome: string;
  content: unknown;
  prev_digest: string;
}): string {
  const body = canonical({
    seq: entry.seq,
    person: entry.person,
    at: entry.at,
    act: entry.act,
    object: entry.object,
    outcome: entry.outcome,
    content: entry.content,
  });
  return sha256(body + entry.prev_digest);
}

// Append is the only write the record accepts. Every call runs inside the
// caller's transaction and takes the record lock so seq stays gapless.
export async function appendEntry(client: pg.PoolClient, input: EntryInput): Promise<RecordEntry> {
  await client.query('SELECT pg_advisory_xact_lock($1)', [RECORD_LOCK]);
  const last = await one<{ seq: number; digest: string }>(
    'SELECT seq, digest FROM record_entry ORDER BY seq DESC LIMIT 1',
    [],
    client,
  );
  const seq = (last?.seq ?? 0) + 1;
  const prev_digest = last?.digest ?? ZERO_DIGEST;
  const at = new Date(input.at ?? Date.now()).toISOString();
  const object = input.object ?? null;
  const content = input.content ?? null;
  const digest = entryDigest({ seq, person: input.person, at, act: input.act, object, outcome: input.outcome, content, prev_digest });
  const rows = await query<RecordEntry>(
    `INSERT INTO record_entry (seq, digest, prev_digest, person, at, act, object, outcome, content, idempotency_key, request_digest, response_status, response)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [
      seq,
      digest,
      prev_digest,
      input.person,
      at,
      input.act,
      object,
      input.outcome,
      content === null ? null : JSON.stringify(content),
      input.idempotency_key ?? null,
      input.request_digest ?? null,
      input.response_status ?? null,
      input.response === undefined ? null : JSON.stringify(input.response),
    ],
    client,
  );
  return rows[0] as RecordEntry;
}

export async function findByIdempotencyKey(client: pg.PoolClient | pg.Pool, key: string): Promise<RecordEntry | null> {
  return one<RecordEntry>('SELECT * FROM record_entry WHERE idempotency_key = $1 ORDER BY seq ASC LIMIT 1', [key], client);
}

// A count of acts is read from the record itself, never from a tally held beside
// the process, so the figure survives a restart and a second instance alike.
export async function countRecentActsBy(
  client: pg.PoolClient,
  act: string,
  caller: string,
  within_seconds: number,
): Promise<number> {
  const counted = await one<{ entries: number }>(
    `SELECT count(*) AS entries FROM record_entry
      WHERE act = $1 AND content ->> 'caller' = $2 AND at >= now() - make_interval(secs => $3)`,
    [act, caller, within_seconds],
    client,
  );
  return counted?.entries ?? 0;
}

export function checkChain(entries: RecordEntry[]): { holds: boolean; first_failure: number | null; entries: number } {
  let prev = ZERO_DIGEST;
  let expectedSeq = 1;
  for (const entry of entries) {
    if (entry.seq !== expectedSeq || entry.prev_digest !== prev) return { holds: false, first_failure: entry.seq, entries: entries.length };
    const expected = entry.deleted_on
      ? entry.digest
      : entryDigest({
          seq: entry.seq,
          person: entry.person,
          at: entry.at,
          act: entry.act,
          object: entry.object,
          outcome: entry.outcome,
          content: entry.content,
          prev_digest: entry.prev_digest,
        });
    if (expected !== entry.digest) return { holds: false, first_failure: entry.seq, entries: entries.length };
    prev = entry.digest;
    expectedSeq += 1;
  }
  return { holds: true, first_failure: null, entries: entries.length };
}

export function publicEntry(entry: RecordEntry): Record<string, unknown> {
  return {
    seq: entry.seq,
    digest: entry.digest,
    prev_digest: entry.prev_digest,
    person: entry.person,
    at: entry.at,
    act: entry.act,
    object: entry.object,
    outcome: entry.outcome,
    content: entry.deleted_on ? null : entry.content,
    deleted_on: entry.deleted_on,
    deleted: entry.deleted_on !== null,
  };
}

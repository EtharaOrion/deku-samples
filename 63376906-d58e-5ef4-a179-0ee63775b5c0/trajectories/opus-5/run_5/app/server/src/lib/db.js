import pg from 'pg';
import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

const { Pool, types } = pg;

// int8 as number (all our counts/masses fit comfortably in a double)
types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
// numeric as number
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// date as plain ISO date string, no timezone shifting
types.setTypeParser(1082, (v) => v);

const connectionString = process.env.DATABASE_URL || process.env.DB_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

export const pool = new Pool({ connectionString, max: 12 });

// A separate, small pool used only to hold advisory locks while work runs on
// the main pool. If a lock were held on a main-pool connection, enough
// concurrent locked acts would hold every connection and the work inside them
// could never acquire one: the guard would deadlock against the thing it
// guards.
export const lockPool = new Pool({ connectionString, max: 8 });

// Tracks whether the current asynchronous call chain already holds a named
// lock. Taking a second one while holding the first exhausts the lock pool as
// soon as enough callers do it at once: every connection is held by somebody
// waiting for a connection. Rather than rely on nobody ever nesting, nesting is
// refused outright and says so.
const lockDepth = new AsyncLocalStorage();

// Serialise everything sharing a name. The lock is held across the callback, so
// a read followed by a write inside it is one indivisible act.
export async function withNamedLock(name, fn) {
  if (lockDepth.getStore()) {
    throw new Error(
      `withNamedLock('${name}') was called while '${lockDepth.getStore()}' was already held. ` +
        'A nested named lock exhausts the lock pool under concurrency. Take one lock per act.',
    );
  }
  const [a, b] = lockIdsFor(name);
  const client = await lockPool.connect();
  try {
    await client.query('select pg_advisory_lock($1, $2)', [a, b]);
    return await lockDepth.run(name, fn);
  } finally {
    try {
      await client.query('select pg_advisory_unlock($1, $2)', [a, b]);
    } catch {
      /* releasing the connection drops the lock in any case */
    }
    client.release();
  }
}

function lockIdsFor(name) {
  const h = createHash('sha256').update(name).digest();
  // two signed 32-bit keys, which is what the two-argument advisory lock takes
  return [h.readInt32BE(0), h.readInt32BE(4)];
}

export async function q(text, params) {
  const r = await pool.query(text, params);
  return r.rows;
}

export async function one(text, params) {
  const rows = await q(text, params);
  return rows[0] || null;
}

// A runner is whatever a read runs against: the pool by default, or a single
// connection held open inside a snapshot.
export const poolRunner = {
  q,
  one,
  query: (text, params) => pool.query(text, params),
};

// A scoped read sees one consistent state and names the moment it saw, rather
// than half of a period before a close and half after. Every query inside runs
// against one REPEATABLE READ snapshot on one connection, so a close landing
// mid-read is either wholly before the moment or wholly after it.
export async function snapshot(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const runner = {
      q: async (text, params) => (await client.query(text, params)).rows,
      one: async (text, params) => (await client.query(text, params)).rows[0] || null,
      query: (text, params) => client.query(text, params),
    };
    // The moment is taken inside the snapshot, so it names the state that was
    // read rather than the instant the response was assembled.
    const { rows } = await client.query('select now() as at');
    const out = await fn(runner, new Date(rows[0].at).toISOString());
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* the connection is already gone */
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* connection already gone */
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function waitForDb(attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      await pool.query('select 1');
      return;
    } catch (e) {
      if (i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

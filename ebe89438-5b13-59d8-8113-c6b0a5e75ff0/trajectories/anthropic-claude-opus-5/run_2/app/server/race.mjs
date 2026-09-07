/**
 * Hammers the last seat: many accounts registering for a tiny capacity at the
 * same instant, repeated over fresh events. The database is the fact, so every
 * assertion reads the registrations table rather than an API response.
 */
import pg from 'pg';

const BASE = process.env.VERIFY_BASE || 'http://127.0.0.1:4180';
const PW = 'deku-demo-pw-2026';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const ROUNDS = Number(process.env.ROUNDS || 6);
const RACERS = Number(process.env.RACERS || 24);
const CAPACITY = Number(process.env.CAPACITY || 2);

let fail = 0;
const note = (ok, msg) => {
  if (!ok) fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`);
};

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    return { status: res.status, json: null, text };
  }
}

async function main() {
  const stamp = Date.now();
  console.log(`\nracing ${RACERS} guests for ${CAPACITY} seats, ${ROUNDS} rounds\n`);

  // a pool of fresh guest accounts
  const tokens = [];
  for (let i = 0; i < RACERS; i++) {
    const r = await api('/auth/signup', {
      method: 'POST',
      body: {
        email: `racer${stamp}-${i}@example.com`,
        password: 'racer-password-1',
        name: `Racer ${i}`,
      },
    });
    tokens.push(r.json.access_token);
  }

  const host = (await api('/auth/login', {
    method: 'POST',
    body: { email: 'host@example.com', password: PW },
  })).json.access_token;

  for (let round = 1; round <= ROUNDS; round++) {
    const waitlist = round % 2 === 1;
    const slug = `race-${stamp}-${round}`;
    const created = await api('/events', {
      method: 'POST',
      token: host,
      body: {
        calendar_slug: 'riverside-run-club',
        slug,
        title: `Race Event ${round}`,
        category: 'running',
        city: 'Berlin',
        time_zone: 'Europe/Berlin',
        starts_at: '2031-06-01T18:00:00Z',
        ends_at: '2031-06-01T20:00:00Z',
        capacity: CAPACITY,
        approval_required: false,
        waitlist_enabled: waitlist,
        description: 'A contended event.',
      },
    });
    if (created.status !== 201) {
      note(false, `round ${round}: could not create the event (${created.status})`);
      continue;
    }

    // every racer submits at the same instant
    const results = await Promise.all(
      tokens.map((t) =>
        api('/registrations', { method: 'POST', token: t, body: { event_slug: slug } }),
      ),
    );

    // The database, not the response, is the fact.
    const { rows: counts } = await pool.query(
      `SELECT status, count(*)::int AS n FROM registrations r
         JOIN events e ON e.id = r.event_id
        WHERE e.slug = $1 GROUP BY status`,
      [slug],
    );
    const by = Object.fromEntries(counts.map((c) => [c.status, c.n]));
    const seats = (by.confirmed || 0) + (by.checked_in || 0);

    note(
      seats === CAPACITY,
      `round ${round} (waitlist ${waitlist ? 'on' : 'off'}): exactly ${CAPACITY} seats in the database, saw ${seats}`,
    );

    const { rows: rowCount } = await pool.query(
      `SELECT count(*)::int AS n FROM registrations r JOIN events e ON e.id = r.event_id
        WHERE e.slug = $1`,
      [slug],
    );
    const expectedRows = waitlist ? RACERS : CAPACITY;
    note(
      rowCount[0].n === expectedRows,
      `round ${round}: ${expectedRows} rows expected, ${rowCount[0].n} present (a refused attempt leaves no row)`,
    );

    // waiting-list positions are 1..n with no gaps and no repeats
    const { rows: positions } = await pool.query(
      `SELECT waitlist_position FROM registrations r JOIN events e ON e.id = r.event_id
        WHERE e.slug = $1 AND r.status = 'waitlisted' ORDER BY waitlist_position`,
      [slug],
    );
    const seq = positions.map((p) => p.waitlist_position);
    note(
      JSON.stringify(seq) === JSON.stringify(seq.map((_, i) => i + 1)),
      `round ${round}: waiting list is 1..${seq.length} with no gaps`,
    );

    // a ticket code exists exactly when the status holds a seat
    const { rows: bad } = await pool.query(
      `SELECT count(*)::int AS n FROM registrations r JOIN events e ON e.id = r.event_id
        WHERE e.slug = $1 AND (
          (r.status IN ('confirmed','checked_in') AND r.ticket_code IS NULL) OR
          (r.status NOT IN ('confirmed','checked_in') AND r.ticket_code IS NOT NULL))`,
      [slug],
    );
    note(bad[0].n === 0, `round ${round}: ticket codes track seats exactly`);

    // one account, one row
    const { rows: dupes } = await pool.query(
      `SELECT count(*)::int AS n FROM (
         SELECT account_id FROM registrations r JOIN events e ON e.id = r.event_id
          WHERE e.slug = $1 GROUP BY account_id HAVING count(*) > 1) d`,
      [slug],
    );
    note(dupes[0].n === 0, `round ${round}: no account holds two rows`);

    const rejected = results.filter((r) => r.status >= 400).length;
    if (!waitlist) {
      note(
        rejected === RACERS - CAPACITY,
        `round ${round}: ${RACERS - CAPACITY} rejected as full, saw ${rejected}`,
      );
    }
    const serverErrors = results.filter((r) => r.status >= 500).length;
    note(serverErrors === 0, `round ${round}: no attempt met a server error`);
  }

  // app-wide ticket uniqueness
  const { rows: codeDupes } = await pool.query(
    `SELECT count(*)::int AS n FROM (
       SELECT ticket_code FROM registrations WHERE ticket_code IS NOT NULL
        GROUP BY ticket_code HAVING count(*) > 1) d`,
  );
  note(codeDupes[0].n === 0, 'no ticket code is held by two registrations app-wide');

  const { rows: overCap } = await pool.query(
    `SELECT e.slug, e.capacity, count(*)::int AS seats
       FROM registrations r JOIN events e ON e.id = r.event_id
      WHERE r.status IN ('confirmed','checked_in')
      GROUP BY e.id, e.slug, e.capacity
     HAVING count(*) > e.capacity`,
  );
  note(
    overCap.length === 0,
    `no event anywhere exceeds its capacity${overCap.length ? ` (${JSON.stringify(overCap)})` : ''}`,
  );

  await pool.end();
  console.log(fail ? `\n${fail} FAILED\n` : '\nall race invariants hold\n');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

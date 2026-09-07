/**
 * Heavy contention on the last seat: many accounts fire at one event with one
 * free seat, at the same instant, repeatedly. The database is the fact.
 */
const BASE = process.env.CHECK_BASE || 'http://127.0.0.1:4300';
const PW = 'stress-password-2026';

const pg = await import('/app/server/node_modules/pg/lib/index.js');
const db = new pg.default.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

async function call(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
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

const ROUNDS = Number(process.env.ROUNDS || 8);
const RACERS = Number(process.env.RACERS || 12);

console.log(`spinning up ${RACERS} accounts`);
const tokens = [];
for (let i = 0; i < RACERS; i++) {
  const email = `stress-${Date.now().toString(36)}-${i}@example.com`;
  const r = await call('POST', '/api/auth/signup', {
    body: { email, password: PW, name: `Stress Racer ${i}` },
  });
  if (!r.json?.access_token) throw new Error(`signup failed: ${JSON.stringify(r)}`);
  tokens.push(r.json.access_token);
}

const host = (
  await call('POST', '/api/auth/login', {
    body: { email: 'host@example.com', password: 'deku-demo-pw-2026' },
  })
).json.access_token;

let failures = 0;

for (let round = 1; round <= ROUNDS; round++) {
  const stamp = `${Date.now().toString(36)}-${round}`;
  const slug = `stress-${stamp}`;
  const capacity = 1 + (round % 3); // 1, 2 or 3 seats
  const created = await call('POST', '/api/events', {
    token: host,
    body: {
      calendar_slug: 'riverside-run-club',
      title: `Stress ${stamp}`,
      slug,
      category: 'running',
      city: 'Berlin',
      time_zone: 'Europe/Berlin',
      starts_at: '2027-09-01T17:00:00Z',
      ends_at: '2027-09-01T19:00:00Z',
      capacity,
      approval_required: false,
      waitlist_enabled: round % 2 === 1, // half with the waiting list off
      description: 'Contention fixture.',
    },
  });
  if (created.json?.state !== 'published') throw new Error(`setup failed: ${JSON.stringify(created.json)}`);

  // Everybody fires at the same instant.
  const results = await Promise.all(
    tokens.map((t) => call('POST', '/api/registrations', { token: t, body: { event_slug: slug } }))
  );

  const rows = (
    await db.query(
      `SELECT r.status, r.waitlist_position, r.ticket_code FROM registrations r
         JOIN events e ON e.id = r.event_id WHERE e.slug = $1`,
      [slug]
    )
  ).rows;

  const seated = rows.filter((r) => ['confirmed', 'checked_in'].includes(r.status));
  const waiting = rows.filter((r) => r.status === 'waitlisted');
  const rejected = results.filter((r) => r.status >= 400);
  const positions = waiting.map((r) => r.waitlist_position).sort((a, b) => a - b);
  const expected = positions.map((_, i) => i + 1);

  const checks = [
    [`seats stored (${seated.length}) never exceed capacity (${capacity})`, seated.length <= capacity],
    [`seats stored fill the capacity exactly`, seated.length === capacity],
    ['every seat holds a distinct ticket code', new Set(seated.map((r) => r.ticket_code)).size === seated.length],
    ['every seat code has the pinned shape', seated.every((r) => /^TKT-[A-Z0-9]{8}$/.test(r.ticket_code || ''))],
    ['nobody waiting holds a ticket', waiting.every((r) => r.ticket_code === null)],
    ['waiting positions are 1..n with no gaps', JSON.stringify(positions) === JSON.stringify(expected)],
    [
      'nothing partial was written',
      rows.length === RACERS - rejected.length,
    ],
    [
      'with the waiting list off the surplus is refused, not seated',
      round % 2 === 1 ? true : waiting.length === 0 && rejected.length === RACERS - capacity,
    ],
  ];

  const bad = checks.filter(([, c]) => !c);
  failures += bad.length;
  console.log(
    `round ${round}: capacity ${capacity}, waitlist ${round % 2 === 1 ? 'on' : 'off'} -> ` +
      `${seated.length} seated, ${waiting.length} waiting, ${rejected.length} refused` +
      (bad.length ? `  FAILED: ${bad.map(([n]) => n).join('; ')}` : '  ok')
  );
}

const oversold = (
  await db.query(
    `SELECT e.slug, e.capacity, count(*)::int seated FROM registrations r
       JOIN events e ON e.id = r.event_id WHERE r.status IN ('confirmed','checked_in')
      GROUP BY e.slug, e.capacity HAVING count(*) > e.capacity`
  )
).rows;
console.log(`\nover-sold events anywhere in the database: ${oversold.length}`);
if (oversold.length) {
  console.log(oversold);
  failures++;
}

await db.end();
console.log(failures ? `\n${failures} FAILURES` : '\nall contention rounds held');
process.exit(failures ? 1 : 0);

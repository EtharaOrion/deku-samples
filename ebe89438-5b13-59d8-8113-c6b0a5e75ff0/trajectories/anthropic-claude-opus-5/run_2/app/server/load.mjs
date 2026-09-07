/**
 * The brief requires the app to stay responsive at 500 events and 5,000
 * registrations. This fills the database to that size directly, then measures
 * the endpoints a visitor actually waits on.
 */
import pg from 'pg';

const BASE = process.env.VERIFY_BASE || 'http://127.0.0.1:4173';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const TARGET_EVENTS = Number(process.env.TARGET_EVENTS || 500);
const TARGET_REGS = Number(process.env.TARGET_REGS || 5000);

const CATEGORIES = [
  'family', 'books', 'games', 'tech', 'food-and-drink', 'ai',
  'running', 'arts-and-culture', 'climate', 'fitness', 'wellness', 'crypto',
];
const CITIES = ['Berlin', 'Lisbon', 'Porto', 'Leipzig', 'Hamburg', 'Faro'];
const HEX = ['#146aeb', '#3cbd2c', '#d69712', '#ab46dd', '#f31a7c', '#28cd41'];

let fail = 0;
const note = (ok, msg) => {
  if (!ok) fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`);
};

async function timed(label, fn, budgetMs) {
  const runs = [];
  for (let i = 0; i < 5; i++) {
    const t = process.hrtime.bigint();
    await fn();
    runs.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  runs.sort((a, b) => a - b);
  const median = runs[2];
  note(median < budgetMs, `${label}: ${median.toFixed(0)}ms (budget ${budgetMs}ms)`);
  return median;
}

async function main() {
  console.log(`\nfilling to ${TARGET_EVENTS} events and ${TARGET_REGS} registrations\n`);

  const { rows: cal } = await pool.query(
    "SELECT id FROM calendars WHERE slug = 'riverside-run-club'",
  );
  const calendarId = cal[0].id;

  // events
  const existing = (await pool.query('SELECT count(*)::int n FROM events')).rows[0].n;
  const toMake = Math.max(0, TARGET_EVENTS - existing);
  if (toMake > 0) {
    const values = [];
    const params = [];
    for (let i = 0; i < toMake; i++) {
      const b = i * 12;
      const start = new Date(Date.now() + (10 + (i % 300)) * 86400000);
      start.setUTCHours(9 + (i % 12), 0, 0, 0);
      params.push(
        calendarId,
        `Load Event ${i}`,
        `load-event-${i}`,
        CATEGORIES[i % CATEGORIES.length],
        CITIES[i % CITIES.length],
        'Europe/Berlin',
        `load-seed-${i}`,
        HEX[i % HEX.length],
        `A generated event for load measurement, number ${i}.`,
        start,
        new Date(start.getTime() + 7200000),
        50,
      );
      values.push(
        `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},'published',now())`,
      );
    }
    await pool.query(
      `INSERT INTO events (calendar_id,title,slug,category,city,time_zone,cover_seed,
         theme_hex,description,starts_at,ends_at,capacity,state,published_at)
       VALUES ${values.join(',')} ON CONFLICT (slug) DO NOTHING`,
      params,
    );
  }

  // accounts to register with
  const needAccounts = 120;
  const accValues = [];
  const accParams = [];
  for (let i = 0; i < needAccounts; i++) {
    const b = i * 5;
    accParams.push(
      `loadguest${i}@example.com`,
      'scrypt$00$00',
      `Load Guest ${i}`,
      `load-guest-${i}`,
      'guest',
    );
    accValues.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`);
  }
  await pool.query(
    `INSERT INTO accounts (email,password_hash,display_name,handle,role)
     VALUES ${accValues.join(',')} ON CONFLICT (email) DO NOTHING`,
    accParams,
  );

  // registrations, respecting capacity so the trigger never fires
  const { rows: accounts } = await pool.query(
    "SELECT id FROM accounts WHERE email LIKE 'loadguest%' ORDER BY email",
  );
  const { rows: events } = await pool.query(
    "SELECT id, capacity FROM events WHERE slug LIKE 'load-event-%' ORDER BY slug",
  );
  const have = (await pool.query('SELECT count(*)::int n FROM registrations')).rows[0].n;
  let made = 0;
  const perEvent = Math.ceil(TARGET_REGS / Math.max(1, events.length));

  for (const ev of events) {
    if (have + made >= TARGET_REGS) break;
    const rows = [];
    const params = [];
    const take = Math.min(perEvent, accounts.length, ev.capacity);
    for (let i = 0; i < take; i++) {
      const b = i * 5;
      const code =
        'TKT-' +
        (made + i).toString(36).toUpperCase().padStart(8, '0').slice(-8);
      params.push(ev.id, accounts[i].id, 'confirmed', null, code);
      rows.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`);
    }
    if (!rows.length) continue;
    await pool.query(
      `INSERT INTO registrations (event_id,account_id,status,waitlist_position,ticket_code)
       VALUES ${rows.join(',')}
       ON CONFLICT (event_id, account_id) DO NOTHING`,
      params,
    );
    made += take;
  }

  const counts = (
    await pool.query(
      'SELECT (SELECT count(*)::int FROM events) e, (SELECT count(*)::int FROM registrations) r',
    )
  ).rows[0];
  console.log(`database now holds ${counts.e} events and ${counts.r} registrations\n`);
  note(counts.e >= TARGET_EVENTS, `at least ${TARGET_EVENTS} events present`);
  note(counts.r >= TARGET_REGS, `at least ${TARGET_REGS} registrations present`);

  console.log('\nresponse times at that size:\n');
  const get = (p) => fetch(`${BASE}${p}`).then((r) => r.text());

  await timed('discovery, first page', () => get('/api/events?limit=20'), 400);
  await timed('discovery, deep page', () => get('/api/events?limit=20&offset=400'), 400);
  await timed('discovery, filtered by category', () => get('/api/events?category=tech'), 400);
  await timed('discovery, free-text search', () => get('/api/events?q=generated'), 500);
  await timed(
    'discovery, all three filters',
    () => get('/api/events?category=tech&city=Berlin&q=load'),
    500,
  );
  await timed('one event page payload', () => get('/api/events/load-event-1'), 300);
  await timed('the application shell', () => get('/load-event-1'), 300);
  await timed('health', () => get('/api/health'), 200);

  // the guest list of a busy event, host-only
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'host@example.com', password: 'deku-demo-pw-2026' }),
  }).then((r) => r.json());
  const auth = { authorization: `Bearer ${login.access_token}` };
  await timed(
    'a full guest list',
    () => fetch(`${BASE}/api/events/load-event-1/registrations`, { headers: auth }).then((r) => r.text()),
    500,
  );
  await timed(
    'the CSV export',
    () => fetch(`${BASE}/api/events/load-event-1/registrations.csv`, { headers: auth }).then((r) => r.text()),
    500,
  );

  // X-Total-Count must still be right at this size
  const res = await fetch(`${BASE}/api/events?limit=1`);
  const total = Number(res.headers.get('x-total-count'));
  const { rows: expect } = await pool.query(
    "SELECT count(*)::int n FROM events WHERE state IN ('published','registration_closed')",
  );
  note(
    total === expect[0].n,
    `X-Total-Count reports every match (${total} = ${expect[0].n})`,
  );

  // the invariants still hold at size
  const { rows: over } = await pool.query(
    `SELECT count(*)::int n FROM (
       SELECT e.id FROM registrations r JOIN events e ON e.id = r.event_id
        WHERE r.status IN ('confirmed','checked_in')
        GROUP BY e.id, e.capacity HAVING count(*) > e.capacity) x`,
  );
  note(over[0].n === 0, 'no event exceeds capacity at this size');

  await pool.end();
  console.log(fail ? `\n${fail} FAILED\n` : '\nall budgets met\n');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

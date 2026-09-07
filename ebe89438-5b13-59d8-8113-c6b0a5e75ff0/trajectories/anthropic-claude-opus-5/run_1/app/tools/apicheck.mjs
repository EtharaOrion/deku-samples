/**
 * Exercises the API against the running app: the last seat under contention,
 * the invariants, authorization, filtering, CSV and mail.
 */
const BASE = process.env.CHECK_BASE || 'http://127.0.0.1:4300';
const MAILPIT = `http://${process.env.SMTP_HOST || 'mailpit'}:8025`;
const PW = 'deku-demo-pw-2026';

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  FAIL ${name}${detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''}`);
  }
}

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
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, headers: res.headers };
}

// Tokens are cached: login is rate limited to ten a minute per account, which
// is the behaviour under test, not something to fight.
const tokens = new Map();
async function login(email) {
  if (tokens.has(email)) return tokens.get(email);
  const r = await call('POST', '/api/auth/login', { body: { email, password: PW } });
  if (!r.json?.access_token) throw new Error(`login failed for ${email}: ${r.text}`);
  tokens.set(email, r.json.access_token);
  return r.json.access_token;
}

async function mailFor(address) {
  const r = await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:' + address)}&limit=50`
  );
  const j = await r.json();
  return j.messages || [];
}

async function resetMail() {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' });
}

const pg = await import('/app/server/node_modules/pg/lib/index.js');
const dbc = new pg.default.Client({ connectionString: process.env.DATABASE_URL });
await dbc.connect();
const sql = async (text, params = []) => (await dbc.query(text, params)).rows;

const run = async (name, fn) => {
  console.log(`\n== ${name}`);
  try {
    await fn();
  } catch (e) {
    fail++;
    failures.push(`${name} threw`);
    console.log(`  FAIL ${name} threw :: ${e.message}`);
  }
};

/* ------------------------------------------------------------------ */

await run('health and seed', async () => {
  const h = await call('GET', '/api/health');
  ok('health 200', h.status === 200, h.json);
  const ev = await call('GET', '/api/events');
  ok('discovery lists the five open events', ev.json.length === 5, ev.json.map((e) => e.slug));
  ok('X-Total-Count matches', ev.headers.get('x-total-count') === '5', ev.headers.get('x-total-count'));
  const slugs = ev.json.map((e) => e.slug);
  ok('draft absent from discovery', !slugs.includes('harbour-loop-recovery-jog'));
  ok('cancelled absent from discovery', !slugs.includes('autumn-book-swap'));
  ok('registration_closed present', slugs.includes('riverside-winter-time-trial'));
  const sorted = [...ev.json].sort((a, b) =>
    a.starts_at === b.starts_at ? a.slug.localeCompare(b.slug) : a.starts_at.localeCompare(b.starts_at)
  );
  ok('ranking soonest first then slug', JSON.stringify(sorted) === JSON.stringify(ev.json));
});

await run('resolve precedence', async () => {
  ok('api is system', (await call('GET', '/api/resolve/api')).json.kind === 'system');
  ok('running is category', (await call('GET', '/api/resolve/running')).json.kind === 'category');
  ok('event slug is event', (await call('GET', '/api/resolve/thursday-night-5k')).json.kind === 'event');
  ok('calendar slug is calendar', (await call('GET', '/api/resolve/riverside-run-club')).json.kind === 'calendar');
  ok('handle is account', (await call('GET', '/api/resolve/priya-raman')).json.kind === 'account');
  ok('unknown is 404', (await call('GET', '/api/resolve/nothing-here-at-all')).status === 404);
  const draftAnon = await call('GET', '/api/resolve/harbour-loop-recovery-jog');
  ok('draft resolves 404 to a stranger', draftAnon.status === 404, draftAnon.json);
  const host = await login('host@example.com');
  const draftHost = await call('GET', '/api/resolve/harbour-loop-recovery-jog', { token: host });
  ok('draft resolves for its host', draftHost.json?.kind === 'event', draftHost.json);
});

await run('draft event is invisible', async () => {
  const anon = await call('GET', '/api/events/harbour-loop-recovery-jog');
  ok('draft event 404 to stranger', anon.status === 404);
  const g = await login('guest@example.com');
  ok('draft event 404 to guest', (await call('GET', '/api/events/harbour-loop-recovery-jog', { token: g })).status === 404);
  const h = await login('host@example.com');
  ok('draft event 200 to owning host', (await call('GET', '/api/events/harbour-loop-recovery-jog', { token: h })).status === 200);
  const h2 = await login('host2@example.com');
  ok('draft event 404 to another host', (await call('GET', '/api/events/harbour-loop-recovery-jog', { token: h2 })).status === 404);
});

await run('THE LAST SEAT under contention', async () => {
  await resetMail();
  const before = await sql(
    `SELECT count(*)::int n FROM registrations r JOIN events e ON e.id=r.event_id
      WHERE e.slug='riverside-track-session' AND r.status IN ('confirmed','checked_in')`
  );
  ok('exactly one seat free before', before[0].n === 1, before);

  const a = await login('guest@example.com');
  const b = await login('guest3@example.com');
  const [ra, rb] = await Promise.all([
    call('POST', '/api/registrations', { token: a, body: { event_slug: 'riverside-track-session' } }),
    call('POST', '/api/registrations', { token: b, body: { event_slug: 'riverside-track-session' } }),
  ]);
  const statuses = [ra.json?.status, rb.json?.status].sort();
  ok('one confirmed, one waitlisted', JSON.stringify(statuses) === '["confirmed","waitlisted"]', { a: ra.json, b: rb.json });
  const seated = await sql(
    `SELECT count(*)::int n FROM registrations r JOIN events e ON e.id=r.event_id
      WHERE e.slug='riverside-track-session' AND r.status IN ('confirmed','checked_in')`
  );
  ok('stored seats == capacity 2, never 3', seated[0].n === 2, seated);

  const winner = ra.json?.status === 'confirmed' ? ra.json : rb.json;
  const loser = ra.json?.status === 'confirmed' ? rb.json : ra.json;
  ok('winner holds a ticket code', /^TKT-[A-Z0-9]{8}$/.test(winner?.ticket_code || ''), winner);
  ok('loser holds no ticket code', loser?.ticket_code === null, loser);
  ok('loser holds waitlist position 1', loser?.waitlist_position === 1, loser);

  const ev = await call('GET', '/api/events/riverside-track-session');
  ok('confirmed_count never exceeds capacity', ev.json.confirmed_count <= ev.json.capacity, ev.json);
});

await run('mail really reached Mailpit', async () => {
  await new Promise((r) => setTimeout(r, 800));
  const all = await (await fetch(`${MAILPIT}/api/v1/messages?limit=50`)).json();
  const subjects = all.messages.map((m) => m.Subject);
  ok('a confirmation subject was sent', subjects.includes("You're going to Riverside Track Session"), subjects);
  ok('a waiting-list subject was sent', subjects.includes("You're on the waiting list for Riverside Track Session"), subjects);
  const one = all.messages[0];
  ok('mail goes to exactly one recipient', one.To.length === 1, one.To);
  ok('mail carries no cc', !one.Cc || one.Cc.length === 0, one.Cc);
  ok('mail carries no bcc', !one.Bcc || one.Bcc.length === 0, one.Bcc);
  const full = await (await fetch(`${MAILPIT}/api/v1/message/${one.ID}`)).json();
  ok('body names the event', /Riverside Track Session/.test(full.Text), full.Text?.slice(0, 200));
  const logged = await sql(`SELECT count(*)::int n FROM email_log`);
  ok('email_log written after the send', logged[0].n >= 2, logged);
});

await run('one registration per account per event', async () => {
  const a = await login('guest@example.com');
  const first = await call('POST', '/api/registrations', { token: a, body: { event_slug: 'winter-reading-night' } });
  const again = await call('POST', '/api/registrations', { token: a, body: { event_slug: 'winter-reading-night' } });
  ok('repeat submission returns the same row', first.json.id === again.json.id, [first.json, again.json]);
  const rows = await sql(
    `SELECT count(*)::int n FROM registrations r JOIN events e ON e.id=r.event_id
       JOIN accounts ac ON ac.id=r.account_id
      WHERE e.slug='winter-reading-night' AND ac.email='guest@example.com'`
  );
  ok('exactly one row stored', rows[0].n === 1, rows);
});

await run('simultaneous first-time registration by one account', async () => {
  const t = await login('guest2@example.com');
  const results = await Promise.all(
    [1, 2, 3].map(() => call('POST', '/api/registrations', { token: t, body: { event_slug: 'winter-reading-night' } }))
  );
  const rows = await sql(
    `SELECT count(*)::int n FROM registrations r JOIN events e ON e.id=r.event_id
       JOIN accounts ac ON ac.id=r.account_id
      WHERE e.slug='winter-reading-night' AND ac.email='guest2@example.com'`
  );
  ok('three simultaneous requests produce one row', rows[0].n === 1, { rows, results: results.map((r) => r.status) });
});

await run('cancel frees a seat and promotes the head of the list', async () => {
  await resetMail();
  const g = await login('guest@example.com');
  const mine = await call('GET', '/api/registrations/me', { token: g });
  const reg = mine.json.find((r) => r.event_slug === 'thursday-night-5k');
  ok('the guest holds a confirmed seat', reg?.status === 'confirmed', reg);

  const cancelled = await call('POST', `/api/registrations/${reg.id}/cancel`, { token: g });
  ok('cancel returns cancelled_by_guest', cancelled.json.status === 'cancelled_by_guest', cancelled.json);
  ok('cancel clears the ticket code', cancelled.json.ticket_code === null, cancelled.json);

  const after = await sql(
    `SELECT r.status, r.waitlist_position, r.ticket_code, ac.email
       FROM registrations r JOIN events e ON e.id=r.event_id
       JOIN accounts ac ON ac.id=r.account_id WHERE e.slug='thursday-night-5k' ORDER BY ac.email`
  );
  const ines = after.find((r) => r.email === 'guest3@example.com');
  ok('the head of the waiting list is now confirmed', ines.status === 'confirmed', after);
  ok('the promoted guest holds a ticket', /^TKT-/.test(ines.ticket_code || ''), ines);
  ok('the promoted guest lost its position', ines.waitlist_position === null, ines);

  await new Promise((r) => setTimeout(r, 800));
  const mails = await mailFor('guest3@example.com');
  ok('the promoted guest was mailed the spot-opened subject',
    mails.some((m) => m.Subject === 'A spot opened up for Thursday Night 5K'), mails.map((m) => m.Subject));
  const guestMail = await mailFor('guest@example.com');
  ok('a guest cancelling their own place sends no mail', guestMail.length === 0, guestMail.map((m) => m.Subject));
});

await run('approval queue', async () => {
  await resetMail();
  const host = await login('host@example.com');
  const list = await call('GET', '/api/events/sunrise-long-run/registrations', { token: host });
  const pending = list.json.find((r) => r.status === 'pending_approval');
  ok('a pending request is waiting', !!pending, list.json);
  const approved = await call('POST', `/api/registrations/${pending.id}/approve`, { token: host });
  ok('approval confirms the row', approved.json.status === 'confirmed', approved.json);
  ok('approval issues a ticket', /^TKT-/.test(approved.json.ticket_code || ''), approved.json);
  await new Promise((r) => setTimeout(r, 800));
  const mails = await mailFor('guest3@example.com');
  ok('the approved guest was mailed the approval subject',
    mails.some((m) => m.Subject === "You're in: Sunrise Long Run"), mails.map((m) => m.Subject));
});

await run('approval_required starts pending and holds no seat', async () => {
  const g = await login('guest@example.com');
  const r = await call('POST', '/api/registrations', { token: g, body: { event_slug: 'sunrise-long-run' } });
  ok('registration starts pending_approval', r.json.status === 'pending_approval', r.json);
  ok('a pending registration holds no ticket', r.json.ticket_code === null, r.json);
  const host = await login('host@example.com');
  const declined = await call('POST', `/api/registrations/${r.json.id}/decline`, { token: host });
  ok('the host declines it', declined.json.status === 'declined', declined.json);
  await new Promise((r2) => setTimeout(r2, 800));
  const mails = await mailFor('guest@example.com');
  ok('the declined guest was mailed the decline subject',
    mails.some((m) => m.Subject === 'About your request to join Sunrise Long Run'), mails.map((m) => m.Subject));
});

await run('registration_closed refuses new registrations', async () => {
  const g = await login('guest@example.com');
  const r = await call('POST', '/api/registrations', { token: g, body: { event_slug: 'riverside-winter-time-trial' } });
  ok('a closed event refuses as a client error', r.status >= 400 && r.status < 500, { status: r.status, body: r.json });
  ok('the refusal names the closed state', /closed/i.test(r.json?.message || ''), r.json);
  ok('the refusal never says the word error', !/\berror\b/i.test(r.json?.message || ''), r.json);
  const rows = await sql(
    `SELECT count(*)::int n FROM registrations r JOIN events e ON e.id=r.event_id
      WHERE e.slug='riverside-winter-time-trial'`
  );
  ok('a refused registration leaves no row behind', rows[0].n === 0, rows);
});

await run('cancelled event refuses registration', async () => {
  const g = await login('guest@example.com');
  const r = await call('POST', '/api/registrations', { token: g, body: { event_slug: 'autumn-book-swap' } });
  ok('a cancelled event refuses as a client error', r.status >= 400 && r.status < 500, { s: r.status, b: r.json });
});

await run('check-in records one arrival', async () => {
  const host = await login('host@example.com');
  const list = await call('GET', '/api/events/thursday-night-5k/registrations', { token: host });
  const seat = list.json.find((r) => r.status === 'confirmed');
  const first = await call('POST', `/api/tickets/${seat.ticket_code}/check-in`, { token: host });
  ok('the first check-in succeeds', first.json.status === 'checked_in', first.json);
  const second = await call('POST', `/api/tickets/${seat.ticket_code}/check-in`, { token: host });
  ok('the second check-in answers already checked in', second.json.already_checked_in === true, second.json);
  ok('the arrival time did not move', first.json.checked_in_at === second.json.checked_in_at, [first.json, second.json]);
  const rows = await sql(`SELECT count(*)::int n FROM registrations WHERE ticket_code = $1`, [seat.ticket_code]);
  ok('still one row', rows[0].n === 1, rows);
  ok('a checked-in row keeps its ticket code', second.json.ticket_code === seat.ticket_code);
});

await run('authorization: a guest cannot reach host endpoints', async () => {
  const g = await login('guest@example.com');
  const host = await login('host@example.com');
  const list = await call('GET', '/api/events/thursday-night-5k/registrations', { token: host });
  const someone = list.json[0];

  const cases = [
    ['guest list', await call('GET', '/api/events/thursday-night-5k/registrations', { token: g })],
    ['guest list csv', await call('GET', '/api/events/thursday-night-5k/registrations.csv', { token: g })],
    ['patch event', await call('PATCH', '/api/events/thursday-night-5k', { token: g, body: { capacity: 500 } })],
    ['cancel event', await call('POST', '/api/events/thursday-night-5k/cancel', { token: g, body: { reason: 'no' } })],
    ['approve', await call('POST', `/api/registrations/${someone.id}/approve`, { token: g })],
    ['decline', await call('POST', `/api/registrations/${someone.id}/decline`, { token: g })],
    ['create calendar', await call('POST', '/api/calendars', { token: g, body: { name: 'X', slug: 'x-cal', category: 'books', city: 'Y', is_public: true } })],
    ['create event', await call('POST', '/api/events', { token: g, body: { calendar_slug: 'riverside-run-club', title: 'X' } })],
  ];
  for (const [name, res] of cases) ok(`guest refused: ${name}`, res.status === 403 || res.status === 404, { name, status: res.status });

  const ev = await call('GET', '/api/events/thursday-night-5k');
  ok('protected state unchanged after refusals', ev.json.state === 'published' && ev.json.capacity === 3, ev.json);
});

await run('authorization: another host cannot reach this calendar', async () => {
  const h2 = await login('host2@example.com');
  const host = await login('host@example.com');
  const list = await call('GET', '/api/events/thursday-night-5k/registrations', { token: host });
  const someone = list.json[0];
  const code = (list.json.find((r) => r.ticket_code) || {}).ticket_code;
  const cases = [
    ['guest list', await call('GET', '/api/events/thursday-night-5k/registrations', { token: h2 })],
    ['csv', await call('GET', '/api/events/thursday-night-5k/registrations.csv', { token: h2 })],
    ['patch', await call('PATCH', '/api/events/thursday-night-5k', { token: h2, body: { capacity: 400 } })],
    ['cancel', await call('POST', '/api/events/thursday-night-5k/cancel', { token: h2, body: { reason: 'nope' } })],
    ['approve', await call('POST', `/api/registrations/${someone.id}/approve`, { token: h2 })],
    ['check-in', await call('POST', `/api/tickets/${code}/check-in`, { token: h2 })],
    ['create event on another calendar', await call('POST', '/api/events', { token: h2, body: { calendar_slug: 'riverside-run-club', title: 'Sneaky' } })],
  ];
  for (const [name, res] of cases) ok(`other host refused: ${name}`, res.status >= 400, { name, status: res.status });
});

await run('unauthenticated is denied, not served', async () => {
  const cases = [
    ['registrations me', await call('GET', '/api/registrations/me')],
    ['calendars', await call('GET', '/api/calendars')],
    ['accounts me', await call('GET', '/api/accounts/me')],
    ['guest list', await call('GET', '/api/events/thursday-night-5k/registrations')],
    ['csv', await call('GET', '/api/events/thursday-night-5k/registrations.csv')],
    ['register', await call('POST', '/api/registrations', { body: { event_slug: 'thursday-night-5k' } })],
  ];
  for (const [name, res] of cases) ok(`anonymous refused: ${name}`, res.status === 401, { name, status: res.status });
});

await run('filtering, q and pagination', async () => {
  const byCat = await call('GET', '/api/events?category=running');
  ok('category filter narrows', byCat.json.every((e) => e.category === 'running'), byCat.json.map((e) => e.category));
  const byCity = await call('GET', '/api/events?city=Lisbon');
  ok('city filter narrows', byCity.json.every((e) => e.city === 'Lisbon'), byCity.json.map((e) => e.city));
  const q = await call('GET', '/api/events?q=track');
  ok('q matches the title', q.json.some((e) => e.slug === 'riverside-track-session'), q.json.map((e) => e.slug));
  const qDesc = await call('GET', '/api/events?q=canal');
  ok('q matches the description', qDesc.json.some((e) => e.slug === 'thursday-night-5k'), qDesc.json.map((e) => e.slug));
  const qCal = await call('GET', '/api/events?q=Northside');
  ok('q matches the calendar name', qCal.json.some((e) => e.slug === 'winter-reading-night'), qCal.json.map((e) => e.slug));
  const qCity = await call('GET', '/api/events?q=Berlin');
  ok('q does not do the city job', qCity.json.length === 0, qCity.json.map((e) => e.slug));
  const combined = await call('GET', '/api/events?category=running&city=Berlin&q=track');
  ok('the three combine as one condition', combined.json.length === 1 && combined.json[0].slug === 'riverside-track-session', combined.json.map((e) => e.slug));
  const contradiction = await call('GET', '/api/events?category=books&q=track');
  ok('q narrows rather than widens', contradiction.json.length === 0, contradiction.json.map((e) => e.slug));
  const blank = await call('GET', '/api/events?q=%20%20');
  const none = await call('GET', '/api/events');
  ok('whitespace q is treated as absent', blank.json.length === none.json.length && blank.json.length > 0, { blank: blank.json.length, none: none.json.length });
  const partial = await call('GET', '/api/events?q=RACK');
  ok('q matches any part of a word, case-insensitively', partial.json.some((e) => e.slug === 'riverside-track-session'), partial.json.map((e) => e.slug));

  const page = await call('GET', '/api/events?limit=2&offset=0');
  ok('limit honoured', page.json.length === 2);
  const page2 = await call('GET', '/api/events?limit=2&offset=2');
  ok('offset pages forward', page2.json[0]?.slug !== page.json[0]?.slug, [page.json[0]?.slug, page2.json[0]?.slug]);
  ok('total counts before limit and offset', page.headers.get('x-total-count') === page2.headers.get('x-total-count'));
  const empty = await call('GET', '/api/events?city=Atlantis');
  ok('empty page still carries the header as 0', empty.headers.get('x-total-count') === '0', empty.headers.get('x-total-count'));
  const capped = await call('GET', '/api/events?limit=5000');
  ok('limit is capped at 100', capped.json.length <= 100);
});

await run('CSV export', async () => {
  const host = await login('host@example.com');
  const res = await fetch(BASE + '/api/events/thursday-night-5k/registrations.csv', {
    headers: { authorization: `Bearer ${host}` },
  });
  const body = await res.text();
  ok('served as text/csv', /text\/csv/.test(res.headers.get('content-type') || ''), res.headers.get('content-type'));
  ok('named after the event slug', /thursday-night-5k\.csv/.test(res.headers.get('content-disposition') || ''), res.headers.get('content-disposition'));
  const lines = body.trim().split('\n');
  ok('pinned header line', lines[0] === 'email,display_name,status,waitlist_position,ticket_code', lines[0]);
  const statuses = lines.slice(1).map((l) => l.split(',')[2]);
  ok('ordered by status ascending', JSON.stringify(statuses) === JSON.stringify([...statuses].sort()), statuses);
});

await run('capacity edit rules', async () => {
  const host = await login('host@example.com');
  const ev = await call('GET', '/api/events/thursday-night-5k', { token: host });
  const lower = await call('PATCH', '/api/events/thursday-night-5k', { token: host, body: { capacity: 1 } });
  ok('lowering below confirmed is refused', lower.status === 400, { s: lower.status, b: lower.json });
  ok('the refusal names the count', /You already have \d+ guests confirmed\./.test(lower.json?.message || ''), lower.json);
  ok('the refusal names the field', lower.json?.field === 'capacity', lower.json);
  const still = await call('GET', '/api/events/thursday-night-5k', { token: host });
  ok('capacity unchanged after a refusal', still.json.capacity === ev.json.capacity, still.json.capacity);
  const over = await call('PATCH', '/api/events/thursday-night-5k', { token: host, body: { capacity: 900 } });
  ok('capacity above 500 refused', over.status === 400, over.json);
});

await run('raising capacity moves the waiting list', async () => {
  await resetMail();
  const host = await login('host@example.com');
  const before = await call('GET', '/api/events/riverside-track-session', { token: host });
  const waiting = await sql(
    `SELECT count(*)::int n FROM registrations r JOIN events e ON e.id=r.event_id
      WHERE e.slug='riverside-track-session' AND r.status='waitlisted'`
  );
  ok('somebody is waiting', waiting[0].n >= 1, waiting);
  const raised = await call('PATCH', '/api/events/riverside-track-session', {
    token: host,
    body: { capacity: before.json.capacity + waiting[0].n },
  });
  ok('the raise reports how many were seated', raised.json.promoted_from_waitlist === waiting[0].n, raised.json);
  const after = await sql(
    `SELECT r.status, r.waitlist_position, r.ticket_code FROM registrations r JOIN events e ON e.id=r.event_id
      WHERE e.slug='riverside-track-session'`
  );
  ok('nobody is left waiting', after.every((r) => r.status !== 'waitlisted'), after);
  ok('everyone seated holds a ticket', after.filter((r) => r.status === 'confirmed').every((r) => /^TKT-/.test(r.ticket_code || '')), after);
  await new Promise((r) => setTimeout(r, 800));
  const all = await (await fetch(`${MAILPIT}/api/v1/messages?limit=50`)).json();
  ok('the seated guest was mailed the spot-opened subject',
    all.messages.some((m) => m.Subject === 'A spot opened up for Riverside Track Session'),
    all.messages.map((m) => m.Subject));
});

await run('waitlist positions are 1..n with no gaps', async () => {
  const rows = await sql(
    `SELECT e.slug, array_agg(r.waitlist_position ORDER BY r.waitlist_position) AS positions
       FROM registrations r JOIN events e ON e.id=r.event_id
      WHERE r.status='waitlisted' GROUP BY e.slug`
  );
  for (const r of rows) {
    const expected = r.positions.map((_, i) => i + 1);
    ok(`positions on ${r.slug} are 1..n`, JSON.stringify(r.positions) === JSON.stringify(expected), r);
  }
  if (!rows.length) ok('no waiting lists to check', true);
});

await run('ticket invariants across the whole database', async () => {
  const bad = await sql(
    `SELECT count(*)::int n FROM registrations
      WHERE (status IN ('confirmed','checked_in')) <> (ticket_code IS NOT NULL)`
  );
  ok('a code exists exactly when seated', bad[0].n === 0, bad);
  const dupes = await sql(
    `SELECT count(*)::int n FROM (SELECT ticket_code FROM registrations WHERE ticket_code IS NOT NULL
       GROUP BY ticket_code HAVING count(*) > 1) x`
  );
  ok('no code is held twice', dupes[0].n === 0, dupes);
  const shape = await sql(`SELECT count(*)::int n FROM registrations WHERE ticket_code IS NOT NULL AND ticket_code !~ '^TKT-[A-Z0-9]{8}$'`);
  ok('every code has the pinned shape', shape[0].n === 0, shape);
  const over = await sql(
    `SELECT e.slug, e.capacity, count(*)::int seated FROM registrations r JOIN events e ON e.id=r.event_id
      WHERE r.status IN ('confirmed','checked_in') GROUP BY e.slug, e.capacity HAVING count(*) > e.capacity`
  );
  ok('no event is over-sold', over.length === 0, over);
  const seatless = await sql(
    `SELECT count(*)::int n FROM registrations
      WHERE status IN ('pending_approval','waitlisted','declined','cancelled_by_guest','cancelled_by_host')
        AND ticket_code IS NOT NULL`
  );
  ok('a seatless status holds no seat', seatless[0].n === 0, seatless);
});

await run('ticket lookup is open to anyone presenting the code', async () => {
  const host = await login('host@example.com');
  const list = await call('GET', '/api/events/thursday-night-5k/registrations', { token: host });
  const code = list.json.find((r) => r.ticket_code)?.ticket_code;
  const anon = await call('GET', `/api/tickets/${code}`);
  ok('a stranger with the code sees the ticket', anon.status === 200, anon.json);
  ok('the ticket names its event', anon.json.event_slug === 'thursday-night-5k', anon.json);
  ok('the ticket carries no guest list', !Array.isArray(anon.json.registrations) && !anon.json.guests, Object.keys(anon.json));
  ok('a code that never existed is a not-found', (await call('GET', '/api/tickets/TKT-ZZZZZZZZ')).status === 404);
});

await run('event cancellation mails every guest the reason', async () => {
  await resetMail();
  const h2 = await login('host2@example.com');
  const reason = 'The reading room flooded and cannot be dried in time.';
  const noReason = await call('POST', '/api/events/winter-reading-night/cancel', { token: h2, body: { reason: '  ' } });
  ok('an empty reason is refused', noReason.status === 400, noReason.json);

  const holders = await sql(
    `SELECT ac.email FROM registrations r JOIN events e ON e.id=r.event_id
       JOIN accounts ac ON ac.id=r.account_id
      WHERE e.slug='winter-reading-night' AND r.status IN ('confirmed','checked_in','waitlisted','pending_approval')`
  );
  const res = await call('POST', '/api/events/winter-reading-night/cancel', { token: h2, body: { reason } });
  ok('the event is cancelled', res.json.state === 'cancelled', res.json);
  ok('the reason comes back word for word', res.json.cancel_reason === reason, res.json.cancel_reason);

  await new Promise((r) => setTimeout(r, 1500));
  const all = await (await fetch(`${MAILPIT}/api/v1/messages?limit=50`)).json();
  ok('one mail per holder', all.messages.length === holders.length, { sent: all.messages.length, holders: holders.length });
  ok('the pinned cancellation subject', all.messages.every((m) => m.Subject === 'Winter Reading Night has been cancelled'), all.messages.map((m) => m.Subject));
  if (all.messages.length) {
    const full = await (await fetch(`${MAILPIT}/api/v1/message/${all.messages[0].ID}`)).json();
    ok('the body carries the reason word for word', full.Text.includes(reason), full.Text.slice(0, 400));
  }
  const republish = await call('PATCH', '/api/events/winter-reading-night', { token: h2, body: { state: 'published' } });
  ok('a cancelled event cannot be republished', republish.status === 400, republish.json);
});

await run('state transitions', async () => {
  const host = await login('host@example.com');
  const toDraft = await call('PATCH', '/api/events/thursday-night-5k', { token: host, body: { state: 'draft' } });
  ok('published cannot return to draft', toDraft.status === 400, toDraft.json);
  const close = await call('PATCH', '/api/events/thursday-night-5k', { token: host, body: { state: 'registration_closed' } });
  ok('published closes registration', close.json.state === 'registration_closed', close.json);
  const g = await login('guest2@example.com');
  const blocked = await call('POST', '/api/registrations', { token: g, body: { event_slug: 'thursday-night-5k' } });
  ok('a closed event takes no new registration', blocked.status >= 400 && blocked.status < 500, blocked.json);
  ok('a closed event stays readable at its address', (await call('GET', '/api/events/thursday-night-5k')).status === 200);
  const reopen = await call('PATCH', '/api/events/thursday-night-5k', { token: host, body: { state: 'published' } });
  ok('a closed event reopens', reopen.json.state === 'published', reopen.json);
  const draftClose = await call('PATCH', '/api/events/harbour-loop-recovery-jog', { token: host, body: { state: 'registration_closed' } });
  ok('a draft cannot close registration', draftClose.status === 400, draftClose.json);
});

await run('the namespace', async () => {
  const host = await login('host@example.com');
  for (const slug of ['api', 'running', 'thursday-night-5k', 'riverside-run-club', 'priya-raman']) {
    const r = await call('POST', '/api/calendars', {
      token: host,
      body: { name: 'Clash', slug, category: 'books', city: 'Berlin', is_public: true },
    });
    ok(`calendar slug "${slug}" refused`, r.status >= 400, { slug, s: r.status });
    if (r.status === 409) ok(`refusal for "${slug}" is the pinned sentence`, r.json.message === 'That address is already taken.', r.json);
  }
  const g = await login('guest@example.com');
  for (const handle of ['api', 'running', 'thursday-night-5k', 'riverside-run-club', 'priya-raman']) {
    const r = await call('PATCH', '/api/accounts/me', { token: g, body: { handle } });
    ok(`handle "${handle}" refused`, r.status >= 400, { handle, s: r.status });
  }
  const still = await call('GET', '/api/accounts/me', { token: g });
  ok('the account keeps the handle it had', still.json.handle === 'amina-osei', still.json);
  const taken = await call('PATCH', '/api/accounts/me', { token: g, body: { handle: 'tomas-vidal' } });
  ok('a taken handle gets the pinned sentence', taken.json.message === 'That handle is already taken.', taken.json);
  const good = await call('PATCH', '/api/accounts/me', { token: g, body: { handle: 'amina-osei-runs' } });
  ok('a free handle is accepted', good.json.handle === 'amina-osei-runs', good.json);
  await call('PATCH', '/api/accounts/me', { token: g, body: { handle: 'amina-osei' } });
});

await run('signup always creates a guest', async () => {
  const email = `stranger-${Date.now()}@example.com`;
  const r = await call('POST', '/api/auth/signup', { body: { email, password: 'a-good-password', name: 'A Stranger' } });
  ok('signup succeeds', r.status === 201, r.json);
  ok('the new account is a guest', r.json.role === 'guest', r.json);
  ok('the new account carries an id', !!r.json.id, r.json);
  ok('the new account can sign in', !!(await call('POST', '/api/auth/login', { body: { email, password: 'a-good-password' } })).json.access_token);
  const escalate = await call('POST', '/api/auth/signup', { body: { email: `x${Date.now()}@example.com`, password: 'a-good-password', name: 'X', role: 'host' } });
  ok('a role in the body cannot make a host', escalate.json.role === 'guest', escalate.json);
});

await run('validation names the offending field', async () => {
  const cases = [
    ['email', await call('POST', '/api/auth/signup', { body: { email: 'not-an-email', password: 'a-good-password', name: 'N' } })],
    ['password', await call('POST', '/api/auth/signup', { body: { email: 'a@b.co', password: 'x', name: 'N' } })],
    ['name', await call('POST', '/api/auth/signup', { body: { email: 'a@b.co', password: 'a-good-password', name: '' } })],
  ];
  for (const [field, res] of cases) {
    ok(`${field} rejection names the field`, res.json?.field === field, res.json);
    ok(`${field} rejection avoids the word error`, !/\berror\b/i.test(res.json?.message || ''), res.json);
  }
  ok('the pinned email sentence', cases[0][1].json.message === 'Enter a valid email address.', cases[0][1].json.message);
  ok('the pinned name sentence', cases[2][1].json.message === 'Add your name so hosts know who is coming.', cases[2][1].json.message);
});

await run('rate limit', async () => {
  const email = `flood-${Date.now()}@example.com`;
  let limited = null;
  for (let i = 0; i < 14; i++) {
    const r = await call('POST', '/api/auth/login', { body: { email, password: 'wrong-password' } });
    if (r.status === 429) {
      limited = r;
      break;
    }
  }
  ok('login is limited', !!limited, 'never limited');
  if (limited) {
    ok('the limit is a client error', limited.status === 429);
    ok('the body states the rate limit', /10 requests per minute/.test(limited.json?.message || '') || limited.json?.limit === 10, limited.json);
  }
});

await run('times cross the API as UTC instants', async () => {
  const ev = await call('GET', '/api/events/riverside-track-session');
  ok('starts_at ends in Z', /Z$/.test(ev.json.starts_at), ev.json.starts_at);
  ok('ends_at ends in Z', /Z$/.test(ev.json.ends_at), ev.json.ends_at);
  ok('the event carries an IANA zone', ev.json.time_zone === 'Europe/Berlin', ev.json.time_zone);
  const host = await login('host@example.com');
  const local = await call('PATCH', '/api/events/riverside-track-session', { token: host, body: { starts_at: '2027-01-01T10:00:00' } });
  ok('a local time without a zone is refused', local.status === 400, local.json);
});

await run('the shell carries the event key colour', async () => {
  const html = await (await fetch(BASE + '/thursday-night-5k')).text();
  ok('the first document carries a theme block', /id="event-theme"/.test(html), html.slice(0, 300));
  ok('it carries the event key colour', /--event-key:#146aeb/.test(html), html.match(/--event-key:[^;]+/)?.[0]);
  ok('it carries a derived ground', /--event-ground:#[0-9a-f]{6}/.test(html), html.match(/--event-ground:[^;]+/)?.[0]);
  const plainHtml = await (await fetch(BASE + '/discover')).text();
  ok('a plain route carries no theme block', !/id="event-theme"/.test(plainHtml));
});

await run('event creation and the composer contract', async () => {
  const host = await login('host@example.com');
  const stamp = Date.now().toString(36);
  const draft = await call('POST', '/api/events', {
    token: host,
    body: { calendar_slug: 'riverside-run-club', title: `Half Made ${stamp}`, slug: `half-made-${stamp}` },
  });
  ok('an incomplete submission is stored as a draft', draft.json.state === 'draft', draft.json);
  ok('a created event carries a theme hex', /^#[0-9a-f]{6}$/.test(draft.json.theme_hex || ''), draft.json);

  const full = await call('POST', '/api/events', {
    token: host,
    body: {
      calendar_slug: 'riverside-run-club', title: `Full Event ${stamp}`, slug: `full-event-${stamp}`,
      category: 'running', city: 'Berlin', time_zone: 'Europe/Berlin',
      starts_at: '2027-06-01T17:00:00Z', ends_at: '2027-06-01T19:00:00Z',
      capacity: 10, approval_required: false, waitlist_enabled: true, description: 'A complete submission.',
    },
  });
  ok('a complete submission is published', full.json.state === 'published', full.json);
  const reuse = await call('POST', '/api/events', {
    token: host,
    body: { calendar_slug: 'riverside-run-club', title: 'Clash', slug: `full-event-${stamp}` },
  });
  ok('a slug is never reused', reuse.status >= 400, reuse.json);
  const badEnd = await call('POST', '/api/events', {
    token: host,
    body: {
      calendar_slug: 'riverside-run-club', title: 'Backwards', slug: `backwards-${stamp}`,
      category: 'running', city: 'Berlin', starts_at: '2027-06-01T19:00:00Z',
      ends_at: '2027-06-01T17:00:00Z', capacity: 5,
    },
  });
  ok('ends_at before starts_at is refused', badEnd.status === 400, badEnd.json);
});

/* ------------------------------------------------------------------ */

await dbc.end();
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('failures:', failures);
  process.exit(1);
}

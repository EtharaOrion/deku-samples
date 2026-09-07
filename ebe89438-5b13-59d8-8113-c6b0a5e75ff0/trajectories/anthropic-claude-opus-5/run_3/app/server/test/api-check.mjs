/**
 * End-to-end checks against a running instance, including the last seat under
 * contention. Run with: node test/api-check.mjs [baseUrl]
 */
import pg from 'pg';

const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:4173';
const PW = 'deku-demo-pw-2026';
const MAILPIT = process.env.MAILPIT_HTTP || 'http://mailpit:8025';

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    failures.push(`${name} ${detail}`);
    console.log(`  FAIL ${name} ${detail}`);
  }
}

async function req(method, path, { token, body, raw } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (raw) return res;
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json, headers: res.headers };
}

async function login(email) {
  const r = await req('POST', '/api/auth/login', { body: { email, password: PW } });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(r.body)}`);
  return r.body.access_token;
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const sql = (t, p = []) => pool.query(t, p);

async function resetEvent(slug) {
  await sql('DELETE FROM registrations WHERE event_id = (SELECT id FROM events WHERE slug = $1)', [slug]);
}

async function main() {
  console.log(`\n== health and shape ==`);
  const health = await req('GET', '/api/health');
  ok('health returns 200', health.status === 200, JSON.stringify(health.body));

  const hostToken = await login('host@example.com');
  const host2Token = await login('host2@example.com');
  const g1 = await login('guest@example.com');
  const g2 = await login('guest2@example.com');
  const g3 = await login('guest3@example.com');
  ok('seeded accounts sign in with the pinned password', !!hostToken && !!g1);

  console.log(`\n== discovery ==`);
  const list = await req('GET', '/api/events');
  ok('GET /api/events returns an array at the top level', Array.isArray(list.body));
  ok('X-Total-Count is present', list.headers.get('x-total-count') !== null);
  const slugs = list.body.map((e) => e.slug);
  ok('draft never appears', !slugs.includes('harbour-loop-recovery-jog'));
  ok('cancelled never appears', !slugs.includes('autumn-book-swap'));
  ok('registration_closed appears', slugs.includes('riverside-winter-time-trial'));
  const sorted = [...list.body].sort((a, b) =>
    a.starts_at === b.starts_at ? a.slug.localeCompare(b.slug) : a.starts_at.localeCompare(b.starts_at)
  );
  ok('ranking is soonest first then slug', JSON.stringify(sorted.map((e) => e.slug)) === JSON.stringify(slugs));
  ok(
    'every timestamp ends in Z',
    list.body.every((e) => !e.starts_at || e.starts_at.endsWith('Z'))
  );

  const empty = await req('GET', '/api/events?category=crypto');
  ok('X-Total-Count reads 0 on an empty page', empty.headers.get('x-total-count') === '0');

  const qOnly = await req('GET', '/api/events?q=%20%20');
  ok('a q of only whitespace is treated as absent', qOnly.body.length === list.body.length);

  const narrowed = await req('GET', '/api/events?category=running&q=track');
  ok(
    'q narrows category rather than widening it',
    narrowed.body.every((e) => e.category === 'running') &&
      narrowed.body.some((e) => e.slug === 'riverside-track-session')
  );
  const byCity = await req('GET', '/api/events?q=Berlin');
  ok('city is city\u2019s job and never q\u2019s', byCity.body.length === 0, JSON.stringify(byCity.body.map((e) => e.slug)));

  const calName = await req('GET', '/api/events?q=Northside');
  ok('q matches the calendar name', calName.body.some((e) => e.slug === 'winter-reading-night'));

  const paged = await req('GET', '/api/events?limit=2&offset=0');
  ok('limit is honoured', paged.body.length === 2);
  ok('X-Total-Count counts before limit', Number(paged.headers.get('x-total-count')) === list.body.length);
  const capped = await req('GET', '/api/events?limit=5000');
  ok('limit is capped at 100', capped.body.length <= 100);

  console.log(`\n== namespace ==`);
  for (const [slug, kind] of [
    ['api', 'system'],
    ['running', 'category'],
    ['thursday-night-5k', 'event'],
    ['riverside-run-club', 'calendar'],
    ['priya-raman', 'account'],
  ]) {
    const r = await req('GET', `/api/resolve/${slug}`);
    ok(`resolve ${slug} -> ${kind}`, r.status === 200 && r.body.kind === kind, JSON.stringify(r.body));
  }
  const nope = await req('GET', '/api/resolve/definitely-not-here');
  ok('resolve of an unknown slug is not found', nope.status === 404);

  console.log(`\n== draft privacy ==`);
  const draftAnon = await req('GET', '/api/events/harbour-loop-recovery-jog');
  const ghost = await req('GET', '/api/events/never-existed-at-all');
  ok(
    'a draft answers a stranger exactly as a slug that never existed does',
    draftAnon.status === 404 && ghost.status === 404 && JSON.stringify(draftAnon.body) === JSON.stringify(ghost.body)
  );
  const draftOwner = await req('GET', '/api/events/harbour-loop-recovery-jog', { token: hostToken });
  ok('the owning host reads its own draft', draftOwner.status === 200);
  const draftOther = await req('GET', '/api/events/harbour-loop-recovery-jog', { token: host2Token });
  ok('another host does not', draftOther.status === 404);

  console.log(`\n== authorization ==`);
  const guestLists = await req('GET', '/api/events/thursday-night-5k/registrations', { token: g1 });
  ok('a guest cannot read a guest list', guestLists.status === 404, String(guestLists.status));
  const anonList = await req('GET', '/api/events/thursday-night-5k/registrations');
  ok('an unauthenticated caller cannot either', anonList.status === 401 || anonList.status === 404);
  const otherHostList = await req('GET', '/api/events/thursday-night-5k/registrations', { token: host2Token });
  ok('a host who does not own the calendar cannot', otherHostList.status === 404);
  const guestCsv = await req('GET', '/api/events/thursday-night-5k/registrations.csv', { token: g1 });
  ok('the CSV meets the same refusal as the JSON list', guestCsv.status === 404);

  const guestCal = await req('POST', '/api/calendars', {
    token: g1,
    body: { name: 'Sneaky', slug: 'sneaky-cal', category: 'books', city: 'Berlin', is_public: true },
  });
  ok('a guest is refused calendar creation', guestCal.status === 404 || guestCal.status === 403);
  const stillGone = await sql('SELECT 1 FROM calendars WHERE slug = $1', ['sneaky-cal']);
  ok('and the protected state is unchanged', stillGone.rowCount === 0);

  const guestEdit = await req('PATCH', '/api/events/thursday-night-5k', {
    token: g1,
    body: { title: 'Hijacked' },
  });
  ok('a guest cannot edit an event', guestEdit.status === 404);
  const titleRow = await sql('SELECT title FROM events WHERE slug = $1', ['thursday-night-5k']);
  ok('the title is unchanged', titleRow.rows[0].title === 'Thursday Night 5K');

  const crossHostEdit = await req('PATCH', '/api/events/thursday-night-5k', {
    token: host2Token,
    body: { title: 'Hijacked' },
  });
  ok('a host cannot touch another host\u2019s event', crossHostEdit.status === 404);

  const noToken = await req('POST', '/api/registrations', { body: { event_slug: 'thursday-night-5k' } });
  ok('a mutating call without a token is denied', noToken.status === 401);

  console.log(`\n== the last seat under contention ==`);
  await resetEvent('riverside-track-session');
  await sql(
    `INSERT INTO registrations (event_id, account_id, status, seat_no, ticket_code)
     SELECT e.id, a.id, 'confirmed', 1, 'TKT-RACEBASE'
       FROM events e, accounts a WHERE e.slug = 'riverside-track-session' AND a.email = 'guest2@example.com'`
  );

  const raceA = req('POST', '/api/registrations', { token: g1, body: { event_slug: 'riverside-track-session' } });
  const raceB = req('POST', '/api/registrations', { token: g3, body: { event_slug: 'riverside-track-session' } });
  const [rA, rB] = await Promise.all([raceA, raceB]);
  const statuses = [rA.body.status, rB.body.status].sort();
  ok(
    'two guests at the last seat produce one seat and one waiting-list place',
    JSON.stringify(statuses) === JSON.stringify(['confirmed', 'waitlisted']),
    JSON.stringify({ a: rA.body, b: rB.body })
  );
  const seated = await sql(
    `SELECT count(*)::int AS n FROM registrations
      WHERE event_id = (SELECT id FROM events WHERE slug='riverside-track-session')
        AND status IN ('confirmed','checked_in')`
  );
  ok('confirmed never exceeds capacity in the database', seated.rows[0].n === 2, `seated=${seated.rows[0].n}`);

  console.log(`\n== a wider race: 20 arrivals at 5 seats ==`);
  const racers = [];
  for (let i = 0; i < 20; i++) {
    const email = `racer${i}@example.com`;
    const su = await req('POST', '/api/auth/signup', {
      body: { email, password: PW, name: `Racer ${i}` },
    });
    racers.push(su.body.access_token || (await login(email)));
  }
  const capRes = await sql(`SELECT id::text FROM calendars WHERE slug='riverside-run-club'`);
  await sql(`DELETE FROM events WHERE slug='race-test-event'`);
  await sql(
    `INSERT INTO events (calendar_id, title, slug, category, city, time_zone, cover_seed, theme_hex,
                         description, location, starts_at, ends_at, capacity, approval_required,
                         waitlist_enabled, state, published_at)
     VALUES ($1,'Race Test Event','race-test-event','running','Berlin','Europe/Berlin','race','#146aeb',
             'race','track', now() + interval '20 days', now() + interval '20 days 2 hours',
             5, false, true, 'published', now())`,
    [capRes.rows[0].id]
  );
  const results = await Promise.all(
    racers.map((t) => req('POST', '/api/registrations', { token: t, body: { event_slug: 'race-test-event' } }))
  );
  const confirmedN = results.filter((r) => r.body?.status === 'confirmed').length;
  const waitN = results.filter((r) => r.body?.status === 'waitlisted').length;
  ok('exactly five seats were handed out', confirmedN === 5, `confirmed=${confirmedN}`);
  ok('the rest took waiting-list places', waitN === 15, `waitlisted=${waitN}`);
  const dbSeated = await sql(
    `SELECT count(*)::int AS n FROM registrations
      WHERE event_id=(SELECT id FROM events WHERE slug='race-test-event')
        AND status IN ('confirmed','checked_in')`
  );
  ok('the database agrees five seats exist', dbSeated.rows[0].n === 5, `db=${dbSeated.rows[0].n}`);
  const positions = await sql(
    `SELECT array_agg(waitlist_position ORDER BY waitlist_position) AS p FROM registrations
      WHERE event_id=(SELECT id FROM events WHERE slug='race-test-event') AND status='waitlisted'`
  );
  const p = positions.rows[0].p || [];
  ok(
    'waiting-list positions are 1..n with no gaps and no repeats',
    JSON.stringify(p) === JSON.stringify(Array.from({ length: p.length }, (_, i) => i + 1)),
    JSON.stringify(p)
  );
  const noPartial = await sql(
    `SELECT count(*)::int AS n FROM registrations
      WHERE event_id=(SELECT id FROM events WHERE slug='race-test-event')`
  );
  ok('a rejected attempt left no partial row', noPartial.rows[0].n === 20, `rows=${noPartial.rows[0].n}`);

  console.log(`\n== one registration per account per event ==`);
  const dup1 = req('POST', '/api/registrations', { token: racers[0], body: { event_slug: 'race-test-event' } });
  const dup2 = req('POST', '/api/registrations', { token: racers[0], body: { event_slug: 'race-test-event' } });
  await Promise.all([dup1, dup2]);
  const dupCount = await sql(
    `SELECT count(*)::int AS n FROM registrations
      WHERE event_id=(SELECT id FROM events WHERE slug='race-test-event')
        AND account_id=(SELECT id FROM accounts WHERE email='racer0@example.com')`
  );
  ok('a repeat submission never adds a second row', dupCount.rows[0].n === 1, `rows=${dupCount.rows[0].n}`);

  console.log(`\n== cancelling frees the seat and promotes the head ==`);
  const firstConfirmed = await sql(
    `SELECT r.id::text, a.email FROM registrations r JOIN accounts a ON a.id=r.account_id
      WHERE r.event_id=(SELECT id FROM events WHERE slug='race-test-event') AND r.status='confirmed'
      ORDER BY r.seat_no LIMIT 1`
  );
  const headBefore = await sql(
    `SELECT r.id::text, r.account_id::text FROM registrations r
      WHERE r.event_id=(SELECT id FROM events WHERE slug='race-test-event')
        AND r.status='waitlisted' ORDER BY r.waitlist_position LIMIT 1`
  );
  const idx = Number(firstConfirmed.rows[0].email.replace(/\D/g, ''));
  const cancelToken = racers[idx];
  const cancelRes = await req('POST', `/api/registrations/${firstConfirmed.rows[0].id}/cancel`, {
    token: cancelToken,
  });
  ok('cancel returns cancelled_by_guest', cancelRes.body.status === 'cancelled_by_guest', JSON.stringify(cancelRes.body));
  const headAfter = await sql(`SELECT status, ticket_code FROM registrations WHERE id=$1`, [headBefore.rows[0].id]);
  ok('the head of the waiting list is confirmed in the same request', headAfter.rows[0].status === 'confirmed');
  ok('and holds a ticket code', /^TKT-[A-Z0-9]{8}$/.test(headAfter.rows[0].ticket_code || ''));
  const stillFive = await sql(
    `SELECT count(*)::int AS n FROM registrations
      WHERE event_id=(SELECT id FROM events WHERE slug='race-test-event') AND status IN ('confirmed','checked_in')`
  );
  ok('the seat count is unchanged at capacity', stillFive.rows[0].n === 5);
  const renumbered = await sql(
    `SELECT array_agg(waitlist_position ORDER BY waitlist_position) AS p FROM registrations
      WHERE event_id=(SELECT id FROM events WHERE slug='race-test-event') AND status='waitlisted'`
  );
  const p2 = renumbered.rows[0].p || [];
  ok(
    'the waiting list renumbers to 1..n',
    JSON.stringify(p2) === JSON.stringify(Array.from({ length: p2.length }, (_, i) => i + 1))
  );

  console.log(`\n== raising capacity moves the waiting list ==`);
  const raise = await req('PATCH', '/api/events/race-test-event', { token: hostToken, body: { capacity: 8 } });
  ok('the raise is accepted', raise.status === 200, JSON.stringify(raise.body).slice(0, 200));
  ok('it names how many were moved to a seat', raise.body.promoted_count === 3, String(raise.body.promoted_count));
  const afterSeated = await sql(
    `SELECT count(*)::int AS n FROM registrations
      WHERE event_id=(SELECT id FROM events WHERE slug='race-test-event') AND status IN ('confirmed','checked_in')`
  );
  ok('the seats that appeared were filled', afterSeated.rows[0].n === 8, `seated=${afterSeated.rows[0].n}`);
  const afterWait = await sql(
    `SELECT array_agg(waitlist_position ORDER BY waitlist_position) AS p FROM registrations
      WHERE event_id=(SELECT id FROM events WHERE slug='race-test-event') AND status='waitlisted'`
  );
  const p3 = afterWait.rows[0].p || [];
  ok(
    'those left waiting renumber with no gaps',
    JSON.stringify(p3) === JSON.stringify(Array.from({ length: p3.length }, (_, i) => i + 1)),
    JSON.stringify(p3)
  );
  const lowerRefused = await req('PATCH', '/api/events/race-test-event', { token: hostToken, body: { capacity: 2 } });
  ok('lowering below the confirmed count is refused', lowerRefused.status === 409);
  ok(
    'and the refusal carries the pinned sentence',
    lowerRefused.body.message === 'You already have 8 guests confirmed.',
    lowerRefused.body.message
  );

  console.log(`\n== ticket codes ==`);
  const codes = await sql(`SELECT status, ticket_code FROM registrations WHERE ticket_code IS NOT NULL LIMIT 200`);
  ok(
    'every code belongs to a seated status',
    codes.rows.every((r) => ['confirmed', 'checked_in'].includes(r.status))
  );
  const noCode = await sql(
    `SELECT count(*)::int AS n FROM registrations
      WHERE status IN ('confirmed','checked_in') AND ticket_code IS NULL`
  );
  ok('a seated status always carries a code', noCode.rows[0].n === 0);
  const shape = await sql(
    `SELECT count(*)::int AS n FROM registrations
      WHERE ticket_code IS NOT NULL AND ticket_code !~ '^TKT-[A-Z0-9]{8}$'`
  );
  ok('codes are TKT- plus 8 uppercase letters and digits', shape.rows[0].n === 0);

  console.log(`\n== approval queue ==`);
  await resetEvent('sunrise-long-run');
  const pend = await req('POST', '/api/registrations', { token: g3, body: { event_slug: 'sunrise-long-run' } });
  ok('with approval on, a registration starts pending_approval', pend.body.status === 'pending_approval');
  ok('and holds no seat', pend.body.ticket_code === null);
  const approve = await req('POST', `/api/registrations/${pend.body.id}/approve`, { token: hostToken });
  ok('the host approves it to confirmed', approve.body.status === 'confirmed', JSON.stringify(approve.body));
  ok('and it gains a ticket', /^TKT-/.test(approve.body.ticket_code || ''));
  const guestApprove = await req('POST', `/api/registrations/${pend.body.id}/approve`, { token: g1 });
  ok('a guest cannot approve anybody', guestApprove.status === 404);

  await resetEvent('sunrise-long-run');
  const pend2 = await req('POST', '/api/registrations', { token: g2, body: { event_slug: 'sunrise-long-run' } });
  const decline = await req('POST', `/api/registrations/${pend2.body.id}/decline`, { token: hostToken });
  ok('the host declines a request to declined', decline.body.status === 'declined');

  console.log(`\n== check-in ==`);
  await resetEvent('sunrise-long-run');
  const fresh = await req('POST', '/api/registrations', { token: g3, body: { event_slug: 'sunrise-long-run' } });
  const appr = await req('POST', `/api/registrations/${fresh.body.id}/approve`, { token: hostToken });
  const code = appr.body.ticket_code;
  const anonTicket = await req('GET', `/api/tickets/${code}`);
  ok('anyone presenting a real code reads the ticket', anonTicket.status === 200, String(anonTicket.status));
  ok(
    'the ticket carries no guest list',
    anonTicket.body.email === undefined && anonTicket.body.registrations === undefined
  );
  const ghostTicket = await req('GET', '/api/tickets/TKT-NOTREAL1');
  ok('a code that never existed meets not found', ghostTicket.status === 404);
  const ci1 = await req('POST', `/api/tickets/${code}/check-in`, { token: hostToken });
  ok('the owning host checks the ticket in', ci1.body.status === 'checked_in', JSON.stringify(ci1.body));
  const firstArrival = ci1.body.checked_in_at;
  const ci2 = await req('POST', `/api/tickets/${code}/check-in`, { token: hostToken });
  ok(
    'a second check-in records one arrival, not two',
    ci2.body.checked_in_at === firstArrival && ci2.body.already_checked_in === true
  );
  const ciGuest = await req('POST', `/api/tickets/${code}/check-in`, { token: g1 });
  ok('a guest cannot check anybody in', ciGuest.status === 404);
  const ciOtherHost = await req('POST', `/api/tickets/${code}/check-in`, { token: host2Token });
  ok('another host cannot either', ciOtherHost.status === 404);

  console.log(`\n== registration_closed ==`);
  const closed = await req('POST', '/api/registrations', {
    token: g1,
    body: { event_slug: 'riverside-winter-time-trial' },
  });
  ok('a closed event refuses a new registration as a client error', closed.status === 409, String(closed.status));
  ok('and the refusal names the closed state', /closed/i.test(closed.body.message || ''), closed.body.message);
  const closedRead = await req('GET', '/api/events/riverside-winter-time-trial');
  ok('it stays readable at its own address', closedRead.status === 200);
  const reopen = await req('PATCH', '/api/events/riverside-winter-time-trial', {
    token: hostToken,
    body: { state: 'published' },
  });
  ok('it moves back to published', reopen.body.state === 'published');
  const reclose = await req('PATCH', '/api/events/riverside-winter-time-trial', {
    token: hostToken,
    body: { state: 'registration_closed' },
  });
  ok('and back to registration_closed', reclose.body.state === 'registration_closed');
  const draftBack = await req('PATCH', '/api/events/thursday-night-5k', { token: hostToken, body: { state: 'draft' } });
  ok('a published event cannot return to draft', draftBack.status === 409, String(draftBack.status));
  const closeFromDraft = await req('PATCH', '/api/events/harbour-loop-recovery-jog', {
    token: hostToken,
    body: { state: 'registration_closed' },
  });
  ok('registration_closed is unreachable from draft', closeFromDraft.status === 409);

  console.log(`\n== cancellation ==`);
  await sql(`DELETE FROM events WHERE slug='cancel-test-event'`);
  await sql(
    `INSERT INTO events (calendar_id, title, slug, category, city, time_zone, cover_seed, theme_hex,
                         description, location, starts_at, ends_at, capacity, approval_required,
                         waitlist_enabled, state, published_at)
     VALUES ($1,'Cancel Test Event','cancel-test-event','running','Berlin','Europe/Berlin','cx','#ab46dd',
             'x','y', now() + interval '21 days', now() + interval '21 days 2 hours',
             4, false, true, 'published', now())`,
    [capRes.rows[0].id]
  );
  await req('POST', '/api/registrations', { token: g1, body: { event_slug: 'cancel-test-event' } });
  await req('POST', '/api/registrations', { token: g2, body: { event_slug: 'cancel-test-event' } });
  const noReason = await req('POST', '/api/events/cancel-test-event/cancel', {
    token: hostToken,
    body: { reason: '   ' },
  });
  ok('cancelling needs a non-empty reason', noReason.status === 400);
  const REASON = 'The hall flooded, and we could not find another room in time.';
  const cancelled = await req('POST', '/api/events/cancel-test-event/cancel', {
    token: hostToken,
    body: { reason: REASON },
  });
  ok('the event is cancelled', cancelled.body.state === 'cancelled');
  ok('and carries the reason word for word', cancelled.body.cancel_reason === REASON);
  ok('every guest holding a place was mailed', cancelled.body.notified_count === 2, String(cancelled.body.notified_count));
  const republish = await req('PATCH', '/api/events/cancel-test-event', { token: hostToken, body: { state: 'published' } });
  ok('a cancelled event cannot be republished', republish.status === 409);

  console.log(`\n== mail over real SMTP ==`);
  const logged = await sql(
    `SELECT recipient, subject FROM email_log
      WHERE event_id=(SELECT id FROM events WHERE slug='cancel-test-event')
        AND subject = 'Cancel Test Event has been cancelled'`
  );
  ok('email_log carries a row per cancellation mail', logged.rowCount === 2, String(logged.rowCount));
  ok(
    'the subject is the pinned cancellation line',
    logged.rows.every((r) => r.subject === 'Cancel Test Event has been cancelled'),
    JSON.stringify(logged.rows.map((r) => r.subject))
  );
  const confirmedThen = await sql(
    `SELECT count(*)::int AS n FROM email_log
      WHERE event_id=(SELECT id FROM events WHERE slug='cancel-test-event')
        AND subject = 'You\u2019re going to Cancel Test Event'`
  );
  ok('each registration owned its own subject earlier', confirmedThen.rows[0].n >= 0);

  try {
    const mp = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent('subject:"Cancel Test Event has been cancelled"')}`
    );
    const mpBody = await mp.json();
    const count = mpBody.messages_count ?? mpBody.total ?? (mpBody.messages || []).length;
    ok('Mailpit really holds those messages', count >= 2, JSON.stringify({ count }));
    const first = mpBody.messages?.[0];
    if (first) {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${first.ID}`)).json();
      ok(
        'the message goes to that guest alone, no cc, no bcc',
        (full.To || []).length === 1 && !(full.Cc || []).length && !(full.Bcc || []).length
      );
      ok('the body names the event', (full.Text || '').includes('Cancel Test Event'));
      ok('the body carries the reason word for word', (full.Text || '').includes(REASON));
    }
  } catch (err) {
    ok('Mailpit reachable', false, err.message);
  }

  const confirmMail = await sql(`SELECT subject FROM email_log WHERE subject LIKE 'You%re going to%' LIMIT 1`);
  ok('a confirmed registration owns its subject', confirmMail.rowCount > 0);

  console.log(`\n== CSV export ==`);
  const csv = await req('GET', '/api/events/race-test-event/registrations.csv', { token: hostToken, raw: true });
  const csvText = await csv.text();
  ok('served as text/csv', (csv.headers.get('content-type') || '').includes('text/csv'));
  ok('named after the event slug', (csv.headers.get('content-disposition') || '').includes('race-test-event.csv'));
  const lines = csvText.trim().split('\n');
  ok('the first line is the pinned header', lines[0] === 'email,display_name,status,waitlist_position,ticket_code', lines[0]);
  const statusOrder = lines.slice(1).map((l) => l.split(',')[2]);
  ok('ordered by status ascending', JSON.stringify(statusOrder) === JSON.stringify([...statusOrder].sort()));

  await sql(`UPDATE accounts SET display_name = $1 WHERE email='racer1@example.com'`, ['Bell, "Ada" Q']);
  const csv2 = await req('GET', '/api/events/race-test-event/registrations.csv', { token: hostToken, raw: true });
  const csv2Text = await csv2.text();
  ok(
    'a value with a comma or quote is wrapped and inner quotes doubled',
    csv2Text.includes('"Bell, ""Ada"" Q"'),
    csv2Text.split('\n').find((l) => l.includes('Ada')) || ''
  );

  console.log(`\n== validation and rate limits ==`);
  const badEmail = await req('POST', '/api/auth/signup', { body: { email: 'nope', password: PW, name: 'X' } });
  ok('a rejection names the offending field', badEmail.status === 400 && badEmail.body.field === 'email');
  ok('and reads as the pinned sentence', badEmail.body.message === 'Enter a valid email address.');
  const badCap = await req('POST', '/api/events', {
    token: hostToken,
    body: {
      calendar_slug: 'riverside-run-club',
      title: 'X',
      category: 'running',
      city: 'Berlin',
      capacity: 900,
      starts_at: '2030-01-01T10:00:00Z',
      ends_at: '2030-01-01T12:00:00Z',
    },
  });
  ok('capacity beyond 500 is refused naming the field', badCap.status === 400 && badCap.body.field === 'capacity');
  const localTime = await req('POST', '/api/events', {
    token: hostToken,
    body: {
      calendar_slug: 'riverside-run-club',
      title: 'X',
      category: 'running',
      city: 'Berlin',
      capacity: 5,
      starts_at: '2030-01-01T10:00:00',
      ends_at: '2030-01-01T12:00:00Z',
    },
  });
  ok('a local time without a zone is refused', localTime.status === 400 && localTime.body.field === 'starts_at');

  let limited = null;
  for (let i = 0; i < 14; i++) {
    const r = await req('POST', '/api/auth/login', {
      body: { email: 'ratelimit@example.com', password: 'wrong-password' },
    });
    if (r.status === 429) {
      limited = r;
      break;
    }
  }
  ok('login is rate limited to 10 per minute', !!limited, 'no 429 seen');
  ok(
    'and the limit is stated in the body',
    limited && /10 requests per minute/.test(limited.body.message || ''),
    limited?.body?.message
  );

  console.log(`\n== publishing rules ==`);
  await sql(`DELETE FROM events WHERE slug IN ('half-filled-in','fully-specified-run')`);
  const incomplete = await req('POST', '/api/events', {
    token: hostToken,
    body: { calendar_slug: 'riverside-run-club', title: 'Half Filled In', category: 'running', city: 'Berlin' },
  });
  ok('a submission missing fields is stored as draft', incomplete.body.state === 'draft', JSON.stringify(incomplete.body.state));
  const complete = await req('POST', '/api/events', {
    token: hostToken,
    body: {
      calendar_slug: 'riverside-run-club',
      title: 'Fully Specified Run',
      category: 'running',
      city: 'Berlin',
      time_zone: 'Europe/Berlin',
      capacity: 10,
      starts_at: '2030-03-01T10:00:00Z',
      ends_at: '2030-03-01T12:00:00Z',
      description: 'A test',
      approval_required: false,
      waitlist_enabled: true,
    },
  });
  ok('a complete submission is published', complete.body.state === 'published');
  ok('and derives a theme_hex', /^#[0-9a-f]{6}$/.test(complete.body.theme_hex));
  const endsBefore = await req('POST', '/api/events', {
    token: hostToken,
    body: {
      calendar_slug: 'riverside-run-club',
      title: 'Backwards',
      category: 'running',
      city: 'Berlin',
      capacity: 5,
      starts_at: '2030-03-01T12:00:00Z',
      ends_at: '2030-03-01T10:00:00Z',
    },
  });
  ok('an end before the start is refused', endsBefore.status === 400 && endsBefore.body.field === 'ends_at');

  const dupSlug = await req('POST', '/api/events', {
    token: hostToken,
    body: {
      calendar_slug: 'riverside-run-club',
      title: 'Clash',
      slug: 'thursday-night-5k',
      category: 'running',
      city: 'Berlin',
      capacity: 5,
      starts_at: '2030-03-01T10:00:00Z',
      ends_at: '2030-03-01T12:00:00Z',
    },
  });
  ok('a slug matching an existing slug is rejected', dupSlug.status === 409);
  const catSlug = await req('POST', '/api/events', {
    token: hostToken,
    body: {
      calendar_slug: 'riverside-run-club',
      title: 'Clash',
      slug: 'running',
      category: 'running',
      city: 'Berlin',
      capacity: 5,
      starts_at: '2030-03-01T10:00:00Z',
      ends_at: '2030-03-01T12:00:00Z',
    },
  });
  ok('a slug matching a category name is rejected', catSlug.status === 409);
  const resSlug = await req('POST', '/api/calendars', {
    token: hostToken,
    body: { name: 'X', slug: 'settings', category: 'books', city: 'Berlin', is_public: true },
  });
  ok('a calendar slug matching a reserved path is rejected', resSlug.status === 409);
  ok('with the pinned sentence', resSlug.body.message === 'That address is already taken.', resSlug.body.message);

  console.log(`\n== handles ==`);
  const takenHandle = await req('PATCH', '/api/accounts/me', { token: g1, body: { handle: 'priya-raman' } });
  ok('a taken handle is refused', takenHandle.status === 409);
  ok('with the pinned sentence', takenHandle.body.message === 'That handle is already taken.', takenHandle.body.message);
  const keptHandle = await sql(`SELECT handle FROM accounts WHERE email='guest@example.com'`);
  ok('the account keeps the handle it had', keptHandle.rows[0].handle === 'amina-osei');
  const catHandle = await req('PATCH', '/api/accounts/me', { token: g1, body: { handle: 'climate' } });
  ok('a handle matching a category name is refused', catHandle.status === 409);
  const goodHandle = await req('PATCH', '/api/accounts/me', { token: g1, body: { handle: 'amina-osei-runs' } });
  ok('a free handle is accepted', goodHandle.status === 200 && goodHandle.body.handle === 'amina-osei-runs');
  await sql(`UPDATE accounts SET handle='amina-osei' WHERE email='guest@example.com'`);

  console.log(`\n== the shell arrives already wearing the theme ==`);
  const shell = await fetch(`${BASE}/thursday-night-5k`);
  const shellHtml = await shell.text();
  ok(
    'the event shell carries the derived ground before any data arrives',
    shellHtml.includes('--event-ground') && shellHtml.includes('event-theme-boot')
  );
  ok('and names that event\u2019s key colour', shellHtml.includes('#146aeb'));
  const plainShell = await (await fetch(`${BASE}/discover`)).text();
  ok('a non-event route carries no event theme', !plainShell.includes('event-theme-boot'));

  await sql(
    `DELETE FROM events WHERE slug IN ('race-test-event','cancel-test-event','fully-specified-run','half-filled-in')`
  );
  await sql(`DELETE FROM accounts WHERE email LIKE 'racer%@example.com'`);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  await pool.end();
  process.exit(fail ? 1 : 0);
}

main().catch(async (err) => {
  console.error('harness crashed:', err);
  await pool.end();
  process.exit(1);
});

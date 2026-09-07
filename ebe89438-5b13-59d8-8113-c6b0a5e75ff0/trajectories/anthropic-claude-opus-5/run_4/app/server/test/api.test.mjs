/**
 * End-to-end checks against a running server, the real PostgreSQL and the real
 * Mailpit. Run: BASE=http://localhost:4180 node test/api.test.mjs
 */
import assert from 'node:assert/strict';
import { db, freshGuest, login, mailFor, messageBody, report, req, resetEvent, sleep, test } from './helpers.mjs';

const TRACK = 'riverside-track-session';

/** Puts the seeded world back, so this suite starts where a fresh app does. */
async function restoreSeedState() {
  await db.query(`
    DELETE FROM registrations WHERE event_id IN
      (SELECT id FROM events WHERE slug IN
        ('riverside-track-session','thursday-night-5k','sunrise-long-run','winter-reading-night'))`);
  await db.query(`
    UPDATE events SET state='published', cancelled_at=NULL, cancel_reason=NULL
     WHERE slug IN ('winter-reading-night','thursday-night-5k','riverside-track-session','sunrise-long-run')`);
  await db.query("UPDATE events SET state='registration_closed' WHERE slug='riverside-winter-time-trial'");
  await db.query("UPDATE events SET state='draft' WHERE slug='harbour-loop-recovery-jog'");
  await db.query(
    "UPDATE events SET capacity=2, waitlist_enabled=true, approval_required=false WHERE slug='riverside-track-session'",
  );
  await db.query("UPDATE events SET capacity=20, approval_required=true WHERE slug='sunrise-long-run'");
  await db.query("UPDATE events SET capacity=3 WHERE slug='thursday-night-5k'");
}

async function main() {
  await restoreSeedState();
  const host = await login('host@example.com');
  const host2 = await login('host2@example.com');
  const guest = await login('guest@example.com');
  const guest2 = await login('guest2@example.com');

  /* ================= health and resolution ================= */

  await test('health answers 200', async () => {
    assert.equal((await req('/api/health')).status, 200);
  });

  await test('resolve keeps its precedence: system, category, event, calendar, account', async () => {
    assert.equal((await req('/api/resolve/login')).body.kind, 'system');
    assert.equal((await req('/api/resolve/running')).body.kind, 'category');
    assert.equal((await req('/api/resolve/thursday-night-5k')).body.kind, 'event');
    assert.equal((await req('/api/resolve/riverside-run-club')).body.kind, 'calendar');
    assert.equal((await req('/api/resolve/priya-raman')).body.kind, 'account');
    assert.equal((await req('/api/resolve/nothing-here-at-all')).status, 404);
  });

  await test('a draft event answers not found to everyone but its host', async () => {
    assert.equal((await req('/api/events/harbour-loop-recovery-jog')).status, 404);
    assert.equal((await req('/api/events/harbour-loop-recovery-jog', { token: guest })).status, 404);
    assert.equal((await req('/api/events/harbour-loop-recovery-jog', { token: host })).status, 200);
    assert.equal((await req('/api/resolve/harbour-loop-recovery-jog')).status, 404);
  });

  /* ================= discovery ================= */

  await test('discovery carries published and registration_closed only', async () => {
    const slugs = (await req('/api/events?limit=100')).body.map((e) => e.slug);
    assert.ok(slugs.includes('thursday-night-5k'));
    assert.ok(slugs.includes('riverside-winter-time-trial'));
    assert.ok(!slugs.includes('harbour-loop-recovery-jog'), 'no draft');
    assert.ok(!slugs.includes('autumn-book-swap'), 'no cancelled');
  });

  await test('ranking is soonest first with ties broken by slug', async () => {
    const list = (await req('/api/events?limit=100')).body;
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1];
      const b = list[i];
      const ta = Date.parse(a.starts_at);
      const tb = Date.parse(b.starts_at);
      assert.ok(ta < tb || (ta === tb && a.slug < b.slug), `order broken at ${a.slug} / ${b.slug}`);
    }
  });

  await test('X-Total-Count counts matches before paging, and reads 0 on an empty page', async () => {
    const r = await req('/api/events?limit=1');
    assert.ok(Number(r.headers.get('x-total-count')) >= 5);
    assert.equal(r.body.length, 1);
    const empty = await req('/api/events?q=zzzznothingmatchesthis');
    assert.equal(empty.headers.get('x-total-count'), '0');
    assert.deepEqual(empty.body, []);
  });

  await test('category, city and q combine as one condition rather than widening', async () => {
    const r = await req('/api/events?category=running&city=Berlin&q=track');
    assert.equal(r.body.length, 1);
    assert.equal(r.body[0].slug, TRACK);
    const conflicting = await req('/api/events?category=books&q=track');
    assert.equal(conflicting.body.length, 0);
    assert.equal(conflicting.headers.get('x-total-count'), '0');
  });

  await test('q reaches the title, the description and the calendar name, never the city', async () => {
    assert.ok((await req('/api/events?q=Northside')).body.some((e) => e.slug === 'winter-reading-night'));
    assert.ok((await req('/api/events?q=conversation')).body.some((e) => e.slug === 'sunrise-long-run'));
    assert.equal((await req('/api/events?q=Lisbon')).body.length, 0, 'the city is city, never q');
  });

  await test('q of only whitespace is treated as absent', async () => {
    const all = await req('/api/events?limit=100');
    const blank = await req('/api/events?q=%20%20&limit=100');
    assert.equal(blank.body.length, all.body.length);
  });

  await test('limit caps at 100 and offset pages', async () => {
    assert.equal((await req('/api/events?limit=1000')).status, 200);
    const p1 = await req('/api/events?limit=2&offset=0');
    const p2 = await req('/api/events?limit=2&offset=2');
    assert.notEqual(p1.body[0].slug, p2.body[0]?.slug);
  });

  /* ================= authorization ================= */

  await test('a guest is refused every host-only endpoint and the state is unchanged', async () => {
    const before = await db.query("SELECT state, title FROM events WHERE slug='winter-reading-night'");
    const calls = [
      ['/api/events', 'POST', { calendar_slug: 'riverside-run-club', title: 'Sneaky' }],
      ['/api/events/winter-reading-night', 'PATCH', { title: 'Hijacked' }],
      ['/api/events/winter-reading-night/cancel', 'POST', { reason: 'no' }],
      ['/api/calendars', 'POST', { name: 'X', slug: 'guest-cal', category: 'books', city: 'X' }],
    ];
    for (const [p, method, body] of calls) {
      const r = await req(p, { method, token: guest, body });
      assert.ok(r.status === 403 || r.status === 404, `${p} answered ${r.status}`);
    }
    assert.equal((await req('/api/events/winter-reading-night/registrations', { token: guest })).status, 404);
    assert.equal((await req('/api/events/winter-reading-night/registrations.csv', { token: guest })).status, 404);
    const after = await db.query("SELECT state, title FROM events WHERE slug='winter-reading-night'");
    assert.deepEqual(after.rows[0], before.rows[0], 'the protected state is untouched');
  });

  await test('one host cannot reach another host calendar, event, guest list or tickets', async () => {
    assert.equal(
      (await req('/api/events/winter-reading-night', { method: 'PATCH', token: host, body: { title: 'Nope' } })).status,
      404,
    );
    assert.equal((await req('/api/events/winter-reading-night/registrations', { token: host })).status, 404);
    assert.equal(
      (await req('/api/events/winter-reading-night/cancel', { method: 'POST', token: host, body: { reason: 'x' } }))
        .status,
      404,
    );
    const t = await db.query("SELECT title FROM events WHERE slug='winter-reading-night'");
    assert.equal(t.rows[0].title, 'Winter Reading Night');
  });

  await test('a request without a bearer token is denied, not served', async () => {
    for (const p of ['/api/accounts/me', '/api/calendars', '/api/registrations/me'])
      assert.equal((await req(p)).status, 401, p);
    assert.equal(
      (await req('/api/registrations', { method: 'POST', body: { event_slug: 'thursday-night-5k' } })).status,
      401,
    );
    assert.equal((await req('/api/registrations/1/approve', { method: 'POST' })).status, 401);
  });

  /* ================= the last seat ================= */

  await test('two guests taking the last seat at the same instant make one seat and one waiting-list place', async () => {
    const eventId = await resetEvent(TRACK, { capacity: 2, waitlist_enabled: true, state: 'published' });
    const [a, b, c] = [await freshGuest('seat'), await freshGuest('seat'), await freshGuest('seat')];
    await req('/api/registrations', { method: 'POST', token: a.token, body: { event_slug: TRACK } });

    const [x, y] = await Promise.all([
      req('/api/registrations', { method: 'POST', token: b.token, body: { event_slug: TRACK } }),
      req('/api/registrations', { method: 'POST', token: c.token, body: { event_slug: TRACK } }),
    ]);
    assert.deepEqual([x.body.status, y.body.status].sort(), ['confirmed', 'waitlisted']);

    const seats = await db.query(
      "SELECT count(*)::int n FROM registrations WHERE event_id=$1 AND status IN ('confirmed','checked_in')",
      [eventId],
    );
    assert.equal(seats.rows[0].n, 2, 'the database is the fact: never two seats');
    const wl = await db.query(
      "SELECT waitlist_position p FROM registrations WHERE event_id=$1 AND status='waitlisted' ORDER BY p",
      [eventId],
    );
    assert.deepEqual(wl.rows.map((r) => r.p), [1]);
  });

  await test('eight guests racing for one seat produce exactly one seat and a gapless waiting list', async () => {
    const eventId = await resetEvent(TRACK, { capacity: 1, waitlist_enabled: true, state: 'published' });
    const racers = [];
    for (let i = 0; i < 8; i++) racers.push(await freshGuest('race'));
    const results = await Promise.all(
      racers.map((g) => req('/api/registrations', { method: 'POST', token: g.token, body: { event_slug: TRACK } })),
    );
    const confirmed = results.filter((r) => r.body.status === 'confirmed');
    assert.equal(confirmed.length, 1, `expected one seat, got ${confirmed.length}`);
    const seats = await db.query(
      "SELECT count(*)::int n FROM registrations WHERE event_id=$1 AND status IN ('confirmed','checked_in')",
      [eventId],
    );
    assert.equal(seats.rows[0].n, 1);
    const positions = (
      await db.query(
        "SELECT waitlist_position p FROM registrations WHERE event_id=$1 AND status='waitlisted' ORDER BY p",
        [eventId],
      )
    ).rows.map((r) => r.p);
    assert.deepEqual(positions, [1, 2, 3, 4, 5, 6, 7], `1..n with no gaps, got ${positions}`);
  });

  await test('the database itself, not the application, refuses an over-capacity write', async () => {
    const eventId = await resetEvent(TRACK, { capacity: 1, state: 'published' });
    const a = await freshGuest('raw');
    const b = await freshGuest('raw');
    await db.query(
      "INSERT INTO registrations (event_id, account_id, status, ticket_code) VALUES ($1,$2,'confirmed','TKT-RAWAAAA1')",
      [eventId, a.id],
    );
    let threw = false;
    try {
      await db.query(
        "INSERT INTO registrations (event_id, account_id, status, ticket_code) VALUES ($1,$2,'confirmed','TKT-RAWBBBB2')",
        [eventId, b.id],
      );
    } catch {
      threw = true;
    }
    assert.ok(threw, 'a raw SQL client is stopped by the database too');
    const n = await db.query(
      "SELECT count(*)::int n FROM registrations WHERE event_id=$1 AND status IN ('confirmed','checked_in')",
      [eventId],
    );
    assert.equal(n.rows[0].n, 1);
  });

  await test('two concurrent raw writes for one seat cannot both land', async () => {
    const eventId = await resetEvent(TRACK, { capacity: 1, state: 'published' });
    const a = await freshGuest('rawrace');
    const b = await freshGuest('rawrace');
    const attempt = async (accountId, code) => {
      const c = await db.connect();
      try {
        await c.query('BEGIN');
        await c.query(
          'INSERT INTO registrations (event_id, account_id, status, ticket_code) VALUES ($1,$2,$3,$4)',
          [eventId, accountId, 'confirmed', code],
        );
        await c.query('COMMIT');
        return 'committed';
      } catch {
        await c.query('ROLLBACK').catch(() => {});
        return 'refused';
      } finally {
        c.release();
      }
    };
    const out = await Promise.all([attempt(a.id, 'TKT-CONCAAA1'), attempt(b.id, 'TKT-CONCBBB2')]);
    assert.deepEqual(out.sort(), ['committed', 'refused']);
    const n = await db.query(
      "SELECT count(*)::int n FROM registrations WHERE event_id=$1 AND status IN ('confirmed','checked_in')",
      [eventId],
    );
    assert.equal(n.rows[0].n, 1);
  });

  await test('a full event with no waiting list refuses as a client error and leaves no row', async () => {
    const eventId = await resetEvent(TRACK, { capacity: 1, waitlist_enabled: false, state: 'published' });
    const a = await freshGuest('nolist');
    const b = await freshGuest('nolist');
    await req('/api/registrations', { method: 'POST', token: a.token, body: { event_slug: TRACK } });
    const r = await req('/api/registrations', { method: 'POST', token: b.token, body: { event_slug: TRACK } });
    assert.equal(r.status, 409);
    assert.ok(!/error/i.test(r.body.message), 'a refusal never says the word error');
    const rows = await db.query('SELECT count(*)::int n FROM registrations WHERE event_id=$1', [eventId]);
    assert.equal(rows.rows[0].n, 1, 'no partial row');
  });

  await test('a repeat submission updates the one row and never adds a second', async () => {
    const eventId = await resetEvent(TRACK, { capacity: 5, state: 'published' });
    const g = await freshGuest('repeat');
    for (let i = 0; i < 3; i++)
      await req('/api/registrations', { method: 'POST', token: g.token, body: { event_slug: TRACK } });
    const rows = await db.query('SELECT count(*)::int n FROM registrations WHERE event_id=$1 AND account_id=$2', [
      eventId,
      g.id,
    ]);
    assert.equal(rows.rows[0].n, 1);
  });

  await test('two simultaneous first-time registrations by one account produce one row', async () => {
    const eventId = await resetEvent(TRACK, { capacity: 5, state: 'published' });
    const g = await freshGuest('dup');
    await Promise.all([
      req('/api/registrations', { method: 'POST', token: g.token, body: { event_slug: TRACK } }),
      req('/api/registrations', { method: 'POST', token: g.token, body: { event_slug: TRACK } }),
    ]);
    const rows = await db.query('SELECT count(*)::int n FROM registrations WHERE event_id=$1 AND account_id=$2', [
      eventId,
      g.id,
    ]);
    assert.equal(rows.rows[0].n, 1);
  });

  /* ================= cancelling frees the seat ================= */

  await test('cancelling a seat promotes place 1 in the same request with a ticket and a mail', async () => {
    const eventId = await resetEvent(TRACK, { capacity: 1, waitlist_enabled: true, state: 'published' });
    const a = await freshGuest('promote');
    const b = await freshGuest('promote');
    const ra = await req('/api/registrations', { method: 'POST', token: a.token, body: { event_slug: TRACK } });
    const rb = await req('/api/registrations', { method: 'POST', token: b.token, body: { event_slug: TRACK } });
    assert.equal(ra.body.status, 'confirmed');
    assert.equal(rb.body.status, 'waitlisted');

    const cancel = await req(`/api/registrations/${ra.body.id}/cancel`, { method: 'POST', token: a.token });
    assert.equal(cancel.body.status, 'cancelled_by_guest');
    assert.equal(cancel.body.ticket_code, null, 'cancelling clears the ticket');

    const promoted = await db.query('SELECT status, ticket_code, waitlist_position FROM registrations WHERE id=$1', [
      rb.body.id,
    ]);
    assert.equal(promoted.rows[0].status, 'confirmed');
    assert.match(promoted.rows[0].ticket_code, /^TKT-[A-Z0-9]{8}$/);
    assert.equal(promoted.rows[0].waitlist_position, null);

    await sleep(500);
    assert.ok((await mailFor(b.email, 'A spot opened up for Riverside Track Session')).length >= 1);
    const own = await db.query('SELECT subject FROM email_log WHERE event_id=$1 AND recipient=$2', [eventId, a.email]);
    assert.ok(!own.rows.some((s) => /cancel/i.test(s.subject)), 'a guest cancelling their own place is sent nothing');
  });

  /* ================= approval ================= */

  await test('with approval on, a registration starts pending and holds no seat', async () => {
    const eventId = await resetEvent('sunrise-long-run', { approval_required: true, capacity: 20, state: 'published' });
    const g = await freshGuest('pending');
    const r = await req('/api/registrations', { method: 'POST', token: g.token, body: { event_slug: 'sunrise-long-run' } });
    assert.equal(r.body.status, 'pending_approval');
    assert.equal(r.body.ticket_code, null);
    const seats = await db.query(
      "SELECT count(*)::int n FROM registrations WHERE event_id=$1 AND status IN ('confirmed','checked_in')",
      [eventId],
    );
    assert.equal(seats.rows[0].n, 0);
    await sleep(400);
    assert.ok((await mailFor(g.email, 'Your request to join Sunrise Long Run')).length >= 1);
  });

  await test('the owning host approves to confirmed with a ticket; nobody else may', async () => {
    await resetEvent('sunrise-long-run', { approval_required: true, capacity: 20, state: 'published' });
    const g = await freshGuest('approve');
    const r = await req('/api/registrations', { method: 'POST', token: g.token, body: { event_slug: 'sunrise-long-run' } });

    for (const t of [guest, guest2, host2]) {
      const bad = await req(`/api/registrations/${r.body.id}/approve`, { method: 'POST', token: t });
      assert.ok(bad.status === 403 || bad.status === 404, `approve answered ${bad.status}`);
    }
    const still = await db.query('SELECT status FROM registrations WHERE id=$1', [r.body.id]);
    assert.equal(still.rows[0].status, 'pending_approval', 'the protected state is unchanged');

    const ok = await req(`/api/registrations/${r.body.id}/approve`, { method: 'POST', token: host });
    assert.equal(ok.body.status, 'confirmed');
    assert.match(ok.body.ticket_code, /^TKT-[A-Z0-9]{8}$/);
    await sleep(400);
    assert.ok((await mailFor(g.email, "You're in: Sunrise Long Run")).length >= 1);
  });

  await test('approving into a full event moves the guest to the waiting list', async () => {
    await resetEvent('sunrise-long-run', {
      approval_required: true,
      capacity: 1,
      waitlist_enabled: true,
      state: 'published',
    });
    const a = await freshGuest('appfull');
    const b = await freshGuest('appfull');
    const ra = await req('/api/registrations', { method: 'POST', token: a.token, body: { event_slug: 'sunrise-long-run' } });
    const rb = await req('/api/registrations', { method: 'POST', token: b.token, body: { event_slug: 'sunrise-long-run' } });
    await req(`/api/registrations/${ra.body.id}/approve`, { method: 'POST', token: host });
    const second = await req(`/api/registrations/${rb.body.id}/approve`, { method: 'POST', token: host });
    assert.equal(second.body.status, 'waitlisted');
    assert.equal(second.body.waitlist_position, 1);
    await sleep(400);
    assert.ok((await mailFor(b.email, "You're on the waiting list for Sunrise Long Run")).length >= 1);
  });

  await test('the host declines a pending request and that guest alone is mailed', async () => {
    await resetEvent('sunrise-long-run', { approval_required: true, capacity: 20, state: 'published' });
    const g = await freshGuest('decline');
    const r = await req('/api/registrations', { method: 'POST', token: g.token, body: { event_slug: 'sunrise-long-run' } });
    const d = await req(`/api/registrations/${r.body.id}/decline`, { method: 'POST', token: host });
    assert.equal(d.body.status, 'declined');
    assert.equal(d.body.ticket_code, null);
    await sleep(400);
    const mails = await mailFor(g.email, 'About your request to join Sunrise Long Run');
    assert.ok(mails.length >= 1);
    const full = await messageBody(mails[0].ID);
    assert.equal(full.To.length, 1);
    assert.ok(full.Text.includes('Sunrise Long Run'));
  });

  /* ================= tickets and the door ================= */

  await test('a ticket exists exactly when a seat is held and no code is held twice', async () => {
    const mismatched = await db.query(
      "SELECT count(*)::int n FROM registrations WHERE (status IN ('confirmed','checked_in')) <> (ticket_code IS NOT NULL)",
    );
    assert.equal(mismatched.rows[0].n, 0);
    const dupes = await db.query(
      'SELECT count(*)::int n FROM (SELECT ticket_code FROM registrations WHERE ticket_code IS NOT NULL GROUP BY 1 HAVING count(*)>1) x',
    );
    assert.equal(dupes.rows[0].n, 0);
    const shape = await db.query(
      "SELECT count(*)::int n FROM registrations WHERE ticket_code IS NOT NULL AND ticket_code !~ '^TKT-[A-Z0-9]{8}$'",
    );
    assert.equal(shape.rows[0].n, 0);
  });

  await test('anyone presenting a real code reads that ticket; an invented code is not found', async () => {
    await resetEvent(TRACK, { capacity: 5, state: 'published' });
    const g = await freshGuest('ticket');
    const r = await req('/api/registrations', { method: 'POST', token: g.token, body: { event_slug: TRACK } });
    const t = await req(`/api/tickets/${r.body.ticket_code}`);
    assert.equal(t.status, 200);
    assert.equal(t.body.ticket_code, r.body.ticket_code);
    assert.equal(t.body.event_slug, TRACK);
    assert.equal(t.body.time_zone, 'Europe/Berlin');
    assert.match(t.body.starts_at, /Z$/);
    assert.equal(t.body.guest_list, undefined, 'a ticket carries no guest list');
    assert.equal((await req('/api/tickets/TKT-ZZZZZZZZ')).status, 404);
  });

  await test('the owning host checks in; a second check-in records one arrival, not two', async () => {
    await resetEvent(TRACK, { capacity: 5, state: 'published' });
    const g = await freshGuest('door');
    const r = await req('/api/registrations', { method: 'POST', token: g.token, body: { event_slug: TRACK } });
    const code = r.body.ticket_code;

    assert.equal((await req(`/api/tickets/${code}/check-in`, { method: 'POST', token: host2 })).status, 404);
    const asGuest = await req(`/api/tickets/${code}/check-in`, { method: 'POST', token: g.token });
    assert.ok(asGuest.status === 403 || asGuest.status === 404);
    const untouched = await db.query('SELECT status FROM registrations WHERE id=$1', [r.body.id]);
    assert.equal(untouched.rows[0].status, 'confirmed');

    const first = await req(`/api/tickets/${code}/check-in`, { method: 'POST', token: host });
    assert.equal(first.body.status, 'checked_in');
    const at = first.body.checked_in_at;
    const second = await req(`/api/tickets/${code}/check-in`, { method: 'POST', token: host });
    assert.equal(second.body.status, 'checked_in');
    assert.equal(second.body.checked_in_at, at, 'one arrival, not two');
    assert.equal(second.body.already_checked_in, true);
    assert.equal(second.body.ticket_code, code, 'a checked-in registration keeps its code');
  });

  /* ================= closed registration ================= */

  await test('a closed event refuses a new registration naming the closed state and stays readable', async () => {
    const g = await freshGuest('closed');
    const r = await req('/api/registrations', {
      method: 'POST',
      token: g.token,
      body: { event_slug: 'riverside-winter-time-trial' },
    });
    assert.equal(r.status, 400);
    assert.match(r.body.message, /closed/i);
    const page = await req('/api/events/riverside-winter-time-trial');
    assert.equal(page.status, 200);
    assert.equal(page.body.state, 'registration_closed');
  });

  await test('closing and reopening are ordinary edits that mail nobody and keep tickets', async () => {
    const eventId = await resetEvent(TRACK, { capacity: 5, state: 'published' });
    const g = await freshGuest('reopen');
    await req('/api/registrations', { method: 'POST', token: g.token, body: { event_slug: TRACK } });
    await sleep(300);
    const before = await db.query('SELECT count(*)::int n FROM email_log WHERE event_id=$1', [eventId]);

    await req(`/api/events/${TRACK}`, { method: 'PATCH', token: host, body: { state: 'registration_closed' } });
    const closed = await req(`/api/events/${TRACK}`, { token: g.token });
    assert.equal(closed.body.state, 'registration_closed');
    assert.equal(closed.body.my_registration.status, 'confirmed');
    assert.ok(closed.body.my_registration.ticket_code, 'a held ticket survives the close');

    await req(`/api/events/${TRACK}`, { method: 'PATCH', token: host, body: { state: 'published' } });
    await sleep(300);
    const after = await db.query('SELECT count(*)::int n FROM email_log WHERE event_id=$1', [eventId]);
    assert.equal(after.rows[0].n, before.rows[0].n, 'closing and reopening mails nobody');
  });

  await test('a guest may cancel while closed and nobody is promoted', async () => {
    const eventId = await resetEvent(TRACK, { capacity: 1, waitlist_enabled: true, state: 'published' });
    const a = await freshGuest('closedcancel');
    const b = await freshGuest('closedcancel');
    const ra = await req('/api/registrations', { method: 'POST', token: a.token, body: { event_slug: TRACK } });
    const rb = await req('/api/registrations', { method: 'POST', token: b.token, body: { event_slug: TRACK } });
    await req(`/api/events/${TRACK}`, { method: 'PATCH', token: host, body: { state: 'registration_closed' } });
    await req(`/api/registrations/${ra.body.id}/cancel`, { method: 'POST', token: a.token });

    const still = await db.query('SELECT status FROM registrations WHERE id=$1', [rb.body.id]);
    assert.equal(still.rows[0].status, 'waitlisted', 'nobody is promoted while registration is closed');
    const seats = await db.query(
      "SELECT count(*)::int n FROM registrations WHERE event_id=$1 AND status IN ('confirmed','checked_in')",
      [eventId],
    );
    assert.equal(seats.rows[0].n, 0, 'the seat count never rises while closed');
  });

  await test('registration_closed is unreachable from draft and a cancelled event moves nowhere', async () => {
    assert.equal(
      (
        await req('/api/events/harbour-loop-recovery-jog', {
          method: 'PATCH',
          token: host,
          body: { state: 'registration_closed' },
        })
      ).status,
      400,
    );
    assert.equal(
      (await req('/api/events/autumn-book-swap', { method: 'PATCH', token: host2, body: { state: 'published' } }))
        .status,
      400,
    );
  });

  await test('a published event cannot return to draft', async () => {
    const r = await req('/api/events/thursday-night-5k', { method: 'PATCH', token: host, body: { state: 'draft' } });
    assert.equal(r.status, 400);
    const s = await db.query("SELECT state FROM events WHERE slug='thursday-night-5k'");
    assert.equal(s.rows[0].state, 'published');
  });

  /* ================= capacity ================= */

  await test('lowering capacity below the confirmed count is refused with the pinned sentence', async () => {
    await resetEvent(TRACK, { capacity: 5, state: 'published' });
    const a = await freshGuest('cap');
    const b = await freshGuest('cap');
    await req('/api/registrations', { method: 'POST', token: a.token, body: { event_slug: TRACK } });
    await req('/api/registrations', { method: 'POST', token: b.token, body: { event_slug: TRACK } });
    const r = await req(`/api/events/${TRACK}`, { method: 'PATCH', token: host, body: { capacity: 1 } });
    assert.equal(r.status, 400);
    assert.equal(r.body.message, 'You already have 2 guests confirmed.');
    assert.equal(r.body.field, 'capacity');
    const cap = await db.query('SELECT capacity FROM events WHERE slug=$1', [TRACK]);
    assert.equal(cap.rows[0].capacity, 5, 'a rejected request writes nothing');
  });

  await test('raising capacity seats the waiting list in the same request and renumbers the rest', async () => {
    const eventId = await resetEvent(TRACK, { capacity: 1, waitlist_enabled: true, state: 'published' });
    const gs = [await freshGuest('raise'), await freshGuest('raise'), await freshGuest('raise')];
    const regs = [];
    for (const g of gs)
      regs.push((await req('/api/registrations', { method: 'POST', token: g.token, body: { event_slug: TRACK } })).body);
    assert.deepEqual(regs.map((r) => r.status), ['confirmed', 'waitlisted', 'waitlisted']);

    const raised = await req(`/api/events/${TRACK}`, { method: 'PATCH', token: host, body: { capacity: 2 } });
    assert.equal(raised.body.promoted_from_waitlist, 1);
    const rows = (
      await db.query('SELECT status, waitlist_position, ticket_code FROM registrations WHERE event_id=$1 ORDER BY id', [
        eventId,
      ])
    ).rows;
    const seated = rows.filter((r) => r.status === 'confirmed');
    assert.equal(seated.length, 2);
    for (const s of seated) assert.match(s.ticket_code, /^TKT-[A-Z0-9]{8}$/);
    assert.deepEqual(
      rows.filter((r) => r.status === 'waitlisted').map((r) => r.waitlist_position),
      [1],
      'the rest renumber to 1..n with no gaps',
    );
    await sleep(400);
    assert.ok((await mailFor(gs[1].email, 'A spot opened up for Riverside Track Session')).length >= 1);
  });

  await test('a raise on an event with nobody waiting mails nobody', async () => {
    const eventId = await resetEvent(TRACK, { capacity: 2, state: 'published' });
    const g = await freshGuest('noraise');
    await req('/api/registrations', { method: 'POST', token: g.token, body: { event_slug: TRACK } });
    await sleep(300);
    const before = await db.query('SELECT count(*)::int n FROM email_log WHERE event_id=$1', [eventId]);
    const r = await req(`/api/events/${TRACK}`, { method: 'PATCH', token: host, body: { capacity: 10 } });
    assert.equal(r.body.promoted_from_waitlist, 0);
    await sleep(300);
    const after = await db.query('SELECT count(*)::int n FROM email_log WHERE event_id=$1', [eventId]);
    assert.equal(after.rows[0].n, before.rows[0].n);
  });

  await test('changing the time of an event with confirmed guests mails every one of them', async () => {
    const eventId = await resetEvent(TRACK, { capacity: 5, state: 'published' });
    const a = await freshGuest('resched');
    const b = await freshGuest('resched');
    await req('/api/registrations', { method: 'POST', token: a.token, body: { event_slug: TRACK } });
    await req('/api/registrations', { method: 'POST', token: b.token, body: { event_slug: TRACK } });
    await sleep(300);
    const q = "SELECT count(*)::int n FROM email_log WHERE event_id=$1 AND subject LIKE 'A change to%'";
    const before = await db.query(q, [eventId]);
    const starts = new Date(Date.now() + 20 * 86400000).toISOString();
    const ends = new Date(Date.now() + 20 * 86400000 + 7200000).toISOString();
    const r = await req(`/api/events/${TRACK}`, {
      method: 'PATCH',
      token: host,
      body: { starts_at: starts, ends_at: ends },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.starts_at, starts, 'the stored instant is what was sent');
    await sleep(500);
    const after = await db.query(q, [eventId]);
    assert.equal(after.rows[0].n - before.rows[0].n, 2);
  });

  /* ================= cancelling an event ================= */

  await test('cancelling needs a reason, carries it word for word to every holder, and cannot be undone', async () => {
    const title = `Cancel Test ${Date.now()}`;
    const created = await req('/api/events', {
      method: 'POST',
      token: host,
      body: {
        calendar_slug: 'riverside-run-club',
        title,
        category: 'running',
        city: 'Berlin',
        time_zone: 'Europe/Berlin',
        starts_at: new Date(Date.now() + 9 * 86400000).toISOString(),
        ends_at: new Date(Date.now() + 9 * 86400000 + 3600000).toISOString(),
        capacity: 1,
        waitlist_enabled: true,
        description: 'A test event that will be called off.',
      },
    });
    const slug = created.body.slug;
    assert.equal(created.body.state, 'published');
    const a = await freshGuest('cancelev');
    const b = await freshGuest('cancelev');
    await req('/api/registrations', { method: 'POST', token: a.token, body: { event_slug: slug } });
    await req('/api/registrations', { method: 'POST', token: b.token, body: { event_slug: slug } });

    const noReason = await req(`/api/events/${slug}/cancel`, { method: 'POST', token: host, body: { reason: '   ' } });
    assert.equal(noReason.status, 400);
    assert.equal(noReason.body.field, 'reason');

    const reason = 'The river path is flooded, and the "detour" is unsafe after dark.';
    const done = await req(`/api/events/${slug}/cancel`, { method: 'POST', token: host, body: { reason } });
    assert.equal(done.body.state, 'cancelled');
    assert.equal(done.body.cancel_reason, reason);

    await sleep(700);
    // Every guest still holding a place, the seated one and the waiting one.
    for (const g of [a, b]) {
      const mails = await mailFor(g.email, `${title} has been cancelled`);
      assert.ok(mails.length >= 1, `${g.email} was mailed`);
      const full = await messageBody(mails[0].ID);
      assert.ok(full.Text.includes(reason), 'the host words reach the guest unedited');
      assert.ok(full.Text.includes(title), 'the body names the event');
      assert.equal(full.To.length, 1);
      assert.equal(full.Cc?.length ?? 0, 0);
      assert.equal(full.Bcc?.length ?? 0, 0);
    }

    assert.equal(
      (await req(`/api/events/${slug}`, { method: 'PATCH', token: host, body: { state: 'published' } })).status,
      400,
    );
    assert.ok(!(await req('/api/events?limit=100')).body.some((e) => e.slug === slug));
  });

  /* ================= the root namespace ================= */

  await test('event slugs, calendar slugs and handles share one namespace', async () => {
    const clash = async (slug) =>
      (await req('/api/calendars', { method: 'POST', token: host, body: { name: 'Clash', slug, category: 'running', city: 'Berlin' } }))
        .body.message;
    assert.equal(await clash('thursday-night-5k'), 'That address is already taken.');
    assert.equal(await clash('discover'), 'That address is already taken.');
    assert.equal(await clash('running'), 'That address is already taken.');
    assert.equal(await clash('priya-raman'), 'That address is already taken.');

    for (const handle of ['priya-raman', 'settings', 'books', 'riverside-run-club', 'thursday-night-5k']) {
      const r = await req('/api/accounts/me', { method: 'PATCH', token: guest, body: { handle } });
      assert.equal(r.body.message, 'That handle is already taken.', `handle ${handle}`);
    }
    assert.equal((await req('/api/accounts/me', { token: guest })).body.handle, 'amina-osei', 'the handle is kept');
  });

  await test('a slug freed by deletion is still never reused', async () => {
    const name = `throwaway-${Date.now().toString(36)}`;
    const made = await req('/api/calendars', {
      method: 'POST',
      token: host,
      body: { name: 'Throwaway', slug: name, category: 'running', city: 'Berlin' },
    });
    assert.equal(made.status, 201);
    await db.query('DELETE FROM calendars WHERE slug=$1', [name]);
    const again = await req('/api/calendars', {
      method: 'POST',
      token: host,
      body: { name: 'Again', slug: name, category: 'running', city: 'Berlin' },
    });
    assert.equal(again.body.message, 'That address is already taken.');
  });

  await test('an account edits its own handle and no other account', async () => {
    const g = await freshGuest('handle');
    const handle = `handle-${Date.now().toString(36)}`;
    const r = await req('/api/accounts/me', { method: 'PATCH', token: g.token, body: { handle } });
    assert.equal(r.body.handle, handle);
    assert.equal(r.body.id, g.id, 'PATCH /accounts/me edits the caller alone');
    const other = await db.query("SELECT handle FROM accounts WHERE email='guest2@example.com'");
    assert.equal(other.rows[0].handle, 'tomas-vidal');
  });

  await test('a calendar belongs to the host that made it, and a guest is refused one', async () => {
    const slug = `cal-${Date.now().toString(36)}`;
    const r = await req('/api/calendars', {
      method: 'POST',
      token: host2,
      body: { name: 'Marcus Extra', slug, category: 'books', city: 'Lisbon', is_public: false },
    });
    assert.equal(r.status, 201);
    const owner = await db.query('SELECT owner_account_id FROM calendars WHERE slug=$1', [slug]);
    const marcus = await db.query("SELECT id FROM accounts WHERE email='host2@example.com'");
    assert.equal(String(owner.rows[0].owner_account_id), String(marcus.rows[0].id));
    assert.ok(!(await req('/api/calendars', { token: host })).body.some((c) => c.slug === slug), 'scope is by ownership');
  });

  /* ================= publishing rules ================= */

  await test('a submission missing a publishing field is stored as draft', async () => {
    const r = await req('/api/events', {
      method: 'POST',
      token: host,
      body: { calendar_slug: 'riverside-run-club', title: `Incomplete ${Date.now()}`, category: 'running', city: 'Berlin' },
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.state, 'draft');
    await db.query('DELETE FROM events WHERE slug=$1', [r.body.slug]);
  });

  await test('capacity outside 1 to 500, a backwards end and a naive time are each refused by field', async () => {
    const base = {
      calendar_slug: 'riverside-run-club',
      category: 'running',
      city: 'Berlin',
      starts_at: new Date(Date.now() + 9 * 86400000).toISOString(),
      ends_at: new Date(Date.now() + 9 * 86400000 + 3600000).toISOString(),
      capacity: 4,
    };
    const big = await req('/api/events', { method: 'POST', token: host, body: { ...base, title: 'A', capacity: 501 } });
    assert.equal(big.body.field, 'capacity');
    const zero = await req('/api/events', { method: 'POST', token: host, body: { ...base, title: 'A', capacity: 0 } });
    assert.equal(zero.body.field, 'capacity');
    const backwards = await req('/api/events', {
      method: 'POST',
      token: host,
      body: { ...base, title: 'A', ends_at: base.starts_at },
    });
    assert.equal(backwards.body.field, 'ends_at');
    const naive = await req('/api/events', {
      method: 'POST',
      token: host,
      body: { ...base, title: 'A', starts_at: '2027-01-01T10:00:00' },
    });
    assert.equal(naive.body.field, 'starts_at');
  });

  await test('every timestamp crossing the API is UTC with a trailing Z, and the zone rides beside it', async () => {
    const e = await req('/api/events/thursday-night-5k');
    assert.match(e.body.starts_at, /Z$/);
    assert.match(e.body.ends_at, /Z$/);
    assert.equal(e.body.time_zone, 'Europe/Berlin');
    for (const ev of (await req('/api/events?limit=100')).body) assert.match(ev.starts_at, /Z$/);
  });

  await test('the stored instant does not move when a zone is displayed', async () => {
    const before = await db.query("SELECT starts_at FROM events WHERE slug='winter-reading-night'");
    const r = await req('/api/events/winter-reading-night');
    assert.equal(new Date(r.body.starts_at).getTime(), before.rows[0].starts_at.getTime());
    assert.equal(r.body.time_zone, 'Europe/Lisbon');
  });

  /* ================= the export ================= */

  await test('the CSV carries the pinned header, the pinned order and doubled quotation marks', async () => {
    await resetEvent(TRACK, { capacity: 2, waitlist_enabled: true, state: 'published' });
    const a = await freshGuest('csv');
    const b = await freshGuest('csv');
    const c = await freshGuest('csv');
    await db.query('UPDATE accounts SET display_name=$2 WHERE email=$1', [b.email, 'Vidal, Tomas "T"']);
    for (const g of [a, b, c]) await req('/api/registrations', { method: 'POST', token: g.token, body: { event_slug: TRACK } });

    const res = await req(`/api/events/${TRACK}/registrations.csv`, { token: host, raw: true });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    assert.match(res.headers.get('content-disposition'), new RegExp(`${TRACK}\\.csv`));
    const lines = (await res.text()).trim().split('\n');
    assert.equal(lines[0], 'email,display_name,status,waitlist_position,ticket_code');
    assert.ok(lines.some((l) => l.includes('"Vidal, Tomas ""T"""')), `quoting: ${lines.join(' | ')}`);
    const statuses = lines
      .slice(1)
      .map((l) => l.split(',').find((cell) => /^(confirmed|waitlisted|declined|pending_approval|checked_in)$/.test(cell)));
    assert.deepEqual(statuses, [...statuses].sort(), `ordered by status ascending: ${statuses}`);

    assert.equal((await req(`/api/events/${TRACK}/registrations.csv`)).status, 401);
    assert.equal((await req(`/api/events/${TRACK}/registrations.csv`, { token: guest })).status, 404);
    assert.equal((await req(`/api/events/${TRACK}/registrations.csv`, { token: host2 })).status, 404);
  });

  /* ================= mail ================= */

  await test('a confirmation reaches that guest alone with the pinned subject, the title and the code', async () => {
    await resetEvent(TRACK, { capacity: 5, state: 'published' });
    const g = await freshGuest('confirm');
    const r = await req('/api/registrations', { method: 'POST', token: g.token, body: { event_slug: TRACK } });
    assert.equal(r.body.status, 'confirmed', JSON.stringify(r.body));
    await sleep(600);
    const mails = await mailFor(g.email, "You're going to Riverside Track Session");
    assert.ok(mails.length >= 1, 'the confirmation arrived at Mailpit');
    const full = await messageBody(mails[0].ID);
    assert.equal(full.To.length, 1);
    assert.equal(full.To[0].Address, g.email);
    assert.equal(full.Cc?.length ?? 0, 0);
    assert.equal(full.Bcc?.length ?? 0, 0);
    assert.ok(full.Text.includes('Riverside Track Session'), 'the body names the event');
    assert.ok(full.Text.includes(r.body.ticket_code), 'the body carries the ticket code');
  });

  await test('a waiting-list place is mailed its own subject', async () => {
    await resetEvent(TRACK, { capacity: 1, waitlist_enabled: true, state: 'published' });
    const a = await freshGuest('wlmail');
    const b = await freshGuest('wlmail');
    await req('/api/registrations', { method: 'POST', token: a.token, body: { event_slug: TRACK } });
    await req('/api/registrations', { method: 'POST', token: b.token, body: { event_slug: TRACK } });
    await sleep(500);
    assert.ok((await mailFor(b.email, "You're on the waiting list for Riverside Track Session")).length >= 1);
  });

  await test('an email_log row exists only where a send returned', async () => {
    const nulls = await db.query('SELECT count(*)::int n FROM email_log WHERE sent_at IS NULL');
    assert.equal(nulls.rows[0].n, 0);
    const rows = await db.query('SELECT count(*)::int n FROM email_log');
    assert.ok(rows.rows[0].n > 0, 'the app really has sent mail');
  });

  /* ================= limits and validation ================= */

  await test('login accepts ten a minute, then refuses as a client error stating the limit', async () => {
    const g = await freshGuest('rl');
    let limited = null;
    for (let i = 0; i < 14; i++) {
      const r = await req('/api/auth/login', { method: 'POST', body: { email: g.email, password: 'wrong-password' } });
      if (r.status === 429) {
        limited = r;
        break;
      }
    }
    assert.ok(limited, 'the limit bites');
    assert.ok(limited.status >= 400 && limited.status < 500, 'a client error');
    assert.equal(limited.body.limit, 10);
    assert.match(limited.body.message, /10 requests per minute/);
  });

  await test('registration accepts ten a minute per account', async () => {
    await resetEvent(TRACK, { capacity: 100, state: 'published' });
    const g = await freshGuest('rlreg');
    let limited = null;
    for (let i = 0; i < 14; i++) {
      const r = await req('/api/registrations', { method: 'POST', token: g.token, body: { event_slug: TRACK } });
      if (r.status === 429) {
        limited = r;
        break;
      }
    }
    assert.ok(limited, 'the registration limit bites');
    assert.equal(limited.body.limit, 10);
  });

  await test('a rejection names the offending field and writes nothing', async () => {
    const r = await req('/api/auth/signup', {
      method: 'POST',
      body: { email: 'not-an-email', password: 'deku-demo-pw-2026', name: 'Nobody At All' },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.field, 'email');
    assert.equal(r.body.message, 'Enter a valid email address.');
    const n = await db.query("SELECT count(*)::int n FROM accounts WHERE display_name='Nobody At All'");
    assert.equal(n.rows[0].n, 0);

    const noName = await req('/api/auth/signup', {
      method: 'POST',
      body: { email: `x${Date.now()}@e.com`, password: 'deku-demo-pw-2026', name: '' },
    });
    assert.equal(noName.body.message, 'Add your name so hosts know who is coming.');
    assert.equal(noName.body.field, 'name');
  });

  await test('signup is open and always creates a guest', async () => {
    const email = `role-${Date.now().toString(36)}@example.test`;
    const r = await req('/api/auth/signup', {
      method: 'POST',
      body: { email, password: 'deku-demo-pw-2026', name: 'Role Tester', role: 'host' },
    });
    assert.equal(r.body.role, 'guest');
    const row = await db.query('SELECT role, password_hash FROM accounts WHERE email=$1', [email]);
    assert.equal(row.rows[0].role, 'guest');
    assert.ok(!row.rows[0].password_hash.includes('deku-demo-pw-2026'), 'passwords are stored hashed');
  });

  await test('every seeded account signs in with the fixture password', async () => {
    for (const email of [
      'host@example.com',
      'host2@example.com',
      'guest@example.com',
      'guest2@example.com',
      'guest3@example.com',
    ]) {
      const r = await req('/api/auth/login', { method: 'POST', body: { email, password: 'deku-demo-pw-2026' } });
      assert.equal(r.status, 200, email);
      assert.ok(r.body.access_token);
    }
  });

  /* ================= invariants ================= */

  await test('the running app holds every invariant', async () => {
    const over = await db.query(`
      SELECT e.slug FROM events e
       WHERE e.capacity IS NOT NULL
         AND (SELECT count(*) FROM registrations r WHERE r.event_id=e.id AND r.status IN ('confirmed','checked_in')) > e.capacity`);
    assert.deepEqual(over.rows, [], 'no event exceeds its capacity');

    const lists = await db.query(`
      SELECT event_id, array_agg(waitlist_position ORDER BY waitlist_position) ps
        FROM registrations WHERE status='waitlisted' GROUP BY event_id`);
    for (const l of lists.rows)
      assert.deepEqual(l.ps, l.ps.map((_, i) => i + 1), `waiting list on event ${l.event_id} is 1..n`);

    const seatless = await db.query(`
      SELECT count(*)::int n FROM registrations
       WHERE status IN ('pending_approval','waitlisted','declined','cancelled_by_guest','cancelled_by_host')
         AND ticket_code IS NOT NULL`);
    assert.equal(seatless.rows[0].n, 0, 'a seatless status holds no ticket');

    const doubled = await db.query(
      'SELECT count(*)::int n FROM (SELECT event_id, account_id FROM registrations GROUP BY 1,2 HAVING count(*)>1) x',
    );
    assert.equal(doubled.rows[0].n, 0, 'one registration per account per event');

    const clash = await db.query(`
      SELECT name FROM (
        SELECT handle AS name FROM accounts
        UNION ALL SELECT slug FROM calendars
        UNION ALL SELECT slug FROM events) x GROUP BY name HAVING count(*)>1`);
    assert.deepEqual(clash.rows, [], 'every name in the root namespace is distinct');
  });

  await report();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});

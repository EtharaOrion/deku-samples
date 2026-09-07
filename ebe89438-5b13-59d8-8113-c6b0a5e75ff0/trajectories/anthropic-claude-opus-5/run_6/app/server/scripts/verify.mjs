
/**
 * Walks the invariants this brief pins, against a running app and the real
 * database. Run with:  node scripts/verify.mjs [baseUrl]
 */
import pg from 'pg';

const BASE = process.argv[2] || 'http://127.0.0.1:4180';
const PW = 'deku-demo-pw-2026';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

async function api(path, { method = 'GET', token, body, raw } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json, headers: res.headers };
}

async function login(email) {
  // the limiter is 10 logins a minute per account, and these suites sign in often
  for (let i = 0; i < 40; i++) {
    const r = await api('/auth/login', { method: 'POST', body: { email, password: PW } });
    if (r.json?.access_token) return r.json.access_token;
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 3000)); continue; }
    throw new Error(`login failed for ${email}: ${JSON.stringify(r.json)}`);
  }
  throw new Error(`login for ${email} stayed rate limited`);
}

async function mailpitFor(subject) {
  const host = process.env.SMTP_HOST || 'mailpit';
  const res = await fetch(`http://${host}:8025/api/v1/search?query=${encodeURIComponent(subject)}`);
  if (!res.ok) return [];
  const j = await res.json();
  return j.messages || [];
}

async function resetEvent(slug) {
  const { rows } = await pool.query('SELECT id FROM events WHERE slug=$1', [slug]);
  await pool.query('DELETE FROM registrations WHERE event_id=$1', [rows[0].id]);
}

async function makeGuests(n, tag) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const email = `race-${tag}-${i}-${Date.now()}@example.com`;
    const r = await api('/auth/signup', {
      method: 'POST', body: { email, password: 'racer-password-1', name: `Racer ${tag}${i}` },
    });
    out.push({ email, token: r.json.access_token, id: r.json.id });
  }
  return out;
}

console.log('\n== health, seed and discovery ==');
{
  const h = await api('/health');
  ok('health answers 200', h.status === 200);

  const list = await api('/events?limit=100');
  ok('discovery lists only published and registration_closed',
    list.json.every((e) => ['published', 'registration_closed'].includes(e.state)),
    JSON.stringify(list.json.map((e) => e.state)));
  ok('draft is absent from discovery', !list.json.some((e) => e.slug === 'harbour-loop-recovery-jog'));
  ok('cancelled is absent from discovery', !list.json.some((e) => e.slug === 'autumn-book-swap'));
  ok('X-Total-Count present', list.headers.get('x-total-count') !== null);

  const sorted = list.json.every((e, i, a) => i === 0 ||
    a[i - 1].starts_at < e.starts_at || (a[i - 1].starts_at === e.starts_at && a[i - 1].slug <= e.slug));
  ok('ranking is soonest first then slug', sorted);

  const empty = await api('/events?category=crypto');
  ok('empty page still carries X-Total-Count = 0', empty.headers.get('x-total-count') === '0');

  const q = await api('/events?q=%20%20');
  ok('whitespace-only q is treated as absent', q.json.length === list.json.length);

  const narrow = await api('/events?category=running&city=Berlin&q=track');
  ok('the three filters combine as one condition',
    narrow.json.length === 1 && narrow.json[0].slug === 'riverside-track-session',
    JSON.stringify(narrow.json.map((e) => e.slug)));

  const byCalendar = await api('/events?q=Northside');
  ok('q matches the calendar name', byCalendar.json.some((e) => e.slug === 'winter-reading-night'));

  const draft = await api('/events/harbour-loop-recovery-jog');
  ok('a draft is not-found to a stranger', draft.status === 404);

  const hostTok = await login('host@example.com');
  const draftAsHost = await api('/events/harbour-loop-recovery-jog', { token: hostTok });
  ok('a draft is readable by its own host', draftAsHost.status === 200);
}

console.log('\n== the last seat under contention ==');
{
  await resetEvent('thursday-night-5k');
  await pool.query(`UPDATE events SET capacity=3, waitlist_enabled=true, approval_required=false,
                    state='published' WHERE slug='thursday-night-5k'`);
  const { rows: ev } = await pool.query("SELECT id FROM events WHERE slug='thursday-night-5k'");
  const eid = ev[0].id;
  const accs = await pool.query("SELECT id,email FROM accounts WHERE email IN ('guest@example.com','guest2@example.com')");
  await pool.query(
    `INSERT INTO registrations (event_id, account_id, status, seat_no, ticket_code)
     VALUES ($1,$2,'confirmed',1,'TKT-RACEAA01'),($1,$3,'confirmed',2,'TKT-RACEAA02')`,
    [eid, accs.rows[0].id, accs.rows[1].id]);

  const racers = await makeGuests(2, 'a');
  const results = await Promise.all(racers.map((g) =>
    api('/registrations', { method: 'POST', token: g.token, body: { event_slug: 'thursday-night-5k' } })));

  const statuses = results.map((r) => r.json.status).sort();
  ok('two simultaneous racers produce one seat and one waiting-list place',
    statuses.length === 2 && statuses[0] === 'confirmed' && statuses[1] === 'waitlisted',
    JSON.stringify(statuses));

  const cnt = await pool.query(
    `SELECT count(*)::int n FROM registrations WHERE event_id=$1 AND status IN ('confirmed','checked_in')`, [eid]);
  ok('confirmed count never exceeds capacity', cnt.rows[0].n === 3, `got ${cnt.rows[0].n}`);
}

console.log('\n== a wide race for one seat ==');
{
  await resetEvent('riverside-track-session');
  await pool.query(`UPDATE events SET capacity=1, waitlist_enabled=true WHERE slug='riverside-track-session'`);
  const racers = await makeGuests(8, 'b');
  const results = await Promise.all(racers.map((g) =>
    api('/registrations', { method: 'POST', token: g.token, body: { event_slug: 'riverside-track-session' } })));
  const confirmed = results.filter((r) => r.json.status === 'confirmed').length;
  const waitlisted = results.filter((r) => r.json.status === 'waitlisted').length;
  ok('eight racers for one seat yield exactly one seat', confirmed === 1, `confirmed=${confirmed}`);
  ok('the other seven take waiting-list places', waitlisted === 7, `waitlisted=${waitlisted}`);

  const { rows } = await pool.query(
    `SELECT waitlist_position p FROM registrations r JOIN events e ON e.id=r.event_id
      WHERE e.slug='riverside-track-session' AND status='waitlisted' ORDER BY p`);
  const positions = rows.map((r) => r.p);
  ok('waiting-list positions are 1..n with no gaps and no repeats',
    positions.every((p, i) => p === i + 1), JSON.stringify(positions));

  const tickets = await pool.query(
    `SELECT status, ticket_code FROM registrations r JOIN events e ON e.id=r.event_id
      WHERE e.slug='riverside-track-session'`);
  ok('a ticket exists exactly when the status holds a seat',
    tickets.rows.every((r) => (['confirmed', 'checked_in'].includes(r.status)) === (r.ticket_code !== null)));
  ok('a ticket code is TKT- plus 8 uppercase letters and digits',
    tickets.rows.filter((r) => r.ticket_code).every((r) => /^TKT-[A-Z0-9]{8}$/.test(r.ticket_code)));
}

console.log('\n== full with no waiting list refuses and leaves nothing behind ==');
{
  await pool.query(`UPDATE events SET state='published', cancel_reason=NULL, cancelled_at=NULL
                     WHERE slug='winter-reading-night'`);
  await resetEvent('winter-reading-night');
  await pool.query(`UPDATE events SET capacity=1, waitlist_enabled=false WHERE slug='winter-reading-night'`);
  const racers = await makeGuests(4, 'c');
  const results = await Promise.all(racers.map((g) =>
    api('/registrations', { method: 'POST', token: g.token, body: { event_slug: 'winter-reading-night' } })));
  const confirmed = results.filter((r) => r.json.status === 'confirmed').length;
  const refused = results.filter((r) => r.status === 409).length;
  ok('exactly one seat is given', confirmed === 1, `confirmed=${confirmed}`);
  ok('the rest are refused as full, as a client error', refused === 3, `refused=${refused}`);
  const rows = await pool.query(
    `SELECT count(*)::int n FROM registrations r JOIN events e ON e.id=r.event_id
      WHERE e.slug='winter-reading-night'`);
  ok('a rejected attempt leaves no row behind', rows.rows[0].n === 1, `rows=${rows.rows[0].n}`);
  await pool.query(`UPDATE events SET capacity=12, waitlist_enabled=false WHERE slug='winter-reading-night'`);
}

console.log('\n== one registration per account per event ==');
{
  await resetEvent('thursday-night-5k');
  await pool.query(`UPDATE events SET capacity=3 WHERE slug='thursday-night-5k'`);
  const [g] = await makeGuests(1, 'd');
  const many = await Promise.all([0, 1, 2, 3].map(() =>
    api('/registrations', { method: 'POST', token: g.token, body: { event_slug: 'thursday-night-5k' } })));
  const rows = await pool.query(
    `SELECT count(*)::int n FROM registrations r JOIN events e ON e.id=r.event_id
      WHERE e.slug='thursday-night-5k' AND r.account_id=$1`, [g.id]);
  ok('four simultaneous first-time registrations produce one row', rows.rows[0].n === 1, `rows=${rows.rows[0].n}`);
  ok('a repeat submission is answered, not refused as a server fault',
    many.every((r) => r.status < 500));
}

console.log('\n== cancelling frees the seat and promotes the head of the list ==');
{
  await resetEvent('thursday-night-5k');
  await pool.query(`UPDATE events SET capacity=1, waitlist_enabled=true WHERE slug='thursday-night-5k'`);
  const [a, b] = await makeGuests(2, 'e');
  const first = await api('/registrations', { method: 'POST', token: a.token, body: { event_slug: 'thursday-night-5k' } });
  const second = await api('/registrations', { method: 'POST', token: b.token, body: { event_slug: 'thursday-night-5k' } });
  ok('the first takes the seat', first.json.status === 'confirmed');
  ok('the second takes waiting-list position 1', second.json.status === 'waitlisted' && second.json.waitlist_position === 1);

  const cancelled = await api(`/registrations/${first.json.id}/cancel`, { method: 'POST', token: a.token });
  ok('cancelling answers cancelled_by_guest', cancelled.json.status === 'cancelled_by_guest');

  const promoted = await pool.query('SELECT status, ticket_code FROM registrations WHERE id=$1', [second.json.id]);
  ok('the head of the waiting list is confirmed in that same request',
    promoted.rows[0].status === 'confirmed', JSON.stringify(promoted.rows[0]));
  ok('and is issued a ticket', /^TKT-[A-Z0-9]{8}$/.test(promoted.rows[0].ticket_code || ''));

  const mails = await mailpitFor('A spot opened up for Thursday Night 5K');
  ok('the promoted guest is mailed the waiting-list-to-seat subject', mails.length > 0, `found ${mails.length}`);
  const logged = await pool.query(
    `SELECT count(*)::int n FROM email_log WHERE subject = 'A spot opened up for Thursday Night 5K'`);
  ok('and the send is recorded in email_log', logged.rows[0].n > 0);
}

console.log('\n== approval queue ==');
{
  await resetEvent('sunrise-long-run');
  await pool.query(`UPDATE events SET approval_required=true, capacity=20 WHERE slug='sunrise-long-run'`);
  const [g] = await makeGuests(1, 'f');
  const reg = await api('/registrations', { method: 'POST', token: g.token, body: { event_slug: 'sunrise-long-run' } });
  ok('with approval on a registration starts pending_approval', reg.json.status === 'pending_approval');
  ok('and holds no seat and no ticket', reg.json.ticket_code === null);

  const pendingMail = await mailpitFor('Your request to join Sunrise Long Run');
  ok('the guest is mailed the awaiting-the-host subject', pendingMail.length > 0);

  const hostTok = await login('host@example.com');
  const guestTok = await login('guest@example.com');

  const asGuest = await api(`/registrations/${reg.json.id}/approve`, { method: 'POST', token: guestTok });
  ok('a guest calling approve directly is denied', asGuest.status === 403 || asGuest.status === 404, `status=${asGuest.status}`);
  const stillPending = await pool.query('SELECT status FROM registrations WHERE id=$1', [reg.json.id]);
  ok('and the protected state is unchanged', stillPending.rows[0].status === 'pending_approval');

  const otherHost = await login('host2@example.com');
  const asOtherHost = await api(`/registrations/${reg.json.id}/approve`, { method: 'POST', token: otherHost });
  ok('a host who does not own the calendar is denied too', asOtherHost.status === 403 || asOtherHost.status === 404);

  const approved = await api(`/registrations/${reg.json.id}/approve`, { method: 'POST', token: hostTok });
  ok('the owning host approves it to confirmed', approved.json.status === 'confirmed');
  ok('and it carries a ticket', /^TKT-[A-Z0-9]{8}$/.test(approved.json.ticket_code || ''));
  const approvedMail = await mailpitFor("You're in: Sunrise Long Run");
  ok('the approved guest is mailed the approval subject', approvedMail.length > 0);

  await resetEvent('sunrise-long-run');
  await pool.query(`UPDATE events SET capacity=1, waitlist_enabled=true WHERE slug='sunrise-long-run'`);
  const [x, y] = await makeGuests(2, 'g');
  const r1 = await api('/registrations', { method: 'POST', token: x.token, body: { event_slug: 'sunrise-long-run' } });
  const r2 = await api('/registrations', { method: 'POST', token: y.token, body: { event_slug: 'sunrise-long-run' } });
  await api(`/registrations/${r1.json.id}/approve`, { method: 'POST', token: hostTok });
  const secondApprove = await api(`/registrations/${r2.json.id}/approve`, { method: 'POST', token: hostTok });
  ok('approving into a full event moves that row to the waiting list',
    secondApprove.json.status === 'waitlisted', JSON.stringify(secondApprove.json));

  const declineTarget = await makeGuests(1, 'h');
  await pool.query(`UPDATE events SET capacity=20 WHERE slug='sunrise-long-run'`);
  const dr = await api('/registrations', { method: 'POST', token: declineTarget[0].token, body: { event_slug: 'sunrise-long-run' } });
  const declined = await api(`/registrations/${dr.json.id}/decline`, { method: 'POST', token: hostTok });
  ok('the host declines a request to declined', declined.json.status === 'declined');
  const declineMail = await mailpitFor('About your request to join Sunrise Long Run');
  ok('the declined guest is mailed the declined subject', declineMail.length > 0);
}

console.log('\n== raising capacity moves the waiting list ==');
{
  await resetEvent('thursday-night-5k');
  await pool.query(`UPDATE events SET capacity=1, waitlist_enabled=true, approval_required=false WHERE slug='thursday-night-5k'`);
  const gs = await makeGuests(4, 'i');
  for (const g of gs) await api('/registrations', { method: 'POST', token: g.token, body: { event_slug: 'thursday-night-5k' } });
  const hostTok = await login('host@example.com');
  const raised = await api('/events/thursday-night-5k', { method: 'PATCH', token: hostTok, body: { capacity: 3 } });
  ok('the raise reports how many were moved to a seat', raised.json.promoted_count === 2, JSON.stringify(raised.json.promoted_count));
  const after = await pool.query(
    `SELECT status, waitlist_position FROM registrations r JOIN events e ON e.id=r.event_id
      WHERE e.slug='thursday-night-5k' ORDER BY waitlist_position NULLS FIRST`);
  ok('three now hold seats', after.rows.filter((r) => r.status === 'confirmed').length === 3);
  const left = after.rows.filter((r) => r.status === 'waitlisted').map((r) => r.waitlist_position);
  ok('those left waiting renumber to 1..n', left.every((p, i) => p === i + 1), JSON.stringify(left));

  const lower = await api('/events/thursday-night-5k', { method: 'PATCH', token: hostTok, body: { capacity: 1 } });
  ok('lowering capacity below the confirmed count is refused', lower.status === 409, `status=${lower.status}`);
  ok('and the refusal names the count', /already have 3 guests confirmed/.test(lower.json.message || ''), lower.json.message);
}

console.log('\n== registration_closed ==');
{
  const r = await api('/registrations', { method: 'POST', token: (await makeGuests(1, 'j'))[0].token,
    body: { event_slug: 'riverside-winter-time-trial' } });
  ok('a closed event refuses a new registration as a client error', r.status === 409, `status=${r.status}`);
  ok('and names the closed state', /closed/i.test(r.json.message || ''), r.json.message);
  const readable = await api('/events/riverside-winter-time-trial');
  ok('a closed event stays readable at its own address', readable.status === 200);
  ok('and appears in discovery', (await api('/events?limit=100')).json.some((e) => e.slug === 'riverside-winter-time-trial'));

  const hostTok = await login('host@example.com');
  const toDraft = await api('/events/riverside-winter-time-trial', { method: 'PATCH', token: hostTok, body: { state: 'draft' } });
  ok('registration_closed cannot fall back to draft', toDraft.status === 409, `status=${toDraft.status}`);
}

console.log('\n== check-in ==');
{
  await resetEvent('thursday-night-5k');
  await pool.query(`UPDATE events SET capacity=3 WHERE slug='thursday-night-5k'`);
  const [g] = await makeGuests(1, 'k');
  const reg = await api('/registrations', { method: 'POST', token: g.token, body: { event_slug: 'thursday-night-5k' } });
  const code = reg.json.ticket_code;
  const hostTok = await login('host@example.com');

  const anon = await api(`/tickets/${code}`);
  ok('a ticket answers a caller with no account', anon.status === 200 && anon.json.ticket_code === code);
  const ghost = await api('/tickets/TKT-NOSUCH99');
  ok('a code that never existed meets not-found', ghost.status === 404);

  const guestTok = await login('guest2@example.com');
  const byGuest = await api(`/tickets/${code}/check-in`, { method: 'POST', token: guestTok });
  ok('a guest cannot check a ticket in', byGuest.status === 403 || byGuest.status === 404);

  const first = await api(`/tickets/${code}/check-in`, { method: 'POST', token: hostTok });
  ok('the owning host checks it in', first.json.status === 'checked_in');
  const firstAt = first.json.checked_in_at;
  const again = await api(`/tickets/${code}/check-in`, { method: 'POST', token: hostTok });
  ok('a second check-in records one arrival, not two', again.json.checked_in_at === firstAt);
  ok('and says so', again.json.already_checked_in === true);
  ok('a checked-in registration keeps its ticket', again.json.ticket_code === code);
}

console.log('\n== the guest list and its export ==');
{
  const hostTok = await login('host@example.com');
  const guestTok = await login('guest@example.com');
  const otherHost = await login('host2@example.com');

  const asGuest = await api('/events/thursday-night-5k/registrations', { token: guestTok });
  ok('a guest cannot read a guest list', asGuest.status === 403 || asGuest.status === 404);
  const asOther = await api('/events/thursday-night-5k/registrations', { token: otherHost });
  ok('a host who does not own it cannot either', asOther.status === 403 || asOther.status === 404);
  const anon = await api('/events/thursday-night-5k/registrations');
  ok('nor an unauthenticated caller', anon.status === 401 || anon.status === 404);

  const mine = await api('/events/thursday-night-5k/registrations', { token: hostTok });
  ok('the owning host reads it', mine.status === 200 && Array.isArray(mine.json));

  const csvRes = await api('/events/thursday-night-5k/registrations.csv', { token: hostTok, raw: true });
  const csv = await csvRes.text();
  ok('the export is served as text/csv', (csvRes.headers.get('content-type') || '').includes('text/csv'));
  ok('and names its file after the event slug',
    (csvRes.headers.get('content-disposition') || '').includes('thursday-night-5k.csv'));
  ok('the first line is the pinned header',
    csv.split('\n')[0] === 'email,display_name,status,waitlist_position,ticket_code', csv.split('\n')[0]);

  const csvGuest = await api('/events/thursday-night-5k/registrations.csv', { token: guestTok, raw: true });
  ok('the export meets the same refusal the JSON list gives', csvGuest.status === 403 || csvGuest.status === 404);
}

console.log('\n== calling an event off ==');
{
  const host2 = await login('host2@example.com');
  await pool.query(`UPDATE events SET state='published', cancel_reason=NULL, cancelled_at=NULL
                     WHERE slug='winter-reading-night'`);
  await resetEvent('winter-reading-night');
  const [g] = await makeGuests(1, 'l');
  await api('/registrations', { method: 'POST', token: g.token, body: { event_slug: 'winter-reading-night' } });

  const noReason = await api('/events/winter-reading-night/cancel', { method: 'POST', token: host2, body: { reason: '  ' } });
  ok('cancelling needs a non-empty reason', noReason.status === 422, `status=${noReason.status}`);

  const reason = 'The venue lost its lease.';
  const done = await api('/events/winter-reading-night/cancel', { method: 'POST', token: host2, body: { reason } });
  ok('the event is called off', done.json.state === 'cancelled');
  ok('and carries the reason word for word', done.json.cancel_reason === reason, done.json.cancel_reason);

  const mails = await mailpitFor('Winter Reading Night has been cancelled');
  ok('every guest holding a place is mailed', mails.length > 0);
  if (mails.length) {
    const host = process.env.SMTP_HOST || 'mailpit';
    const full = await (await fetch(`http://${host}:8025/api/v1/message/${mails[0].ID}`)).json();
    ok('the mail carries the reason word for word', (full.Text || '').includes(reason));
    ok('the mail names the event', (full.Text || '').includes('Winter Reading Night'));
    ok('it goes to that guest alone', (full.To || []).length === 1);
    ok('with no cc', !(full.Cc || []).length);
    ok('and no bcc', !(full.Bcc || []).length);
  }

  const republish = await api('/events/winter-reading-night', { method: 'PATCH', token: host2, body: { state: 'published' } });
  ok('republishing a cancelled event is refused', republish.status === 409, `status=${republish.status}`);

  const list = await api('/events?limit=100');
  ok('a cancelled event leaves discovery', !list.json.some((e) => e.slug === 'winter-reading-night'));

  // leave the seed as it was found, so the suite may be run again
  await pool.query(`UPDATE events SET state='published', cancel_reason=NULL, cancelled_at=NULL
                     WHERE slug='winter-reading-night'`);
}

console.log('\n== a guest cancelling their own registration sends no mail ==');
{
  await resetEvent('thursday-night-5k');
  await pool.query(`UPDATE events SET capacity=3, waitlist_enabled=false WHERE slug='thursday-night-5k'`);
  const [g] = await makeGuests(1, 'm');
  const reg = await api('/registrations', { method: 'POST', token: g.token, body: { event_slug: 'thursday-night-5k' } });
  const before = await pool.query('SELECT count(*)::int n FROM email_log WHERE recipient=$1', [g.email]);
  await api(`/registrations/${reg.json.id}/cancel`, { method: 'POST', token: g.token });
  const after = await pool.query('SELECT count(*)::int n FROM email_log WHERE recipient=$1', [g.email]);
  ok('no mail is sent to the guest who cancelled', after.rows[0].n === before.rows[0].n,
    `${before.rows[0].n} -> ${after.rows[0].n}`);
  await pool.query(`UPDATE events SET waitlist_enabled=true WHERE slug='thursday-night-5k'`);
}

console.log('\n== mail for an ordinary registration ==');
{
  await resetEvent('thursday-night-5k');
  const [g] = await makeGuests(1, 'n');
  const reg = await api('/registrations', { method: 'POST', token: g.token, body: { event_slug: 'thursday-night-5k' } });
  const host = process.env.SMTP_HOST || 'mailpit';
  const found = await (await fetch(`http://${host}:8025/api/v1/search?query=${encodeURIComponent('to:' + g.email)}`)).json();
  const msgs = found.messages || [];
  ok('the confirmation reaches that inbox', msgs.length > 0);
  if (msgs.length) {
    ok('with the pinned subject', msgs[0].Subject === "You're going to Thursday Night 5K", msgs[0].Subject);
    const full = await (await fetch(`http://${host}:8025/api/v1/message/${msgs[0].ID}`)).json();
    ok('the body names the event', (full.Text || '').includes('Thursday Night 5K'));
    ok('the body carries the ticket code', (full.Text || '').includes(reg.json.ticket_code));
    ok('addressed to that guest alone', (full.To || []).length === 1 && full.To[0].Address === g.email);
  }
}

console.log('\n== authorization on mutating endpoints ==');
{
  const guestTok = await login('guest@example.com');
  const host2 = await login('host2@example.com');

  const mkCal = await api('/calendars', { method: 'POST', token: guestTok,
    body: { name: 'Sneaky', slug: 'sneaky-cal', category: 'books', city: 'Berlin', is_public: true } });
  ok('a guest is refused calendar creation', mkCal.status === 403, `status=${mkCal.status}`);

  const mkEvent = await api('/events', { method: 'POST', token: guestTok,
    body: { calendar_slug: 'riverside-run-club', title: 'Nope', category: 'running', city: 'Berlin',
            time_zone: 'UTC', starts_at: '2030-01-01T10:00:00Z', ends_at: '2030-01-01T12:00:00Z', capacity: 5 } });
  ok('a guest cannot create an event', mkEvent.status === 403 || mkEvent.status === 404);

  const edit = await api('/events/thursday-night-5k', { method: 'PATCH', token: guestTok, body: { title: 'Hijacked' } });
  ok('a guest cannot edit an event', edit.status === 403 || edit.status === 404);
  const crossHost = await api('/events/thursday-night-5k', { method: 'PATCH', token: host2, body: { title: 'Hijacked' } });
  ok("a host cannot edit another host's event", crossHost.status === 403 || crossHost.status === 404);
  const title = await pool.query("SELECT title FROM events WHERE slug='thursday-night-5k'");
  ok('the protected state is unchanged', title.rows[0].title === 'Thursday Night 5K', title.rows[0].title);

  const noToken = await api('/registrations', { method: 'POST', body: { event_slug: 'thursday-night-5k' } });
  ok('a request with no token is denied, not served', noToken.status === 401, `status=${noToken.status}`);
  const badToken = await api('/accounts/me', { token: 'not.a.real.token' });
  ok('a forged token is denied', badToken.status === 401);
}

console.log('\n== the root namespace ==');
{
  const hostTok = await login('host@example.com');
  for (const [slug, kind] of [['api', 'system'], ['login', 'system'], ['running', 'category'],
                               ['thursday-night-5k', 'event'], ['riverside-run-club', 'calendar'],
                               ['priya-raman', 'account']]) {
    const r = await api(`/resolve/${slug}`);
    ok(`resolve ${slug} -> ${kind}`, r.json.kind === kind, JSON.stringify(r.json));
  }
  const missing = await api('/resolve/nothing-here-at-all');
  ok('an unknown name meets not-found', missing.status === 404);

  const reserved = await api('/calendars', { method: 'POST', token: hostTok,
    body: { name: 'X', slug: 'login', category: 'books', city: 'Berlin', is_public: true } });
  ok('a calendar slug matching a reserved path is refused', reserved.status === 409 || reserved.status === 422);
  const cat = await api('/calendars', { method: 'POST', token: hostTok,
    body: { name: 'X', slug: 'running', category: 'books', city: 'Berlin', is_public: true } });
  ok('a calendar slug matching a category name is refused', cat.status === 409 || cat.status === 422);
  const dupe = await api('/calendars', { method: 'POST', token: hostTok,
    body: { name: 'X', slug: 'thursday-night-5k', category: 'books', city: 'Berlin', is_public: true } });
  ok('a calendar slug matching an existing event slug is refused', dupe.status === 409);
  ok('and it is refused in the pinned words', dupe.json.message === 'That address is already taken.', dupe.json.message);

  const handle = await api('/accounts/me', { method: 'PATCH', token: hostTok, body: { handle: 'marcus-bell' } });
  ok('a handle already held is refused', handle.status === 409);
  ok('in the pinned words', handle.json.message === 'That handle is already taken.', handle.json.message);
  const kept = await pool.query("SELECT handle FROM accounts WHERE email='host@example.com'");
  ok('and the account keeps the handle it had', kept.rows[0].handle === 'priya-raman');
  const catHandle = await api('/accounts/me', { method: 'PATCH', token: hostTok, body: { handle: 'climate' } });
  ok('a handle matching a category name is refused', catHandle.status === 409);
}

console.log('\n== validation and rate limits ==');
{
  const bad = await api('/auth/signup', { method: 'POST', body: { email: 'not-an-email', password: 'x', name: '' } });
  ok('a rejection names the offending field', bad.status === 422 && !!bad.json.field, JSON.stringify(bad.json));

  const email = `rl-${Date.now()}@example.com`;
  let limited = null;
  for (let i = 0; i < 14; i++) {
    const r = await api('/auth/login', { method: 'POST', body: { email, password: 'whatever-1234' } });
    if (r.status === 429) { limited = r; break; }
  }
  ok('login is limited to 10 a minute per account', limited !== null);
  ok('and the limit is stated in the response body',
    limited && /10 requests per minute/.test(limited.json.message || ''), limited?.json?.message);
}

console.log('\n== time and time zones ==');
{
  const e = await api('/events/thursday-night-5k');
  ok('starts_at is RFC 3339 with a trailing Z', /Z$/.test(e.json.starts_at), e.json.starts_at);
  ok('the event carries an IANA zone', e.json.time_zone === 'Europe/Berlin', e.json.time_zone);

  const hostTok = await login('host@example.com');
  const local = await api('/events/thursday-night-5k', { method: 'PATCH', token: hostTok,
    body: { starts_at: '2030-03-01T10:00:00' } });
  ok('a local time with no zone is refused', local.status === 422, `status=${local.status}`);
}

console.log('\n== the event theme arrives in the first document ==');
{
  const res = await fetch(`${BASE}/thursday-night-5k`);
  const html = await res.text();
  ok('the shell carries the event palette already', html.includes('--event-ground'), html.slice(0, 200));
  const { rows } = await pool.query("SELECT theme_hex FROM events WHERE slug='thursday-night-5k'");
  ok('and the event key colour', html.includes(rows[0].theme_hex), rows[0].theme_hex);
  const plain = await (await fetch(`${BASE}/discover`)).text();
  ok('a route with no event gets no injected theme block', !plain.includes('event-theme-boot'));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
await pool.end();
process.exit(fail ? 1 : 0);

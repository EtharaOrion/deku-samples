
/** The registration_closed rules, which the main suite only partly covers. */
import pg from 'pg';

const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const PW = 'deku-demo-pw-2026';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + ' ' + d); } };

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
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
async function guest(tag) {
  const email = `closed-${tag}-${Date.now()}@example.com`;
  const r = await api('/auth/signup', { method: 'POST', body: { email, password: 'closed-pw-12345', name: `Closed ${tag}` } });
  return { email, token: r.json.access_token, id: r.json.id };
}

const SLUG = 'riverside-track-session';
const eid = (await pool.query('select id from events where slug=$1', [SLUG])).rows[0].id;
const hostTok = await login('host@example.com');

console.log('\n== a seat freed while registration is closed promotes nobody ==');
{
  await pool.query('delete from registrations where event_id=$1', [eid]);
  await pool.query("update events set capacity=1, waitlist_enabled=true, approval_required=false, state='published' where id=$1", [eid]);

  const holder = await guest('holder');
  const waiter = await guest('waiter');
  const h = await api('/registrations', { method: 'POST', token: holder.token, body: { event_slug: SLUG } });
  const w = await api('/registrations', { method: 'POST', token: waiter.token, body: { event_slug: SLUG } });
  ok('the holder has the seat', h.json.status === 'confirmed');
  ok('the waiter is at position 1', w.json.status === 'waitlisted' && w.json.waitlist_position === 1);

  // close registration: an ordinary edit that mails nobody
  const mailsBefore = (await pool.query('select count(*)::int n from email_log where event_id=$1', [eid])).rows[0].n;
  const closed = await api(`/events/${SLUG}`, { method: 'PATCH', token: hostTok, body: { state: 'registration_closed' } });
  ok('a published event moves to registration_closed', closed.json.state === 'registration_closed', closed.json.state);
  const mailsAfter = (await pool.query('select count(*)::int n from email_log where event_id=$1', [eid])).rows[0].n;
  ok('closing registration mails nobody', mailsAfter === mailsBefore, `${mailsBefore} -> ${mailsAfter}`);

  // the guest may still cancel, and the seat is freed without promoting anybody
  const cancelled = await api(`/registrations/${h.json.id}/cancel`, { method: 'POST', token: holder.token });
  ok('a guest may still cancel while registration is closed', cancelled.json.status === 'cancelled_by_guest');
  const stillWaiting = (await pool.query('select status, waitlist_position from registrations where id=$1', [w.json.id])).rows[0];
  ok('and nobody is promoted while it stays closed',
    stillWaiting.status === 'waitlisted' && stillWaiting.waitlist_position === 1, JSON.stringify(stillWaiting));

  const seats = (await pool.query(
    `select count(*)::int n from registrations where event_id=$1 and status in ('confirmed','checked_in')`, [eid])).rows[0].n;
  ok('the seats held never rise while it stays closed', seats === 0, String(seats));

  ok('a new registration is still refused as a client error',
    (await api('/registrations', { method: 'POST', token: (await guest('late')).token, body: { event_slug: SLUG } })).status === 409);
}

console.log('\n== the host still works the queue and the door while closed ==');
{
  await pool.query('delete from registrations where event_id=$1', [eid]);
  await pool.query("update events set capacity=5, state='published', approval_required=true where id=$1", [eid]);
  const g = await guest('queued');
  const r = await api('/registrations', { method: 'POST', token: g.token, body: { event_slug: SLUG } });
  ok('the request starts pending', r.json.status === 'pending_approval');

  await api(`/events/${SLUG}`, { method: 'PATCH', token: hostTok, body: { state: 'registration_closed' } });
  const approved = await api(`/registrations/${r.json.id}/approve`, { method: 'POST', token: hostTok });
  ok('the owning host still approves while closed', approved.json.status === 'confirmed', JSON.stringify(approved.json));

  const checked = await api(`/tickets/${approved.json.ticket_code}/check-in`, { method: 'POST', token: hostTok });
  ok('and still checks a ticket in at the door', checked.json.status === 'checked_in');
}

console.log('\n== reopening restores the panel that was there before ==');
{
  const reopened = await api(`/events/${SLUG}`, { method: 'PATCH', token: hostTok, body: { state: 'published' } });
  ok('a registration_closed event moves back to published', reopened.json.state === 'published', reopened.json.state);
  const held = (await pool.query(
    `select status, ticket_code from registrations where event_id=$1 and status='checked_in'`, [eid])).rows[0];
  ok('registrations already held keep their status and their ticket',
    !!held && /^TKT-[A-Z0-9]{8}$/.test(held.ticket_code), JSON.stringify(held));
}

console.log('\n== a cancelled event moves to no other state ==');
{
  const slug = 'autumn-book-swap';
  const host2 = await login('host2@example.com');
  for (const state of ['published', 'registration_closed', 'draft']) {
    const r = await api(`/events/${slug}`, { method: 'PATCH', token: host2, body: { state } });
    ok(`cancelled -> ${state} is refused`, r.status === 409, `status=${r.status}`);
  }
  const st = (await pool.query('select state from events where slug=$1', [slug])).rows[0].state;
  ok('and it stays cancelled', st === 'cancelled', st);
}

console.log('\n== registration_closed is reachable from published alone ==');
{
  const draft = await api('/events/harbour-loop-recovery-jog', { method: 'PATCH', token: hostTok,
    body: { state: 'registration_closed' } });
  ok('draft -> registration_closed is refused', draft.status === 409, `status=${draft.status}`);
}

// leave the seed as it was found
await pool.query('delete from registrations where event_id=$1', [eid]);
await pool.query("update events set capacity=2, approval_required=false, waitlist_enabled=true, state='published' where id=$1", [eid]);
const g2 = (await pool.query("select id from accounts where email='guest2@example.com'")).rows[0].id;
await pool.query(`insert into registrations (event_id, account_id, status, seat_no, ticket_code)
                  values ($1,$2,'confirmed',1,'TKT-SEEDRT01')`, [eid, g2]);

console.log(`\n${pass} passed, ${fail} failed\n`);
await pool.end();
process.exit(fail ? 1 : 0);

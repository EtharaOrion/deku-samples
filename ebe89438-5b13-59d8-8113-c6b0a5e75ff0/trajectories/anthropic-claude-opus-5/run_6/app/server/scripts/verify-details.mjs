
/** A second pass over details the main suite does not cover. */
import pg from 'pg';

const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const PW = 'deku-demo-pw-2026';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + ' ' + d); } };

async function api(path, { method = 'GET', token, body, raw } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  let json = null; try { json = await res.json(); } catch {}
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

console.log('\n== the export, in detail ==');
{
  const hostTok = await login('host@example.com');
  const eid = (await pool.query("select id from events where slug='thursday-night-5k'")).rows[0].id;
  await pool.query('delete from registrations where event_id=$1', [eid]);
  await pool.query("update events set capacity=10, waitlist_enabled=true where id=$1", [eid]);

  // a display name carrying a comma and a quotation mark must be escaped
  const mk = async (email, name, status, seat, pos, ticket) => {
    let id = (await pool.query('select id from accounts where email=$1', [email])).rows[0]?.id;
    if (!id) {
      const h = 'csv-' + Math.random().toString(36).slice(2, 8);
      id = (await pool.query(
        `insert into accounts (email, password_hash, display_name, handle, role)
         values ($1,(select password_hash from accounts where email='guest@example.com'),$2,$3,'guest')
         returning id`, [email, name, h])).rows[0].id;
    } else {
      await pool.query('update accounts set display_name=$2 where id=$1', [id, name]);
    }
    await pool.query(
      `insert into registrations (event_id, account_id, status, seat_no, waitlist_position, ticket_code)
       values ($1,$2,$3,$4,$5,$6)`, [eid, id, status, seat, pos, ticket]);
  };
  await mk('csv-b@example.com', 'Bell, Marcus', 'confirmed', 1, null, 'TKT-CSVAAAA1');
  await mk('csv-a@example.com', 'Ann "Nan" Ash', 'confirmed', 2, null, 'TKT-CSVAAAA2');
  await mk('csv-w2@example.com', 'Wait Two', 'waitlisted', null, 2, null);
  await mk('csv-w1@example.com', 'Wait One', 'waitlisted', null, 1, null);
  await mk('csv-d@example.com', 'Dee Declined', 'declined', null, null, null);

  const res = await api('/events/thursday-night-5k/registrations.csv', { token: hostTok, raw: true });
  const text = await res.text();
  const lines = text.trim().split('\n');
  ok('the header line is exact', lines[0] === 'email,display_name,status,waitlist_position,ticket_code', lines[0]);

  const statuses = lines.slice(1).map((l) => l.split(',').find((c) => /^(confirmed|declined|waitlisted|checked_in|pending_approval|cancelled_by_guest|cancelled_by_host)$/.test(c)));
  const sortedByStatus = statuses.every((s, i) => i === 0 || statuses[i - 1] <= s);
  ok('rows are ordered by status ascending', sortedByStatus, JSON.stringify(statuses));

  ok('a value carrying a comma is wrapped in quotation marks',
    text.includes('"Bell, Marcus"'), lines.join(' | '));
  ok('an inner quotation mark is doubled',
    text.includes('"Ann ""Nan"" Ash"'), lines.join(' | '));

  const confirmedRows = lines.slice(1).filter((l) => l.includes(',confirmed,'));
  ok('confirmed rows sort by email ascending',
    confirmedRows[0].startsWith('csv-a@') && confirmedRows[1].startsWith('csv-b@'),
    JSON.stringify(confirmedRows));

  const waitRows = lines.slice(1).filter((l) => l.includes(',waitlisted,'));
  ok('waiting rows sort by position ascending',
    waitRows[0].includes(',1,') && waitRows[1].includes(',2,'), JSON.stringify(waitRows));

  const declinedIdx = lines.findIndex((l) => l.includes(',declined,'));
  const waitIdx = lines.findIndex((l) => l.includes(',waitlisted,'));
  ok('an empty waitlist_position sorts last within its status', declinedIdx < waitIdx);
}

console.log('\n== an incomplete submission is stored as a draft ==');
{
  const hostTok = await login('host@example.com');
  const partial = await api('/events', { method: 'POST', token: hostTok,
    body: { calendar_slug: 'riverside-run-club', title: 'Half Finished Idea' } });
  ok('a submission missing what publishing needs is stored as draft',
    partial.json.state === 'draft', JSON.stringify(partial.json.state));
  ok('and it still carries a theme_hex derived at creation',
    /^#[0-9a-f]{6}$/.test(partial.json.theme_hex || ''), partial.json.theme_hex);

  const full = await api('/events', { method: 'POST', token: hostTok,
    body: { calendar_slug: 'riverside-run-club', title: 'Fully Formed Run', category: 'running',
            city: 'Berlin', time_zone: 'Europe/Berlin', starts_at: '2031-05-01T17:00:00Z',
            ends_at: '2031-05-01T19:00:00Z', capacity: 25, description: 'A complete submission.' } });
  ok('a complete submission publishes', full.json.state === 'published', JSON.stringify(full.json.state));
  ok('capacity outside 1..500 is refused',
    (await api('/events', { method: 'POST', token: hostTok,
      body: { calendar_slug: 'riverside-run-club', title: 'Too Big', category: 'running', city: 'Berlin',
              time_zone: 'UTC', starts_at: '2031-05-01T17:00:00Z', ends_at: '2031-05-01T19:00:00Z',
              capacity: 501 } })).status === 422);
  ok('an end before its start is refused',
    (await api('/events', { method: 'POST', token: hostTok,
      body: { calendar_slug: 'riverside-run-club', title: 'Backwards', category: 'running', city: 'Berlin',
              time_zone: 'UTC', starts_at: '2031-05-01T19:00:00Z', ends_at: '2031-05-01T17:00:00Z',
              capacity: 10 } })).status === 422);
  ok('no slug is ever reused',
    (await api('/events', { method: 'POST', token: hostTok,
      body: { calendar_slug: 'riverside-run-club', slug: 'thursday-night-5k', title: 'Clash',
              category: 'running', city: 'Berlin', time_zone: 'UTC',
              starts_at: '2031-05-01T17:00:00Z', ends_at: '2031-05-01T19:00:00Z', capacity: 10 } })).status === 409);
}

console.log('\n== moving an event tells the guests holding a seat ==');
{
  const hostTok = await login('host@example.com');
  const eid = (await pool.query("select id from events where slug='riverside-track-session'")).rows[0].id;
  await pool.query('delete from registrations where event_id=$1', [eid]);
  await pool.query("update events set capacity=5, state='published' where id=$1", [eid]);
  const email = `move-${Date.now()}@example.com`;
  const signup = await api('/auth/signup', { method: 'POST',
    body: { email, password: 'mover-password-1', name: 'Mover One' } });
  await api('/registrations', { method: 'POST', token: signup.json.access_token,
    body: { event_slug: 'riverside-track-session' } });
  const before = (await pool.query('select count(*)::int n from email_log where recipient=$1', [email])).rows[0].n;
  await api('/events/riverside-track-session', { method: 'PATCH', token: hostTok,
    body: { starts_at: '2031-07-07T18:00:00Z', ends_at: '2031-07-07T20:00:00Z' } });
  const after = (await pool.query('select count(*)::int n from email_log where recipient=$1', [email])).rows[0].n;
  ok('a guest holding a seat is mailed when the time moves', after > before, `${before} -> ${after}`);
}

console.log('\n== pagination ==');
{
  const first = await api('/events?limit=2&offset=0');
  const second = await api('/events?limit=2&offset=2');
  ok('limit is honoured', first.json.length <= 2, String(first.json.length));
  ok('offset moves the window',
    !first.json.length || !second.json.length || first.json[0].slug !== second.json[0].slug);
  ok('the total is the same on both pages',
    first.headers.get('x-total-count') === second.headers.get('x-total-count'));
  const capped = await api('/events?limit=5000');
  ok('limit is capped at 100', capped.json.length <= 100, String(capped.json.length));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
await pool.end();
process.exit(fail ? 1 : 0);

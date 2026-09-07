/**
 * Contract tests against a running server. Not shipped in the image.
 *   node test/api_test.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? 'http://127.0.0.1:4173';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://mailpit:8025';
const PW = 'deku-demo-pw-2026';

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; failures.push(`${name} ${detail}`); console.log(`  FAIL ${name} ${detail}`); }
}
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

async function req(method, path, { token, body, raw } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json, headers: res.headers };
}

// Tokens are cached: login is rate limited to 10/min per account by design,
// so a test suite that logs in afresh each time would trip its own contract.
const tokenCache = new Map();
async function login(email) {
  if (!tokenCache.has(email)) {
    const r = await req('POST', '/api/auth/login', { body: { email, password: PW } });
    if (!r.body?.access_token) throw new Error(`login failed for ${email}: ${JSON.stringify(r.body)}`);
    tokenCache.set(email, r.body.access_token);
  }
  return tokenCache.get(email);
}

async function mailFor(subject) {
  const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`subject:"${subject}"`)}`);
  if (!r.ok) return [];
  return (await r.json()).messages ?? [];
}
async function resetMail() { await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' }).catch(() => {}); }

const stamp = Date.now().toString(36);
async function newGuest(tag) {
  const email = `t-${tag}-${stamp}@example.com`;
  const r = await req('POST', '/api/auth/signup', { body: { email, password: PW, name: `Test ${tag}` } });
  return { email, token: r.body.access_token, id: r.body.id, res: r };
}

console.log(`\n=== contract tests against ${BASE} ===\n`);

console.log('health & resolve');
{
  const r = await req('GET', '/api/health');
  ok('health 200', r.status === 200, `status ${r.status}`);
  const kinds = {
    api: 'system', running: 'category', 'thursday-night-5k': 'event',
    'riverside-run-club': 'calendar', 'priya-raman': 'account',
  };
  for (const [slug, kind] of Object.entries(kinds)) {
    const res = await req('GET', `/api/resolve/${slug}`);
    eq(`resolve ${slug} -> ${kind}`, res.body.kind, kind);
  }
  const miss = await req('GET', '/api/resolve/no-such-thing-here');
  ok('resolve unknown 404', miss.status === 404, `status ${miss.status}`);
}

console.log('\nauth');
{
  const g = await newGuest('auth');
  eq('signup creates guest', g.res.body.role, 'guest');
  ok('signup returns id', typeof g.res.body.id === 'number');
  const bad = await req('POST', '/api/auth/login', { body: { email: 'host@example.com', password: 'wrong' } });
  ok('bad password 401', bad.status === 401, `status ${bad.status}`);
  ok('refusal avoids the word error', !JSON.stringify(bad.body).toLowerCase().includes('error'));
  const seeded = await login('host@example.com');
  ok('seeded password works', typeof seeded === 'string' && seeded.length > 10);
  const noTok = await req('GET', '/api/accounts/me');
  ok('no token denied', noTok.status === 401, `status ${noTok.status}`);
  const badTok = await req('GET', '/api/accounts/me', { token: 'garbage.token.here' });
  ok('bad token denied', badTok.status === 401, `status ${badTok.status}`);
}

console.log('\nevents & discovery');
{
  const r = await req('GET', '/api/events');
  ok('events list is an array', Array.isArray(r.body));
  ok('X-Total-Count present', r.headers.get('x-total-count') !== null);
  const slugs = r.body.map((e) => e.slug);
  ok('draft not discoverable', !slugs.includes('harbour-loop-recovery-jog'), slugs.join(','));
  ok('cancelled not discoverable', !slugs.includes('autumn-book-swap'));
  ok('registration_closed IS discoverable', slugs.includes('riverside-winter-time-trial'));

  const sorted = [...r.body].sort((a, b) =>
    a.starts_at === b.starts_at ? a.slug.localeCompare(b.slug) : a.starts_at.localeCompare(b.starts_at));
  eq('ranking is starts_at then slug', slugs, sorted.map((e) => e.slug));
  ok('starts_at ends in Z', r.body.every((e) => /Z$/.test(e.starts_at)));

  const empty = await req('GET', '/api/events?category=crypto&city=Nowhere');
  eq('empty page total is 0', empty.headers.get('x-total-count'), '0');
  eq('empty page is []', empty.body, []);

  const combo = await req('GET', '/api/events?category=running&city=Berlin&q=track');
  ok('three filters combine', combo.body.every((e) => e.category === 'running' && e.city === 'Berlin'));
  ok('q matches title part-word', combo.body.some((e) => e.slug === 'riverside-track-session'), JSON.stringify(combo.body.map(e=>e.slug)));
  const qCal = await req('GET', '/api/events?q=Northside');
  ok('q matches calendar name', qCal.body.some((e) => e.slug === 'winter-reading-night'), JSON.stringify(qCal.body.map(e=>e.slug)));
  const qws = await req('GET', '/api/events?q=%20%20');
  eq('whitespace q is absent', qws.headers.get('x-total-count'), (await req('GET', '/api/events')).headers.get('x-total-count'));

  const cap = await req('GET', '/api/events?limit=999');
  ok('limit capped at 100', cap.body.length <= 100);

  const draftAnon = await req('GET', '/api/events/harbour-loop-recovery-jog');
  ok('draft 404 to stranger', draftAnon.status === 404, `status ${draftAnon.status}`);
  const hostTok = await login('host@example.com');
  const draftHost = await req('GET', '/api/events/harbour-loop-recovery-jog', { token: hostTok });
  ok('draft 200 to its host', draftHost.status === 200, `status ${draftHost.status}`);
  const otherHost = await login('host2@example.com');
  const draftOther = await req('GET', '/api/events/harbour-loop-recovery-jog', { token: otherHost });
  ok('draft 404 to other host', draftOther.status === 404, `status ${draftOther.status}`);

  const one = await req('GET', '/api/events/thursday-night-5k');
  ok('event carries theme_hex', one.body.theme_hex === '#146aeb', one.body.theme_hex);
  ok('event carries description', typeof one.body.description === 'string');
  ok('confirmed_count never exceeds capacity', one.body.confirmed_count <= one.body.capacity);
  eq('seeded 5k has one free seat', one.body.remaining, 1);
}

async function makeEvent(hostTok, slug, over = {}) {
  const body = {
    calendar_slug: 'riverside-run-club', title: over.title ?? 'Lab Event', slug,
    category: 'running', city: 'Berlin', time_zone: 'Europe/Berlin',
    starts_at: new Date(Date.now() + 9 * 864e5).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    ends_at: new Date(Date.now() + 9 * 864e5 + 36e5).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    capacity: 1, approval_required: false, waitlist_enabled: true,
    description: 'A lab event.', ...over,
  };
  return req('POST', '/api/events', { token: hostTok, body });
}

console.log('\nthe last seat under contention');
{
  await resetMail();
  // Two guests take the one remaining seat of a capacity-2 event at once.
  const hostTok = await login('host@example.com');
  const slug = `pair-lab-${stamp}`;
  await makeEvent(hostTok, slug, { capacity: 2, title: 'Pair Lab' });
  const first = await newGuest('race-seed');
  const seeded = await req('POST', '/api/registrations', { token: first.token, body: { event_slug: slug } });
  eq('one seat already taken', seeded.body.status, 'confirmed');

  const a = await newGuest('race-a');
  const b = await newGuest('race-b');
  const [ra, rb] = await Promise.all([
    req('POST', '/api/registrations', { token: a.token, body: { event_slug: slug } }),
    req('POST', '/api/registrations', { token: b.token, body: { event_slug: slug } }),
  ]);
  const statuses = [ra.body.status, rb.body.status].sort();
  eq('one seat + one waiting place', statuses, ['confirmed', 'waitlisted']);
  const confirmedOne = [ra.body, rb.body].find((r) => r.status === 'confirmed');
  const waitedOne = [ra.body, rb.body].find((r) => r.status === 'waitlisted');
  ok('the seat carries a ticket', /^TKT-[A-Z0-9]{8}$/.test(confirmedOne.ticket_code), confirmedOne.ticket_code);
  ok('the waiting place carries no ticket', waitedOne.ticket_code === null);
  ok('the waiting place has a position', waitedOne.waitlist_position >= 1);

  const ev = await req('GET', `/api/events/${slug}`);
  eq('confirmed_count equals capacity, never more', ev.body.confirmed_count, 2);
  eq('remaining is 0', ev.body.remaining, 0);

  // full with the waiting list off is a refusal that leaves nothing behind
  const noWait = `nowait-lab-${stamp}`;
  await makeEvent(hostTok, noWait, { capacity: 1, waitlist_enabled: false, title: 'No Wait Lab' });
  const w1 = await newGuest('nowait-1');
  await req('POST', '/api/registrations', { token: w1.token, body: { event_slug: noWait } });
  const w2 = await newGuest('nowait-2');
  const refused = await req('POST', '/api/registrations', { token: w2.token, body: { event_slug: noWait } });
  ok('full with no waiting list is refused', refused.status === 409, `status ${refused.status}`);
  const leftovers = await req('GET', '/api/registrations/me', { token: w2.token });
  eq('a refused registration leaves no row',
    leftovers.body.filter((r) => r.event_slug === noWait).length, 0);
}

{
  const hostTok = await login('host@example.com');
  const slug = `race-lab-${stamp}`;
  const create = await req('POST', '/api/events', {
    token: hostTok,
    body: {
      calendar_slug: 'riverside-run-club', title: 'Race Lab', slug,
      category: 'running', city: 'Berlin', time_zone: 'Europe/Berlin',
      starts_at: new Date(Date.now() + 9 * 864e5).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      ends_at: new Date(Date.now() + 9 * 864e5 + 36e5).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      capacity: 1, approval_required: false, waitlist_enabled: true,
      description: 'A lab for the last seat.',
    },
  });
  eq('event created published', create.body.state, 'published');

  const guests = await Promise.all([...Array(8)].map((_, i) => newGuest(`swarm-${i}`)));
  const results = await Promise.all(guests.map((g) =>
    req('POST', '/api/registrations', { token: g.token, body: { event_slug: slug } })));
  const confirmed = results.filter((r) => r.body.status === 'confirmed');
  const waitlisted = results.filter((r) => r.body.status === 'waitlisted');
  eq('exactly one seat among 8 racers', confirmed.length, 1);
  eq('the other seven wait', waitlisted.length, 7);
  const positions = waitlisted.map((r) => r.body.waitlist_position).sort((x, y) => x - y);
  eq('waitlist positions are 1..n with no gaps', positions, [1, 2, 3, 4, 5, 6, 7]);

  const ev = await req('GET', `/api/events/${slug}`);
  eq('database says one confirmed', ev.body.confirmed_count, 1);

  const seatHolder = guests[results.indexOf(confirmed[0])];
  const cancel = await req('POST', `/api/registrations/${confirmed[0].body.id}/cancel`, { token: seatHolder.token });
  eq('cancel sets cancelled_by_guest', cancel.body.status, 'cancelled_by_guest');
  ok('cancel clears the ticket', cancel.body.ticket_code === null);
  const after = await req('GET', `/api/events/${slug}`);
  eq('seat passed on at once', after.body.confirmed_count, 1);
  const promotedMail = await mailFor('A spot opened up for Race Lab');
  ok('promotion was mailed', promotedMail.length >= 1, `found ${promotedMail.length}`);

  const hostList = await req('GET', `/api/events/${slug}/registrations`, { token: hostTok });
  const wl = hostList.body.filter((r) => r.status === 'waitlisted').map((r) => r.waitlist_position).sort((x, y) => x - y);
  eq('waitlist renumbered with no gaps', wl, [1, 2, 3, 4, 5, 6]);

  const raise = await req('PATCH', `/api/events/${slug}`, { token: hostTok, body: { capacity: 4 } });
  eq('raise reports how many were seated', raise.body.promoted_count, 3);
  const afterRaise = await req('GET', `/api/events/${slug}`);
  eq('confirmed rose to 4', afterRaise.body.confirmed_count, 4);
  const list2 = await req('GET', `/api/events/${slug}/registrations`, { token: hostTok });
  const wl2 = list2.body.filter((r) => r.status === 'waitlisted').map((r) => r.waitlist_position).sort((x, y) => x - y);
  eq('waitlist renumbered again', wl2, [1, 2, 3]);
  ok('every seat holds a unique ticket',
    new Set(list2.body.filter((r) => r.ticket_code).map((r) => r.ticket_code)).size ===
    list2.body.filter((r) => r.ticket_code).length);

  const lower = await req('PATCH', `/api/events/${slug}`, { token: hostTok, body: { capacity: 1 } });
  ok('lowering below confirmed refused', lower.status === 409, `status ${lower.status}`);
  eq('pinned capacity sentence', lower.body.message, 'You already have 4 guests confirmed.');
}

console.log('\none registration per account per event');
{
  const g = await newGuest('repeat');
  const first = await req('POST', '/api/registrations', { token: g.token, body: { event_slug: 'winter-reading-night' } });
  const second = await req('POST', '/api/registrations', { token: g.token, body: { event_slug: 'winter-reading-night' } });
  eq('repeat returns the same row', first.body.id, second.body.id);
  const mine = await req('GET', '/api/registrations/me', { token: g.token });
  eq('exactly one row for that event', mine.body.filter((r) => r.event_slug === 'winter-reading-night').length, 1);

  const g2 = await newGuest('repeat-race');
  await Promise.all([
    req('POST', '/api/registrations', { token: g2.token, body: { event_slug: 'winter-reading-night' } }),
    req('POST', '/api/registrations', { token: g2.token, body: { event_slug: 'winter-reading-night' } }),
  ]);
  const mine2 = await req('GET', '/api/registrations/me', { token: g2.token });
  eq('concurrent double submit -> one row',
    mine2.body.filter((r) => r.event_slug === 'winter-reading-night').length, 1);
}

console.log('\napproval queue');
{
  await resetMail();
  const g = await newGuest('approve');
  const r = await req('POST', '/api/registrations', { token: g.token, body: { event_slug: 'sunrise-long-run' } });
  eq('approval event starts pending', r.body.status, 'pending_approval');
  ok('pending holds no seat', r.body.ticket_code === null);
  await new Promise((x) => setTimeout(x, 400));
  const pendingMail = await mailFor('Your request to join Sunrise Long Run');
  ok('pending was mailed', pendingMail.length >= 1, `found ${pendingMail.length}`);

  const other = await newGuest('meddler');
  const denied = await req('POST', `/api/registrations/${r.body.id}/approve`, { token: other.token });
  ok('guest cannot approve', denied.status === 404, `status ${denied.status}`);
  const host2 = await login('host2@example.com');
  const denied2 = await req('POST', `/api/registrations/${r.body.id}/approve`, { token: host2 });
  ok('other host cannot approve', denied2.status === 404, `status ${denied2.status}`);
  const still = await req('GET', '/api/registrations/me', { token: g.token });
  eq('state unchanged after refusals',
    still.body.find((x) => x.event_slug === 'sunrise-long-run').status, 'pending_approval');

  const hostTok = await login('host@example.com');
  const appr = await req('POST', `/api/registrations/${r.body.id}/approve`, { token: hostTok });
  eq('host approves to confirmed', appr.body.status, 'confirmed');
  ok('approval issues a ticket', /^TKT-[A-Z0-9]{8}$/.test(appr.body.ticket_code));
  await new Promise((x) => setTimeout(x, 400));
  const inMail = (await mailFor('You\u2019re in: Sunrise Long Run')).length + (await mailFor("You're in: Sunrise Long Run")).length;
  ok('approval was mailed', inMail >= 1, `found ${inMail}`);

  const g2 = await newGuest('decline');
  const r2 = await req('POST', '/api/registrations', { token: g2.token, body: { event_slug: 'sunrise-long-run' } });
  const dec = await req('POST', `/api/registrations/${r2.body.id}/decline`, { token: hostTok });
  eq('host declines', dec.body.status, 'declined');
  ok('declined holds no ticket', dec.body.ticket_code === null);
}

console.log('\ntickets and the door');
{
  const hostTok = await login('host@example.com');
  const g = await newGuest('ticket');
  const r = await req('POST', '/api/registrations', { token: g.token, body: { event_slug: 'thursday-night-5k' } });
  const code = r.body.ticket_code;
  ok('registration took the last 5k seat', r.body.status === 'confirmed', r.body.status);

  const anon = await req('GET', `/api/tickets/${code}`);
  ok('ticket readable without an account', anon.status === 200, `status ${anon.status}`);
  eq('ticket names its event', anon.body.event_slug, 'thursday-night-5k');
  ok('ticket carries no guest list', anon.body.registrations === undefined);
  const ghost = await req('GET', '/api/tickets/TKT-ZZZZZZZZ');
  ok('unknown code 404', ghost.status === 404, `status ${ghost.status}`);

  const guestCheck = await req('POST', `/api/tickets/${code}/check-in`, { token: g.token });
  ok('guest cannot check in', guestCheck.status === 404, `status ${guestCheck.status}`);
  const ci = await req('POST', `/api/tickets/${code}/check-in`, { token: hostTok });
  eq('host checks in', ci.body.status, 'checked_in');
  const ci2 = await req('POST', `/api/tickets/${code}/check-in`, { token: hostTok });
  eq('second check-in records one arrival', ci2.body.already_checked_in, true);
  eq('arrival time unchanged', ci.body.checked_in_at, ci2.body.checked_in_at);
  const evNow = await req('GET', '/api/events/thursday-night-5k');
  ok('checked_in still counts as a seat', evNow.body.confirmed_count <= evNow.body.capacity);
}

console.log('\nregistration closed');
{
  const g = await newGuest('closed');
  const r = await req('POST', '/api/registrations', { token: g.token, body: { event_slug: 'riverside-winter-time-trial' } });
  ok('closed event refuses registration', r.status === 409, `status ${r.status}`);
  ok('refusal names the closed state', /clos/i.test(r.body.message), r.body.message);
  const ev = await req('GET', '/api/events/riverside-winter-time-trial');
  ok('closed event still readable', ev.status === 200);
  const hostTok = await login('host@example.com');
  const reopen = await req('PATCH', '/api/events/riverside-winter-time-trial', { token: hostTok, body: { state: 'published' } });
  eq('reopens to published', reopen.body.state, 'published');
  const reclose = await req('PATCH', '/api/events/riverside-winter-time-trial', { token: hostTok, body: { state: 'registration_closed' } });
  eq('closes again', reclose.body.state, 'registration_closed');
  const toDraft = await req('PATCH', '/api/events/thursday-night-5k', { token: hostTok, body: { state: 'draft' } });
  ok('published cannot return to draft', toDraft.status === 409, `status ${toDraft.status}`);
}

console.log('\ncancelling an event');
{
  await resetMail();
  const hostTok = await login('host@example.com');
  const slug = `cancel-lab-${stamp}`;
  await req('POST', '/api/events', {
    token: hostTok,
    body: {
      calendar_slug: 'riverside-run-club', title: 'Cancel Lab', slug,
      category: 'running', city: 'Berlin', time_zone: 'Europe/Berlin',
      starts_at: new Date(Date.now() + 9 * 864e5).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      ends_at: new Date(Date.now() + 9 * 864e5 + 36e5).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      capacity: 5, approval_required: false, waitlist_enabled: true, description: 'x',
    },
  });
  const g = await newGuest('cancelme');
  await req('POST', '/api/registrations', { token: g.token, body: { event_slug: slug } });

  const noReason = await req('POST', `/api/events/${slug}/cancel`, { token: hostTok, body: { reason: '   ' } });
  ok('cancel needs a reason', noReason.status === 400, `status ${noReason.status}`);
  const stillLive = await req('GET', `/api/events/${slug}`);
  eq('refused cancel wrote nothing', stillLive.body.state, 'published');

  const reason = 'The venue lost its lease, and we could not find another in time.';
  const done = await req('POST', `/api/events/${slug}/cancel`, { token: hostTok, body: { reason } });
  eq('cancelled', done.body.state, 'cancelled');
  eq('reason stored word for word', done.body.cancel_reason, reason);
  const again = await req('POST', `/api/events/${slug}/cancel`, { token: hostTok, body: { reason: 'again' } });
  ok('a cancellation cannot be undone or repeated', again.status === 409, `status ${again.status}`);
  const republish = await req('PATCH', `/api/events/${slug}`, { token: hostTok, body: { state: 'published' } });
  ok('cancelled cannot be republished', republish.status === 409, `status ${republish.status}`);

  await new Promise((x) => setTimeout(x, 500));
  const msgs = await mailFor('Cancel Lab has been cancelled');
  ok('cancellation mailed the guest', msgs.length >= 1, `found ${msgs.length}`);
  if (msgs.length) {
    const full = await (await fetch(`${MAILPIT}/api/v1/message/${msgs[0].ID}`)).json();
    ok('body carries the reason word for word', (full.Text ?? '').includes(reason));
    ok('body names the event', (full.Text ?? '').includes('Cancel Lab'));
    eq('to that guest alone', full.To.length, 1);
    eq('no cc', (full.Cc ?? []).length, 0);
    eq('no bcc', (full.Bcc ?? []).length, 0);
  }
}

{
  const g = await newGuest('silent');
  const r = await req('POST', '/api/registrations', { token: g.token, body: { event_slug: 'winter-reading-night' } });
  await new Promise((x) => setTimeout(x, 400));
  await resetMail();
  await req('POST', `/api/registrations/${r.body.id}/cancel`, { token: g.token });
  await new Promise((x) => setTimeout(x, 600));
  const all = await (await fetch(`${MAILPIT}/api/v1/messages`)).json();
  eq('guest self-cancel sends no mail', (all.messages ?? []).length, 0);
}

console.log('\nmail subjects');
{
  await resetMail();
  const g = await newGuest('subjects');
  await req('POST', '/api/registrations', { token: g.token, body: { event_slug: 'winter-reading-night' } });
  await new Promise((r) => setTimeout(r, 500));
  const msgs = await mailFor('You\u2019re going to Winter Reading Night');
  const alt = await mailFor("You're going to Winter Reading Night");
  ok('confirmation subject is exact', msgs.length + alt.length >= 1, `found ${msgs.length + alt.length}`);
  const list = await (await fetch(`${MAILPIT}/api/v1/messages`)).json();
  const m = (list.messages ?? [])[0];
  if (m) {
    const full = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
    ok('body names the event', (full.Text ?? '').includes('Winter Reading Night'));
    ok('body carries the ticket code', /TKT-[A-Z0-9]{8}/.test(full.Text ?? ''));
    eq('single recipient', full.To.length, 1);
  }
}

console.log('\nCSV export');
{
  const hostTok = await login('host@example.com');
  const res = await fetch(`${BASE}/api/events/thursday-night-5k/registrations.csv`, {
    headers: { authorization: `Bearer ${hostTok}` },
  });
  ok('csv content type', (res.headers.get('content-type') ?? '').includes('text/csv'));
  ok('csv names its file after the slug',
    (res.headers.get('content-disposition') ?? '').includes('thursday-night-5k'));
  const text = await res.text();
  eq('pinned header line', text.split('\n')[0], 'email,display_name,status,waitlist_position,ticket_code');

  const anon = await fetch(`${BASE}/api/events/thursday-night-5k/registrations.csv`);
  ok('csv denies the anonymous caller', anon.status === 401 || anon.status === 404, `status ${anon.status}`);
  const guestTok = await login('guest@example.com');
  const asGuest = await fetch(`${BASE}/api/events/thursday-night-5k/registrations.csv`, {
    headers: { authorization: `Bearer ${guestTok}` },
  });
  ok('csv denies a guest', asGuest.status === 404, `status ${asGuest.status}`);
  const host2 = await login('host2@example.com');
  const asOther = await fetch(`${BASE}/api/events/thursday-night-5k/registrations.csv`, {
    headers: { authorization: `Bearer ${host2}` },
  });
  ok('csv denies a non-owning host', asOther.status === 404, `status ${asOther.status}`);

  const g = await newGuest('csv-quote');
  await req('PATCH', '/api/accounts/me', { token: g.token, body: { display_name: 'Ann "Bee", Cee' } });
  await req('POST', '/api/registrations', { token: g.token, body: { event_slug: 'winter-reading-night' } });
  const h2 = await login('host2@example.com');
  const csv2 = await (await fetch(`${BASE}/api/events/winter-reading-night/registrations.csv`, {
    headers: { authorization: `Bearer ${h2}` },
  })).text();
  ok('comma and quote are wrapped and doubled', csv2.includes('"Ann ""Bee"", Cee"'), csv2.split('\n').find(l=>l.includes('Ann'))??'');
}

console.log('\nauthorization boundaries');
{
  const guestTok = await login('guest@example.com');
  const host2 = await login('host2@example.com');
  const checks = [
    ['guest reads a guest list', 'GET', '/api/events/thursday-night-5k/registrations', guestTok],
    ['other host reads a guest list', 'GET', '/api/events/thursday-night-5k/registrations', host2],
    ['guest creates a calendar', 'POST', '/api/calendars', guestTok,
      { name: 'Nope', slug: `nope-${stamp}`, category: 'books', city: 'X', is_public: true }],
    ['guest creates an event', 'POST', '/api/events', guestTok,
      { calendar_slug: 'riverside-run-club', title: 'Nope' }],
    ['other host edits an event', 'PATCH', '/api/events/thursday-night-5k', host2, { title: 'Hijacked' }],
    ['other host cancels an event', 'POST', '/api/events/thursday-night-5k/cancel', host2, { reason: 'nope' }],
  ];
  for (const [name, method, path, token, body] of checks) {
    const r = await req(method, path, { token, body });
    ok(name + ' denied', r.status === 401 || r.status === 403 || r.status === 404, `status ${r.status}`);
  }
  const untouched = await req('GET', '/api/events/thursday-night-5k');
  eq('protected state unchanged', untouched.body.title, 'Thursday Night 5K');
  eq('still published', untouched.body.state, 'published');
}

console.log('\nroot namespace');
{
  const g = await newGuest('handle');
  for (const bad of ['api', 'login', 'running', 'books', 'priya-raman', 'riverside-run-club', 'thursday-night-5k']) {
    const r = await req('PATCH', '/api/accounts/me', { token: g.token, body: { handle: bad } });
    ok(`handle "${bad}" refused`, r.status >= 400, `status ${r.status}`);
  }
  const taken = await req('PATCH', '/api/accounts/me', { token: g.token, body: { handle: 'priya-raman' } });
  eq('pinned handle refusal', taken.body.message, 'That handle is already taken.');
  const me = await req('GET', '/api/accounts/me', { token: g.token });
  ok('handle unchanged after refusal', me.body.handle !== 'priya-raman');
  const good = await req('PATCH', '/api/accounts/me', { token: g.token, body: { handle: `ok-handle-${stamp}` } });
  eq('a free handle is accepted', good.status, 200);

  const hostTok = await login('host@example.com');
  const dup = await req('POST', '/api/calendars', {
    token: hostTok, body: { name: 'Dup', slug: 'running', category: 'books', city: 'X', is_public: true },
  });
  eq('pinned calendar slug refusal', dup.body.message, 'That address is already taken.');
  const dup2 = await req('POST', '/api/calendars', {
    token: hostTok, body: { name: 'Dup', slug: 'thursday-night-5k', category: 'books', city: 'X', is_public: true },
  });
  ok('calendar slug cannot equal an event slug', dup2.status === 409, `status ${dup2.status}`);
}

console.log('\nvalidation and rate limits');
{
  const bad = await req('POST', '/api/auth/signup', { body: { email: 'not-an-email', password: PW, name: 'X' } });
  ok('invalid email refused', bad.status === 400, `status ${bad.status}`);
  eq('refusal names the field', bad.body.field, 'email');
  eq('pinned email sentence', bad.body.message, 'Enter a valid email address.');

  const hostTok = await login('host@example.com');
  const badCap = await req('POST', '/api/events', {
    token: hostTok, body: { calendar_slug: 'riverside-run-club', title: 'Bad', capacity: 9999 },
  });
  ok('capacity above 500 refused', badCap.status === 400, `status ${badCap.status}`);
  eq('names the capacity field', badCap.body.field, 'capacity');

  const localTime = await req('POST', '/api/events', {
    token: hostTok,
    body: { calendar_slug: 'riverside-run-club', title: 'Local', starts_at: '2030-01-01T10:00:00' },
  });
  ok('a local time without Z is refused', localTime.status === 400, `status ${localTime.status}`);

  const draft = await req('POST', '/api/events', {
    token: hostTok, body: { calendar_slug: 'riverside-run-club', title: `Incomplete ${stamp}` },
  });
  eq('incomplete submission stored as draft', draft.body.state, 'draft');

  const rl = await newGuest('rl');
  let limited = null;
  for (let i = 0; i < 14; i++) {
    const r = await req('POST', '/api/registrations', { token: rl.token, body: { event_slug: 'winter-reading-night' } });
    if (r.status === 429) { limited = r; break; }
  }
  ok('registration is rate limited', limited !== null && limited.status === 429);
  ok('the limit is stated in the body', limited && /10/.test(limited.body.message), limited?.body?.message);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (failures.length) {
  console.log('\nfailures:');
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(fail === 0 ? 0 : 1);

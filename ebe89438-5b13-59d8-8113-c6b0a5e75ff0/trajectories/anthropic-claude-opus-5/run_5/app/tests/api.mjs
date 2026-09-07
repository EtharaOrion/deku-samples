/**
 * End-to-end API check, run against a live server and the real Postgres and
 * Mailpit instances. Usage: node tests/api.mjs [baseUrl]
 */
const BASE = process.argv[2] || process.env.TEST_BASE || 'http://localhost:4180';
const MAILPIT = process.env.MAILPIT_HTTP || 'http://mailpit:8025';
const PW = 'deku-demo-pw-2026';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  FAIL ${name}${detail !== undefined ? ' :: ' + JSON.stringify(detail).slice(0, 400) : ''}`);
  }
}

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
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, headers: res.headers };
}

async function login(email) {
  const r = await api('/auth/login', { method: 'POST', body: { email, password: PW } });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${r.text}`);
  return r.json.access_token;
}

async function mailpit(path) {
  try {
    const r = await fetch(`${MAILPIT}${path}`);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

const iso = (msFromNow) => new Date(Date.now() + msFromNow).toISOString().replace(/\.\d+Z$/, 'Z');

async function main() {
  console.log('\n== health ==');
  const health = await api('/health');
  check('health returns 200', health.status === 200, health.json);

  console.log('\n== auth ==');
  const hostToken = await login('host@example.com');
  const host2Token = await login('host2@example.com');
  const guestToken = await login('guest@example.com');
  const guest2Token = await login('guest2@example.com');
  const guest3Token = await login('guest3@example.com');
  check('seeded host signs in with the pinned password', !!hostToken);
  check('seeded guest signs in with the pinned password', !!guestToken);

  const bad = await api('/auth/login', { method: 'POST', body: { email: 'host@example.com', password: 'nope-nope-nope' } });
  check('wrong password refused', bad.status === 401, bad.json);
  check('the refusal never says the word error', !/error/i.test(bad.json.message), bad.json);

  const stamp = Date.now().toString(36);
  const signup = await api('/auth/signup', {
    method: 'POST',
    body: { email: `walker-${stamp}@example.com`, password: 'walk-the-app-2026', name: 'Wanda Walker' },
  });
  check('signup creates a guest', signup.status === 201 && signup.json.role === 'guest', signup.json);
  check('signup returns an id', typeof signup.json?.id === 'number');
  const newGuestToken = signup.json.access_token;

  console.log('\n== resolve ==');
  for (const [slug, kind] of [
    ['login', 'system'],
    ['api', 'system'],
    ['running', 'category'],
    ['thursday-night-5k', 'event'],
    ['riverside-run-club', 'calendar'],
    ['priya-raman', 'account'],
  ]) {
    const r = await api(`/resolve/${slug}`);
    check(`resolve ${slug} -> ${kind}`, r.status === 200 && r.json.kind === kind, r.json);
  }
  check('resolve unknown -> 404', (await api('/resolve/nothing-here-at-all')).status === 404);

  console.log('\n== discovery ==');
  const list = await api('/events');
  check('list returns an array at top level', Array.isArray(list.json), list.json);
  check('X-Total-Count present', list.headers.get('x-total-count') !== null);
  const slugs = list.json.map((e) => e.slug);
  check('draft absent from discovery', !slugs.includes('harbour-loop-recovery-jog'), slugs);
  check('cancelled absent from discovery', !slugs.includes('autumn-book-swap'), slugs);
  check('registration_closed present in discovery', slugs.includes('riverside-winter-time-trial'), slugs);
  const sorted = [...list.json].sort((a, b) =>
    a.starts_at === b.starts_at ? a.slug.localeCompare(b.slug) : a.starts_at.localeCompare(b.starts_at),
  );
  check('ranking is soonest first then slug', JSON.stringify(sorted.map((e) => e.slug)) === JSON.stringify(slugs));
  check('every timestamp ends in Z', list.json.every((e) => /Z$/.test(e.starts_at) && /Z$/.test(e.ends_at)));
  check('confirmed_count never exceeds capacity', list.json.every((e) => e.confirmed_count <= e.capacity));
  check('each row carries remaining and theme_hex', list.json.every((e) => typeof e.remaining === 'number' && /^#[0-9a-f]{6}$/.test(e.theme_hex)));
  check('each row carries time_zone', list.json.every((e) => !!e.time_zone));

  const byCat = await api('/events?category=books');
  check('category filter narrows', byCat.json.length > 0 && byCat.json.every((e) => e.category === 'books'), byCat.json);
  const byCity = await api('/events?city=Berlin');
  check('city filter narrows', byCity.json.length > 0 && byCity.json.every((e) => e.city === 'Berlin'));
  const byQ = await api('/events?q=track');
  check('q matches part of a title word', byQ.json.some((e) => e.slug === 'riverside-track-session'), byQ.json.map((e) => e.slug));
  const qCal = await api('/events?q=Northside');
  check('q matches the calendar name', qCal.json.some((e) => e.slug === 'winter-reading-night'), qCal.json.map((e) => e.slug));
  const qDesc = await api('/events?q=canal');
  check('q matches the description', qDesc.json.some((e) => e.slug === 'thursday-night-5k'), qDesc.json.map((e) => e.slug));
  const qCity = await api('/events?q=Lisbon');
  check('q is not the city field', !qCity.json.some((e) => e.slug === 'winter-reading-night'), qCity.json.map((e) => e.slug));
  const combined = await api('/events?category=running&city=Berlin&q=track');
  check('the three combine as one condition', combined.json.length === 1 && combined.json[0].slug === 'riverside-track-session', combined.json.map((e) => e.slug));
  const whitespaceQ = await api('/events?q=%20%20');
  check('a whitespace q is treated as absent', whitespaceQ.json.length === list.json.length);
  const empty = await api('/events?city=Atlantis');
  check('an empty page still carries X-Total-Count 0', empty.headers.get('x-total-count') === '0' && empty.json.length === 0);
  const paged = await api('/events?limit=2&offset=0');
  check('limit honoured', paged.json.length === 2);
  check('the total counts before limit and offset', Number(paged.headers.get('x-total-count')) === list.json.length);
  check('limit capped at 100', (await api('/events?limit=1000')).json.length <= 100);

  console.log('\n== draft privacy ==');
  const draftAnon = await api('/events/harbour-loop-recovery-jog');
  const draftGuest = await api('/events/harbour-loop-recovery-jog', { token: guestToken });
  const draftHost = await api('/events/harbour-loop-recovery-jog', { token: hostToken });
  const neverExisted = await api('/events/no-such-event-ever');
  check('a draft is 404 to anonymous', draftAnon.status === 404);
  check('a draft is 404 to a guest', draftGuest.status === 404);
  check('a draft matches the never-existed wording', draftAnon.json.message === neverExisted.json.message, [draftAnon.json, neverExisted.json]);
  check('a draft is visible to its host', draftHost.status === 200 && draftHost.json.state === 'draft');

  console.log('\n== the last seat under contention ==');
  const contenders = [];
  for (let i = 0; i < 2; i++) {
    const s = await api('/auth/signup', {
      method: 'POST',
      body: { email: `racer-${stamp}-${i}@example.com`, password: 'race-the-seat-2026', name: `Racer ${i}` },
    });
    contenders.push(s.json.access_token);
  }
  const raced = await Promise.all(
    contenders.map((t) => api('/registrations', { method: 'POST', token: t, body: { event_slug: 'thursday-night-5k' } })),
  );
  const statuses = raced.map((r) => r.json?.status ?? `http_${r.status}`);
  check('exactly one of the two took the last seat', statuses.filter((s) => s === 'confirmed').length === 1, statuses);
  check('the other took a waiting-list place', statuses.filter((s) => s === 'waitlisted').length === 1, statuses);
  const after5k = await api('/events/thursday-night-5k');
  check('confirmed_count equals capacity, never more', after5k.json.confirmed_count === 3, after5k.json);

  const raceSlug = `race-night-${stamp}`;
  const created = await api('/events', {
    method: 'POST',
    token: hostToken,
    body: {
      calendar_slug: 'riverside-run-club', slug: raceSlug, title: `Race Night ${stamp}`,
      category: 'running', city: 'Berlin', time_zone: 'Europe/Berlin',
      starts_at: iso(20 * 86400000), ends_at: iso(20 * 86400000 + 7200000),
      capacity: 2, approval_required: false, waitlist_enabled: true,
      description: 'A contended two-seat event.',
    },
  });
  check('a host creates a published event', created.status === 201 && created.json.state === 'published', created.json);
  check('the created event carries a theme_hex', /^#[0-9a-f]{6}$/.test(created.json.theme_hex || ''), created.json.theme_hex);

  const crowd = [];
  for (let i = 0; i < 8; i++) {
    const s = await api('/auth/signup', {
      method: 'POST',
      body: { email: `crowd-${stamp}-${i}@example.com`, password: 'crowd-the-door-2026', name: `Crowd ${i}` },
    });
    crowd.push(s.json.access_token);
  }
  const stampede = await Promise.all(
    crowd.map((t) => api('/registrations', { method: 'POST', token: t, body: { event_slug: raceSlug } })),
  );
  const st = stampede.map((r) => r.json?.status ?? `http_${r.status}`);
  check('eight at the same instant produce exactly two seats', st.filter((s) => s === 'confirmed').length === 2, st);
  check('the rest take waiting-list places', st.filter((s) => s === 'waitlisted').length === 6, st);
  const positions = stampede.filter((r) => r.json?.status === 'waitlisted').map((r) => r.json.waitlist_position).sort((a, b) => a - b);
  check('waiting-list positions are 1..n with no gaps or repeats', JSON.stringify(positions) === JSON.stringify([1, 2, 3, 4, 5, 6]), positions);
  check('confirmed_count is exactly the capacity', (await api(`/events/${raceSlug}`)).json.confirmed_count === 2);

  console.log('\n== one registration per account ==');
  await Promise.all([
    api('/registrations', { method: 'POST', token: crowd[0], body: { event_slug: raceSlug } }),
    api('/registrations', { method: 'POST', token: crowd[0], body: { event_slug: raceSlug } }),
  ]);
  const guestList = await api(`/events/${raceSlug}/registrations`, { token: hostToken });
  const rowsFor0 = guestList.json.filter((r) => r.email === `crowd-${stamp}-0@example.com`);
  check('a repeat submission never adds a second row', rowsFor0.length === 1, rowsFor0);
  check('the guest list has exactly eight rows', guestList.json.length === 8, guestList.json.length);

  console.log('\n== a full event with no waiting list ==');
  const noWlSlug = `strict-door-${stamp}`;
  await api('/events', {
    method: 'POST', token: hostToken,
    body: {
      calendar_slug: 'riverside-run-club', slug: noWlSlug, title: `Strict Door ${stamp}`,
      category: 'running', city: 'Berlin', time_zone: 'Europe/Berlin',
      starts_at: iso(22 * 86400000), ends_at: iso(22 * 86400000 + 3600000),
      capacity: 1, approval_required: false, waitlist_enabled: false, description: 'One seat, no waiting list.',
    },
  });
  const strict = await Promise.all([
    api('/registrations', { method: 'POST', token: crowd[1], body: { event_slug: noWlSlug } }),
    api('/registrations', { method: 'POST', token: crowd[2], body: { event_slug: noWlSlug } }),
  ]);
  const strictStatuses = strict.map((r) => r.json?.status ?? `http_${r.status}`);
  check('one seat is taken', strict.filter((r) => r.json?.status === 'confirmed').length === 1, strictStatuses);
  check('the other is rejected as full, not seated', strict.filter((r) => r.status >= 400 && r.status < 500).length === 1, strictStatuses);
  const strictList = await api(`/events/${noWlSlug}/registrations`, { token: hostToken });
  check('a rejected attempt leaves no partial row', strictList.json.length === 1, strictList.json);

  console.log('\n== ticket codes ==');
  const seatReg = stampede.find((r) => r.json?.status === 'confirmed');
  check('a ticket code has the pinned shape', /^TKT-[A-Z0-9]{8}$/.test(seatReg.json.ticket_code), seatReg.json.ticket_code);
  const wl = stampede.find((r) => r.json?.status === 'waitlisted').json;
  check('a waitlisted registration holds no ticket', wl.ticket_code === null, wl);
  const ticketAnon = await api(`/tickets/${seatReg.json.ticket_code}`);
  check('a ticket answers an anonymous caller', ticketAnon.status === 200 && ticketAnon.json.ticket_code === seatReg.json.ticket_code, ticketAnon.json);
  check('a ticket carries the event, never the guest list', ticketAnon.json.event_slug === raceSlug && ticketAnon.json.registrations === undefined);
  check('an unknown code meets not-found', (await api('/tickets/TKT-ZZZZZZZZ')).status === 404);
  const allCodes = guestList.json.map((r) => r.ticket_code).filter(Boolean);
  check('no code is held by two registrations', new Set(allCodes).size === allCodes.length, allCodes);

  console.log('\n== cancelling frees the seat and promotes the head ==');
  const seatIdx = stampede.indexOf(seatReg);
  const headBefore = guestList.json.find((r) => r.waitlist_position === 1);
  const cancelled = await api(`/registrations/${seatReg.json.id}/cancel`, { method: 'POST', token: crowd[seatIdx] });
  check('cancel returns cancelled_by_guest', cancelled.json.status === 'cancelled_by_guest', cancelled.json);
  check('cancelling clears the ticket code', cancelled.json.ticket_code === null, cancelled.json);
  const listAfter = await api(`/events/${raceSlug}/registrations`, { token: hostToken });
  const headAfter = listAfter.json.find((r) => r.id === headBefore.id);
  check('the head of the waiting list is confirmed in the same request', headAfter.status === 'confirmed', headAfter);
  check('the promoted guest holds a ticket', /^TKT-[A-Z0-9]{8}$/.test(headAfter.ticket_code || ''), headAfter);
  check('the promoted guest loses its waiting-list position', headAfter.waitlist_position === null, headAfter);
  const stillWaiting = listAfter.json.filter((r) => r.status === 'waitlisted').map((r) => r.waitlist_position).sort((a, b) => a - b);
  check('the rest renumber to 1..n', JSON.stringify(stillWaiting) === JSON.stringify([1, 2, 3, 4, 5]), stillWaiting);
  check('confirmed_count still equals capacity', (await api(`/events/${raceSlug}`)).json.confirmed_count === 2);

  console.log('\n== raising capacity moves the waiting list ==');
  const raised = await api(`/events/${raceSlug}`, { method: 'PATCH', token: hostToken, body: { capacity: 5 } });
  check('the raise reports how many were moved to a seat', raised.json.promoted_from_waitlist === 3, raised.json);
  const listRaised = await api(`/events/${raceSlug}/registrations`, { token: hostToken });
  check('the raise filled the seats that appeared', listRaised.json.filter((r) => r.status === 'confirmed').length === 5, listRaised.json.map((r) => r.status));
  const waitRenum = listRaised.json.filter((r) => r.status === 'waitlisted').map((r) => r.waitlist_position).sort((a, b) => a - b);
  check('the remainder renumber with no gaps', JSON.stringify(waitRenum) === JSON.stringify([1, 2]), waitRenum);
  check('each promoted guest was issued its own code', new Set(listRaised.json.filter((r) => r.ticket_code).map((r) => r.ticket_code)).size === 5);
  const lowered = await api(`/events/${raceSlug}`, { method: 'PATCH', token: hostToken, body: { capacity: 1 } });
  check('lowering below the confirmed count is refused', lowered.status === 400, lowered.json);
  check('the refusal is the pinned sentence', lowered.json.message === 'You already have 5 guests confirmed.', lowered.json);
  check('the refusal names the offending field', lowered.json.field === 'capacity');

  console.log('\n== approval queue ==');
  const pendingList = await api('/events/sunrise-long-run/registrations', { token: hostToken });
  const pending = pendingList.json.find((r) => r.status === 'pending_approval');
  check('the seeded pending request is there', !!pending, pendingList.json);
  const approved = await api(`/registrations/${pending.id}/approve`, { method: 'POST', token: hostToken });
  check('approve flips the row to confirmed', approved.json.status === 'confirmed', approved.json);
  check('approve issues a ticket', /^TKT-[A-Z0-9]{8}$/.test(approved.json.ticket_code || ''), approved.json);

  const apSlug = `approval-night-${stamp}`;
  await api('/events', {
    method: 'POST', token: hostToken,
    body: {
      calendar_slug: 'riverside-run-club', slug: apSlug, title: `Approval Night ${stamp}`,
      category: 'running', city: 'Berlin', time_zone: 'Europe/Berlin',
      starts_at: iso(21 * 86400000), ends_at: iso(21 * 86400000 + 3600000),
      capacity: 1, approval_required: true, waitlist_enabled: true, description: 'Approval, one seat.',
    },
  });
  const ap1 = await api('/registrations', { method: 'POST', token: guestToken, body: { event_slug: apSlug } });
  const ap2 = await api('/registrations', { method: 'POST', token: guest2Token, body: { event_slug: apSlug } });
  check('approval_required starts pending_approval', ap1.json.status === 'pending_approval', ap1.json);
  check('a pending registration holds no seat', (await api(`/events/${apSlug}`)).json.confirmed_count === 0);
  check('a pending registration holds no ticket', ap1.json.ticket_code === null);
  const apA = await api(`/registrations/${ap1.json.id}/approve`, { method: 'POST', token: hostToken });
  const apB = await api(`/registrations/${ap2.json.id}/approve`, { method: 'POST', token: hostToken });
  check('the first approval takes the seat', apA.json.status === 'confirmed', apA.json);
  check('approving into a full event waitlists and says so', apB.json.status === 'waitlisted' && apB.json.moved_to_waitlist === true, apB.json);
  const declineTarget = await api('/registrations', { method: 'POST', token: guest3Token, body: { event_slug: apSlug } });
  const declined = await api(`/registrations/${declineTarget.json.id}/decline`, { method: 'POST', token: hostToken });
  check('decline sets declined', declined.json.status === 'declined', declined.json);
  check('a declined registration holds no ticket', declined.json.ticket_code === null);

  console.log('\n== check-in ==');
  const code = apA.json.ticket_code;
  const ci1 = await api(`/tickets/${code}/check-in`, { method: 'POST', token: hostToken });
  const ci2 = await api(`/tickets/${code}/check-in`, { method: 'POST', token: hostToken });
  check('check-in sets checked_in', ci1.json.status === 'checked_in', ci1.json);
  check('a second check-in records one arrival, not two', ci2.json.already_checked_in === true && ci2.json.checked_in_at === ci1.json.checked_in_at, [ci1.json.checked_in_at, ci2.json.checked_in_at]);
  check('a checked-in registration keeps its ticket', ci2.json.ticket_code === code);

  console.log('\n== registration_closed ==');
  const closed = await api('/events/riverside-winter-time-trial');
  check('a closed event is readable at its own address', closed.status === 200 && closed.json.state === 'registration_closed');
  const closedTry = await api('/registrations', { method: 'POST', token: guestToken, body: { event_slug: 'riverside-winter-time-trial' } });
  check('a closed event refuses a registration as a client error', closedTry.status >= 400 && closedTry.status < 500, closedTry.status);
  check('the refusal names the closed state', /closed/i.test(closedTry.json.message), closedTry.json);
  check('closed reopens to published', (await api('/events/riverside-winter-time-trial', { method: 'PATCH', token: hostToken, body: { state: 'published' } })).json.state === 'published');
  check('published closes again', (await api('/events/riverside-winter-time-trial', { method: 'PATCH', token: hostToken, body: { state: 'registration_closed' } })).json.state === 'registration_closed');
  check('draft cannot reach registration_closed', (await api('/events/harbour-loop-recovery-jog', { method: 'PATCH', token: hostToken, body: { state: 'registration_closed' } })).status === 400);

  console.log('\n== state rules ==');
  check('a cancelled event cannot be republished', (await api('/events/autumn-book-swap', { method: 'PATCH', token: host2Token, body: { state: 'published' } })).status === 400);
  check('a published event cannot return to draft', (await api(`/events/${raceSlug}`, { method: 'PATCH', token: hostToken, body: { state: 'draft' } })).status === 400);
  const noReason = await api(`/events/${raceSlug}/cancel`, { method: 'POST', token: hostToken, body: { reason: '  ' } });
  check('cancelling needs a non-empty reason', noReason.status === 400 && noReason.json.field === 'reason', noReason.json);
  check('the event is still published after a refused cancel', (await api(`/events/${raceSlug}`)).json.state === 'published');

  console.log('\n== the root namespace ==');
  const reservedSlug = await api('/calendars', { method: 'POST', token: hostToken, body: { name: 'X', slug: 'login', category: 'running', city: 'Berlin', is_public: true } });
  check('a reserved path is refused as a calendar slug', reservedSlug.status === 409, reservedSlug.json);
  check('the refusal is the pinned address string', reservedSlug.json.message === 'That address is already taken.', reservedSlug.json);
  check('a category name is refused as a calendar slug', (await api('/calendars', { method: 'POST', token: hostToken, body: { name: 'X', slug: 'running', category: 'running', city: 'Berlin', is_public: true } })).status === 409);
  check('an existing event slug is refused as a calendar slug', (await api('/calendars', { method: 'POST', token: hostToken, body: { name: 'X', slug: 'thursday-night-5k', category: 'running', city: 'Berlin', is_public: true } })).status === 409);
  check('an existing handle is refused as a calendar slug', (await api('/calendars', { method: 'POST', token: hostToken, body: { name: 'X', slug: 'priya-raman', category: 'running', city: 'Berlin', is_public: true } })).status === 409);
  const handleTaken = await api('/accounts/me', { method: 'PATCH', token: guestToken, body: { handle: 'priya-raman' } });
  check('a taken handle is refused', handleTaken.status === 409, handleTaken.json);
  check('the refusal is the pinned handle string', handleTaken.json.message === 'That handle is already taken.', handleTaken.json);
  check('the account keeps the handle it had', (await api('/accounts/me', { token: guestToken })).json.handle === 'amina-osei');
  check('a reserved handle is refused', (await api('/accounts/me', { method: 'PATCH', token: guestToken, body: { handle: 'settings' } })).status === 409);
  check('a category handle is refused', (await api('/accounts/me', { method: 'PATCH', token: guestToken, body: { handle: 'climate' } })).status === 409);
  check('an event slug is refused as a handle', (await api('/accounts/me', { method: 'PATCH', token: guestToken, body: { handle: 'thursday-night-5k' } })).status === 409);
  const handleOk = await api('/accounts/me', { method: 'PATCH', token: newGuestToken, body: { handle: `wanda-${stamp}`, display_name: 'Wanda W' } });
  check('a free handle is accepted', handleOk.status === 200 && handleOk.json.handle === `wanda-${stamp}`, handleOk.json);
  await api('/accounts/me', { method: 'PATCH', token: newGuestToken, body: { id: 1, display_name: 'Not Priya' } });
  check('no account can name another one in the body', (await api('/accounts/me', { token: hostToken })).json.display_name === 'Priya Raman');
  const newCal = await api('/calendars', { method: 'POST', token: host2Token, body: { name: 'Lisbon Poetry', slug: `lisbon-poetry-${stamp}`, category: 'books', city: 'Lisbon', is_public: true } });
  check('a host creates a calendar of its own', newCal.status === 201, newCal.json);
  check('the calendar is owned by the account that created it', newCal.json.owner_account_id !== undefined);

  console.log('\n== authorization, server side ==');
  const guestCal = await api('/calendars', { method: 'POST', token: guestToken, body: { name: 'Sneak', slug: `sneak-${stamp}`, category: 'running', city: 'Berlin', is_public: true } });
  check('a guest is refused calendar creation', guestCal.status === 404, guestCal.status);
  check('the refused calendar was not written', (await api(`/resolve/sneak-${stamp}`)).status === 404);
  const guestGuestList = await api('/events/thursday-night-5k/registrations', { token: guestToken });
  check('a guest cannot read a guest list', guestGuestList.status === 404, guestGuestList.status);
  const anonGuestList = await api('/events/thursday-night-5k/registrations');
  check('an anonymous caller cannot read a guest list', anonGuestList.status === 401, anonGuestList.status);
  const otherHostList = await api('/events/thursday-night-5k/registrations', { token: host2Token });
  check('another host cannot read this guest list', otherHostList.status === 404, otherHostList.status);
  check('another host meets the same refusal on the CSV', (await api('/events/thursday-night-5k/registrations.csv', { token: host2Token })).status === otherHostList.status);
  check('a guest meets the same refusal on the CSV', (await api('/events/thursday-night-5k/registrations.csv', { token: guestToken })).status === guestGuestList.status);
  check('an anonymous caller meets the same refusal on the CSV', (await api('/events/thursday-night-5k/registrations.csv')).status === anonGuestList.status);
  check('a guest cannot approve', (await api(`/registrations/${ap2.json.id}/approve`, { method: 'POST', token: guestToken })).status === 404);
  check('a guest cannot decline', (await api(`/registrations/${ap2.json.id}/decline`, { method: 'POST', token: guestToken })).status === 404);
  check('a guest cannot check anybody in', (await api(`/tickets/${code}/check-in`, { method: 'POST', token: guestToken })).status === 404);
  check('another host cannot edit this event', (await api('/events/thursday-night-5k', { method: 'PATCH', token: host2Token, body: { capacity: 500 } })).status === 404);
  check('the protected state is unchanged', (await api('/events/thursday-night-5k')).json.capacity === 3);
  check('another host cannot cancel this event', (await api('/events/thursday-night-5k/cancel', { method: 'POST', token: host2Token, body: { reason: 'not mine' } })).status === 404);
  check('the event is still published', (await api('/events/thursday-night-5k')).json.state === 'published');
  check('a guest cannot create an event', (await api('/events', { method: 'POST', token: guestToken, body: { calendar_slug: 'riverside-run-club', title: 'x' } })).status === 404);
  check('a request without a token is denied', (await api('/registrations', { method: 'POST', body: { event_slug: 'thursday-night-5k' } })).status === 401);
  check('a forged token is denied', (await api('/accounts/me', { token: 'not.a.real.token' })).status === 401);
  check('a guest cannot cancel another guest registration', (await api(`/registrations/${ap1.json.id}/cancel`, { method: 'POST', token: guest2Token })).status === 404);
  check('an anonymous caller cannot list calendars', (await api('/calendars')).status === 401);

  console.log('\n== CSV export ==');
  const csv = await api('/events/thursday-night-5k/registrations.csv', { token: hostToken });
  const lines = csv.text.trim().split('\n');
  check('the CSV is served as text/csv', /text\/csv/.test(csv.headers.get('content-type') || ''), csv.headers.get('content-type'));
  check('the CSV names its file after the event slug', /thursday-night-5k\.csv/.test(csv.headers.get('content-disposition') || ''), csv.headers.get('content-disposition'));
  check('the header line is pinned', lines[0] === 'email,display_name,status,waitlist_position,ticket_code', lines[0]);
  const csvStatuses = lines.slice(1).map((l) => l.split(',')[2]);
  check('rows are ordered by status ascending', JSON.stringify(csvStatuses) === JSON.stringify([...csvStatuses].sort()), csvStatuses);
  const commaSignup = await api('/auth/signup', { method: 'POST', body: { email: `comma-${stamp}@example.com`, password: 'quoting-is-hard-2026', name: 'Bell, Marcus "Big M"' } });
  await api('/registrations', { method: 'POST', token: commaSignup.json.access_token, body: { event_slug: apSlug } });
  const csv2 = await api(`/events/${apSlug}/registrations.csv`, { token: hostToken });
  check('a comma and a quotation mark are escaped', csv2.text.includes('"Bell, Marcus ""Big M"""'), csv2.text.split('\n').find((l) => l.includes('Bell')));

  console.log('\n== validation and rate limits ==');
  const badEmail = await api('/auth/signup', { method: 'POST', body: { email: 'not-an-email', password: 'longenough123', name: 'X' } });
  check('a bad email is refused with the pinned sentence', badEmail.json.message === 'Enter a valid email address.', badEmail.json);
  check('the refusal names the offending field', badEmail.json.field === 'email');
  const noName = await api('/auth/signup', { method: 'POST', body: { email: `x-${stamp}@example.com`, password: 'longenough123' } });
  check('a missing name is refused with the pinned sentence', noName.json.message === 'Add your name so hosts know who is coming.', noName.json);
  check('a rejected signup wrote nothing', (await api('/auth/login', { method: 'POST', body: { email: `x-${stamp}@example.com`, password: 'longenough123' } })).status === 401);
  check('capacity above 500 is refused', (await api('/events', { method: 'POST', token: hostToken, body: { calendar_slug: 'riverside-run-club', title: 'X', category: 'running', city: 'Berlin', capacity: 900, starts_at: iso(9e8), ends_at: iso(9e8 + 3600000) } })).json.field === 'capacity');
  check('a local time without Z is refused', (await api('/events', { method: 'POST', token: hostToken, body: { calendar_slug: 'riverside-run-club', title: 'X', category: 'running', city: 'Berlin', capacity: 5, starts_at: '2030-01-01T10:00:00', ends_at: iso(9e8) } })).json.field === 'starts_at');
  check('ends_at before starts_at is refused', (await api('/events', { method: 'POST', token: hostToken, body: { calendar_slug: 'riverside-run-club', title: 'X', category: 'running', city: 'Berlin', capacity: 5, starts_at: '2030-01-01T12:00:00Z', ends_at: '2030-01-01T10:00:00Z' } })).json.field === 'ends_at');
  check('an unreal time zone is refused', (await api('/events', { method: 'POST', token: hostToken, body: { calendar_slug: 'riverside-run-club', title: 'X', category: 'running', city: 'Berlin', time_zone: 'Mars/Olympus', capacity: 5, starts_at: iso(9e8), ends_at: iso(9e8 + 3600000) } })).json.field === 'time_zone');
  const beforeDraftCount = (await api('/events')).json.length;
  const incomplete = await api('/events', { method: 'POST', token: hostToken, body: { calendar_slug: 'riverside-run-club', title: `Sketch ${stamp}`, description: 'Only a title.' } });
  check('a submission missing publishing fields is stored as draft', incomplete.json.state === 'draft', incomplete.json);
  check('a draft does not enter discovery', (await api('/events')).json.length === beforeDraftCount);

  let limited = null;
  for (let i = 0; i < 14; i++) {
    const r = await api('/auth/login', { method: 'POST', body: { email: `ratelimit-${stamp}@example.com`, password: 'whatever12345' } });
    if (r.status === 429) { limited = r; break; }
  }
  check('login is limited to 10 a minute', !!limited, limited?.status);
  check('the limit is rejected as a client error', limited && limited.status >= 400 && limited.status < 500);
  check('the rate limit is stated in the response body', limited && /10/.test(limited.json.message) && limited.json.rate_limit === 10, limited?.json);

  console.log('\n== editing a published event ==');
  const editSlug = `edit-me-${stamp}`;
  await api('/events', { method: 'POST', token: hostToken, body: { calendar_slug: 'riverside-run-club', slug: editSlug, title: `Edit Me ${stamp}`, category: 'running', city: 'Berlin', time_zone: 'Europe/Berlin', starts_at: iso(30 * 86400000), ends_at: iso(30 * 86400000 + 3600000), capacity: 10, description: 'Editable.' } });
  await api('/registrations', { method: 'POST', token: guest3Token, body: { event_slug: editSlug } });
  const edited = await api(`/events/${editSlug}`, { method: 'PATCH', token: hostToken, body: { title: `Edited ${stamp}`, city: 'Potsdam', starts_at: iso(31 * 86400000), ends_at: iso(31 * 86400000 + 3600000) } });
  check('a host edits a published event', edited.json.title === `Edited ${stamp}` && edited.json.city === 'Potsdam', edited.json);
  check('the stored instant changes only when asked', edited.json.starts_at.endsWith('Z'));

  console.log('\n== cancelling an event ==');
  const reason = 'The venue flooded and we cannot safely gather there.';
  const cancelEvent = await api(`/events/${apSlug}/cancel`, { method: 'POST', token: hostToken, body: { reason } });
  check('cancel returns the cancelled event', cancelEvent.json.state === 'cancelled', cancelEvent.json);
  check('cancel carries the reason word for word', cancelEvent.json.cancel_reason === reason, cancelEvent.json);
  check('a cancelled event leaves discovery', !(await api('/events')).json.map((e) => e.slug).includes(apSlug));
  check('a cancelled event keeps its address', (await api(`/events/${apSlug}`)).status === 200);
  const regOnCancelled = await api('/registrations', { method: 'POST', token: guest3Token, body: { event_slug: apSlug } });
  check('a cancelled event takes no registration', regOnCancelled.status >= 400 && regOnCancelled.status < 500, regOnCancelled.status);

  console.log('\n== mail over real SMTP ==');
  await new Promise((r) => setTimeout(r, 900));
  const box = await mailpit('/api/v1/messages?limit=300');
  if (!box) {
    console.log('  (mailpit HTTP API not reachable from here; skipping mail assertions)');
  } else {
    const msgs = box.messages || [];
    const subjects = msgs.map((m) => m.Subject);
    check('a confirmation carries its pinned subject', subjects.includes("You're going to Thursday Night 5K"), subjects.slice(0, 10));
    check('a waiting-list place carries its pinned subject', subjects.some((s) => s.startsWith("You're on the waiting list for")), subjects.slice(0, 10));
    check('a promotion carries its pinned subject', subjects.some((s) => s.startsWith('A spot opened up for')), subjects.slice(0, 10));
    check('an approval carries its pinned subject', subjects.some((s) => s.startsWith("You're in: ")), subjects.slice(0, 10));
    check('a decline carries its pinned subject', subjects.some((s) => s.startsWith('About your request to join')), subjects.slice(0, 10));
    check('a pending request carries its pinned subject', subjects.some((s) => s.startsWith('Your request to join')), subjects.slice(0, 10));
    check('a cancellation carries its pinned subject', subjects.includes(`Approval Night ${stamp} has been cancelled`), subjects.slice(0, 10));

    const one = msgs.find((m) => m.Subject === "You're going to Thursday Night 5K");
    check('mail goes to that guest alone', one && one.To.length === 1, one?.To);
    check('no cc', one && (!one.Cc || one.Cc.length === 0), one?.Cc);
    check('no bcc', one && (!one.Bcc || one.Bcc.length === 0), one?.Bcc);
    const full = await mailpit(`/api/v1/message/${one.ID}`);
    check('the body names the event', full && full.Text.includes('Thursday Night 5K'), full?.Text?.slice(0, 160));
    check('the body carries a ticket code', full && /TKT-[A-Z0-9]{8}/.test(full.Text), full?.Text?.slice(0, 300));

    const cancelMail = msgs.find((m) => m.Subject === `Approval Night ${stamp} has been cancelled`);
    const cancelFull = cancelMail ? await mailpit(`/api/v1/message/${cancelMail.ID}`) : null;
    check("the cancellation carries the host's own words unedited", cancelFull && cancelFull.Text.includes(reason), cancelFull?.Text?.slice(0, 400));

    const selfCancelTarget = await api('/registrations', { method: 'POST', token: guest2Token, body: { event_slug: 'winter-reading-night' } });
    await new Promise((r) => setTimeout(r, 700));
    const mid = (await mailpit('/api/v1/messages?limit=400')).messages;
    await api(`/registrations/${selfCancelTarget.json.id}/cancel`, { method: 'POST', token: guest2Token });
    await new Promise((r) => setTimeout(r, 900));
    const after = (await mailpit('/api/v1/messages?limit=400')).messages;
    check('a guest cancelling their own registration sends no mail', after.length === mid.length, { mid: mid.length, after: after.length });
  }

  console.log('\n== registrations/me ==');
  const mine = await api('/registrations/me', { token: guestToken });
  check('a guest reads their own registrations', Array.isArray(mine.json) && mine.json.length > 0, mine.json?.length);
  check('each row carries its event', mine.json.every((r) => !!r.event_slug && !!r.title));

  console.log('\n== the theme in the first document ==');
  const shell = await fetch(`${BASE}/thursday-night-5k`).then((r) => r.text());
  const themedTag = /<html[^>]*data-event-theme="on"[^>]*>/.exec(shell)?.[0] ?? '';
  check('the document element already wears the theme', !!themedTag, shell.slice(0, 200));
  check('the key colour is in the first document painted', themedTag.includes('--event-key:#146aeb'), themedTag);
  check('the derived ground is in the first document', /--event-ground:#[0-9a-f]{6}/.test(themedTag), themedTag);
  check('the derived ink is in the first document', /--event-ink:#[0-9a-f]{6}/.test(themedTag), themedTag);
  const plain = await fetch(`${BASE}/discover`).then((r) => r.text());
  check('a non-event route carries no event theme', !/<html[^>]*data-event-theme/.test(plain));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) {
    console.log('failures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

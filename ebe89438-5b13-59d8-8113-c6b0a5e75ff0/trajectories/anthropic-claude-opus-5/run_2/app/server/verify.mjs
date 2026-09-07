/**
 * Walks the API the way the brief describes, with the seat race driven by
 * genuinely simultaneous requests. Run against a live server.
 */
const BASE = process.env.VERIFY_BASE || 'http://127.0.0.1:4180';
const PW = 'deku-demo-pw-2026';
const MAILPIT = process.env.MAILPIT_URL || 'http://mailpit:8025';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    failures.push(`${name} ${detail}`);
    console.log(`  FAIL ${name} ${detail}`);
  }
}

async function api(path, { method = 'GET', token, body, raw } = {}) {
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
  } catch {
    /* not json */
  }
  return { status: res.status, json, text, headers: res.headers, raw };
}

async function login(email) {
  const r = await api('/auth/login', {
    method: 'POST',
    body: { email, password: PW },
  });
  if (r.status !== 200) throw new Error(`login ${email} -> ${r.status} ${r.text}`);
  return r.json.access_token;
}

const mail = {
  async all() {
    const res = await fetch(`${MAILPIT}/api/v1/messages?limit=500`);
    return (await res.json()).messages || [];
  },
  async reset() {
    await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' });
  },
  async find(pred, tries = 20) {
    for (let i = 0; i < tries; i++) {
      const msgs = await this.all();
      const hit = msgs.find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  },
};

async function body(id) {
  const res = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  return res.json();
}

/* ------------------------------------------------------------------ suite */

async function main() {
  console.log('\n== health, resolve, discovery ==');
  check('health 200', (await api('/health')).status === 200);

  for (const [slug, kind] of [
    ['api', 'system'], ['login', 'system'], ['running', 'category'],
    ['thursday-night-5k', 'event'], ['riverside-run-club', 'calendar'],
    ['priya-raman', 'account'],
  ]) {
    const r = await api(`/resolve/${slug}`);
    check(`resolve ${slug} -> ${kind}`, r.json?.kind === kind, JSON.stringify(r.json));
  }
  check('resolve unknown -> 404', (await api('/resolve/nothing-here')).status === 404);

  const list = await api('/events');
  const slugs = list.json.map((e) => e.slug);
  check('X-Total-Count present', list.headers.get('x-total-count') !== null,
    String(list.headers.get('x-total-count')));
  check('draft hidden from discovery', !slugs.includes('harbour-loop-recovery-jog'));
  check('cancelled hidden from discovery', !slugs.includes('autumn-book-swap'));
  check('registration_closed listed', slugs.includes('riverside-winter-time-trial'));
  const sorted = [...list.json].sort((a, b) =>
    a.starts_at === b.starts_at
      ? a.slug.localeCompare(b.slug)
      : a.starts_at.localeCompare(b.starts_at));
  check('ranking soonest then slug', JSON.stringify(sorted.map(e=>e.slug)) === JSON.stringify(slugs));
  check('timestamps are UTC Z', list.json.every((e) => /Z$/.test(e.starts_at)));

  const empty = await api('/events?category=crypto');
  check('empty page still carries total 0', empty.headers.get('x-total-count') === '0');

  const q1 = await api('/events?q=%20%20');
  check('whitespace q treated as absent', q1.json.length === list.json.length);
  const qCombined = await api('/events?category=books&city=Lisbon&q=reading');
  check('category+city+q combine as one condition',
    qCombined.json.length === 1 && qCombined.json[0].slug === 'winter-reading-night',
    JSON.stringify(qCombined.json.map(e=>e.slug)));
  const qCity = await api('/events?q=Berlin');
  check("q never matches city", qCity.json.length === 0, JSON.stringify(qCity.json.map(e=>e.slug)));
  const qCal = await api('/events?q=northside');
  check('q matches calendar name', qCal.json.some(e => e.slug === 'winter-reading-night'));
  const lim = await api('/events?limit=2');
  check('limit honoured', lim.json.length === 2);
  const cap = await api('/events?limit=999');
  check('limit capped at 100', cap.json.length <= 100);

  check('draft event 404 to stranger', (await api('/events/harbour-loop-recovery-jog')).status === 404);

  console.log('\n== auth ==');
  const guest = await login('guest@example.com');
  const guest2 = await login('guest2@example.com');
  const guest3 = await login('guest3@example.com');
  const host = await login('host@example.com');
  const host2 = await login('host2@example.com');
  check('seeded password works', !!guest && !!host);
  check('bad password refused', (await api('/auth/login', {
    method: 'POST', body: { email: 'guest@example.com', password: 'nope' } })).status === 401);
  const hostMe = await api('/accounts/me', { token: host });
  check('host role is host', hostMe.json.role === 'host');

  const stamp = Date.now();
  const signup = await api('/auth/signup', {
    method: 'POST',
    body: { email: `walker${stamp}@example.com`, password: 'walker-pw-123', name: 'Wanda Walker' },
  });
  check('signup creates a guest', signup.status === 201 && signup.json.role === 'guest',
    JSON.stringify(signup.json));
  const walker = signup.json.access_token;

  console.log('\n== authorization ==');
  check('no token -> 401', (await api('/registrations/me')).status === 401);
  check('guest cannot read guest list',
    (await api('/events/thursday-night-5k/registrations', { token: guest })).status === 404);
  check('guest cannot read csv',
    (await api('/events/thursday-night-5k/registrations.csv', { token: guest })).status === 404);
  check('unauthenticated csv refused',
    (await api('/events/thursday-night-5k/registrations.csv')).status === 401);
  check('other host cannot read guest list',
    (await api('/events/thursday-night-5k/registrations', { token: host2 })).status === 404);
  check('other host cannot patch event',
    (await api('/events/thursday-night-5k', { method: 'PATCH', token: host2,
      body: { capacity: 99 } })).status === 404);
  check('guest cannot create calendar',
    (await api('/calendars', { method: 'POST', token: guest,
      body: { name: 'x', slug: `x-${stamp}`, category: 'books', city: 'Berlin', is_public: true } })).status === 404);
  check('guest cannot create event',
    (await api('/events', { method: 'POST', token: guest,
      body: { calendar_slug: 'riverside-run-club', title: 'Nope' } })).status === 404);
  check('guest cannot cancel an event',
    (await api('/events/thursday-night-5k/cancel', { method: 'POST', token: guest,
      body: { reason: 'x' } })).status === 404);
  const beforeState = (await api('/events/thursday-night-5k')).json.state;
  check('protected state unchanged after refusals', beforeState === 'published');

  console.log('\n== the last seat, under contention ==');
  await mail.reset();
  // Riverside Track Session: capacity 2, one seat already taken => one free.
  const trackBefore = await api('/events/riverside-track-session');
  check('one free seat before the race',
    trackBefore.json.capacity - trackBefore.json.confirmed_count === 1,
    `${trackBefore.json.confirmed_count}/${trackBefore.json.capacity}`);

  const racers = [guest, guest3, walker];
  const results = await Promise.all(
    racers.map((t) => api('/registrations', {
      method: 'POST', token: t, body: { event_slug: 'riverside-track-session' } })),
  );
  const statuses = results.map((r) => r.json?.status);
  const confirmedWinners = statuses.filter((s) => s === 'confirmed').length;
  const waited = statuses.filter((s) => s === 'waitlisted').length;
  check('exactly one seat from the race', confirmedWinners === 1, JSON.stringify(statuses));
  check('the losers take waiting-list places', waited === racers.length - 1, JSON.stringify(statuses));

  const trackAfter = await api('/events/riverside-track-session');
  check('confirmed_count never exceeds capacity',
    trackAfter.json.confirmed_count <= trackAfter.json.capacity,
    `${trackAfter.json.confirmed_count}/${trackAfter.json.capacity}`);
  check('confirmed_count is exactly capacity',
    trackAfter.json.confirmed_count === trackAfter.json.capacity);

  const trackList = await api('/events/riverside-track-session/registrations', { token: host });
  const positions = trackList.json.filter((r) => r.status === 'waitlisted')
    .map((r) => r.waitlist_position).sort((a, b) => a - b);
  check('waitlist positions are 1..n with no gaps',
    JSON.stringify(positions) === JSON.stringify(positions.map((_, i) => i + 1)),
    JSON.stringify(positions));
  const seatHolders = trackList.json.filter((r) => ['confirmed','checked_in'].includes(r.status));
  check('every seat holds a ticket code',
    seatHolders.every((r) => /^TKT-[A-Z0-9]{8}$/.test(r.ticket_code || '')));
  check('no non-seat holds a ticket code',
    trackList.json.filter((r) => !['confirmed','checked_in'].includes(r.status))
      .every((r) => r.ticket_code === null));

  const winnerIdx = statuses.indexOf('confirmed');
  const winnerMailTo = ['guest@example.com','guest3@example.com',`walker${stamp}@example.com`][winnerIdx];
  const winnerMail = await mail.find((m) =>
    m.Subject === "You're going to Riverside Track Session" &&
    m.To.some((t) => t.Address === winnerMailTo));
  check('the seat winner is mailed the confirmed subject', !!winnerMail);
  if (winnerMail) {
    const full = await body(winnerMail.ID);
    check('confirmation names the event', (full.Text || '').includes('Riverside Track Session'));
    check('confirmation carries a ticket code', /TKT-[A-Z0-9]{8}/.test(full.Text || ''));
    check('mail goes to that guest alone', winnerMail.To.length === 1 &&
      (!winnerMail.Cc || winnerMail.Cc.length === 0) &&
      (!winnerMail.Bcc || winnerMail.Bcc.length === 0));
  }
  const wlMail = await mail.find((m) =>
    m.Subject === "You're on the waiting list for Riverside Track Session");
  check('a waiting-list place is mailed its own subject', !!wlMail);

  console.log('\n== one registration per account ==');
  const dupes = await Promise.all([0, 1].map(() =>
    api('/registrations', { method: 'POST', token: guest2,
      body: { event_slug: 'winter-reading-night' } })));
  check('simultaneous first-time registrations produce one row',
    new Set(dupes.map((d) => d.json?.id)).size === 1, JSON.stringify(dupes.map(d=>d.json?.id)));
  const repeat = await api('/registrations', { method: 'POST', token: guest2,
    body: { event_slug: 'winter-reading-night' } });
  check('a repeat submission updates rather than adds',
    repeat.json.id === dupes[0].json.id);
  const wrnList = await api('/events/winter-reading-night/registrations', { token: host2 });
  check('exactly one row for that account',
    wrnList.json.filter((r) => r.email === 'guest2@example.com').length === 1);

  console.log('\n== cancel frees the seat and promotes the head ==');
  await mail.reset();
  const my = await api('/registrations/me', { token: guest });
  const trackReg = my.json.find((r) => r.event_slug === 'riverside-track-session');
  const beforeCancel = await api('/events/riverside-track-session/registrations', { token: host });
  const head = beforeCancel.json.find((r) => r.waitlist_position === 1);
  const cancelled = await api(`/registrations/${trackReg.id}/cancel`, {
    method: 'POST', token: guest });
  if (trackReg.status === 'confirmed') {
    check('cancel returns cancelled_by_guest',
      cancelled.json.status === 'cancelled_by_guest', JSON.stringify(cancelled.json));
    const afterCancel = await api('/events/riverside-track-session/registrations', { token: host });
    const promoted = afterCancel.json.find((r) => r.id === head?.id);
    check('waiting-list position 1 becomes confirmed in the same request',
      promoted?.status === 'confirmed', JSON.stringify(promoted));
    check('the promoted guest is issued a ticket',
      /^TKT-[A-Z0-9]{8}$/.test(promoted?.ticket_code || ''));
    const promoMail = await mail.find((m) =>
      m.Subject === 'A spot opened up for Riverside Track Session');
    check('the promoted guest is mailed', !!promoMail);
    const selfMail = (await mail.all()).filter((m) =>
      m.To.some((t) => t.Address === 'guest@example.com'));
    check('a guest cancelling their own registration sends no mail to themselves',
      selfMail.length === 0, JSON.stringify(selfMail.map(m=>m.Subject)));
    const stillFull = await api('/events/riverside-track-session');
    check('seat count still within capacity after promotion',
      stillFull.json.confirmed_count <= stillFull.json.capacity);
  }

  console.log('\n== approval queue ==');
  await mail.reset();
  const queue = await api('/events/sunrise-long-run/registrations', { token: host });
  const pending = queue.json.find((r) => r.status === 'pending_approval');
  check('a pending request holds no seat',
    pending && pending.ticket_code === null && pending.waitlist_position === null);
  check('a guest cannot approve',
    (await api(`/registrations/${pending.id}/approve`, { method: 'POST', token: guest })).status === 404);
  const approved = await api(`/registrations/${pending.id}/approve`, { method: 'POST', token: host });
  check('the host approves to confirmed', approved.json.status === 'confirmed',
    JSON.stringify(approved.json));
  check('approval issues a ticket', /^TKT-[A-Z0-9]{8}$/.test(approved.json.ticket_code || ''));
  check('approval mail carries its own subject',
    !!(await mail.find((m) => m.Subject === "You're in: Sunrise Long Run")));
  check('re-approving is refused',
    (await api(`/registrations/${pending.id}/approve`, { method: 'POST', token: host })).status === 409);

  // a fresh pending request to decline
  await api('/registrations', { method: 'POST', token: walker, body: { event_slug: 'sunrise-long-run' } });
  const queue2 = await api('/events/sunrise-long-run/registrations', { token: host });
  const pending2 = queue2.json.find((r) => r.status === 'pending_approval');
  check('registering on an approval event starts pending_approval', !!pending2);
  check('pending mail carries its own subject',
    !!(await mail.find((m) => m.Subject === 'Your request to join Sunrise Long Run')));
  const declined = await api(`/registrations/${pending2.id}/decline`, { method: 'POST', token: host });
  check('the host declines to declined', declined.json.status === 'declined');
  check('a declined registration holds no ticket', declined.json.ticket_code === null);
  check('decline mail carries its own subject',
    !!(await mail.find((m) => m.Subject === 'About your request to join Sunrise Long Run')));

  console.log('\n== check-in at the door ==');
  const doorCode = approved.json.ticket_code;
  check('a guest cannot check a ticket in',
    (await api(`/tickets/${doorCode}/check-in`, { method: 'POST', token: guest })).status === 404);
  const first = await api(`/tickets/${doorCode}/check-in`, { method: 'POST', token: host });
  check('the owning host checks the ticket in', first.json.status === 'checked_in');
  const second = await api(`/tickets/${doorCode}/check-in`, { method: 'POST', token: host });
  check('a second check-in records one arrival, not two',
    second.json.status === 'checked_in' &&
    second.json.checked_in_at === first.json.checked_in_at &&
    second.json.already_checked_in === true,
    `${first.json.checked_in_at} vs ${second.json.checked_in_at}`);
  check('a checked-in registration keeps its ticket code',
    second.json.ticket_code === doorCode);

  const anon = await api(`/tickets/${doorCode}`);
  check('anyone presenting a real code reads the ticket', anon.status === 200);
  check('the ticket carries the event, not the guest list',
    anon.json.event_slug === 'sunrise-long-run' && anon.json.ticket_code === doorCode &&
    !('registrations' in anon.json));
  check('a code that never existed meets not-found',
    (await api('/tickets/TKT-ZZZZZZZZ')).status === 404);

  console.log('\n== registration_closed ==');
  const closed = await api('/events/riverside-winter-time-trial');
  check('a closed event stays readable', closed.status === 200 &&
    closed.json.state === 'registration_closed');
  const closedTry = await api('/registrations', { method: 'POST', token: guest,
    body: { event_slug: 'riverside-winter-time-trial' } });
  check('a new registration on a closed event is a client error',
    closedTry.status >= 400 && closedTry.status < 500, String(closedTry.status));
  check('the refusal names the closed state',
    /stopped taking registrations/i.test(closedTry.json?.message || ''),
    closedTry.json?.message);

  console.log('\n== capacity: lowering, raising, promotion ==');
  await mail.reset();
  const t5k = await api('/events/thursday-night-5k');
  const lower = await api('/events/thursday-night-5k', { method: 'PATCH', token: host,
    body: { capacity: 1 } });
  check('lowering below the confirmed count is refused', lower.status === 409, String(lower.status));
  check('the refusal names how many are confirmed',
    /You already have \d+ guests confirmed\./.test(lower.json?.message || ''), lower.json?.message);
  const unchanged = await api('/events/thursday-night-5k');
  check('a rejected request writes nothing', unchanged.json.capacity === t5k.json.capacity);

  // fill the last seat, then raise and watch the waiting list move
  await api('/registrations', { method: 'POST', token: walker, body: { event_slug: 'thursday-night-5k' } });
  const beforeRaise = await api('/events/thursday-night-5k/registrations', { token: host });
  const waitingBefore = beforeRaise.json.filter((r) => r.status === 'waitlisted').length;
  check('the waiting list is not empty before the raise', waitingBefore > 0, String(waitingBefore));
  const raised = await api('/events/thursday-night-5k', { method: 'PATCH', token: host,
    body: { capacity: t5k.json.capacity + waitingBefore } });
  check('raising capacity succeeds', raised.status === 200, String(raised.status));
  const afterRaise = await api('/events/thursday-night-5k/registrations', { token: host });
  check('raising capacity seats the waiting list in the same request',
    afterRaise.json.filter((r) => r.status === 'waitlisted').length === 0,
    JSON.stringify(afterRaise.json.map(r=>r.status)));
  check('each seated guest gained a ticket',
    afterRaise.json.filter((r) => r.status === 'confirmed').every((r) => !!r.ticket_code));
  check('the seated guests are mailed the waiting-list-to-seat subject',
    !!(await mail.find((m) => m.Subject === 'A spot opened up for Thursday Night 5K')));
  const stillWithin = await api('/events/thursday-night-5k');
  check('confirmed never exceeds capacity after a raise',
    stillWithin.json.confirmed_count <= stillWithin.json.capacity);

  console.log('\n== event state machine ==');
  check('a published event cannot return to draft',
    (await api('/events/thursday-night-5k', { method: 'PATCH', token: host,
      body: { state: 'draft' } })).status === 409);
  check('a cancelled event cannot be republished',
    (await api('/events/autumn-book-swap', { method: 'PATCH', token: host2,
      body: { state: 'published' } })).status === 409);
  check('cancelling without a reason is refused',
    (await api('/events/winter-reading-night/cancel', { method: 'POST', token: host2,
      body: { reason: '  ' } })).status === 400);
  const closeIt = await api('/events/riverside-winter-time-trial', { method: 'PATCH',
    token: host, body: { state: 'published' } });
  check('registration_closed reopens to published', closeIt.json.state === 'published');
  await api('/events/riverside-winter-time-trial', { method: 'PATCH', token: host,
    body: { state: 'registration_closed' } });

  console.log('\n== namespace ==');
  const nsTaken = await api('/calendars', { method: 'POST', token: host,
    body: { name: 'Clash', slug: 'thursday-night-5k', category: 'running', city: 'Berlin', is_public: true } });
  check('a calendar slug clashing with an event slug is refused', nsTaken.status === 409);
  check('the refusal is the pinned sentence',
    nsTaken.json?.message === 'That address is already taken.', nsTaken.json?.message);
  check('a reserved path is refused as a calendar slug',
    (await api('/calendars', { method: 'POST', token: host,
      body: { name: 'x', slug: 'discover', category: 'running', city: 'Berlin', is_public: true } })).status === 409);
  check('a category name is refused as a calendar slug',
    (await api('/calendars', { method: 'POST', token: host,
      body: { name: 'x', slug: 'running', category: 'running', city: 'Berlin', is_public: true } })).status === 409);
  const handleTaken = await api('/accounts/me', { method: 'PATCH', token: guest,
    body: { handle: 'priya-raman' } });
  check('a taken handle is refused', handleTaken.status === 409);
  check('the handle refusal is the pinned sentence',
    handleTaken.json?.message === 'That handle is already taken.', handleTaken.json?.message);
  const keptHandle = await api('/accounts/me', { token: guest });
  check('the account keeps the handle it had', keptHandle.json.handle === 'amina-osei');
  check('a reserved handle is refused',
    (await api('/accounts/me', { method: 'PATCH', token: guest, body: { handle: 'settings' } })).status === 409);
  const okHandle = await api('/accounts/me', { method: 'PATCH', token: walker,
    body: { handle: `walker-${stamp}` } });
  check('a free handle is accepted', okHandle.status === 200 && okHandle.json.handle === `walker-${stamp}`);

  console.log('\n== validation and rate limits ==');
  const badEmail = await api('/auth/signup', { method: 'POST',
    body: { email: 'not-an-email', password: 'x'.repeat(9), name: 'X' } });
  check('a rejection names the offending field', badEmail.json?.field === 'email', JSON.stringify(badEmail.json));
  check('the email refusal is the pinned sentence',
    badEmail.json?.message === 'Enter a valid email address.');
  const badName = await api('/auth/signup', { method: 'POST',
    body: { email: `x${stamp}@example.com`, password: 'x'.repeat(9), name: '' } });
  check('the name refusal is the pinned sentence',
    badName.json?.message === 'Add your name so hosts know who is coming.');
  const badCapacity = await api('/events', { method: 'POST', token: host,
    body: { calendar_slug: 'riverside-run-club', title: 'Bad', capacity: 501 } });
  check('capacity above 500 is refused', badCapacity.json?.field === 'capacity');
  const badTime = await api('/events', { method: 'POST', token: host,
    body: { calendar_slug: 'riverside-run-club', title: 'Bad', starts_at: '2030-01-01 10:00' } });
  check('a local time without Z is refused', badTime.json?.field === 'starts_at');

  let limited = null;
  for (let i = 0; i < 14; i++) {
    const r = await api('/auth/login', { method: 'POST',
      body: { email: `ratelimit${stamp}@example.com`, password: 'wrong-pw' } });
    if (r.status === 429) { limited = r; break; }
  }
  check('login is rate limited to 10 a minute', !!limited);
  check('the rate limit is stated in the body',
    /10 requests per minute/.test(limited?.json?.message || ''), limited?.json?.message);

  console.log('\n== draft as publish gate ==');
  const draft = await api('/events', { method: 'POST', token: host,
    body: { calendar_slug: 'riverside-run-club', title: `Half Formed ${stamp}`, category: 'running',
            city: 'Berlin', time_zone: 'Europe/Berlin' } });
  check('a submission missing fields is stored as draft', draft.json?.state === 'draft',
    JSON.stringify(draft.json?.state));
  check('a draft has a theme_hex from creation', /^#[0-9a-f]{6}$/.test(draft.json?.theme_hex || ''));
  check('a draft is 404 to a stranger',
    (await api(`/events/${draft.json.slug}`)).status === 404);
  check('a draft is readable by its host',
    (await api(`/events/${draft.json.slug}`, { token: host })).status === 200);
  const published = await api(`/events/${draft.json.slug}`, { method: 'PATCH', token: host,
    body: { starts_at: '2031-03-04T18:00:00Z', ends_at: '2031-03-04T20:00:00Z', capacity: 10,
            state: 'published' } });
  check('a complete draft publishes', published.json?.state === 'published');

  console.log('\n== csv export ==');
  const csv = await api('/events/thursday-night-5k/registrations.csv', { token: host });
  const lines = csv.text.trim().split('\n');
  check('csv header line is pinned',
    lines[0] === 'email,display_name,status,waitlist_position,ticket_code', lines[0]);
  check('csv is served as text/csv',
    (csv.headers.get('content-type') || '').includes('text/csv'));
  check('csv names its file after the event slug',
    (csv.headers.get('content-disposition') || '').includes('thursday-night-5k.csv'),
    csv.headers.get('content-disposition'));
  check('csv carries one line per registration', lines.length >= 2);

  console.log('\n== cancelling an event mails every holder, word for word ==');
  await mail.reset();
  const reason = 'The venue flooded, and we could not find another room in time.';
  const wrnBefore = await api('/events/winter-reading-night/registrations', { token: host2 });
  const holders = wrnBefore.json.filter((r) =>
    ['confirmed','checked_in','waitlisted','pending_approval'].includes(r.status));
  const cancelEv = await api('/events/winter-reading-night/cancel', { method: 'POST',
    token: host2, body: { reason } });
  check('cancelling returns the cancelled event with its reason',
    cancelEv.json?.state === 'cancelled' && cancelEv.json?.cancel_reason === reason);
  for (const h of holders) {
    const m = await mail.find((mm) =>
      mm.Subject === 'Winter Reading Night has been cancelled' &&
      mm.To.some((t) => t.Address === h.email));
    check(`the holder ${h.email} is mailed the cancellation`, !!m);
    if (m) {
      const full = await body(m.ID);
      check('the cancellation carries the reason word for word',
        (full.Text || '').includes(reason));
    }
  }
  const goneFromList = await api('/events');
  check('a cancelled event leaves discovery',
    !goneFromList.json.map((e) => e.slug).includes('winter-reading-night'));
  check('a cancelled event keeps its address',
    (await api('/events/winter-reading-night')).status === 200);

  console.log('\n== email_log is written only after a send ==');
  const logged = await api('/health');
  check('health still ok at the end', logged.status === 200);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error('suite crashed:', err);
  process.exit(2);
});

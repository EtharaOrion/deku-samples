// End-to-end API check against a running server. Not shipped in the image.
const BASE = process.env.TEST_BASE ?? 'http://localhost:4180';
const MAILPIT = process.env.MAILPIT_API ?? 'http://mailpit:8025';
const PW = 'deku-demo-pw-2026';
let pass = 0;
let fail = 0;

function ok(cond, label, extra = '') {
  if (cond) {
    pass++;
    console.log(`  ok  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label} ${extra}`);
  }
}

async function req(method, path, { token, body, raw } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers, text };
}

async function login(email) {
  const r = await req('POST', '/api/auth/login', { body: { email, password: PW } });
  if (r.status !== 200) throw new Error(`login ${email} failed: ${r.text}`);
  return r.data.access_token;
}

async function mailFor(recipient) {
  const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:' + recipient)}&limit=50`);
  const j = await r.json();
  return j.messages ?? [];
}

const run = async () => {
  console.log('# health & resolve');
  ok((await req('GET', '/api/health')).status === 200, 'health 200');
  const res1 = await req('GET', '/api/resolve/thursday-night-5k');
  ok(res1.data.kind === 'event', 'resolve event');
  ok((await req('GET', '/api/resolve/running')).data.kind === 'category', 'resolve category');
  ok((await req('GET', '/api/resolve/login')).data.kind === 'system', 'resolve system');
  ok((await req('GET', '/api/resolve/riverside-run-club')).data.kind === 'calendar', 'resolve calendar');
  ok((await req('GET', '/api/resolve/priya-raman')).data.kind === 'account', 'resolve account');
  ok((await req('GET', '/api/resolve/nope-nothing')).status === 404, 'resolve unknown 404');

  console.log('# discovery');
  const list = await req('GET', '/api/events');
  ok(Array.isArray(list.data), 'events is array');
  ok(list.headers.get('x-total-count') !== null, 'X-Total-Count present');
  const slugs = list.data.map((e) => e.slug);
  ok(!slugs.includes('harbour-loop-recovery-jog'), 'draft hidden');
  ok(!slugs.includes('autumn-book-swap'), 'cancelled hidden');
  ok(slugs.includes('riverside-winter-time-trial'), 'registration_closed listed');
  const sorted = [...list.data].sort((a, b) => (a.starts_at === b.starts_at ? a.slug.localeCompare(b.slug) : a.starts_at.localeCompare(b.starts_at)));
  ok(JSON.stringify(sorted.map((e) => e.slug)) === JSON.stringify(slugs), 'ordering soonest then slug');
  const filtered = await req('GET', '/api/events?category=books&city=Lisbon&q=reading');
  ok(filtered.data.length === 1 && filtered.data[0].slug === 'winter-reading-night', 'combined filters narrow');
  const qcity = await req('GET', '/api/events?q=Berlin');
  ok(qcity.data.length === 0, 'q does not match city');
  const ws = await req('GET', '/api/events?q=%20%20');
  ok(ws.data.length === list.data.length, 'whitespace q treated as absent');
  const empty = await req('GET', '/api/events?category=crypto');
  ok(empty.data.length === 0 && empty.headers.get('x-total-count') === '0', 'empty page carries total 0');
  const page = await req('GET', '/api/events?limit=2&offset=0');
  ok(page.data.length === 2, 'limit works');
  const qcal = await req('GET', '/api/events?q=riverside%20run');
  ok(qcal.data.length >= 3, 'q matches calendar name');
  const draft = await req('GET', '/api/events/harbour-loop-recovery-jog');
  ok(draft.status === 404, 'draft 404 to stranger');

  console.log('# auth');
  const gToken = await login('guest@example.com');
  const g2 = await login('guest2@example.com');
  const g3 = await login('guest3@example.com');
  const hToken = await login('host@example.com');
  const h2 = await login('host2@example.com');
  ok(!!gToken && !!hToken, 'logins work');
  const bad = await req('POST', '/api/auth/login', { body: { email: 'guest@example.com', password: 'wrong' } });
  ok(bad.status === 401, 'bad password 401');
  const draftHost = await req('GET', '/api/events/harbour-loop-recovery-jog', { token: hToken });
  ok(draftHost.status === 200, 'draft visible to owner');
  const draftOther = await req('GET', '/api/events/harbour-loop-recovery-jog', { token: h2 });
  ok(draftOther.status === 404, 'draft 404 to other host');

  const email = `stranger-${Date.now()}@example.com`;
  const signup = await req('POST', '/api/auth/signup', { body: { email, password: 'a-good-password', name: 'Sam Stranger' } });
  ok(signup.status === 201 && signup.data.role === 'guest', 'signup creates guest');
  const sToken = signup.data.access_token ?? (await login(email));

  console.log('# authorization');
  ok((await req('GET', '/api/events/thursday-night-5k/registrations')).status === 401, 'guest list needs auth');
  ok((await req('GET', '/api/events/thursday-night-5k/registrations', { token: gToken })).status === 404, 'guest cannot read guest list');
  ok((await req('GET', '/api/events/thursday-night-5k/registrations', { token: h2 })).status === 404, 'other host cannot read guest list');
  ok((await req('GET', '/api/events/thursday-night-5k/registrations', { token: hToken })).status === 200, 'owner reads guest list');
  ok((await req('GET', '/api/events/thursday-night-5k/registrations.csv', { token: gToken })).status === 404, 'guest cannot csv');
  ok((await req('POST', '/api/calendars', { token: gToken, body: { name: 'X', slug: 'x-cal', category: 'books', city: 'Y' } })).status === 404, 'guest cannot create calendar');
  ok((await req('POST', '/api/events/thursday-night-5k/cancel', { token: h2, body: { reason: 'nope' } })).status === 404, 'other host cannot cancel');
  const stillPub = await req('GET', '/api/events/thursday-night-5k');
  ok(stillPub.data.state === 'published', 'protected state unchanged');

  console.log('# last seat under contention');
  // riverside-track-session: capacity 2, guest2 confirmed -> exactly one free seat
  const [a, b] = await Promise.all([
    req('POST', '/api/registrations', { token: gToken, body: { event_slug: 'riverside-track-session' } }),
    req('POST', '/api/registrations', { token: g3, body: { event_slug: 'riverside-track-session' } }),
  ]);
  const statuses = [a.data.status, b.data.status].sort();
  ok(JSON.stringify(statuses) === JSON.stringify(['confirmed', 'waitlisted']), 'one seat one waitlist', JSON.stringify([a.data, b.data]));
  const ev = await req('GET', '/api/events/riverside-track-session');
  ok(ev.data.confirmed_count === 2 && ev.data.capacity === 2, 'confirmed_count never exceeds capacity', JSON.stringify(ev.data));
  const racers = [
    { res: a, token: gToken, email: 'guest@example.com' },
    { res: b, token: g3, email: 'guest3@example.com' },
  ];
  const winnerSide = racers.find((r) => r.res.data.status === 'confirmed');
  const loserSide = racers.find((r) => r.res.data.status === 'waitlisted');
  const winner = winnerSide.res;
  const loser = loserSide.res;
  ok(/^TKT-[A-Z0-9]{8}$/.test(winner.data.ticket_code), 'ticket code shape');
  ok(loser.data.ticket_code === null && loser.data.waitlist_position === 1, 'waitlisted has no ticket, position 1');

  console.log('# idempotent repeat registration');
  const again = await req('POST', '/api/registrations', { token: winnerSide.token, body: { event_slug: 'riverside-track-session' } });
  ok(again.data.id === winner.data.id, 'repeat updates the same row');
  const gl = await req('GET', '/api/events/riverside-track-session/registrations', { token: hToken });
  const mineRows = gl.data.filter((r) => r.email === winnerSide.email);
  ok(mineRows.length === 1, 'one row per account per event');

  console.log('# cancel promotes head of waiting list');
  const before = await mailFor(loserSide.email);
  const cancelled = await req('POST', `/api/registrations/${winner.data.id}/cancel`, { token: winnerSide.token });
  ok(cancelled.data.status === 'cancelled_by_guest' && cancelled.data.ticket_code === null, 'cancel clears ticket', JSON.stringify(cancelled.data));
  const gl2 = await req('GET', '/api/events/riverside-track-session/registrations', { token: hToken });
  const promotedRow = gl2.data.find((r) => r.email === loserSide.email);
  ok(promotedRow.status === 'confirmed' && !!promotedRow.ticket_code, 'head of waitlist promoted with ticket', JSON.stringify(promotedRow));
  const after = await mailFor(loserSide.email);
  ok(after.length > before.length, 'promotion mailed');
  ok(after.some((m) => m.Subject === 'A spot opened up for Riverside Track Session'), 'promotion subject exact', JSON.stringify(after.map((m) => m.Subject)));

  console.log('# guest cancelling sends no mail to themselves');
  const gMail = await mailFor(winnerSide.email);
  ok(!gMail.some((m) => /cancel/i.test(m.Subject)), 'no mail for own cancellation');

  console.log('# waitlist off -> full is refused');
  // winter-reading-night capacity 12 waitlist off; fill is expensive, use approval flow instead
  console.log('# approval flow');
  const pend = await req('GET', '/api/events/sunrise-long-run/registrations', { token: hToken });
  const pendingRow = pend.data.find((r) => r.status === 'pending_approval');
  ok(!!pendingRow, 'seeded pending row exists');
  ok((await req('POST', `/api/registrations/${pendingRow.id}/approve`, { token: gToken })).status === 404, 'guest cannot approve');
  const approved = await req('POST', `/api/registrations/${pendingRow.id}/approve`, { token: hToken });
  ok(approved.data.status === 'confirmed' && !!approved.data.ticket_code, 'approve confirms with ticket');
  const g3mail = await mailFor('guest3@example.com');
  ok(g3mail.some((m) => m.Subject === "You're in: Sunrise Long Run"), 'approval subject exact');

  const pendNew = await req('POST', '/api/registrations', { token: sToken, body: { event_slug: 'sunrise-long-run' } });
  ok(pendNew.data.status === 'pending_approval' && pendNew.data.ticket_code === null, 'approval_required starts pending, no seat');
  const sMail = await mailFor(email);
  ok(sMail.some((m) => m.Subject === 'Your request to join Sunrise Long Run'), 'pending subject exact');
  const declined = await req('POST', `/api/registrations/${pendNew.data.id}/decline`, { token: hToken });
  ok(declined.data.status === 'declined', 'decline works');
  const sMail2 = await mailFor(email);
  ok(sMail2.some((m) => m.Subject === 'About your request to join Sunrise Long Run'), 'decline subject exact');

  console.log('# registration_closed');
  const closed = await req('POST', '/api/registrations', { token: sToken, body: { event_slug: 'riverside-winter-time-trial' } });
  ok(closed.status === 400 && /closed/i.test(closed.data.message), 'closed event refuses registration', JSON.stringify(closed.data));
  ok((await req('GET', '/api/events/riverside-winter-time-trial')).status === 200, 'closed event still readable');

  console.log('# check-in');
  const ticket = promotedRow.ticket_code;
  const anon = await req('GET', `/api/tickets/${ticket}`);
  ok(anon.status === 200 && anon.data.ticket_code === ticket, 'ticket readable without auth');
  ok((await req('GET', '/api/tickets/TKT-NOTREAL')).status === 404, 'unknown ticket 404');
  ok((await req('POST', `/api/tickets/${ticket}/check-in`, { token: gToken })).status === 404, 'guest cannot check in');
  ok((await req('POST', `/api/tickets/${ticket}/check-in`, { token: h2 })).status === 404, 'other host cannot check in');
  const ci = await req('POST', `/api/tickets/${ticket}/check-in`, { token: hToken });
  ok(ci.data.status === 'checked_in' && !!ci.data.checked_in_at, 'check-in works');
  const ci2 = await req('POST', `/api/tickets/${ticket}/check-in`, { token: hToken });
  ok(ci2.data.checked_in_at === ci.data.checked_in_at && ci2.data.already_checked_in === true, 'second check-in records one arrival');

  console.log('# capacity raise moves the waiting list');
  // thursday-night-5k: cap 3, 2 confirmed, guest3 waitlisted pos1 -> register stranger fills seat 3, then another waits
  const fill = await req('POST', '/api/registrations', { token: sToken, body: { event_slug: 'thursday-night-5k' } });
  ok(fill.data.status === 'confirmed', 'last seat taken', JSON.stringify(fill.data));
  const g2reg = await req('POST', '/api/registrations', { token: g2, body: { event_slug: 'thursday-night-5k' } });
  ok(['confirmed', 'waitlisted'].includes(g2reg.data.status), 'guest2 already seeded confirmed');
  const raise = await req('PATCH', '/api/events/thursday-night-5k', { token: hToken, body: { capacity: 5 } });
  ok(raise.status === 200 && raise.data.promoted_count >= 1, 'raise promotes waitlist', JSON.stringify(raise.data));
  const t5 = await req('GET', '/api/events/thursday-night-5k/registrations', { token: hToken });
  ok(t5.data.filter((r) => r.status === 'waitlisted').length === 0, 'waitlist drained');
  const lower = await req('PATCH', '/api/events/thursday-night-5k', { token: hToken, body: { capacity: 1 } });
  ok(lower.status === 400 && /already have \d+ guests confirmed/.test(lower.data.message), 'lowering capacity refused with pinned copy', JSON.stringify(lower.data));

  console.log('# waitlist positions have no gaps');
  const wl = await req('GET', '/api/events/riverside-track-session/registrations', { token: hToken });
  const positions = wl.data.filter((r) => r.status === 'waitlisted').map((r) => r.waitlist_position).sort((x, y) => x - y);
  ok(JSON.stringify(positions) === JSON.stringify(positions.map((_, i) => i + 1)), 'positions are 1..n');

  console.log('# CSV export');
  const csv = await fetch(`${BASE}/api/events/thursday-night-5k/registrations.csv`, { headers: { authorization: `Bearer ${hToken}` } });
  const csvText = await csv.text();
  ok(csv.headers.get('content-type').includes('text/csv'), 'csv content type');
  ok(csv.headers.get('content-disposition').includes('thursday-night-5k.csv'), 'csv filename');
  ok(csvText.split('\n')[0] === 'email,display_name,status,waitlist_position,ticket_code', 'csv header line');

  console.log('# event editing & cancellation');
  const nowIso = new Date(Date.now() + 20 * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const badTime = await req('PATCH', '/api/events/thursday-night-5k', { token: hToken, body: { starts_at: '2026-01-01 10:00' } });
  ok(badTime.status === 400 && badTime.data.field === 'starts_at', 'local time refused, field named');
  const republish = await req('PATCH', '/api/events/autumn-book-swap', { token: h2, body: { state: 'published' } });
  ok(republish.status === 400, 'cancelled cannot be republished');
  const toDraft = await req('PATCH', '/api/events/winter-reading-night', { token: h2, body: { state: 'draft' } });
  ok(toDraft.status === 400, 'published cannot return to draft');
  const noReason = await req('POST', '/api/events/winter-reading-night/cancel', { token: h2, body: { reason: '  ' } });
  ok(noReason.status === 400, 'cancel needs a reason');

  console.log('# cancellation mails every guest with the reason');
  const target = 'winter-reading-night';
  await req('POST', '/api/registrations', { token: gToken, body: { event_slug: target } });
  const beforeCancel = (await mailFor('guest@example.com')).length;
  const reason = 'The venue flooded overnight.';
  const canc = await req('POST', `/api/events/${target}/cancel`, { token: h2, body: { reason } });
  ok(canc.status === 200 && canc.data.cancel_reason === reason, 'cancel returns reason');
  const afterCancel = await mailFor('guest@example.com');
  ok(afterCancel.length > beforeCancel, 'cancellation mailed the guest');
  const cancelMsg = afterCancel.find((m) => m.Subject === 'Winter Reading Night has been cancelled');
  ok(!!cancelMsg, 'cancellation subject exact');
  if (cancelMsg) {
    const full = await (await fetch(`${MAILPIT}/api/v1/message/${cancelMsg.ID}`)).json();
    ok(full.Text.includes(reason), 'cancellation body carries reason word for word');
    ok(full.To.length === 1 && (full.Cc ?? []).length === 0 && (full.Bcc ?? []).length === 0, 'one recipient, no cc/bcc');
    ok(full.Text.includes('Winter Reading Night'), 'body names the event');
  }
  const afterCancelReg = await req('POST', '/api/registrations', { token: g2, body: { event_slug: target } });
  ok(afterCancelReg.status === 400, 'cancelled event refuses registration');

  console.log('# namespace');
  const dupCal = await req('POST', '/api/calendars', { token: hToken, body: { name: 'Dup', slug: 'riverside-run-club', category: 'running', city: 'Berlin' } });
  ok(dupCal.status === 400 && dupCal.data.message === 'That address is already taken.', 'calendar slug clash pinned copy', JSON.stringify(dupCal.data));
  const resCal = await req('POST', '/api/calendars', { token: hToken, body: { name: 'Dup', slug: 'discover', category: 'running', city: 'Berlin' } });
  ok(resCal.status === 400, 'reserved path refused');
  const catCal = await req('POST', '/api/calendars', { token: hToken, body: { name: 'Dup', slug: 'running', category: 'running', city: 'Berlin' } });
  ok(catCal.status === 400, 'category name refused');
  const handleTaken = await req('PATCH', '/api/accounts/me', { token: gToken, body: { handle: 'priya-raman' } });
  ok(handleTaken.status === 400 && handleTaken.data.message === 'That handle is already taken.', 'handle clash pinned copy');
  const me = await req('GET', '/api/accounts/me', { token: gToken });
  ok(me.data.handle === 'amina-osei', 'handle unchanged after refusal');
  const okHandle = await req('PATCH', '/api/accounts/me', { token: gToken, body: { handle: 'amina-osei' } });
  ok(okHandle.status === 200, 'same handle accepted');

  console.log('# calendar creation and event creation');
  const calSlug = `test-cal-${Date.now()}`;
  const newCal = await req('POST', '/api/calendars', { token: hToken, body: { name: 'Test Calendar', slug: calSlug, category: 'tech', city: 'Berlin', is_public: true } });
  ok(newCal.status === 201 && newCal.data.slug === calSlug, 'calendar created');
  const evSlug = `test-event-${Date.now()}`;
  const start = new Date(Date.now() + 15 * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const end = new Date(Date.now() + 15 * 86400000 + 7200000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const newEv = await req('POST', '/api/events', {
    token: hToken,
    body: { calendar_slug: calSlug, slug: evSlug, title: 'Test Event', category: 'tech', city: 'Berlin', time_zone: 'Europe/Berlin', starts_at: start, ends_at: end, capacity: 2, approval_required: false, waitlist_enabled: false, description: 'A test' },
  });
  ok(newEv.status === 201 && newEv.data.state === 'published' && /^#[0-9a-f]{6}$/.test(newEv.data.theme_hex), 'event published with theme');
  const draftEv = await req('POST', '/api/events', { token: hToken, body: { calendar_slug: calSlug, title: 'Incomplete Event' } });
  ok(draftEv.status === 201 && draftEv.data.state === 'draft', 'incomplete submission stored as draft');

  console.log('# waitlist disabled -> full is refused, no partial row');
  await req('POST', '/api/registrations', { token: gToken, body: { event_slug: evSlug } });
  await req('POST', '/api/registrations', { token: g2, body: { event_slug: evSlug } });
  const refused = await req('POST', '/api/registrations', { token: g3, body: { event_slug: evSlug } });
  ok(refused.status === 400 && /full/i.test(refused.data.message), 'full with waitlist off is refused');
  const evRegs = await req('GET', `/api/events/${evSlug}/registrations`, { token: hToken });
  ok(evRegs.data.length === 2, 'refused attempt left no row', JSON.stringify(evRegs.data.length));

  console.log('# time format');
  const one = await req('GET', '/api/events/thursday-night-5k');
  ok(/Z$/.test(one.data.starts_at) && one.data.time_zone === 'Europe/Berlin', 'instants are UTC Z with IANA zone');

  console.log('# rate limit');
  let limited = false;
  for (let i = 0; i < 14; i++) {
    const r = await req('POST', '/api/auth/login', { body: { email: 'ratelimit@example.com', password: 'x' } });
    if (r.status === 429) {
      limited = /10/.test(r.data.message);
      break;
    }
  }
  ok(limited, 'login rate limit at 10/min states the limit');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Contention check: many guests take the last seats at the same instant.
const BASE = process.env.TEST_BASE ?? 'http://localhost:4180';
const PW = 'deku-demo-pw-2026';
const HOST = 'host@example.com';

async function req(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

const hostToken = (await req('POST', '/api/auth/login', { body: { email: HOST, password: PW } })).data.access_token;

const stamp = Date.now();
const calSlug = `race-cal-${stamp}`;
await req('POST', '/api/calendars', { token: hostToken, body: { name: 'Race Calendar', slug: calSlug, category: 'tech', city: 'Berlin', is_public: true } });

async function scenario({ capacity, contenders, waitlist }) {
  const slug = `race-event-${stamp}-${capacity}-${waitlist ? 'wl' : 'nowl'}`;
  const start = new Date(Date.now() + 30 * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const end = new Date(Date.now() + 30 * 86400000 + 7200000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const created = await req('POST', '/api/events', {
    token: hostToken,
    body: {
      calendar_slug: calSlug,
      slug,
      title: `Race Event ${capacity}`,
      category: 'tech',
      city: 'Berlin',
      time_zone: 'UTC',
      starts_at: start,
      ends_at: end,
      capacity,
      approval_required: false,
      waitlist_enabled: waitlist,
      description: 'contention',
    },
  });
  if (created.status !== 201) throw new Error('event not created: ' + JSON.stringify(created.data));

  const tokens = [];
  for (let i = 0; i < contenders; i++) {
    const email = `racer-${stamp}-${capacity}-${waitlist}-${i}@example.com`;
    const s = await req('POST', '/api/auth/signup', { body: { email, password: 'race-password-1', name: `Racer ${i}` } });
    tokens.push(s.data.access_token);
  }

  const results = await Promise.all(tokens.map((t) => req('POST', '/api/registrations', { token: t, body: { event_slug: slug } })));
  const confirmed = results.filter((r) => r.data?.status === 'confirmed').length;
  const waited = results.filter((r) => r.data?.status === 'waitlisted').length;
  const refused = results.filter((r) => r.status >= 400).length;

  const regs = await req('GET', `/api/events/${slug}/registrations`, { token: hostToken });
  const dbConfirmed = regs.data.filter((r) => ['confirmed', 'checked_in'].includes(r.status)).length;
  const tickets = new Set(regs.data.filter((r) => r.ticket_code).map((r) => r.ticket_code));
  const ticketed = regs.data.filter((r) => r.ticket_code).length;
  const positions = regs.data.filter((r) => r.status === 'waitlisted').map((r) => r.waitlist_position).sort((a, b) => a - b);
  const contiguous = positions.every((p, i) => p === i + 1);
  const view = await req('GET', `/api/events/${slug}`);

  const okAll =
    confirmed === capacity &&
    dbConfirmed === capacity &&
    view.data.confirmed_count === capacity &&
    ticketed === dbConfirmed &&
    tickets.size === ticketed &&
    contiguous &&
    (waitlist ? waited === contenders - capacity && refused === 0 : refused === contenders - capacity && waited === 0) &&
    regs.data.length === (waitlist ? contenders : capacity);

  console.log(
    `${okAll ? '  ok ' : 'FAIL'} capacity=${capacity} contenders=${contenders} waitlist=${waitlist}: ` +
      `confirmed=${confirmed} db=${dbConfirmed} read=${view.data.confirmed_count} waited=${waited} refused=${refused} ` +
      `tickets=${ticketed}/${tickets.size} positions=[${positions}] rows=${regs.data.length}`,
  );
  return okAll;
}

let allOk = true;
allOk = (await scenario({ capacity: 1, contenders: 12, waitlist: true })) && allOk;
allOk = (await scenario({ capacity: 3, contenders: 20, waitlist: true })) && allOk;
allOk = (await scenario({ capacity: 2, contenders: 15, waitlist: false })) && allOk;
allOk = (await scenario({ capacity: 10, contenders: 10, waitlist: true })) && allOk;
console.log(allOk ? '\nrace invariants held' : '\nrace invariants BROKEN');
process.exit(allOk ? 0 : 1);

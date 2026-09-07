import { query, withTx } from './db.js';
import { env, log } from './env.js';
import { hashPassword, newTicketCode } from './util.js';

interface SeedEvent {
  title: string;
  slug: string;
  calendar: string;
  capacity: number;
  state: string;
  approval: boolean;
  waitlist: boolean;
  theme: string;
  tz: string;
  hour: number;
  dayOffset: number;
  description: string;
  city: string;
  category: string;
  cancel_reason?: string;
}

const EVENTS: SeedEvent[] = [
  {
    title: 'Thursday Night 5K',
    slug: 'thursday-night-5k',
    calendar: 'riverside-run-club',
    capacity: 3,
    state: 'published',
    approval: false,
    waitlist: true,
    theme: '#146aeb',
    tz: 'Europe/Berlin',
    hour: 18,
    dayOffset: 8,
    city: 'Berlin',
    category: 'running',
    description:
      'A friendly five kilometre loop along the canal, finishing at the bridge. Every pace welcome; we always wait at the corners and nobody runs home alone.',
  },
  {
    title: 'Riverside Track Session',
    slug: 'riverside-track-session',
    calendar: 'riverside-run-club',
    capacity: 2,
    state: 'published',
    approval: false,
    waitlist: true,
    theme: '#3cbd2c',
    tz: 'Europe/Berlin',
    hour: 19,
    dayOffset: 9,
    city: 'Berlin',
    category: 'running',
    description:
      'Eight by four hundred on the old cinder track, with a long warm up and a longer cool down. Bring water and a jacket for the standing about.',
  },
  {
    title: 'Sunrise Long Run',
    slug: 'sunrise-long-run',
    calendar: 'riverside-run-club',
    capacity: 20,
    state: 'published',
    approval: true,
    waitlist: true,
    theme: '#d69712',
    tz: 'Europe/Berlin',
    hour: 9,
    dayOffset: 10,
    city: 'Berlin',
    category: 'running',
    description:
      'Sixteen slow kilometres out to the lake while the city is still quiet. The host approves each request so the group stays the size of a conversation.',
  },
  {
    title: 'Harbour Loop Recovery Jog',
    slug: 'harbour-loop-recovery-jog',
    calendar: 'riverside-run-club',
    capacity: 12,
    state: 'draft',
    approval: false,
    waitlist: false,
    theme: '#007aff',
    tz: 'Europe/Berlin',
    hour: 10,
    dayOffset: 11,
    city: 'Berlin',
    category: 'running',
    description: 'An easy shakeout around the harbour. Still being planned.',
  },
  {
    title: 'Winter Reading Night',
    slug: 'winter-reading-night',
    calendar: 'northside-reading-nights',
    capacity: 12,
    state: 'published',
    approval: false,
    waitlist: false,
    theme: '#ab46dd',
    tz: 'Europe/Lisbon',
    hour: 20,
    dayOffset: 12,
    city: 'Lisbon',
    category: 'books',
    description:
      'One long table, one short novel, and two hours of reading in company. Tea is poured at the hour and nobody is asked what they thought until the end.',
  },
  {
    title: 'Autumn Book Swap',
    slug: 'autumn-book-swap',
    calendar: 'northside-reading-nights',
    capacity: 20,
    state: 'cancelled',
    approval: false,
    waitlist: false,
    theme: '#f31a7c',
    tz: 'Europe/Lisbon',
    hour: 17,
    dayOffset: 13,
    city: 'Lisbon',
    category: 'books',
    description: 'Bring three books you have finished and leave with three you have not.',
    cancel_reason: 'The venue lost its lease.',
  },
  {
    title: 'Riverside Winter Time Trial',
    slug: 'riverside-winter-time-trial',
    calendar: 'riverside-run-club',
    capacity: 8,
    state: 'registration_closed',
    approval: false,
    waitlist: false,
    theme: '#28cd41',
    tz: 'Europe/Berlin',
    hour: 11,
    dayOffset: 14,
    city: 'Berlin',
    category: 'running',
    description:
      'A measured three kilometres against the clock, run in pairs. Registration has closed while the club sorts out the timing mats.',
  },
];

const ACCOUNTS = [
  { email: 'host@example.com', name: 'Priya Raman', handle: 'priya-raman', role: 'host' },
  { email: 'host2@example.com', name: 'Marcus Bell', handle: 'marcus-bell', role: 'host' },
  { email: 'guest@example.com', name: 'Amina Osei', handle: 'amina-osei', role: 'guest' },
  { email: 'guest2@example.com', name: 'Tomas Vidal', handle: 'tomas-vidal', role: 'guest' },
  { email: 'guest3@example.com', name: 'Ines Duarte', handle: 'ines-duarte', role: 'guest' },
];

const CALENDARS = [
  {
    name: 'Riverside Run Club',
    slug: 'riverside-run-club',
    owner: 'host@example.com',
    category: 'running',
    city: 'Berlin',
    is_public: true,
  },
  {
    name: 'Northside Reading Nights',
    slug: 'northside-reading-nights',
    owner: 'host2@example.com',
    category: 'books',
    city: 'Lisbon',
    is_public: false,
  },
];

function atHour(dayOffset: number, hour: number): Date {
  const base = new Date();
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + dayOffset, hour, 0, 0, 0));
  return d;
}

export async function seed(): Promise<void> {
  const hash = hashPassword(env.seedPassword);
  await withTx(async (c) => {
    const accountIds = new Map<string, string>();
    for (const a of ACCOUNTS) {
      const r = await c.query<{ id: string }>(
        `INSERT INTO accounts (email, password_hash, display_name, handle, role)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, handle = EXCLUDED.handle, role = EXCLUDED.role
         RETURNING id`,
        [a.email, hash, a.name, a.handle, a.role],
      );
      accountIds.set(a.email, r.rows[0].id);
    }

    const calendarIds = new Map<string, string>();
    for (const cal of CALENDARS) {
      const r = await c.query<{ id: string }>(
        `INSERT INTO calendars (owner_account_id, name, slug, category, city, is_public)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category,
           city = EXCLUDED.city, is_public = EXCLUDED.is_public
         RETURNING id`,
        [accountIds.get(cal.owner), cal.name, cal.slug, cal.category, cal.city, cal.is_public],
      );
      calendarIds.set(cal.slug, r.rows[0].id);
    }

    const eventIds = new Map<string, string>();
    for (const e of EVENTS) {
      const starts = atHour(e.dayOffset, e.hour);
      const ends = new Date(starts.getTime() + 2 * 60 * 60 * 1000);
      const exists = await c.query<{ id: string }>('SELECT id FROM events WHERE slug = $1', [e.slug]);
      if (exists.rowCount) {
        eventIds.set(e.slug, exists.rows[0].id);
        continue;
      }
      const r = await c.query<{ id: string }>(
        `INSERT INTO events (calendar_id, title, slug, category, city, time_zone, cover_seed, theme_hex, description,
           starts_at, ends_at, capacity, approval_required, waitlist_enabled, state, published_at, cancelled_at, cancel_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
        [
          calendarIds.get(e.calendar),
          e.title,
          e.slug,
          e.category,
          e.city,
          e.tz,
          e.slug,
          e.theme,
          e.description,
          starts,
          ends,
          e.capacity,
          e.approval,
          e.waitlist,
          e.state,
          e.state === 'draft' ? null : new Date(),
          e.state === 'cancelled' ? new Date() : null,
          e.cancel_reason ?? null,
        ],
      );
      eventIds.set(e.slug, r.rows[0].id);
    }

    const regs: Array<{ event: string; account: string; status: string; seat: number | null; pos: number | null }> = [
      { event: 'thursday-night-5k', account: 'guest@example.com', status: 'confirmed', seat: 1, pos: null },
      { event: 'thursday-night-5k', account: 'guest2@example.com', status: 'confirmed', seat: 2, pos: null },
      { event: 'thursday-night-5k', account: 'guest3@example.com', status: 'waitlisted', seat: null, pos: 1 },
      { event: 'riverside-track-session', account: 'guest2@example.com', status: 'confirmed', seat: 1, pos: null },
      { event: 'sunrise-long-run', account: 'guest3@example.com', status: 'pending_approval', seat: null, pos: null },
    ];
    for (const reg of regs) {
      const eventId = eventIds.get(reg.event)!;
      const accountId = accountIds.get(reg.account)!;
      const existing = await c.query('SELECT 1 FROM registrations WHERE event_id = $1 AND account_id = $2', [eventId, accountId]);
      if (existing.rowCount) continue;
      const ticket = reg.status === 'confirmed' ? newTicketCode() : null;
      await c.query(
        `INSERT INTO registrations (event_id, account_id, status, seat_no, ticket_code, waitlist_position)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [eventId, accountId, reg.status, reg.seat, ticket, reg.pos],
      );
    }
  });
  const counts = await query<{ accounts: string; events: string; registrations: string }>(
    'SELECT (SELECT count(*) FROM accounts) accounts, (SELECT count(*) FROM events) events, (SELECT count(*) FROM registrations) registrations',
  );
  log('info', 'seed complete', counts.rows[0]);
}

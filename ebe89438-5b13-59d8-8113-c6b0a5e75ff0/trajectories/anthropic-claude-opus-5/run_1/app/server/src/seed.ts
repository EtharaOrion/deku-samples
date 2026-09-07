import { pool, query, tx } from './db.js';
import { log } from './env.js';
import { hashPassword, randomTicketCode } from './domain.js';
import { SCHEMA_SQL } from './schema.js';

export const SEED_PASSWORD = 'deku-demo-pw-2026';

const ACCOUNTS = [
  { email: 'host@example.com', display_name: 'Priya Raman', handle: 'priya-raman', role: 'host' },
  { email: 'host2@example.com', display_name: 'Marcus Bell', handle: 'marcus-bell', role: 'host' },
  { email: 'guest@example.com', display_name: 'Amina Osei', handle: 'amina-osei', role: 'guest' },
  { email: 'guest2@example.com', display_name: 'Tomas Vidal', handle: 'tomas-vidal', role: 'guest' },
  { email: 'guest3@example.com', display_name: 'Ines Duarte', handle: 'ines-duarte', role: 'guest' },
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

interface SeedEvent {
  title: string;
  slug: string;
    calendar: string;
  capacity: number;
  state: string;
  approval_required: boolean;
  waitlist_enabled: boolean;
  theme_hex: string;
  time_zone: string;
  hour: number;
  dayOffset: number;
  description: string;
  cancel_reason?: string;
}

const EVENTS: SeedEvent[] = [
  {
    title: 'Thursday Night 5K',
    slug: 'thursday-night-5k',
    calendar: 'riverside-run-club',
    capacity: 3,
    state: 'published',
    approval_required: false,
    waitlist_enabled: true,
    theme_hex: '#146aeb',
    time_zone: 'Europe/Berlin',
    hour: 19,
    dayOffset: 8,
    description:
      'A friendly five kilometres along the canal, finishing at the bridge. Every pace is welcome and nobody is left behind; we regroup at each corner and walk the last hundred metres together.',
  },
  {
    title: 'Riverside Track Session',
    slug: 'riverside-track-session',
    calendar: 'riverside-run-club',
    capacity: 2,
    state: 'published',
    approval_required: false,
    waitlist_enabled: true,
    theme_hex: '#3cbd2c',
    time_zone: 'Europe/Berlin',
    hour: 18,
    dayOffset: 9,
    description:
      'Eight by four hundred on the old municipal track, with a proper warm up and a long jog home. Bring a watch if you have one and water either way.',
  },
  {
    title: 'Sunrise Long Run',
    slug: 'sunrise-long-run',
    calendar: 'riverside-run-club',
    capacity: 20,
    state: 'published',
    approval_required: true,
    waitlist_enabled: true,
    theme_hex: '#d69712',
    time_zone: 'Europe/Berlin',
    hour: 9,
    dayOffset: 10,
    description:
      'Sixteen kilometres out to the lake and back while the city is still quiet. The host reads every request before the day, so tell us roughly what pace you keep.',
  },
  {
    title: 'Harbour Loop Recovery Jog',
    slug: 'harbour-loop-recovery-jog',
    calendar: 'riverside-run-club',
    capacity: 12,
    state: 'draft',
    approval_required: false,
    waitlist_enabled: false,
    theme_hex: '#007aff',
    time_zone: 'Europe/Berlin',
    hour: 11,
    dayOffset: 11,
    description:
      'An easy hour around the harbour the morning after a hard session. Conversational pace throughout.',
  },
  {
    title: 'Winter Reading Night',
    slug: 'winter-reading-night',
    calendar: 'northside-reading-nights',
    capacity: 12,
    state: 'published',
    approval_required: false,
    waitlist_enabled: false,
    theme_hex: '#ab46dd',
    time_zone: 'Europe/Lisbon',
    hour: 20,
    dayOffset: 12,
    description:
      'One long table, one short novel and a room that stays quiet for the first hour. Bring the book you are already halfway through.',
  },
  {
    title: 'Autumn Book Swap',
    slug: 'autumn-book-swap',
    calendar: 'northside-reading-nights',
    capacity: 20,
    state: 'cancelled',
    approval_required: false,
    waitlist_enabled: false,
    theme_hex: '#f31a7c',
    time_zone: 'Europe/Lisbon',
    hour: 17,
    dayOffset: 13,
    description:
      'Bring three books you have finished and leave with three you have not. Coffee from the corner and nothing to pay.',
    cancel_reason: 'The venue lost its lease.',
  },
  {
    title: 'Riverside Winter Time Trial',
    slug: 'riverside-winter-time-trial',
    calendar: 'riverside-run-club',
    capacity: 8,
    state: 'registration_closed',
    approval_required: false,
    waitlist_enabled: false,
    theme_hex: '#28cd41',
    time_zone: 'Europe/Berlin',
    hour: 10,
    dayOffset: 14,
    description:
      'A measured three kilometres against the clock on the riverside path, with the field set off in pairs. Registration for this one has already closed.',
  },
];

function seedDay(offset: number, hour: number): { starts: string; ends: string } {
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  base.setUTCDate(base.getUTCDate() + offset);
  const starts = new Date(base);
  starts.setUTCHours(hour, 0, 0, 0);
  const ends = new Date(starts.getTime() + 2 * 60 * 60 * 1000);
  return { starts: starts.toISOString(), ends: ends.toISOString() };
}

/** Applies the schema, then plants the fixture data exactly once. */
export async function migrateAndSeed(): Promise<void> {
  await pool.query(SCHEMA_SQL);
  log('info', 'db.schema_applied');

  await tx(async (c) => {
    // one advisory lock so two starting containers cannot both seed
    await c.query('SELECT pg_advisory_xact_lock(918273645)');

    const pw = hashPassword(SEED_PASSWORD);
    for (const a of ACCOUNTS) {
      await c.query(
        `INSERT INTO accounts (email, password_hash, display_name, handle, role)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (email) DO NOTHING`,
        [a.email, pw, a.display_name, a.handle, a.role]
      );
    }

    const accountIds = new Map<string, string>();
    for (const a of ACCOUNTS) {
      const r = await c.query<{ id: string }>('SELECT id FROM accounts WHERE email = $1', [a.email]);
      accountIds.set(a.email, r.rows[0].id);
    }

    for (const cal of CALENDARS) {
      await c.query(
        `INSERT INTO calendars (owner_account_id, name, slug, category, city, is_public)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (slug) DO NOTHING`,
        [accountIds.get(cal.owner), cal.name, cal.slug, cal.category, cal.city, cal.is_public]
      );
    }

    const calendarIds = new Map<string, string>();
    for (const cal of CALENDARS) {
      const r = await c.query<{ id: string }>('SELECT id FROM calendars WHERE slug = $1', [cal.slug]);
      calendarIds.set(cal.slug, r.rows[0].id);
    }

    const calCategory = new Map(CALENDARS.map((x) => [x.slug, x] as const));

    for (const e of EVENTS) {
      const { starts, ends } = seedDay(e.dayOffset, e.hour);
      const cal = calCategory.get(e.calendar)!;
      await c.query(
        `INSERT INTO events (calendar_id, title, slug, category, city, time_zone, cover_seed,
            theme_hex, description, starts_at, ends_at, capacity, approval_required,
            waitlist_enabled, state, published_at, cancelled_at, cancel_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (slug) DO NOTHING`,
        [
          calendarIds.get(e.calendar),
          e.title,
          e.slug,
          cal.category,
          cal.city,
          e.time_zone,
          e.slug,
          e.theme_hex,
          e.description,
          starts,
          ends,
          e.capacity,
          e.approval_required,
          e.waitlist_enabled,
          e.state,
          e.state === 'draft' ? null : new Date().toISOString(),
          e.state === 'cancelled' ? new Date().toISOString() : null,
          e.cancel_reason ?? null,
        ]
      );
    }

    const eventIds = new Map<string, string>();
    for (const e of EVENTS) {
      const r = await c.query<{ id: string }>('SELECT id FROM events WHERE slug = $1', [e.slug]);
      eventIds.set(e.slug, r.rows[0].id);
    }

    const regs: [string, string, string, number | null][] = [
      ['thursday-night-5k', 'guest@example.com', 'confirmed', null],
      ['thursday-night-5k', 'guest2@example.com', 'confirmed', null],
      ['thursday-night-5k', 'guest3@example.com', 'waitlisted', 1],
      ['riverside-track-session', 'guest2@example.com', 'confirmed', null],
      ['sunrise-long-run', 'guest3@example.com', 'pending_approval', null],
    ];
    for (const [slug, email, status, position] of regs) {
      const eventId = eventIds.get(slug);
      const accountId = accountIds.get(email);
      // The capacity trigger runs before ON CONFLICT can discard a duplicate,
      // so the row is checked for first and only planted when it is absent.
      const already = await c.query(
        'SELECT 1 FROM registrations WHERE event_id = $1 AND account_id = $2',
        [eventId, accountId]
      );
      if (already.rowCount) continue;
      const code = status === 'confirmed' || status === 'checked_in' ? randomTicketCode() : null;
      await c.query(
        `INSERT INTO registrations (event_id, account_id, status, waitlist_position, ticket_code)
         VALUES ($1,$2,$3,$4,$5)`,
        [eventId, accountId, status, position, code]
      );
    }
  });

  const counts = await query<{ accounts: string; events: string; registrations: string }>(
    `SELECT (SELECT count(*) FROM accounts)::text AS accounts,
            (SELECT count(*) FROM events)::text AS events,
            (SELECT count(*) FROM registrations)::text AS registrations`
  );
  log('info', 'db.seeded', counts.rows[0]);
}

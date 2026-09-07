import { query, tx } from './db.js';
import { env } from './env.js';
import { hashPassword, makeTicketCode } from './crypto.js';
import { log } from './log.js';

interface SeedAccount {
  email: string;
  display_name: string;
  handle: string;
  role: 'host' | 'guest';
}

const ACCOUNTS: SeedAccount[] = [
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
  state: 'draft' | 'published' | 'registration_closed' | 'cancelled';
  approval_required: boolean;
  waitlist_enabled: boolean;
  theme_hex: string;
  time_zone: string;
  category: string;
  city: string;
  description: string;
  dayOffset: number;
  startHourUtc: number;
  durationHours: number;
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
    category: 'running',
    city: 'Berlin',
    description:
      'A friendly five kilometres along the canal path, finishing at the bridge. Everyone runs their own pace and nobody is left behind. Stay for a drink afterwards.',
    dayOffset: 8,
    startHourUtc: 18,
    durationHours: 2,
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
    category: 'running',
    city: 'Berlin',
    description:
      'Intervals on the old cinder track. Bring flats, water and a willingness to count laps out loud. Two places only, so the coaching stays personal.',
    dayOffset: 9,
    startHourUtc: 17,
    durationHours: 2,
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
    category: 'running',
    city: 'Berlin',
    description:
      'Eighteen kilometres out past the lakes while the city is still asleep. Requests are read by the host, because the route needs a steady group.',
    dayOffset: 10,
    startHourUtc: 9,
    durationHours: 3,
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
    category: 'running',
    city: 'Berlin',
    description: 'An easy loop around the harbour. Still being planned.',
    dayOffset: 11,
    startHourUtc: 10,
    durationHours: 1,
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
    category: 'books',
    city: 'Lisbon',
    description:
      'One long table, twelve chairs and whatever you are reading. We read quietly for an hour, then talk about it for two.',
    dayOffset: 12,
    startHourUtc: 19,
    durationHours: 3,
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
    category: 'books',
    city: 'Lisbon',
    description: 'Bring one book you have finished and leave with one you have not.',
    dayOffset: 13,
    startHourUtc: 18,
    durationHours: 2,
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
    category: 'running',
    city: 'Berlin',
    description:
      'Eight runners, one stopwatch, three kilometres in the cold. Registration for this one has closed.',
    dayOffset: 14,
    startHourUtc: 11,
    durationHours: 2,
  },
];

function seedInstant(dayOffset: number, hourUtc: number): Date {
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  const d = new Date(base.getTime() + dayOffset * 86_400_000);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}

export async function seed(): Promise<void> {
  const already = await query<{ n: number }>(`SELECT count(*)::bigint AS n FROM accounts`);
  const passwordHash = await hashPassword(env.seedPassword);

  await tx(async (client) => {
    const accountIds = new Map<string, number>();
    for (const a of ACCOUNTS) {
      const r = await client.query<{ id: number }>(
        `INSERT INTO accounts (email, password_hash, display_name, handle, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
         RETURNING id`,
        [a.email, passwordHash, a.display_name, a.handle, a.role],
      );
      accountIds.set(a.email, r.rows[0].id);
    }

    const calendarIds = new Map<string, number>();
    for (const cal of CALENDARS) {
      const r = await client.query<{ id: number }>(
        `INSERT INTO calendars (owner_account_id, name, slug, category, city, is_public)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [accountIds.get(cal.owner), cal.name, cal.slug, cal.category, cal.city, cal.is_public],
      );
      calendarIds.set(cal.slug, r.rows[0].id);
    }

    const eventIds = new Map<string, number>();
    for (const e of EVENTS) {
      const startsAt = seedInstant(e.dayOffset, e.startHourUtc);
      const endsAt = new Date(startsAt.getTime() + e.durationHours * 3_600_000);
      const r = await client.query<{ id: number }>(
        `INSERT INTO events (calendar_id, title, slug, category, city, time_zone, cover_seed, theme_hex,
                             description, starts_at, ends_at, capacity, approval_required, waitlist_enabled,
                             state, published_at, cancelled_at, cancel_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (slug) DO NOTHING
         RETURNING id`,
        [
          calendarIds.get(e.calendar),
          e.title,
          e.slug,
          e.category,
          e.city,
          e.time_zone,
          e.slug,
          e.theme_hex,
          e.description,
          startsAt.toISOString(),
          endsAt.toISOString(),
          e.capacity,
          e.approval_required,
          e.waitlist_enabled,
          e.state,
          e.state === 'draft' ? null : new Date().toISOString(),
          e.state === 'cancelled' ? new Date().toISOString() : null,
          e.cancel_reason ?? null,
        ],
      );
      if (r.rows[0]) {
        eventIds.set(e.slug, r.rows[0].id);
      } else {
        const existing = await client.query<{ id: number }>(`SELECT id FROM events WHERE slug = $1`, [e.slug]);
        eventIds.set(e.slug, existing.rows[0].id);
      }
    }

    const regs: Array<{
      event: string;
      account: string;
      status: string;
      waitlist_position: number | null;
      ticket: boolean;
    }> = [
      { event: 'thursday-night-5k', account: 'guest@example.com', status: 'confirmed', waitlist_position: null, ticket: true },
      { event: 'thursday-night-5k', account: 'guest2@example.com', status: 'confirmed', waitlist_position: null, ticket: true },
      { event: 'thursday-night-5k', account: 'guest3@example.com', status: 'waitlisted', waitlist_position: 1, ticket: false },
      { event: 'riverside-track-session', account: 'guest2@example.com', status: 'confirmed', waitlist_position: null, ticket: true },
      { event: 'sunrise-long-run', account: 'guest3@example.com', status: 'pending_approval', waitlist_position: null, ticket: false },
    ];

    for (const reg of regs) {
      // A restart must never disturb the registrations the running app has
      // taken since, and must never fail because real guests have filled the
      // event: an event that already carries registrations is left alone, and a
      // savepoint lets any remaining refusal be skipped on its own.
      const eventId = eventIds.get(reg.event);
      const held = await client.query<{ n: number }>(
        `SELECT count(*)::bigint AS n FROM registrations WHERE event_id = $1`,
        [eventId],
      );
      const seeded = regs.filter((r) => r.event === reg.event).length;
      if (held.rows[0].n >= seeded) continue;

      await client.query('SAVEPOINT seed_reg');
      try {
        await client.query(
          `INSERT INTO registrations (event_id, account_id, status, waitlist_position, ticket_code)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (event_id, account_id) DO NOTHING`,
          [
            eventId,
            accountIds.get(reg.account),
            reg.status,
            reg.waitlist_position,
            reg.ticket ? makeTicketCode() : null,
          ],
        );
        await client.query('RELEASE SAVEPOINT seed_reg');
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT seed_reg');
        await client.query('RELEASE SAVEPOINT seed_reg');
        log.warn('seed registration skipped', {
          event: reg.event,
          account: reg.account,
          reason: String(e),
        });
      }
    }
  });

  log.info('seed applied', { fresh: already.rows[0].n === 0 });
}

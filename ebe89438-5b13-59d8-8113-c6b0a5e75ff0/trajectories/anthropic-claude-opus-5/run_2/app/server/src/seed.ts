import type { PoolClient } from 'pg';
import { tx } from './db.js';
import { issueTicketCode } from './domain.js';
import { hashPassword, log } from './util.js';

export const SEED_PASSWORD = 'deku-demo-pw-2026';

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
  category: string;
  city: string;
  description: string;
  /** days after the seed date, and the whole hour (09:00-20:00 UTC) it starts at */
  day: number;
  hour: number;
  duration_hours: number;
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
      'A flat five kilometres along the canal path, run at a conversational pace. We gather by the boathouse ten minutes before, run together, and finish where we started. Every pace is welcome; nobody is left behind.',
    day: 8,
    hour: 18,
    duration_hours: 2,
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
      'Intervals on the old cinder track: eight by four hundred with a walked recovery between each. Bring water and shoes you can push off in. Two lanes are held for us, which is why places are so few.',
    day: 9,
    hour: 19,
    duration_hours: 2,
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
      'Sixteen kilometres out along the river as the light comes up, with coffee at the far end before we turn back. The host reads every request first, because the group stays together and the pace has to suit everybody in it.',
    day: 11,
    hour: 9,
    duration_hours: 3,
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
    description:
      'An easy loop of the harbour the morning after a hard session. Still being planned.',
    day: 13,
    hour: 10,
    duration_hours: 1,
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
      'One long table, one short novel, and the rule that nobody has to have finished it. We read aloud for the first hour and argue about it for the second. Tea is provided; the biscuits are a collective responsibility.',
    day: 10,
    hour: 19,
    duration_hours: 3,
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
    description:
      'Bring three books you have finished with and leave with three you have not. A table for poetry, a table for everything else.',
    day: 14,
    hour: 17,
    duration_hours: 2,
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
      'A measured three kilometres against the clock, run in pairs so nobody has to chase alone. Registration for this one has closed while the marshals are confirmed.',
    day: 12,
    hour: 11,
    duration_hours: 2,
  },
];

function atDay(day: number, hour: number): Date {
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  const d = new Date(base.getTime() + day * 86400000);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

async function seedRegistration(
  client: PoolClient,
  eventId: string,
  accountId: string,
  status: string,
  waitlistPosition: number | null,
) {
  const { rows: existing } = await client.query(
    'SELECT id FROM registrations WHERE event_id = $1 AND account_id = $2',
    [eventId, accountId],
  );
  if (existing.length) return;
  const ticket =
    status === 'confirmed' || status === 'checked_in'
      ? await issueTicketCode(client)
      : null;
  await client.query(
    `INSERT INTO registrations (event_id, account_id, status, waitlist_position, ticket_code)
     VALUES ($1, $2, $3, $4, $5)`,
    [eventId, accountId, status, waitlistPosition, ticket],
  );
}

/** Restarting the app must not duplicate rows. */
export async function seed(): Promise<void> {
  await tx(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['seed']);

    const accountIds = new Map<string, string>();
    for (const a of ACCOUNTS) {
      const { rows } = await client.query(
        `INSERT INTO accounts (email, password_hash, display_name, handle, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
         RETURNING id`,
        [a.email, hashPassword(SEED_PASSWORD), a.name, a.handle, a.role],
      );
      accountIds.set(a.email, rows[0].id);
    }

    const calendarIds = new Map<string, string>();
    for (const c of CALENDARS) {
      const { rows } = await client.query(
        `INSERT INTO calendars (owner_account_id, name, slug, category, city, is_public)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [accountIds.get(c.owner), c.name, c.slug, c.category, c.city, c.is_public],
      );
      calendarIds.set(c.slug, rows[0].id);
    }

    const eventIds = new Map<string, string>();
    for (const e of EVENTS) {
      const startsAt = atDay(e.day, e.hour);
      const endsAt = new Date(startsAt.getTime() + e.duration_hours * 3600000);
      const { rows } = await client.query(
        `INSERT INTO events (
           calendar_id, title, slug, category, city, time_zone, cover_seed,
           theme_hex, description, starts_at, ends_at, capacity,
           approval_required, waitlist_enabled, state, published_at,
           cancelled_at, cancel_reason)
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
          startsAt,
          endsAt,
          e.capacity,
          e.approval_required,
          e.waitlist_enabled,
          e.state,
          e.state === 'draft' ? null : new Date(),
          e.state === 'cancelled' ? new Date() : null,
          e.cancel_reason ?? null,
        ],
      );
      if (rows.length) {
        eventIds.set(e.slug, rows[0].id);
      } else {
        const { rows: found } = await client.query(
          'SELECT id FROM events WHERE slug = $1',
          [e.slug],
        );
        eventIds.set(e.slug, found[0].id);
      }
    }

    const ev = (slug: string) => eventIds.get(slug)!;
    const ac = (email: string) => accountIds.get(email)!;

    // Thursday Night 5K, capacity 3: two seats taken, one waiting => one free seat.
    await seedRegistration(client, ev('thursday-night-5k'), ac('guest@example.com'), 'confirmed', null);
    await seedRegistration(client, ev('thursday-night-5k'), ac('guest2@example.com'), 'confirmed', null);
    await seedRegistration(client, ev('thursday-night-5k'), ac('guest3@example.com'), 'waitlisted', 1);

    // Riverside Track Session, capacity 2: one seat taken => one free seat.
    await seedRegistration(client, ev('riverside-track-session'), ac('guest2@example.com'), 'confirmed', null);

    // Sunrise Long Run has approval on: one request waiting for the host.
    await seedRegistration(client, ev('sunrise-long-run'), ac('guest3@example.com'), 'pending_approval', null);

    log('info', 'seed_complete', {
      accounts: ACCOUNTS.length,
      calendars: CALENDARS.length,
      events: EVENTS.length,
    });
  });
}

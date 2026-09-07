import { query, tx } from './db.js';
import { hashPassword } from './auth.js';
import { log } from './log.js';

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

type SeedEvent = {
  title: string;
  slug: string;
  calendar: string;
  capacity: number;
  state: 'draft' | 'published' | 'registration_closed' | 'cancelled';
  approval_required: boolean;
  waitlist_enabled: boolean;
  theme_hex: string;
  time_zone: string;
  hour: number;
  dayOffset: number;
  description: string;
  location: string;
  cancel_reason?: string;
};

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
    hour: 18,
    dayOffset: 8,
    description:
      'A friendly five kilometres along the canal path, finishing at the bridge. One loop, no drop-offs, and a slower group at the back so nobody runs alone. Bring a light if the evening is drawing in.',
    location: 'Canal Path Gate, Treptower Park, Berlin',
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
    hour: 19,
    dayOffset: 9,
    description:
      'Intervals on the track: eight times four hundred with a walked recovery between each. Two lanes are held for us, which is why the numbers are small.',
    location: 'Riverside Athletics Track, Berlin',
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
    dayOffset: 11,
    description:
      'Sixteen kilometres out along the river while the city is still quiet, back before the cafes fill. The host approves each request so the pace groups stay even.',
    location: 'Oberbaum Bridge, east side, Berlin',
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
    hour: 10,
    dayOffset: 13,
    description: 'An easy hour around the harbour, conversational throughout.',
    location: 'Harbour Basin, Berlin',
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
    dayOffset: 10,
    description:
      'Bring the book you are in the middle of and read in company for two hours, with a break in the middle for tea and for saying what you are reading and why.',
    location: 'Northside Bookshop, Rua da Prata, Lisbon',
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
    dayOffset: 12,
    description: 'Bring three books you have finished and leave with three you have not.',
    location: 'Northside Bookshop, Rua da Prata, Lisbon',
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
    hour: 11,
    dayOffset: 14,
    description:
      'A measured five kilometres against the clock, with times read out at the finish. Registration for this one has closed.',
    location: 'Riverside Athletics Track, Berlin',
  },
];

/** An instant on the hour, dayOffset days from today, at the given UTC hour. */
function eventInstant(dayOffset: number, hour: number) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0, 0));
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return d;
}

/** Restarting the app must not duplicate rows. */
export async function seed() {
  const passwordHash = hashPassword(SEED_PASSWORD);

  await tx(async (c) => {
    for (const a of ACCOUNTS) {
      await c.query(
        `INSERT INTO accounts (email, password_hash, display_name, handle, role)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (email) DO NOTHING`,
        [a.email, passwordHash, a.display_name, a.handle, a.role]
      );
    }

    for (const cal of CALENDARS) {
      await c.query(
        `INSERT INTO calendars (owner_account_id, name, slug, category, city, is_public)
         SELECT a.id, $2, $3, $4, $5, $6 FROM accounts a WHERE a.email = $1
         ON CONFLICT (slug) DO NOTHING`,
        [cal.owner, cal.name, cal.slug, cal.category, cal.city, cal.is_public]
      );
    }

    for (const e of EVENTS) {
      const starts = eventInstant(e.dayOffset, e.hour);
      const ends = new Date(starts.getTime() + 90 * 60 * 1000);
      await c.query(
        `INSERT INTO events
           (calendar_id, title, slug, category, city, time_zone, cover_seed, theme_hex,
            description, location, starts_at, ends_at, capacity, approval_required,
            waitlist_enabled, state, published_at, cancelled_at, cancel_reason)
         SELECT cal.id, $2, $3, cal.category, cal.city, $4, $5, $6, $7, $8, $9, $10, $11,
                $12, $13, $14,
                CASE WHEN $14 IN ('published','registration_closed','cancelled') THEN now() ELSE NULL END,
                CASE WHEN $14 = 'cancelled' THEN now() ELSE NULL END,
                $15
           FROM calendars cal WHERE cal.slug = $1
         ON CONFLICT (slug) DO NOTHING`,
        [
          e.calendar,
          e.title,
          e.slug,
          e.time_zone,
          e.slug,
          e.theme_hex,
          e.description,
          e.location,
          starts.toISOString(),
          ends.toISOString(),
          e.capacity,
          e.approval_required,
          e.waitlist_enabled,
          e.state,
          e.cancel_reason ?? null,
        ]
      );
    }

    // Seeded registrations. DO NOTHING on conflict so a restart never resets a
    // registration a guest has since changed.
    const seatFor = async (
      eventSlug: string,
      email: string,
      status: string,
      seat: number | null,
      waitlist: number | null,
      ticket: string | null
    ) => {
      await c.query(
        `INSERT INTO registrations (event_id, account_id, status, seat_no, waitlist_position, ticket_code)
         SELECT e.id, a.id, $3, $4, $5, $6
           FROM events e, accounts a
          WHERE e.slug = $1 AND a.email = $2
         ON CONFLICT (event_id, account_id) DO NOTHING`,
        [eventSlug, email, status, seat, waitlist, ticket]
      );
    };

    await seatFor('thursday-night-5k', 'guest@example.com', 'confirmed', 1, null, 'TKT-SEED0001');
    await seatFor('thursday-night-5k', 'guest2@example.com', 'confirmed', 2, null, 'TKT-SEED0002');
    await seatFor('thursday-night-5k', 'guest3@example.com', 'waitlisted', null, 1, null);
    await seatFor('riverside-track-session', 'guest2@example.com', 'confirmed', 1, null, 'TKT-SEED0003');
    await seatFor('sunrise-long-run', 'guest3@example.com', 'pending_approval', null, null, null);
  });

  const counts = await query<{ accounts: string; calendars: string; events: string; registrations: string }>(
    `SELECT (SELECT count(*) FROM accounts)::text AS accounts,
            (SELECT count(*) FROM calendars)::text AS calendars,
            (SELECT count(*) FROM events)::text AS events,
            (SELECT count(*) FROM registrations)::text AS registrations`
  );
  log.info('seed_complete', counts.rows[0]);
}

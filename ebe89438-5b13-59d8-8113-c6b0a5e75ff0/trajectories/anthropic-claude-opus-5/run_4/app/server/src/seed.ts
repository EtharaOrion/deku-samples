import { pool, tx } from './db.js';
import { env } from './env.js';
import { log } from './log.js';
import { hashPassword, newTicketCode } from './util.js';

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
  location: string;
  description: string;
  dayOffset: number;
  hourUtc: number;
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
    location: 'Boathouse steps, Treptower Park',
    description:
      'A friendly five kilometres along the water, lit by the bridges. We leave together, we finish together, and nobody is left behind on the last kilometre. Bring a light layer for the walk back.',
    dayOffset: 8,
    hourUtc: 18,
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
    location: 'Willy-Kressmann-Stadion, lane one',
    description:
      'Eight by four hundred with a walk back, coached from the infield. Two lanes are ours for the hour, which is exactly why the seat count is what it is.',
    dayOffset: 9,
    hourUtc: 17,
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
    location: 'Oberbaumbrücke, east side',
    description:
      'Eighteen kilometres at conversation pace, starting before the city does. Because the route crosses two districts we approve each request by hand so the group stays the size the pace needs.',
    dayOffset: 10,
    hourUtc: 6 + 3,
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
    location: 'Westhafen, crane yard gate',
    description: 'A slow loop of the harbour the morning after a hard session. Still being planned.',
    dayOffset: 12,
    hourUtc: 9,
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
    location: 'The back room, Livraria do Bairro',
    description:
      'One long table, one short book, and the rule that nobody has to have finished it. We read the first chapter aloud and argue about the rest until the tea runs out.',
    dayOffset: 11,
    hourUtc: 19,
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
    location: 'The courtyard, Rua da Rosa',
    description: 'Bring three books you have finished with and leave with three you have not.',
    dayOffset: 14,
    hourUtc: 16,
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
    location: 'Tempelhofer Feld, runway six',
    description:
      'Three kilometres against the clock on the old runway, chip-free and honest. Entry closed once the marshals were counted.',
    dayOffset: 13,
    hourUtc: 11,
    durationHours: 2,
  },
];

function eventInstants(e: SeedEvent): { starts: Date; ends: Date } {
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  const starts = new Date(base.getTime() + e.dayOffset * 86_400_000);
  starts.setUTCHours(e.hourUtc, 0, 0, 0);
  const ends = new Date(starts.getTime() + e.durationHours * 3_600_000);
  return { starts, ends };
}

export async function seed(): Promise<void> {
  const password_hash = hashPassword(env.seedPassword);

  await tx(async (c) => {
    // A single advisory lock keeps two starting replicas from seeding twice.
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['community-calendar-seed']);

    for (const a of ACCOUNTS) {
      await c.query(
        `INSERT INTO accounts (email, password_hash, display_name, handle, role)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        [a.email, password_hash, a.display_name, a.handle, a.role],
      );
    }

    for (const cal of CALENDARS) {
      await c.query(
        `INSERT INTO calendars (owner_account_id, name, slug, category, city, is_public)
         VALUES ((SELECT id FROM accounts WHERE email = $1), $2,$3,$4,$5,$6)
         ON CONFLICT (slug) DO NOTHING`,
        [cal.owner, cal.name, cal.slug, cal.category, cal.city, cal.is_public],
      );
    }

    for (const e of EVENTS) {
      const { starts, ends } = eventInstants(e);
      await c.query(
        `INSERT INTO events (calendar_id, title, slug, category, city, location, time_zone, cover_seed,
                             theme_hex, description, starts_at, ends_at, capacity, approval_required,
                             waitlist_enabled, state, published_at, cancelled_at, cancel_reason)
         VALUES ((SELECT id FROM calendars WHERE slug = $1), $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (slug) DO NOTHING`,
        [
          e.calendar,
          e.title,
          e.slug,
          e.category,
          e.city,
          e.location,
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
          e.state === 'draft' ? null : new Date(),
          e.state === 'cancelled' ? new Date() : null,
          e.cancel_reason ?? null,
        ],
      );
    }

    const seededRegs: Array<{
      event: string;
      email: string;
      status: 'confirmed' | 'waitlisted' | 'pending_approval';
      waitlist_position: number | null;
    }> = [
      { event: 'thursday-night-5k', email: 'guest@example.com', status: 'confirmed', waitlist_position: null },
      { event: 'thursday-night-5k', email: 'guest2@example.com', status: 'confirmed', waitlist_position: null },
      { event: 'thursday-night-5k', email: 'guest3@example.com', status: 'waitlisted', waitlist_position: 1 },
      { event: 'riverside-track-session', email: 'guest2@example.com', status: 'confirmed', waitlist_position: null },
      { event: 'sunrise-long-run', email: 'guest3@example.com', status: 'pending_approval', waitlist_position: null },
    ];

    /*
     * Fixture registrations are laid down only on an event that holds none, so
     * a restart against a database the app has already been used against adds
     * nothing and disturbs nothing. Trying row by row would not do: the
     * capacity guard fires before ON CONFLICT is ever consulted, so an event
     * already at capacity would abort the whole seed.
     */
    const eventsToPopulate = [...new Set(seededRegs.map((r) => r.event))];
    for (const slug of eventsToPopulate) {
      const held = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM registrations r
           JOIN events e ON e.id = r.event_id WHERE e.slug = $1`,
        [slug],
      );
      if (Number(held.rows[0]!.n) > 0) continue;

      for (const r of seededRegs.filter((x) => x.event === slug)) {
        const ticket = r.status === 'confirmed' ? newTicketCode() : null;
        await c.query(
          `INSERT INTO registrations (event_id, account_id, status, waitlist_position, ticket_code)
           VALUES ((SELECT id FROM events WHERE slug = $1), (SELECT id FROM accounts WHERE email = $2), $3, $4, $5)
           ON CONFLICT (event_id, account_id) DO NOTHING`,
          [r.event, r.email, r.status, r.waitlist_position, ticket],
        );
      }
    }
  });

  const counts = await pool.query(
    `SELECT (SELECT count(*) FROM accounts) accounts,
            (SELECT count(*) FROM calendars) calendars,
            (SELECT count(*) FROM events) events,
            (SELECT count(*) FROM registrations) registrations`,
  );
  log.info('seed complete', counts.rows[0]);
}

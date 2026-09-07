import { query, tx } from './db.js';
import { log } from './env.js';
import { COVER_COLOURS, hashPassword, SEED_PASSWORD, themeFromSeed } from './domain.js';

/** Finds a cover_seed whose derivation lands on the pinned key colour. */
function seedForColour(slugBase: string, hex: string): string {
  for (let i = 0; i < 5000; i++) {
    const candidate = i === 0 ? slugBase : `${slugBase}-${i}`;
    if (themeFromSeed(candidate) === hex) return candidate;
  }
  return slugBase;
}

const ACCOUNTS = [
  { email: 'host@example.com', display_name: 'Priya Raman', handle: 'priya-raman', role: 'host' },
  { email: 'host2@example.com', display_name: 'Marcus Bell', handle: 'marcus-bell', role: 'host' },
  { email: 'guest@example.com', display_name: 'Amina Osei', handle: 'amina-osei', role: 'guest' },
  { email: 'guest2@example.com', display_name: 'Tomas Vidal', handle: 'tomas-vidal', role: 'guest' },
  { email: 'guest3@example.com', display_name: 'Ines Duarte', handle: 'ines-duarte', role: 'guest' },
];

const CALENDARS = [
  { name: 'Riverside Run Club', slug: 'riverside-run-club', owner: 'host@example.com', category: 'running', city: 'Berlin', is_public: true },
  { name: 'Northside Reading Nights', slug: 'northside-reading-nights', owner: 'host2@example.com', category: 'books', city: 'Lisbon', is_public: false },
];

type SeedEvent = {
  title: string; slug: string; calendar: string; capacity: number;
  state: string; approval_required: boolean; waitlist_enabled: boolean;
  theme_hex: string; time_zone: string; hour: number; dayOffset: number;
  description: string; cancel_reason?: string;
};

const EVENTS: SeedEvent[] = [
  {
    title: 'Thursday Night 5K', slug: 'thursday-night-5k', calendar: 'riverside-run-club',
    capacity: 3, state: 'published', approval_required: false, waitlist_enabled: true,
    theme_hex: '#146aeb', time_zone: 'Europe/Berlin', hour: 18, dayOffset: 8,
    description: 'A friendly five kilometres along the canal path, finishing at the bridge. All paces welcome; nobody is left behind, and we walk the last hundred metres together if that is what the evening needs.',
  },
  {
    title: 'Riverside Track Session', slug: 'riverside-track-session', calendar: 'riverside-run-club',
    capacity: 2, state: 'published', approval_required: false, waitlist_enabled: true,
    theme_hex: '#3cbd2c', time_zone: 'Europe/Berlin', hour: 19, dayOffset: 9,
    description: 'Intervals on the old cinder track. Bring a watch you can read in low light. We warm up together for fifteen minutes and finish with a slow lap and a long talk.',
  },
  {
    title: 'Sunrise Long Run', slug: 'sunrise-long-run', calendar: 'riverside-run-club',
    capacity: 20, state: 'published', approval_required: true, waitlist_enabled: true,
    theme_hex: '#d69712', time_zone: 'Europe/Berlin', hour: 9, dayOffset: 10,
    description: 'Sixteen kilometres out past the allotments while the city is still quiet. The host reads every request before the seat is given, so tell us roughly how far you run in a week.',
  },
  {
    title: 'Harbour Loop Recovery Jog', slug: 'harbour-loop-recovery-jog', calendar: 'riverside-run-club',
    capacity: 12, state: 'draft', approval_required: false, waitlist_enabled: false,
    theme_hex: '#007aff', time_zone: 'Europe/Berlin', hour: 11, dayOffset: 11,
    description: 'An easy loop of the harbour the morning after a hard session. Still being planned.',
  },
  {
    title: 'Winter Reading Night', slug: 'winter-reading-night', calendar: 'northside-reading-nights',
    capacity: 12, state: 'published', approval_required: false, waitlist_enabled: false,
    theme_hex: '#ab46dd', time_zone: 'Europe/Lisbon', hour: 20, dayOffset: 12,
    description: 'One long table, one short novel, and as many lamps as the room will hold. Read the first three chapters beforehand if you can; come anyway if you could not.',
  },
  {
    title: 'Autumn Book Swap', slug: 'autumn-book-swap', calendar: 'northside-reading-nights',
    capacity: 20, state: 'cancelled', approval_required: false, waitlist_enabled: false,
    theme_hex: '#f31a7c', time_zone: 'Europe/Lisbon', hour: 17, dayOffset: 13,
    description: 'Bring one book you have finished and leave with one you have not.',
    cancel_reason: 'The venue lost its lease.',
  },
  {
    title: 'Riverside Winter Time Trial', slug: 'riverside-winter-time-trial', calendar: 'riverside-run-club',
    capacity: 8, state: 'registration_closed', approval_required: false, waitlist_enabled: false,
    theme_hex: '#28cd41', time_zone: 'Europe/Berlin', hour: 10, dayOffset: 14,
    description: 'A measured three miles against the clock, run in whatever the weather gives us. Registration for this one has closed.',
  },
];

function atHourUtc(dayOffset: number, hour: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

async function reserve(slug: string, kind: string) {
  await query(
    `INSERT INTO namespace_reservations (slug, kind) VALUES ($1,$2) ON CONFLICT (slug) DO NOTHING`,
    [slug, kind],
  );
}

/** Idempotent: restarting the app must not duplicate a single row. */
export async function seed() {
  const already = await query(`SELECT count(*)::int AS n FROM accounts`);
  const fresh = already.rows[0].n === 0;

  const pwHash = hashPassword(SEED_PASSWORD);
  const accountIds = new Map<string, number>();
  for (const a of ACCOUNTS) {
    const r = await query<{ id: number }>(
      `INSERT INTO accounts (email, password_hash, display_name, handle, role)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING id`,
      [a.email, pwHash, a.display_name, a.handle, a.role],
    );
    accountIds.set(a.email, r.rows[0].id);
    await reserve(a.handle, 'account');
  }

  const calendarIds = new Map<string, number>();
  for (const cal of CALENDARS) {
    const r = await query<{ id: number }>(
      `INSERT INTO calendars (owner_account_id, name, slug, category, city, is_public)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [accountIds.get(cal.owner), cal.name, cal.slug, cal.category, cal.city, cal.is_public],
    );
    calendarIds.set(cal.slug, r.rows[0].id);
    await reserve(cal.slug, 'calendar');
  }

  const eventIds = new Map<string, number>();
  for (const e of EVENTS) {
    const starts = atHourUtc(e.dayOffset, e.hour);
    const ends = new Date(starts.getTime() + 2 * 60 * 60 * 1000);
    const coverSeed = seedForColour(e.slug, e.theme_hex);
    const cal = CALENDARS.find((c) => c.slug === e.calendar)!;
    const r = await query<{ id: number }>(
      `INSERT INTO events (calendar_id, title, slug, category, city, time_zone, cover_seed,
                           theme_hex, description, starts_at, ends_at, capacity,
                           approval_required, waitlist_enabled, state, published_at,
                           cancelled_at, cancel_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title
       RETURNING id`,
      [
        calendarIds.get(e.calendar), e.title, e.slug, cal.category, cal.city, e.time_zone,
        coverSeed, e.theme_hex, e.description, starts.toISOString(), ends.toISOString(),
        e.capacity, e.approval_required, e.waitlist_enabled, e.state,
        e.state === 'draft' ? null : new Date().toISOString(),
        e.state === 'cancelled' ? new Date().toISOString() : null,
        e.cancel_reason ?? null,
      ],
    );
    eventIds.set(e.slug, r.rows[0].id);
    await reserve(e.slug, 'event');
  }

  if (fresh) {
    await tx(async (c) => {
      const mk = async (
        eventSlug: string, email: string, status: string,
        seatNo: number | null, position: number | null, ticket: string | null,
      ) => {
        await c.query(
          `INSERT INTO registrations (event_id, account_id, status, seat_no, waitlist_position, ticket_code)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (event_id, account_id) DO NOTHING`,
          [eventIds.get(eventSlug), accountIds.get(email), status, seatNo, position, ticket],
        );
      };
      await mk('thursday-night-5k', 'guest@example.com', 'confirmed', 1, null, 'TKT-SEEDTN01');
      await mk('thursday-night-5k', 'guest2@example.com', 'confirmed', 2, null, 'TKT-SEEDTN02');
      await mk('thursday-night-5k', 'guest3@example.com', 'waitlisted', null, 1, null);
      await mk('riverside-track-session', 'guest2@example.com', 'confirmed', 1, null, 'TKT-SEEDRT01');
      await mk('sunrise-long-run', 'guest3@example.com', 'pending_approval', null, null, null);
    });
  }

  log('info', 'seed complete', { fresh, accounts: ACCOUNTS.length, events: EVENTS.length });
}

import { pool, tx } from './db.js';
import { hashPassword } from './crypto.js';
import { SCHEMA_SQL } from './schema.js';

const SEED_PASSWORD = 'deku-demo-pw-2026';

type SeedEvent = {
  title: string;
  slug: string;
  calendarSlug: string;
  capacity: number;
  state: 'draft' | 'published' | 'registration_closed' | 'cancelled';
  approval: boolean;
  waitlist: boolean;
  themeHex: string;
  timeZone: string;
  startsAt: Date;
  description: string;
  cancelReason?: string;
};

export async function applySchema(): Promise<void> {
  await pool.query(SCHEMA_SQL);
}

export async function seedIfEmpty(): Promise<{ seeded: boolean }> {
  return tx(async (client) => {
    const { rows: existing } = await client.query(`SELECT count(*)::int AS n FROM accounts`);
    if ((existing[0].n as number) > 0) {
      return { seeded: false };
    }

    const passwordHash = await hashPassword(SEED_PASSWORD);
    const accounts = [
      { email: 'host@example.com', name: 'Priya Raman', handle: 'priya-raman', role: 'host' },
      { email: 'host2@example.com', name: 'Marcus Bell', handle: 'marcus-bell', role: 'host' },
      { email: 'guest@example.com', name: 'Amina Osei', handle: 'amina-osei', role: 'guest' },
      { email: 'guest2@example.com', name: 'Tomas Vidal', handle: 'tomas-vidal', role: 'guest' },
      { email: 'guest3@example.com', name: 'Ines Duarte', handle: 'ines-duarte', role: 'guest' },
    ];
    const ids: Record<string, string> = {};
    for (const a of accounts) {
      const { rows } = await client.query(
        `INSERT INTO accounts (email, password_hash, display_name, handle, role) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id`,
        [a.email, passwordHash, a.name, a.handle, a.role],
      );
      ids[a.email] = rows[0].id;
    }

    const calendars = [
      { name: 'Riverside Run Club', slug: 'riverside-run-club', owner: 'host@example.com', category: 'running', city: 'Berlin', isPublic: true },
      { name: 'Northside Reading Nights', slug: 'northside-reading-nights', owner: 'host2@example.com', category: 'books', city: 'Lisbon', isPublic: false },
    ];
    const calIds: Record<string, string> = {};
    for (const cal of calendars) {
      const { rows } = await client.query(
        `INSERT INTO calendars (owner_account_id, name, slug, category, city, is_public) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [ids[cal.owner], cal.name, cal.slug, cal.category, cal.city, cal.isPublic],
      );
      calIds[cal.slug] = rows[0].id;
    }

    // Each event starts on the hour between 09:00 and 20:00 UTC, at least seven days after the seed date.
    const base = nextSeedDate();
    const hour = (h: number) => new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), h, 0, 0));
    const events: SeedEvent[] = [
      {
        title: 'Thursday Night 5K', slug: 'thursday-night-5k', calendarSlug: 'riverside-run-club', capacity: 3,
        state: 'published', approval: false, waitlist: true, themeHex: '#146aeb', timeZone: 'Europe/Berlin',
        startsAt: hour(19), description: 'An easy 5K along the river at dusk, all paces welcome, coffee after at the boathouse.',
      },
      {
        title: 'Riverside Track Session', slug: 'riverside-track-session', calendarSlug: 'riverside-run-club', capacity: 2,
        state: 'published', approval: false, waitlist: true, themeHex: '#3cbd2c', timeZone: 'Europe/Berlin',
        startsAt: hour(18), description: 'Six by 800m on the riverside track with a proper warm-up and a long cool-down.',
      },
      {
        title: 'Sunrise Long Run', slug: 'sunrise-long-run', calendarSlug: 'riverside-run-club', capacity: 20,
        state: 'published', approval: true, waitlist: true, themeHex: '#d69712', timeZone: 'Europe/Berlin',
        startsAt: hour(9), description: 'A steady 18K out to the lakes and back while the city is still waking up.',
      },
      {
        title: 'Harbour Loop Recovery Jog', slug: 'harbour-loop-recovery-jog', calendarSlug: 'riverside-run-club', capacity: 12,
        state: 'draft', approval: false, waitlist: false, themeHex: '#007aff', timeZone: 'Europe/Berlin',
        startsAt: hour(10), description: 'A very easy loop of the harbour, chat pace, nobody gets dropped.',
      },
      {
        title: 'Winter Reading Night', slug: 'winter-reading-night', calendarSlug: 'northside-reading-nights', capacity: 12,
        state: 'published', approval: false, waitlist: false, themeHex: '#ab46dd', timeZone: 'Europe/Lisbon',
        startsAt: hour(20), description: 'Bring one page you love and read it out loud. Wine, blankets and a slow evening.',
      },
      {
        title: 'Autumn Book Swap', slug: 'autumn-book-swap', calendarSlug: 'northside-reading-nights', capacity: 20,
        state: 'cancelled', approval: false, waitlist: false, themeHex: '#f31a7c', timeZone: 'Europe/Lisbon',
        startsAt: hour(17), description: 'Bring a book you loved, take a stranger\'s favourite home.',
        cancelReason: 'The venue lost its lease.',
      },
      {
        title: 'Riverside Winter Time Trial', slug: 'riverside-winter-time-trial', calendarSlug: 'riverside-run-club', capacity: 8,
        state: 'registration_closed', approval: false, waitlist: false, themeHex: '#28cd41', timeZone: 'Europe/Berlin',
        startsAt: hour(11), description: 'One mile, all out, on the riverside path. Results on the board after.',
      },
    ];

    const eventIds: Record<string, string> = {};
    for (const ev of events) {
      const coverSeed = `${ev.slug}-${ev.startsAt.toISOString().slice(0, 10)}`;
      const { rows } = await client.query(
        `INSERT INTO events (calendar_id, title, slug, category, city, time_zone, cover_seed, theme_hex, description,
            starts_at, ends_at, capacity, approval_required, waitlist_enabled, state, published_at, cancelled_at, cancel_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title RETURNING id`,
        [
          calIds[ev.calendarSlug], ev.title, ev.slug, categoryFor(ev.calendarSlug), cityFor(ev.calendarSlug),
          ev.timeZone, coverSeed, ev.themeHex, ev.description, ev.startsAt, addHours(ev.startsAt, 2), ev.capacity,
          ev.approval, ev.waitlist, ev.state,
          ev.state === 'draft' ? null : new Date(),
          ev.state === 'cancelled' ? new Date() : null,
          ev.cancelReason ?? null,
        ],
      );
      eventIds[ev.slug] = rows[0].id;
    }

    const ticketOf = (seed: string) => `TKT-${seed.toUpperCase().padEnd(8, 'X').slice(0, 8).replace(/[^A-Z0-9]/g, 'X')}`;
    const registrations: Array<{ event: string; email: string; status: string; position: number | null; code: string | null }> = [
      { event: 'thursday-night-5k', email: 'guest@example.com', status: 'confirmed', position: null, code: ticketOf('A5KAMINA') },
      { event: 'thursday-night-5k', email: 'guest2@example.com', status: 'confirmed', position: null, code: ticketOf('B5KTOMAS') },
      { event: 'thursday-night-5k', email: 'guest3@example.com', status: 'waitlisted', position: 1, code: null },
      { event: 'riverside-track-session', email: 'guest2@example.com', status: 'confirmed', position: null, code: ticketOf('C7TRKTOM') },
      { event: 'sunrise-long-run', email: 'guest3@example.com', status: 'pending_approval', position: null, code: null },
    ];
    for (const r of registrations) {
      await client.query(
        `INSERT INTO registrations (event_id, account_id, status, waitlist_position, ticket_code)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (event_id, account_id) DO UPDATE SET status = EXCLUDED.status, waitlist_position = EXCLUDED.waitlist_position, ticket_code = EXCLUDED.ticket_code`,
        [eventIds[r.event], ids[r.email], r.status, r.position, r.code],
      );
    }
    return { seeded: true };
  }, 'READ COMMITTED');
}

function categoryFor(calendarSlug: string): string {
  return calendarSlug === 'northside-reading-nights' ? 'books' : 'running';
}

function cityFor(calendarSlug: string): string {
  return calendarSlug === 'northside-reading-nights' ? 'Lisbon' : 'Berlin';
}

function addHours(d: Date, h: number): Date {
  return new Date(d.getTime() + h * 3600 * 1000);
}

/** The Saturday at least seven days out, so seeded events never start in the past. */
function nextSeedDate(): Date {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 8));
  return target;
}

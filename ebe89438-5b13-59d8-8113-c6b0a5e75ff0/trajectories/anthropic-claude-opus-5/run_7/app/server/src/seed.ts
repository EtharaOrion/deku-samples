import type pg from 'pg';
import { pool, tx } from './db.js';
import { hashPassword, newTicketCode } from './core.js';
import { env, log } from './env.js';

interface SeedAccount {
  email: string; display_name: string; handle: string; role: 'host' | 'guest';
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
    name: 'Riverside Run Club', slug: 'riverside-run-club', owner: 'host@example.com',
    category: 'running', city: 'Berlin', is_public: true,
  },
  {
    name: 'Northside Reading Nights', slug: 'northside-reading-nights', owner: 'host2@example.com',
    category: 'books', city: 'Lisbon', is_public: false,
  },
];

interface SeedEvent {
  title: string; slug: string; calendar: string; capacity: number; state: string;
  approval_required: boolean; waitlist_enabled: boolean; theme_hex: string;
  time_zone: string; dayOffset: number; hour: number; durationHours: number;
  description: string; cancel_reason?: string;
}

const EVENTS: SeedEvent[] = [
  {
    title: 'Thursday Night 5K', slug: 'thursday-night-5k', calendar: 'riverside-run-club',
    capacity: 3, state: 'published', approval_required: false, waitlist_enabled: true,
    theme_hex: '#146aeb', time_zone: 'Europe/Berlin', dayOffset: 8, hour: 19, durationHours: 2,
    description:
      'A friendly five kilometres along the canal path, finishing at the bridge. ' +
      'Every pace is welcome: there is a group at the front chasing a personal best and ' +
      'a group at the back walking the last stretch, and nobody is ever left behind.',
  },
  {
    title: 'Riverside Track Session', slug: 'riverside-track-session', calendar: 'riverside-run-club',
    capacity: 2, state: 'published', approval_required: false, waitlist_enabled: true,
    theme_hex: '#3cbd2c', time_zone: 'Europe/Berlin', dayOffset: 9, hour: 18, durationHours: 2,
    description:
      'Intervals on the old cinder track. Bring a watch and something warm for afterwards. ' +
      'We run eight repetitions of four hundred metres with a slow lap between each.',
  },
  {
    title: 'Sunrise Long Run', slug: 'sunrise-long-run', calendar: 'riverside-run-club',
    capacity: 20, state: 'published', approval_required: true, waitlist_enabled: true,
    theme_hex: '#d69712', time_zone: 'Europe/Berlin', dayOffset: 10, hour: 9, durationHours: 3,
    description:
      'Sixteen kilometres out along the water while the city is still asleep, coffee at the end. ' +
      'The host approves each request so the group stays the size the route can carry.',
  },
  {
    title: 'Harbour Loop Recovery Jog', slug: 'harbour-loop-recovery-jog', calendar: 'riverside-run-club',
    capacity: 12, state: 'draft', approval_required: false, waitlist_enabled: false,
    theme_hex: '#007aff', time_zone: 'Europe/Berlin', dayOffset: 11, hour: 10, durationHours: 1,
    description: 'An easy loop of the harbour at conversation pace, the day after a hard session.',
  },
  {
    title: 'Winter Reading Night', slug: 'winter-reading-night', calendar: 'northside-reading-nights',
    capacity: 12, state: 'published', approval_required: false, waitlist_enabled: false,
    theme_hex: '#ab46dd', time_zone: 'Europe/Lisbon', dayOffset: 12, hour: 20, durationHours: 2,
    description:
      'Bring the book you are in the middle of and read beside other people for two hours. ' +
      'There is tea, one long table, and a rule against talking until the last half hour.',
  },
  {
    title: 'Autumn Book Swap', slug: 'autumn-book-swap', calendar: 'northside-reading-nights',
    capacity: 20, state: 'cancelled', approval_required: false, waitlist_enabled: false,
    theme_hex: '#f31a7c', time_zone: 'Europe/Lisbon', dayOffset: 13, hour: 18, durationHours: 2,
    description: 'Bring three books you have finished and leave with three you have not.',
    cancel_reason: 'The venue lost its lease.',
  },
  {
    title: 'Riverside Winter Time Trial', slug: 'riverside-winter-time-trial', calendar: 'riverside-run-club',
    capacity: 8, state: 'registration_closed', approval_required: false, waitlist_enabled: false,
    theme_hex: '#28cd41', time_zone: 'Europe/Berlin', dayOffset: 14, hour: 11, durationHours: 2,
    description:
      'A measured five kilometres against the clock, run in pairs. Registration for this one ' +
      'has closed while the club confirms marshals for the corners.',
  },
];

function seedDate(dayOffset: number, hour: number): Date {
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  const d = new Date(base.getTime() + dayOffset * 86400000);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

async function accountId(c: pg.PoolClient, email: string): Promise<number> {
  const r = await c.query('SELECT id FROM accounts WHERE email = $1', [email]);
  return r.rows[0].id as number;
}

/**
 * Idempotent: every statement is an upsert or is guarded by an existence
 * check, so restarting the app never duplicates a row.
 */
export async function seed(): Promise<void> {
  await tx(async (c) => {
    const passwordHash = hashPassword(env.seedPassword);

    for (const a of ACCOUNTS) {
      await c.query(
        `INSERT INTO accounts (email, password_hash, display_name, handle, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO UPDATE
           SET display_name = EXCLUDED.display_name, role = EXCLUDED.role`,
        [a.email, passwordHash, a.display_name, a.handle, a.role],
      );
    }

    for (const cal of CALENDARS) {
      const owner = await accountId(c, cal.owner);
      await c.query(
        `INSERT INTO calendars (owner_account_id, name, slug, category, city, is_public)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (slug) DO UPDATE
           SET name = EXCLUDED.name, category = EXCLUDED.category,
               city = EXCLUDED.city, is_public = EXCLUDED.is_public`,
        [owner, cal.name, cal.slug, cal.category, cal.city, cal.is_public],
      );
    }

    for (const e of EVENTS) {
      const cal = await c.query('SELECT id, category, city FROM calendars WHERE slug = $1', [e.calendar]);
      const calRow = cal.rows[0];
      const startsAt = seedDate(e.dayOffset, e.hour);
      const endsAt = new Date(startsAt.getTime() + e.durationHours * 3600000);
      const existing = await c.query('SELECT id FROM events WHERE slug = $1', [e.slug]);
      if (existing.rowCount === 0) {
        await c.query(
          `INSERT INTO events (calendar_id, title, slug, category, city, time_zone, cover_seed,
                               theme_hex, description, starts_at, ends_at, capacity,
                               approval_required, waitlist_enabled, state, published_at,
                               cancelled_at, cancel_reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [
            calRow.id, e.title, e.slug, calRow.category, calRow.city, e.time_zone, e.slug,
            e.theme_hex, e.description, startsAt, endsAt, e.capacity,
            e.approval_required, e.waitlist_enabled, e.state,
            e.state === 'draft' ? null : new Date(),
            e.state === 'cancelled' ? new Date() : null,
            e.cancel_reason ?? null,
          ],
        );
      }
    }

    // ---- seeded registrations, each guarded so a restart adds nothing ----
    const evId = async (slug: string) => {
      const r = await c.query('SELECT id, capacity FROM events WHERE slug = $1', [slug]);
      return r.rows[0] as { id: number; capacity: number };
    };
    const hasAnyReg = async (eventId: number) => {
      const r = await c.query('SELECT 1 FROM registrations WHERE event_id = $1 LIMIT 1', [eventId]);
      return (r.rowCount ?? 0) > 0;
    };

    const t5k = await evId('thursday-night-5k');
    if (!(await hasAnyReg(t5k.id))) {
      const g1 = await accountId(c, 'guest@example.com');
      const g2 = await accountId(c, 'guest2@example.com');
      const g3 = await accountId(c, 'guest3@example.com');
      await c.query(
        `INSERT INTO registrations (event_id, account_id, status, seat_no, event_capacity, ticket_code)
         VALUES ($1,$2,'confirmed',1,$3,$4), ($1,$5,'confirmed',2,$3,$6)`,
        [t5k.id, g1, t5k.capacity, newTicketCode(), g2, newTicketCode()],
      );
      await c.query(
        `INSERT INTO registrations (event_id, account_id, status, waitlist_position)
         VALUES ($1,$2,'waitlisted',1)`,
        [t5k.id, g3],
      );
    }

    const track = await evId('riverside-track-session');
    if (!(await hasAnyReg(track.id))) {
      const g2 = await accountId(c, 'guest2@example.com');
      await c.query(
        `INSERT INTO registrations (event_id, account_id, status, seat_no, event_capacity, ticket_code)
         VALUES ($1,$2,'confirmed',1,$3,$4)`,
        [track.id, g2, track.capacity, newTicketCode()],
      );
    }

    const longRun = await evId('sunrise-long-run');
    if (!(await hasAnyReg(longRun.id))) {
      const g3 = await accountId(c, 'guest3@example.com');
      await c.query(
        `INSERT INTO registrations (event_id, account_id, status)
         VALUES ($1,$2,'pending_approval')`,
        [longRun.id, g3],
      );
    }
  });
  log('info', 'seed complete');
}

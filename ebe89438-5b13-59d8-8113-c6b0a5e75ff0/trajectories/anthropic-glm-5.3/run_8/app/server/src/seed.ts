import type { PoolClient } from 'pg';
import { hashPassword, shortId, newTicketCode } from './config.js';
import { log } from './config.js';

export const SEED_PASSWORD = 'deku-demo-pw-2026';

/** Events start at least seven days after the seed date, each on the hour 09:00-20:00 UTC. */
function seedDates(now = new Date()): { starts: Date[] } {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const base = new Date(day.getTime() + 8 * 24 * 3600 * 1000); // comfortably more than seven days out
  const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  const starts = hours.map((h) => new Date(base.getTime() + h * 3600 * 1000));
  return { starts };
}

interface SeedEvent {
  slug: string;
  calendar: string;
  title: string;
  capacity: number;
  state: 'draft' | 'published' | 'registration_closed' | 'cancelled';
  approval: boolean;
  waitlist: boolean;
  theme: string;
  zone: string;
  description: string;
  city: string;
  category: string;
  start: Date;
  hour: number;
  cancel_reason?: string;
  published: boolean;
}

export async function runSeed(tx: PoolClient): Promise<void> {
  const { starts } = seedDates();

  const accounts: Array<[string, string, string, string, 'host' | 'guest']> = [
    ['host@example.com', 'Priya Raman', 'priya-raman', 'accth01', 'host'],
    ['host2@example.com', 'Marcus Bell', 'marcus-bell', 'accth02', 'host'],
    ['guest@example.com', 'Amina Osei', 'amina-osei', 'acctg01', 'guest'],
    ['guest2@example.com', 'Tomas Vidal', 'tomas-vidal', 'acctg02', 'guest'],
    ['guest3@example.com', 'Ines Duarte', 'ines-duarte', 'acctg03', 'guest'],
  ];
  for (const [email, name, handle, id, role] of accounts) {
    await tx.query(
      `INSERT INTO accounts (id, email, password_hash, display_name, handle, role, created_at)
       VALUES ($1,$2,$3,$4,$5,$6, now())
       ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, handle = EXCLUDED.handle, role = EXCLUDED.role`,
      [id, email, hashPassword(SEED_PASSWORD), name, handle, role],
    );
  }
  // A handle that has since been taken by another account is left alone.
  await tx.query(
    `UPDATE accounts a SET handle = v.handle
       FROM (VALUES ('host@example.com','priya-raman'), ('host2@example.com','marcus-bell'),
                    ('guest@example.com','amina-osei'), ('guest2@example.com','tomas-vidal'),
                    ('guest3@example.com','ines-duarte')) AS v(email, handle)
      WHERE a.email = v.email
        AND NOT EXISTS (SELECT 1 FROM accounts b WHERE b.handle = v.handle AND b.email <> v.email)`,
  );

  const calendars: Array<[string, string, string, string, string, string, boolean]> = [
    ['calriverside', 'host@example.com', 'Riverside Run Club', 'riverside-run-club', 'running', 'Berlin', true],
    ['calnorthside', 'host2@example.com', 'Northside Reading Nights', 'northside-reading-nights', 'books', 'Lisbon', false],
  ];
  for (const [id, owner, name, slug, category, city, isPublic] of calendars) {
    await tx.query(
      `INSERT INTO calendars (id, owner_account_id, name, slug, category, city, is_public, created_at)
       VALUES ($1, (SELECT id FROM accounts WHERE email=$2), $3,$4,$5,$6,$7, now())
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, owner_account_id = EXCLUDED.owner_account_id,
         category = EXCLUDED.category, city = EXCLUDED.city, is_public = EXCLUDED.is_public`,
      [id, owner, name, slug, category, city, isPublic],
    );
  }

  interface Def {
    slug: string; calendar: string; title: string; capacity: number;
    state: 'draft' | 'published' | 'registration_closed' | 'cancelled';
    approval: boolean; waitlist: boolean; theme: string; zone: string;
    description: string; city: string; category: string;
    cancel_reason?: string; published: boolean;
  }
  const defs: Def[] = [
    { slug: 'thursday-night-5k', calendar: 'riverside-run-club', title: 'Thursday Night 5K', capacity: 3, state: 'published', approval: false, waitlist: true, theme: '#146aeb', zone: 'Europe/Berlin', city: 'Berlin', category: 'running', description: 'An easy 5K along the river after work, all paces welcome, with a slow lap to finish and something warm to drink at the boathouse.', published: true },
    { slug: 'riverside-track-session', calendar: 'riverside-run-club', title: 'Riverside Track Session', capacity: 2, state: 'published', approval: false, waitlist: true, theme: '#3cbd2c', zone: 'Europe/Berlin', city: 'Berlin', category: 'running', description: 'Six by four hundred metres on the old track by the weir. Lanes assigned on the night, spikes optional, encouragement mandatory.', published: true },
    { slug: 'sunrise-long-run', calendar: 'riverside-run-club', title: 'Sunrise Long Run', capacity: 20, state: 'published', approval: true, waitlist: true, theme: '#d69712', zone: 'Europe/Berlin', city: 'Berlin', category: 'running', description: 'Ninety minutes out along the canal while the city wakes up. We meet on the bridge, we finish at the bakery.', published: true },
    { slug: 'harbour-loop-recovery-jog', calendar: 'riverside-run-club', title: 'Harbour Loop Recovery Jog', capacity: 12, state: 'draft', approval: false, waitlist: false, theme: '#007aff', zone: 'Europe/Berlin', city: 'Berlin', category: 'running', description: 'A conversational loop of the harbour on the flattest path in the city. Bring a friend who says they are not a runner.', published: false },
    { slug: 'winter-reading-night', calendar: 'northside-reading-nights', title: 'Winter Reading Night', capacity: 12, state: 'published', approval: false, waitlist: false, theme: '#ab46dd', zone: 'Europe/Lisbon', city: 'Lisbon', category: 'books', description: 'One room, one lamp each, and whatever you are reading aloud tonight. Tea provided, opinions optional.', published: true },
    { slug: 'autumn-book-swap', calendar: 'northside-reading-nights', title: 'Autumn Book Swap', capacity: 20, state: 'cancelled', approval: false, waitlist: false, theme: '#f31a7c', zone: 'Europe/Lisbon', city: 'Lisbon', category: 'books', description: 'Bring three books you can part with and leave with three you cannot. Tables by genre, coffee by donation.', published: true, cancel_reason: 'The venue lost its lease.' },
    { slug: 'riverside-winter-time-trial', calendar: 'riverside-run-club', title: 'Riverside Winter Time Trial', capacity: 8, state: 'registration_closed', approval: false, waitlist: false, theme: '#28cd41', zone: 'Europe/Berlin', city: 'Berlin', category: 'running', description: 'One mile, one watch, one long breath at the end. Times read out at the finish line and written on the board.', published: true },
  ];
  const startFor = (slug: string): Date => {
    const idx = defs.findIndex((d) => d.slug === slug);
    return starts[idx % starts.length];
  };

  for (const d of defs) {
    const start = startFor(d.slug);
    const end = new Date(start.getTime() + 2 * 3600 * 1000);
    await tx.query(
      `INSERT INTO events (id, calendar_id, title, slug, category, city, time_zone, cover_seed, theme_hex, description,
          starts_at, ends_at, capacity, approval_required, waitlist_enabled, state, published_at, cancelled_at, cancel_reason, created_at, updated_at)
       VALUES ($1,(SELECT id FROM calendars WHERE slug=$2),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, now(), now())
       ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, capacity = EXCLUDED.capacity, state = EXCLUDED.state,
         approval_required = EXCLUDED.approval_required, waitlist_enabled = EXCLUDED.waitlist_enabled,
         theme_hex = EXCLUDED.theme_hex, time_zone = EXCLUDED.time_zone, description = EXCLUDED.description,
         starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, category = EXCLUDED.category, city = EXCLUDED.city,
         published_at = EXCLUDED.published_at, cancelled_at = EXCLUDED.cancelled_at, cancel_reason = EXCLUDED.cancel_reason`,
      [shortId(16), d.calendar, d.title, d.slug, d.category, d.city, d.zone, `seed-${d.slug}`, d.theme, d.description,
       start.toISOString(), end.toISOString(), d.capacity, d.approval, d.waitlist, d.state,
       d.published ? new Date(Date.now() - 3600_000).toISOString() : null, d.state === 'cancelled' ? start.toISOString() : null, d.cancel_reason ?? null],
    );
  }

  await seedRegistrations(tx);
  log('seed_complete', {});
}

async function seedRegistrations(tx: PoolClient): Promise<void> {
  // The seed owns the registrations on its own seven events, so it resets them
  // wholesale: this keeps a restart idempotent on a database that has drifted.
  await tx.query(
    `DELETE FROM registrations WHERE event_id IN (SELECT id FROM events WHERE slug = ANY($1::text[]))`,
    [[
      'thursday-night-5k', 'riverside-track-session', 'sunrise-long-run',
      'harbour-loop-recovery-jog', 'winter-reading-night', 'autumn-book-swap',
      'riverside-winter-time-trial',
    ]],
  );
  const rows: Array<[string, string, string, number | null]> = [
    // Thursday Night 5K: two confirmed, one waiting at position 1 -> exactly one free seat.
    ['thursday-night-5k', 'guest@example.com', 'confirmed', null],
    ['thursday-night-5k', 'guest2@example.com', 'confirmed', null],
    ['thursday-night-5k', 'guest3@example.com', 'waitlisted', 1],
    // Riverside Track Session: one confirmed -> exactly one free seat.
    ['riverside-track-session', 'guest2@example.com', 'confirmed', null],
    // Sunrise Long Run: one pending approval.
    ['sunrise-long-run', 'guest3@example.com', 'pending_approval', null],
  ];
  for (const [slug, email, status, position] of rows) {
    const ticket = status === 'confirmed' ? newTicketCode() : null;
    await tx.query(
      `DELETE FROM registrations
        WHERE event_id = (SELECT id FROM events WHERE slug = $1)
          AND account_id = (SELECT id FROM accounts WHERE email = $2)`,
      [slug, email],
    );
    await tx.query(
      `INSERT INTO registrations (id, event_id, account_id, status, waitlist_position, ticket_code, created_at, updated_at)
       VALUES ($1, (SELECT id FROM events WHERE slug=$2), (SELECT id FROM accounts WHERE email=$3), $4, $5, $6, now(), now())
       ON CONFLICT (event_id, account_id) DO UPDATE SET status = EXCLUDED.status,
         waitlist_position = EXCLUDED.waitlist_position, ticket_code = EXCLUDED.ticket_code`,
      [shortId(16), slug, email, status, position, ticket],
    );
  }
}

import { PoolClient } from 'pg';
import { hashPassword } from './password.js';
import { themeHexFromSeed } from './constants.js';
import { log } from './log.js';

export const SEED_PASSWORD = 'deku-demo-pw-2026';

/**
 * Seeding is idempotent: every insert is keyed on a natural unique key, so
 * restarting the app re-runs this and changes nothing.
 */
export async function seed(db: PoolClient): Promise<void> {
  const pw = hashPassword(SEED_PASSWORD);

  const accounts: Array<[string, string, string, string]> = [
    ['host@example.com', 'Priya Raman', 'priya-raman', 'host'],
    ['host2@example.com', 'Marcus Bell', 'marcus-bell', 'host'],
    ['guest@example.com', 'Amina Osei', 'amina-osei', 'guest'],
    ['guest2@example.com', 'Tomas Vidal', 'tomas-vidal', 'guest'],
    ['guest3@example.com', 'Ines Duarte', 'ines-duarte', 'guest'],
  ];
  const ids: Record<string, string> = {};
  for (const [email, name, handle, role] of accounts) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO accounts (email, password_hash, display_name, handle, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name,
         handle = EXCLUDED.handle, role = EXCLUDED.role
       RETURNING id`,
      [email, pw, name, handle, role],
    );
    ids[email] = rows[0].id;
  }

  const calendars: Array<[string, string, string, string, string, boolean, string]> = [
    ['riverside-run-club', 'Riverside Run Club', ids['host@example.com'], 'running', 'Berlin', true, 'riverside-run-club'],
    ['northside-reading-nights', 'Northside Reading Nights', ids['host2@example.com'], 'books', 'Lisbon', false, 'northside-reading-nights'],
  ];
  const cal: Record<string, string> = {};
  for (const [slug, name, owner, category, city, isPublic, seedKey] of calendars) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO calendars (slug, name, owner_account_id, category, city, is_public)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, owner_account_id = EXCLUDED.owner_account_id,
         category = EXCLUDED.category, city = EXCLUDED.city, is_public = EXCLUDED.is_public
       RETURNING id`,
      [slug, name, owner, category, city, isPublic],
    );
    cal[slug] = rows[0].id;
    void seedKey;
  }

  const now = Date.now();
  const day = 86400000;
  // At least seven days after the seed date, starting on the hour.
  const base = new Date(now + 8 * day);
  base.setUTCHours(0, 0, 0, 0);

  const events: Array<Record<string, unknown>> = [
    { title: 'Thursday Night 5K', slug: 'thursday-night-5k', calendar: 'riverside-run-club', capacity: 3, state: 'published', approval: false, waitlist: true, theme: '#146aeb', tz: 'Europe/Berlin', hour: 18, blurb: 'An easy 5K along the canal, all paces welcome, one regroup at the halfway bridge.' },
    { title: 'Riverside Track Session', slug: 'riverside-track-session', calendar: 'riverside-run-club', capacity: 2, state: 'published', approval: false, waitlist: true, theme: '#3cbd2c', tz: 'Europe/Berlin', hour: 19, blurb: 'Six by 800m on the riverside track with honest pacing and a long warm-down.' },
    { title: 'Sunrise Long Run', slug: 'sunrise-long-run', calendar: 'riverside-run-club', capacity: 20, state: 'published', approval: true, waitlist: true, theme: '#d69712', tz: 'Europe/Berlin', hour: 9, blurb: 'Twenty-two kilometres before the city wakes, with coffee at the end for everyone who finishes.' },
    { title: 'Harbour Loop Recovery Jog', slug: 'harbour-loop-recovery-jog', calendar: 'riverside-run-club', capacity: 12, state: 'draft', approval: false, waitlist: false, theme: '#007aff', tz: 'Europe/Berlin', hour: 10, blurb: 'A very slow loop of the harbour, conversation pace and a stop for pastries.' },
    { title: 'Winter Reading Night', slug: 'winter-reading-night', calendar: 'northside-reading-nights', capacity: 12, state: 'published', approval: false, waitlist: false, theme: '#ab46dd', tz: 'Europe/Lisbon', hour: 20, blurb: 'Bring one short piece you love and read it aloud, or just listen with the rest of the room.' },
    { title: 'Autumn Book Swap', slug: 'autumn-book-swap', calendar: 'northside-reading-nights', capacity: 20, state: 'cancelled', approval: false, waitlist: false, theme: '#f31a7c', tz: 'Europe/Lisbon', hour: 11, blurb: 'Bring up to five books you are ready to part with and leave with five you are not.' },
    { title: 'Riverside Winter Time Trial', slug: 'riverside-winter-time-trial', calendar: 'riverside-run-club', capacity: 8, state: 'registration_closed', approval: false, waitlist: false, theme: '#28cd41', tz: 'Europe/Berlin', hour: 12, blurb: 'A timed 5K against yourself, held on the first dry Saturday of the winter block.' },
  ];

  const offsetFor = (index: number) => new Date(base.getTime() + (index + 1) * day + 0);

  const evIds: Record<string, string> = {};
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const start = offsetFor(i);
    start.setUTCHours(9 + i, 0, 0, 0);
    const end = new Date(start.getTime() + 2 * 3600000);
    const seedStr = String(e.slug);
    const theme = (e.theme as string) || themeHexFromSeed(seedStr);
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO events (calendar_id, title, slug, category, city, time_zone, cover_seed, theme_hex,
                           description, starts_at, ends_at, capacity, approval_required, waitlist_enabled,
                           state, published_at, cancelled_at, cancel_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (slug) DO UPDATE SET
         calendar_id = EXCLUDED.calendar_id, title = EXCLUDED.title, category = EXCLUDED.category,
         city = EXCLUDED.city, time_zone = EXCLUDED.time_zone, cover_seed = EXCLUDED.cover_seed,
         theme_hex = EXCLUDED.theme_hex, description = EXCLUDED.description,
         starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, capacity = EXCLUDED.capacity,
         approval_required = EXCLUDED.approval_required, waitlist_enabled = EXCLUDED.waitlist_enabled,
         state = EXCLUDED.state, published_at = EXCLUDED.published_at,
         cancelled_at = EXCLUDED.cancelled_at, cancel_reason = EXCLUDED.cancel_reason
       RETURNING id`,
      [
        cal[e.calendar as string], e.title, e.slug, 'running', e.city ?? 'Berlin',
        e.tz, seedStr, theme, e.blurb, start, end, e.capacity, e.approval, e.waitlist,
        e.state,
        e.state === 'draft' ? null : start,
        e.state === 'cancelled' ? start : null,
        e.state === 'cancelled' ? 'The venue lost its lease.' : null,
      ],
    );
    evIds[e.slug as string] = rows[0].id;
  }

  const regRows: Array<[string, string, string]> = [
    ['thursday-night-5k', 'guest@example.com', 'confirmed'],
    ['thursday-night-5k', 'guest2@example.com', 'confirmed'],
    ['thursday-night-5k', 'guest3@example.com', 'waitlisted'],
    ['riverside-track-session', 'guest2@example.com', 'confirmed'],
    ['sunrise-long-run', 'guest3@example.com', 'pending_approval'],
  ];

  for (const [slug, email, status] of regRows) {
    const code = status === 'confirmed' ? 'TKT-' + codeFor(slug, email) : null;
    await db.query(
      `INSERT INTO registrations (event_id, account_id, status, ticket_code, waitlist_position)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (event_id, account_id) DO NOTHING`,
      [
        evIds[slug], ids[email], status, code,
        status === 'waitlisted' ? 1 : null,
      ],
    );
  }

  // The waiting-list position is owned by the database: keep the seed tidy.
  await db.query(`UPDATE registrations SET waitlist_position = NULL WHERE status <> 'waitlisted'`);

  log.info('seed_complete', { accounts: accounts.length, calendars: 2, events: events.length });
}

function codeFor(slug: string, email: string): string {
  let h = 0;
  const s = slug + '|' + email;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += alphabet[(h >>> (i * 3)) % alphabet.length];
  }
  return out;
}

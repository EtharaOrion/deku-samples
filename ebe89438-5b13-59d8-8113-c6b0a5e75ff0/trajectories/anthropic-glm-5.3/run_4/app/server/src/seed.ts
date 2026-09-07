import type { Pool } from 'pg';
import { query } from './db.js';
import { hashPassword, log } from './util.js';

const PASSWORD = 'deku-demo-pw-2026';

type SeedAccount = {
  id: string; email: string; display_name: string; handle: string;
  role: 'host' | 'guest';
};

const ACCOUNTS: SeedAccount[] = [
  { id: 'acc_priya', email: 'host@example.com', display_name: 'Priya Raman', handle: 'priya-raman', role: 'host' },
  { id: 'acc_marcus', email: 'host2@example.com', display_name: 'Marcus Bell', handle: 'marcus-bell', role: 'host' },
  { id: 'acc_amina', email: 'guest@example.com', display_name: 'Amina Osei', handle: 'amina-osei', role: 'guest' },
  { id: 'acc_tomas', email: 'guest2@example.com', display_name: 'Tomas Vidal', handle: 'tomas-vidal', role: 'guest' },
  { id: 'acc_ines', email: 'guest3@example.com', display_name: 'Ines Duarte', handle: 'ines-duarte', role: 'guest' },
];

type SeedCalendar = {
  id: string; owner: string; name: string; slug: string;
  category: string; city: string; is_public: boolean;
};

const CALENDARS: SeedCalendar[] = [
  { id: 'cal_riverside', owner: 'acc_priya', name: 'Riverside Run Club', slug: 'riverside-run-club', category: 'running', city: 'Berlin', is_public: true },
  { id: 'cal_northside', owner: 'acc_marcus', name: 'Northside Reading Nights', slug: 'northside-reading-nights', category: 'books', city: 'Lisbon', is_public: false },
];

/** Events run on the hour, 09:00..20:00 UTC, at least seven days after the seed date. */
function eventDay(dayOffset: number, hourUtc: number): Date {
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  const d = new Date(base.getTime() + (7 + dayOffset) * 86400000);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}

type SeedEvent = {
  id: string; calendar: string; title: string; slug: string; capacity: number;
  state: 'draft' | 'published' | 'registration_closed' | 'cancelled';
  approval: boolean; waitlist: boolean; theme_hex: string; time_zone: string;
  cover_seed: string; city: string; category: string; description: string;
  dayOffset: number; hourUtc: number; durationHours: number;
  cancel_reason?: string;
};

const EVENTS: SeedEvent[] = [
  {
    id: 'evt_thursday5k', calendar: 'cal_riverside', title: 'Thursday Night 5K', slug: 'thursday-night-5k',
    capacity: 3, state: 'published', approval: false, waitlist: true, theme_hex: '#146aeb',
    time_zone: 'Europe/Berlin', cover_seed: 'thursday-night-5k', city: 'Berlin', category: 'running',
    description: 'An easy 5 kilometres along the river after work. All paces welcome, we regroup at every bridge and finish with a stretch on the bank.',
    dayOffset: 0, hourUtc: 17, durationHours: 2,
  },
  {
    id: 'evt_track_session', calendar: 'cal_riverside', title: 'Riverside Track Session', slug: 'riverside-track-session',
    capacity: 2, state: 'published', approval: false, waitlist: true, theme_hex: '#3cbd2c',
    time_zone: 'Europe/Berlin', cover_seed: 'riverside-track-session', city: 'Berlin', category: 'running',
    description: 'Six by eight hundred metres on the flat track by the river, with a warm-up loop and a long cool-down. Lanes are limited, so places are few.',
    dayOffset: 1, hourUtc: 18, durationHours: 2,
  },
  {
    id: 'evt_sunrise_run', calendar: 'cal_riverside', title: 'Sunrise Long Run', slug: 'sunrise-long-run',
    capacity: 20, state: 'published', approval: true, waitlist: true, theme_hex: '#d69712',
    time_zone: 'Europe/Berlin', cover_seed: 'sunrise-long-run', city: 'Berlin', category: 'running',
    description: 'A steady long run out of the city while the light comes up over the fields. Every request is read by the host before a place is offered.',
    dayOffset: 2, hourUtc: 9, durationHours: 3,
  },
  {
    id: 'evt_harbour_loop', calendar: 'cal_riverside', title: 'Harbour Loop Recovery Jog', slug: 'harbour-loop-recovery-jog',
    capacity: 12, state: 'draft', approval: false, waitlist: false, theme_hex: '#007aff',
    time_zone: 'Europe/Berlin', cover_seed: 'harbour-loop-recovery-jog', city: 'Berlin', category: 'running',
    description: 'A very easy loop of the old harbour basin, mostly flat, mostly chatting. Bring a friend and a coffee for after.',
    dayOffset: 3, hourUtc: 9, durationHours: 1,
  },
  {
    id: 'evt_winter_reading', calendar: 'cal_northside', title: 'Winter Reading Night', slug: 'winter-reading-night',
    capacity: 12, state: 'published', approval: false, waitlist: false, theme_hex: '#ab46dd',
    time_zone: 'Europe/Lisbon', cover_seed: 'winter-reading-night', city: 'Lisbon', category: 'books',
    description: 'One evening, three readers, a short novel read aloud by lamplight. Chairs are few and the room is warm, so arrive early and settle in.',
    dayOffset: 4, hourUtc: 20, durationHours: 2,
  },
  {
    id: 'evt_autumn_swap', calendar: 'cal_northside', title: 'Autumn Book Swap', slug: 'autumn-book-swap',
    capacity: 20, state: 'cancelled', approval: false, waitlist: false, theme_hex: '#f31a7c',
    time_zone: 'Europe/Lisbon', cover_seed: 'autumn-book-swap', city: 'Lisbon', category: 'books',
    description: 'Bring a book you loved and leave with one you have never met. Tables by genre, tea by the pot, no money at all.',
    dayOffset: 5, hourUtc: 19, durationHours: 3,
    cancel_reason: 'The venue lost its lease.',
  },
  {
    id: 'evt_time_trial', calendar: 'cal_riverside', title: 'Riverside Winter Time Trial', slug: 'riverside-winter-time-trial',
    capacity: 8, state: 'registration_closed', approval: false, waitlist: false, theme_hex: '#28cd41',
    time_zone: 'Europe/Berlin', cover_seed: 'riverside-winter-time-trial', city: 'Berlin', category: 'running',
    description: 'A monthly timed 5K on the riverside path. The list is set for this month and registration is closed until the next one opens.',
    dayOffset: 6, hourUtc: 10, durationHours: 2,
  },
];

const COVER_SEED_THEMES: Record<string, string> = {};
for (const e of EVENTS) COVER_SEED_THEMES[e.cover_seed] = e.theme_hex;

function ticketCode(seed: string): string {
  // Deterministic but opaque-looking: 8 chars from a base-33 alphabet.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += alphabet[(h >>> (i % 4 * 8)) % alphabet.length];
    h = Math.imul(h, 48611) + 11;
  }
  return `TKT-${out}`;
}

type SeedReg = {
  event: string; account: string; status: string;
  waitlist_position?: number;
};

const REGISTRATIONS: SeedReg[] = [
  { event: 'evt_thursday5k', account: 'acc_amina', status: 'confirmed' },
  { event: 'evt_thursday5k', account: 'acc_tomas', status: 'confirmed' },
  { event: 'evt_thursday5k', account: 'acc_ines', status: 'waitlisted', waitlist_position: 1 },
  { event: 'evt_track_session', account: 'acc_tomas', status: 'confirmed' },
  { event: 'evt_sunrise_run', account: 'acc_ines', status: 'pending_approval' },
];

export async function seed(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const pwHash = hashPassword(PASSWORD);

    for (const a of ACCOUNTS) {
      await client.query(
        `insert into accounts (id, email, password_hash, display_name, handle, role)
         values ($1,$2,$3,$4,$5,$6)
         on conflict (id) do update set email = excluded.email, display_name = excluded.display_name,
           handle = excluded.handle, role = excluded.role, password_hash = excluded.password_hash`,
        [a.id, a.email, pwHash, a.display_name, a.handle, a.role],
      );
    }

    for (const cal of CALENDARS) {
      await client.query(
        `insert into calendars (id, owner_account_id, name, slug, category, city, is_public)
         values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (id) do update set owner_account_id = excluded.owner_account_id, name = excluded.name,
           slug = excluded.slug, category = excluded.category, city = excluded.city, is_public = excluded.is_public`,
        [cal.id, cal.owner, cal.name, cal.slug, cal.category, cal.city, cal.is_public],
      );
    }

    const seededAt = new Date(Date.now() - 86400000);
    for (const e of EVENTS) {
      const starts = eventDay(e.dayOffset, e.hourUtc);
      const ends = new Date(starts.getTime() + e.durationHours * 3600000);
      await client.query(
        `insert into events (id, calendar_id, title, slug, category, city, time_zone, cover_seed, theme_hex,
            description, starts_at, ends_at, capacity, approval_required, waitlist_enabled, state,
            published_at, cancelled_at, cancel_reason)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         on conflict (id) do update set calendar_id = excluded.calendar_id, title = excluded.title,
           slug = excluded.slug, category = excluded.category, city = excluded.city,
           time_zone = excluded.time_zone, cover_seed = excluded.cover_seed, theme_hex = excluded.theme_hex,
           description = excluded.description, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
           capacity = excluded.capacity, approval_required = excluded.approval_required,
           waitlist_enabled = excluded.waitlist_enabled, state = excluded.state,
           published_at = excluded.published_at, cancelled_at = excluded.cancelled_at,
           cancel_reason = excluded.cancel_reason`,
        [
          e.id, e.calendar, e.title, e.slug, e.category, e.city, e.time_zone, e.cover_seed, e.theme_hex,
          e.description, starts, ends, e.capacity, e.approval, e.waitlist, e.state,
          e.state === 'draft' ? null : seededAt,
          e.state === 'cancelled' ? seededAt : null,
          e.cancel_reason ?? null,
        ],
      );
    }

    // Registrations are only inserted when absent so a restart never duplicates or overwrites live state.
    for (const r of REGISTRATIONS) {
      await client.query(
        `insert into registrations (id, event_id, account_id, status, waitlist_position, ticket_code)
         values ($1,$2,$3,$4,$5,$6)
         on conflict (event_id, account_id) do nothing`,
        [
          `reg_${r.event}_${r.account}`, r.event, r.account, r.status,
          r.waitlist_position ?? null,
          r.status === 'confirmed' ? ticketCode(`${r.event}:${r.account}`) : null,
        ],
      );
    }

    await client.query('commit');
    log({ level: 'info', msg: 'seed complete', accounts: ACCOUNTS.length, calendars: CALENDARS.length, events: EVENTS.length });
  } catch (err) {
    await client.query('rollback');
    log({ level: 'error', msg: 'seed failed', error: String(err) });
    throw err;
  } finally {
    client.release();
  }
}

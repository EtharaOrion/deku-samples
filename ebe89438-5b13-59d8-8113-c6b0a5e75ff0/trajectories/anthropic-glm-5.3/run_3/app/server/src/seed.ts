import pg from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { logger } from './log.ts';
import { hashPassword } from './auth.ts';

const here = dirname(fileURLToPath(import.meta.url));

export const CATEGORIES = [
  'family', 'books', 'games', 'tech', 'food-and-drink', 'ai', 'running',
  'arts-and-culture', 'climate', 'fitness', 'wellness', 'crypto',
] as const;

export const RESERVED_PATHS = [
  'api', 'app', 'login', 'signup', 'home', 'calendars', 'create',
  'discover', 'settings', 'event', 't',
] as const;

export const SEED_PASSWORD = 'deku-demo-pw-2026';

export async function migrate(client: pg.Client | pg.PoolClient): Promise<void> {
  const sql = readFileSync(join(here, 'schema.sql'), 'utf8');
  await client.query(sql);
}

/** Seed day i: on the hour, at least seven days after the seed date. */
function seedDay(i: number): Date {
  const d = new Date();
  d.setUTCHours(9 + i, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 7 + i);
  return d;
}

type SeedEvent = {
  cal: number; title: string; slug: string; category: string; city: string;
  tz: string; theme: string; cap: number; appr: boolean; wait: boolean;
  state: string; desc: string; reason?: string;
};

/** Idempotent: every insert is guarded, so a restart adds no rows. */
export async function seed(client: pg.Client | pg.PoolClient): Promise<void> {
  await client.query('begin');
  try {
    const now = new Date().toISOString();
    const q = (sql: string, params: any[] = []) => client.query(sql, params);

    const accounts = [
      { email: 'host@example.com', display_name: 'Priya Raman', handle: 'priya-raman', role: 'host' },
      { email: 'host2@example.com', display_name: 'Marcus Bell', handle: 'marcus-bell', role: 'host' },
      { email: 'guest@example.com', display_name: 'Amina Osei', handle: 'amina-osei', role: 'guest' },
      { email: 'guest2@example.com', display_name: 'Tomas Vidal', handle: 'tomas-vidal', role: 'guest' },
      { email: 'guest3@example.com', display_name: 'Ines Duarte', handle: 'ines-duarte', role: 'guest' },
    ];
    const pw = hashPassword(SEED_PASSWORD);
    for (const a of accounts) {
      await q(
        `insert into accounts (email, password_hash, display_name, handle, role)
         values ($1,$2,$3,$4,$5)
         on conflict (email) do update set
           display_name = excluded.display_name, handle = excluded.handle,
           role = excluded.role, password_hash = excluded.password_hash`,
        [a.email, pw, a.display_name, a.handle, a.role]
      );
    }

    const calendar = async (name: string, slug: string, ownerEmail: string, category: string, city: string, isPublic: boolean) => {
      await q(
        `insert into calendars (owner_account_id, name, slug, category, city, is_public)
         select a.id, $1, $2, $3, $4, $5 from accounts a where a.email = $6
         on conflict (slug) do update set
           name = excluded.name, category = excluded.category, city = excluded.city,
           is_public = excluded.is_public, owner_account_id = excluded.owner_account_id`,
        [name, slug, category, city, isPublic, ownerEmail]
      );
      const r = await q('select id from calendars where slug = $1', [slug]);
      return Number(r.rows[0].id);
    };
    const riverside = await calendar('Riverside Run Club', 'riverside-run-club', 'host@example.com', 'running', 'Berlin', true);
    const northside = await calendar('Northside Reading Nights', 'northside-reading-nights', 'host2@example.com', 'books', 'Lisbon', false);

    const events: SeedEvent[] = [
      { cal: riverside, title: 'Thursday Night 5K', slug: 'thursday-night-5k', category: 'running', city: 'Berlin', tz: 'Europe/Berlin', theme: '#146aeb', cap: 3, appr: false, wait: true, state: 'published',
        desc: 'A relaxed 5K along the river. All paces welcome; we regroup at every bridge.' },
      { cal: riverside, title: 'Riverside Track Session', slug: 'riverside-track-session', category: 'running', city: 'Berlin', tz: 'Europe/Berlin', theme: '#3cbd2c', cap: 2, appr: false, wait: true, state: 'published',
        desc: 'Interval session on the riverside track: six 800 metre repeats with equal recovery.' },
      { cal: riverside, title: 'Sunrise Long Run', slug: 'sunrise-long-run', category: 'running', city: 'Berlin', tz: 'Europe/Berlin', theme: '#d69712', cap: 20, appr: true, wait: true, state: 'published',
        desc: 'Long run out to the lake and back. Bring water; we stop at the halfway cafe.' },
      { cal: riverside, title: 'Harbour Loop Recovery Jog', slug: 'harbour-loop-recovery-jog', category: 'running', city: 'Berlin', tz: 'Europe/Berlin', theme: '#007aff', cap: 12, appr: false, wait: false, state: 'draft',
        desc: 'Easy recovery jog around the harbour loop. Conversation pace only.' },
      { cal: northside, title: 'Winter Reading Night', slug: 'winter-reading-night', category: 'books', city: 'Lisbon', tz: 'Europe/Lisbon', theme: '#ab46dd', cap: 12, appr: false, wait: false, state: 'published',
        desc: 'A cosy evening of reading aloud and hot drinks. Bring a book you love.' },
      { cal: northside, title: 'Autumn Book Swap', slug: 'autumn-book-swap', category: 'books', city: 'Lisbon', tz: 'Europe/Lisbon', theme: '#f31a7c', cap: 20, appr: false, wait: false, state: 'cancelled', reason: 'The venue lost its lease.',
        desc: 'Bring a book, take a book. Tables open from seven.' },
      { cal: riverside, title: 'Riverside Winter Time Trial', slug: 'riverside-winter-time-trial', category: 'running', city: 'Berlin', tz: 'Europe/Berlin', theme: '#28cd41', cap: 8, appr: false, wait: false, state: 'registration_closed',
        desc: 'Winter time trial over five miles. Chip timing, small field.' },
    ];

    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      const start = seedDay(i);
      const end = new Date(start.getTime() + 2 * 3600_000);
      await q(
        `insert into events (calendar_id, title, slug, category, city, time_zone, cover_seed, theme_hex,
                             description, starts_at, ends_at, capacity, approval_required, waitlist_enabled,
                             state, published_at, cancelled_at, cancel_reason)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         on conflict (slug) do update set
           calendar_id = excluded.calendar_id, title = excluded.title, category = excluded.category,
           city = excluded.city, time_zone = excluded.time_zone, cover_seed = excluded.cover_seed,
           theme_hex = excluded.theme_hex, description = excluded.description,
           starts_at = excluded.starts_at, ends_at = excluded.ends_at, capacity = excluded.capacity,
           approval_required = excluded.approval_required, waitlist_enabled = excluded.waitlist_enabled,
           state = excluded.state, published_at = excluded.published_at,
           cancelled_at = excluded.cancelled_at, cancel_reason = excluded.cancel_reason`,
        [e.cal, e.title, e.slug, e.category, e.city, e.tz, e.slug, e.theme, e.desc,
         start.toISOString(), end.toISOString(), e.cap, e.appr, e.wait, e.state,
         e.state === 'draft' ? null : now,
         e.state === 'cancelled' ? now : null,
         e.reason ?? null]
      );
    }

    const reg = async (eventSlug: string, email: string, status: string, pos: number | null, code: string | null) => {
      await q(
        `insert into registrations (event_id, account_id, status, waitlist_position, ticket_code)
         select e.id, a.id, $3, $4, $5 from events e, accounts a
          where e.slug = $1 and a.email = $2
            and not exists (select 1 from registrations x where x.event_id = e.id and x.account_id = a.id)`,
        [eventSlug, email, status, pos, code]
      );
    };
    await reg('thursday-night-5k', 'guest@example.com', 'confirmed', null, 'TKT-SEEDA01');
    await reg('thursday-night-5k', 'guest2@example.com', 'confirmed', null, 'TKT-SEEDA02');
    await reg('thursday-night-5k', 'guest3@example.com', 'waitlisted', 1, null);
    await reg('riverside-track-session', 'guest2@example.com', 'confirmed', null, 'TKT-SEEDB01');
    await reg('sunrise-long-run', 'guest3@example.com', 'pending_approval', null, null);

    await client.query('commit');
    logger.info('seed complete', { accounts: accounts.length, calendars: 2, events: events.length });
  } catch (e) {
    await client.query('rollback');
    throw e;
  }
}

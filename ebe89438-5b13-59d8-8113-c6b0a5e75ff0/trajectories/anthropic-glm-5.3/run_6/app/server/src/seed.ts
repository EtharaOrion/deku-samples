import type { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { CATEGORIES } from './constants.js';
import { hslToHex } from './slug.js';
import { newId, toRfc3339Utc } from './util.js';

const PW = 'deku-demo-pw-2026';

export async function seed(pg: Pool): Promise<void> {
  const c = await pg.connect();
  try {
    await c.query('BEGIN');
    const hash = await bcrypt.hash(PW, 10);
    const now = new Date();
    const mk = (hour: number, plusDays: number) => {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() + plusDays);
      d.setUTCHours(hour, 0, 0, 0);
      return d;
    };
    // seven seeded events, each on the hour between 09:00 and 20:00 UTC, at least eight days out
    const d09 = mk(9, 8);
    const d10 = mk(10, 10);
    const d11 = mk(11, 12);
    const d12 = mk(12, 14);
    const d13 = mk(13, 16);
    const d15 = mk(15, 18);
    const d20 = mk(20, 20);

    const accounts: Array<[string, string, string, string, string]> = [
      ['host@example.com', 'Priya Raman', 'priya-raman', 'host', hash],
      ['host2@example.com', 'Marcus Bell', 'marcus-bell', 'host', hash],
      ['guest@example.com', 'Amina Osei', 'amina-osei', 'guest', hash],
      ['guest2@example.com', 'Tomas Vidal', 'tomas-vidal', 'guest', hash],
      ['guest3@example.com', 'Ines Duarte', 'ines-duarte', 'guest', hash],
    ];
    const ids: Record<string, string> = {};
    for (const [email, name, handle, role, pwHash] of accounts) {
      const ex = await c.query('SELECT id FROM accounts WHERE email = $1', [email]);
      if (ex.rows[0]) { ids[email] = ex.rows[0].id; continue; }
      const id = newId('acc');
      await c.query(
        'INSERT INTO accounts (id, email, password_hash, display_name, handle, role, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [id, email, pwHash, name, handle, role, toRfc3339Utc(now)],
      );
      ids[email] = id;
    }

    const mkcal = async (name: string, slug: string, owner: string, category: string, city: string, isPublic: boolean) => {
      const ex = await c.query('SELECT id FROM calendars WHERE slug = $1', [slug]);
      if (ex.rows[0]) return ex.rows[0].id;
      const id = newId('cal');
      await c.query(
        'INSERT INTO calendars (id, owner_account_id, name, slug, category, city, is_public, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [id, ids[owner], name, slug, category, city, isPublic, toRfc3339Utc(now)],
      );
      return id;
    };
    const rrc = await mkcal('Riverside Run Club', 'riverside-run-club', 'host@example.com', 'running', 'Berlin', true);
    const nrn = await mkcal('Northside Reading Nights', 'northside-reading-nights', 'host2@example.com', 'books', 'Lisbon', false);

    const mkEvent = async (e: {
      title: string; slug: string; cal: string; cat: string; city: string; tz: string; starts: Date;
      capacity: number; state: string; approval: boolean; waitlist: boolean; theme: string; desc: string;
      reason?: string;
    }) => {
      const ex = await c.query('SELECT id FROM events WHERE slug = $1', [e.slug]);
      if (ex.rows[0]) return ex.rows[0].id;
      const id = newId('evt');
      await c.query(
        `INSERT INTO events (id, calendar_id, title, slug, category, city, time_zone, cover_seed, theme_hex, description,
          starts_at, ends_at, capacity, approval_required, waitlist_enabled, state, published_at, cancelled_at, cancel_reason, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
        [id, e.cal, e.title, e.slug, e.cat, e.city, e.tz, e.slug, e.theme, e.desc, toRfc3339Utc(e.starts),
         toRfc3339Utc(new Date(e.starts.getTime() + 2 * 3600 * 1000)), e.capacity, e.approval, e.waitlist, e.state,
         e.state === 'draft' ? null : toRfc3339Utc(now),
         e.state === 'cancelled' ? toRfc3339Utc(now) : null, e.reason ?? null,
         toRfc3339Utc(now), toRfc3339Utc(now)],
      );
      return id;
    };

    const tn5k = await mkEvent({
      title: 'Thursday Night 5K', slug: 'thursday-night-5k', cal: rrc, cat: 'running', city: 'Berlin', tz: 'Europe/Berlin',
      starts: d20, capacity: 3, state: 'published', approval: false, waitlist: true, theme: '#146aeb',
      desc: 'An easy evening five along the river. All paces welcome, we regroup at every kilometre and finish with a drink at the boathouse.',
    });
    const rts = await mkEvent({
      title: 'Riverside Track Session', slug: 'riverside-track-session', cal: rrc, cat: 'running', city: 'Berlin', tz: 'Europe/Berlin',
      starts: d10, capacity: 2, state: 'published', approval: false, waitlist: true, theme: '#3cbd2c',
      desc: 'Six by eight hundred metres on the old track by the water. Lanes are limited, so we hold a waiting list.',
    });
    const slr = await mkEvent({
      title: 'Sunrise Long Run', slug: 'sunrise-long-run', cal: rrc, cat: 'running', city: 'Berlin', tz: 'Europe/Berlin',
      starts: d09, capacity: 20, state: 'published', approval: true, waitlist: true, theme: '#d69712',
      desc: 'A slow twenty-four kilometres out along the canal as the light comes up. The host confirms each runner by hand.',
    });
    await mkEvent({
      title: 'Harbour Loop Recovery Jog', slug: 'harbour-loop-recovery-jog', cal: rrc, cat: 'running', city: 'Berlin', tz: 'Europe/Berlin',
      starts: d11, capacity: 12, state: 'draft', approval: false, waitlist: false, theme: '#007aff',
      desc: 'A gentle loop of the harbour on tired legs, stopping for coffee halfway.',
    });
    const wrn = await mkEvent({
      title: 'Winter Reading Night', slug: 'winter-reading-night', cal: nrn, cat: 'books', city: 'Lisbon', tz: 'Europe/Lisbon',
      starts: d12, capacity: 12, state: 'published', approval: false, waitlist: false, theme: '#ab46dd',
      desc: 'One evening, one short book, one warm room. Bring the book you finished this month and a paragraph you would read aloud.',
    });
    await mkEvent({
      title: 'Autumn Book Swap', slug: 'autumn-book-swap', cal: nrn, cat: 'books', city: 'Lisbon', tz: 'Europe/Lisbon',
      starts: d13, capacity: 20, state: 'cancelled', approval: false, waitlist: false, theme: '#f31a7c',
      desc: 'Bring three books, take three books. Tea and cake in the middle of the table.', reason: 'The venue lost its lease.',
    });
    await mkEvent({
      title: 'Riverside Winter Time Trial', slug: 'riverside-winter-time-trial', cal: rrc, cat: 'running', city: 'Berlin', tz: 'Europe/Berlin',
      starts: d15, capacity: 8, state: 'registration_closed', approval: false, waitlist: false, theme: '#28cd41',
      desc: 'A flat four-mile effort against the clock. The field is set for this winter and registration is closed.',
    });

    const mkreg = async (eventId: string, email: string, status: string, pos: number | null, code: string | null) => {
      const ex = await c.query('SELECT id FROM registrations WHERE event_id = $1 AND account_id = $2', [eventId, ids[email]]);
      if (ex.rows[0]) return;
      await c.query(
        'INSERT INTO registrations (id, event_id, account_id, status, waitlist_position, ticket_code, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)',
        [newId('reg'), eventId, ids[email], status, pos, code, toRfc3339Utc(now)],
      );
    };

    await mkreg(tn5k, 'guest@example.com', 'confirmed', null, 'TKT-A1B2C3D4');
    await mkreg(tn5k, 'guest2@example.com', 'confirmed', null, 'TKT-E5F6G7H8');
    await mkreg(tn5k, 'guest3@example.com', 'waitlisted', 1, null);
    await mkreg(rts, 'guest2@example.com', 'confirmed', null, 'TKT-J9K0L1M2');
    await mkreg(slr, 'guest3@example.com', 'pending_approval', null, null);

    await c.query('COMMIT');
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch { /* noop */ }
    throw e;
  } finally {
    c.release();
  }
}

export const SEED_PASSWORD = PW;
export { hslToHex, CATEGORIES };

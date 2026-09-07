import { db } from './db/client.js';
import { hashPassword, id as newId } from './lib/util.js';

const SEED_PASSWORD = 'deku-demo-pw-2026';

/** seed date = today; events start >= 7 days after it, on the hour 09:00-20:00 UTC */
function seedTimes(): { starts: Date; ends: Date }[] {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + 8);
  base.setUTCHours(0, 0, 0, 0);
  const hours = [9, 11, 13, 15, 17, 18, 20];
  return hours.map((h, i) => {
    const starts = new Date(base);
    starts.setUTCDate(starts.getUTCDate() + i); // spread across days, each on the hour
    starts.setUTCHours(h, 0, 0, 0);
    const ends = new Date(starts.getTime() + 90 * 60 * 1000);
    return { starts, ends };
  });
}

async function upsertAccount(a: { id: string; email: string; name: string; handle: string; role: 'host' | 'guest' }) {
  const hash = await hashPassword(SEED_PASSWORD);
  await db.query(
    `INSERT INTO accounts (id, email, password_hash, display_name, handle, role, created_at)
     VALUES ($1,$2,$3,$4,$5,$6, now())
     ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role`,
    [a.id, a.email, hash, a.name, a.handle, a.role]
  );
}

async function upsertCalendar(cc: { id: string; owner: string; name: string; slug: string; category: string; city: string; is_public: boolean }) {
  await db.query(
    `INSERT INTO calendars (id, owner_account_id, name, slug, category, city, is_public, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now())
     ON CONFLICT (slug) DO NOTHING`,
    [cc.id, cc.owner, cc.name, cc.slug, cc.category, cc.city, cc.is_public]
  );
}

async function upsertEvent(e: any) {
  await db.query(
    `INSERT INTO events (id, calendar_id, title, slug, category, city, time_zone, cover_seed, theme_hex, description,
       starts_at, ends_at, capacity, approval_required, waitlist_enabled, state, published_at, cancelled_at, cancel_reason, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, now(), now())
     ON CONFLICT (slug) DO NOTHING`,
    [e.id, e.calendarId, e.title, e.slug, e.category, e.city, e.timeZone, e.coverSeed, e.themeHex, e.description,
     e.starts, e.ends, e.capacity, e.approval, e.waitlist, e.state,
     e.state === 'draft' ? null : e.starts,
     e.state === 'cancelled' ? new Date() : null,
     e.state === 'cancelled' ? e.cancelReason : null]
  );
}

async function upsertRegistration(r: { eventId: string; accountEmail: string; status: string; position?: number; code?: string }) {
  const acc = (await db.query(`SELECT id FROM accounts WHERE email=$1`, [r.accountEmail])).rows[0];
  if (!acc) return;
  const existing = (await db.query(`SELECT id, status FROM registrations WHERE event_id=$1 AND account_id=$2`, [r.eventId, acc.id])).rows[0];
  if (existing) return;
  await db.query(
    `INSERT INTO registrations (id, event_id, account_id, status, waitlist_position, ticket_code, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6, now(), now())`,
    [newId(), r.eventId, acc.id, r.status, r.position ?? null, r.code ?? null]
  );
}

const evId = (slug: string) => `seed-ev-${slug}`;

export async function seed() {
  const accounts = [
    { id: 'seed-ac-priya', email: 'host@example.com', name: 'Priya Raman', handle: 'priya-raman', role: 'host' as const },
    { id: 'seed-ac-marcus', email: 'host2@example.com', name: 'Marcus Bell', handle: 'marcus-bell', role: 'host' as const },
    { id: 'seed-ac-amina', email: 'guest@example.com', name: 'Amina Osei', handle: 'amina-osei', role: 'guest' as const },
    { id: 'seed-ac-tomas', email: 'guest2@example.com', name: 'Tomas Vidal', handle: 'tomas-vidal', role: 'guest' as const },
    { id: 'seed-ac-ines', email: 'guest3@example.com', name: 'Ines Duarte', handle: 'ines-duarte', role: 'guest' as const },
  ];
  for (const a of accounts) await upsertAccount(a);

  await upsertCalendar({ id: 'seed-cal-riverside', owner: 'seed-ac-priya', name: 'Riverside Run Club', slug: 'riverside-run-club', category: 'running', city: 'Berlin', is_public: true });
  await upsertCalendar({ id: 'seed-cal-northside', owner: 'seed-ac-marcus', name: 'Northside Reading Nights', slug: 'northside-reading-nights', category: 'books', city: 'Lisbon', is_public: false });

  const t = seedTimes();
  const events = [
    { slug: 'thursday-night-5k', calendarId: 'seed-cal-riverside', title: 'Thursday Night 5K', category: 'running', city: 'Berlin', timeZone: 'Europe/Berlin', themeHex: '#146aeb', capacity: 3, state: 'published', approval: false, waitlist: true, ...t[0],
      description: 'An easy 5K along the river, all paces welcome. We meet by the bridge and finish with coffee.' },
    { slug: 'riverside-track-session', calendarId: 'seed-cal-riverside', title: 'Riverside Track Session', category: 'running', city: 'Berlin', timeZone: 'Europe/Berlin', themeHex: '#3cbd2c', capacity: 2, state: 'published', approval: false, waitlist: true, ...t[1],
      description: 'Six sets of 400m on the track. Bring spikes if you have them; we time every set.' },
    { slug: 'sunrise-long-run', calendarId: 'seed-cal-riverside', title: 'Sunrise Long Run', category: 'running', city: 'Berlin', timeZone: 'Europe/Berlin', themeHex: '#d69712', capacity: 20, state: 'published', approval: true, waitlist: true, ...t[2],
      description: 'Ninety minutes easy before work. The host confirms each runner the night before.' },
    { slug: 'harbour-loop-recovery-jog', calendarId: 'seed-cal-riverside', title: 'Harbour Loop Recovery Jog', category: 'running', city: 'Berlin', timeZone: 'Europe/Berlin', themeHex: '#007aff', capacity: 12, state: 'draft', approval: false, waitlist: false, ...t[3],
      description: 'A slow loop of the harbour, conversation pace, nobody left behind.' },
    { slug: 'winter-reading-night', calendarId: 'seed-cal-northside', title: 'Winter Reading Night', category: 'books', city: 'Lisbon', timeZone: 'Europe/Lisbon', themeHex: '#ab46dd', capacity: 12, state: 'published', approval: false, waitlist: false, ...t[4],
      description: 'Bring one page you love and read it aloud. Candles, chairs, and one very good lamp.' },
    { slug: 'autumn-book-swap', calendarId: 'seed-cal-northside', title: 'Autumn Book Swap', category: 'books', city: 'Lisbon', timeZone: 'Europe/Lisbon', themeHex: '#f31a7c', capacity: 20, state: 'cancelled', approval: false, waitlist: false, ...t[5],
      description: 'Bring a book, take a book, tell us why. The venue lost its lease.', cancelReason: 'The venue lost its lease.' },
    { slug: 'riverside-winter-time-trial', calendarId: 'seed-cal-riverside', title: 'Riverside Winter Time Trial', category: 'running', city: 'Berlin', timeZone: 'Europe/Berlin', themeHex: '#28cd41', capacity: 8, state: 'registration_closed', approval: false, waitlist: false, ...t[6],
      description: 'One lap of the winter course, against the clock. Registration is closed for this round.' },
  ];
  for (const e of events) await upsertEvent({ ...e, id: evId(e.slug), coverSeed: `seed-${e.slug}` });

  await upsertRegistration({ eventId: evId('thursday-night-5k'), accountEmail: 'guest@example.com', status: 'confirmed', code: 'TKT-SEEDA01' });
  await upsertRegistration({ eventId: evId('thursday-night-5k'), accountEmail: 'guest2@example.com', status: 'confirmed', code: 'TKT-SEEDA02' });
  await upsertRegistration({ eventId: evId('thursday-night-5k'), accountEmail: 'guest3@example.com', status: 'waitlisted', position: 1 });
  await upsertRegistration({ eventId: evId('riverside-track-session'), accountEmail: 'guest2@example.com', status: 'confirmed', code: 'TKT-SEEDA03' });
  await upsertRegistration({ eventId: evId('sunrise-long-run'), accountEmail: 'guest3@example.com', status: 'pending_approval' });

  // clean any stale auth tokens
  await db.query(`DELETE FROM auth_tokens WHERE expires_at < now()`);
}

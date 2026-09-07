import { pool } from './db.js';
import { hashPassword } from './config.js';

/**
 * Idempotent seed: every row is inserted only if its natural key is absent.
 * Restarting the app must not duplicate rows.
 */
export async function seed(): Promise<void> {
  const accounts: Array<[string, string, string, string, string]> = [
    ['host@example.com', 'Priya Raman', 'priya-raman', 'host', 'deku-demo-pw-2026'],
    ['host2@example.com', 'Marcus Bell', 'marcus-bell', 'host', 'deku-demo-pw-2026'],
    ['guest@example.com', 'Amina Osei', 'amina-osei', 'guest', 'deku-demo-pw-2026'],
    ['guest2@example.com', 'Tomas Vidal', 'tomas-vidal', 'guest', 'deku-demo-pw-2026'],
    ['guest3@example.com', 'Ines Duarte', 'ines-duarte', 'guest', 'deku-demo-pw-2026'],
  ];
  const emails = accounts.map(a => a[0]);
  const existing = await pool.query(`SELECT email FROM accounts WHERE email = ANY($1)`, [emails]);
  const have = new Set(existing.rows.map((r: any) => r.email));
  for (const [email, name, handle, role, pw] of accounts) {
    if (have.has(email)) continue;
    await pool.query(
      `INSERT INTO accounts (email, password_hash, display_name, handle, role)
       VALUES ($1,$2,$3,$4,$5)`,
      [email, hashPassword(pw), name, handle, role]);
  }

  const calOwners = await pool.query(
    `SELECT id, email FROM accounts WHERE email = ANY($1)`, [emails]);
  const byEmail = new Map(calOwners.rows.map((r: any) => [r.email, r.id]));
  const hostId = byEmail.get('host@example.com');
  const host2Id = byEmail.get('host2@example.com');

  const calendars: Array<[string, string, string, string, boolean, string]> = [
    ['Riverside Run Club', 'riverside-run-club', 'running', 'Berlin', true, hostId],
    ['Northside Reading Nights', 'northside-reading-nights', 'books', 'Lisbon', false, host2Id],
  ];
  for (const [name, slug, category, city, isPublic, owner] of calendars) {
    const has = await pool.query(`SELECT 1 FROM calendars WHERE slug = $1`, [slug]);
    if (has.rowCount) continue;
    await pool.query(
      `INSERT INTO calendars (owner_account_id, name, slug, category, city, is_public)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [owner, name, slug, category, city, isPublic]);
  }
  const calIds = (await pool.query(`SELECT id, slug FROM calendars WHERE slug = ANY($1)`,
    [['riverside-run-club', 'northside-reading-nights']])).rows;
  const calBySlug = new Map(calIds.map((r: any) => [r.slug, r.id]));

  // At least seven days after the seed date, on the hour 09:00-20:00 UTC.
  // Computed from the running clock so the events are always in the future.
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + 10);
  base.setUTCHours(0, 0, 0, 0);
  const at = (h: number) => new Date(base.getTime() + h * 3600_000).toISOString();
  const events: Array<any> = [
    ['Thursday Night 5K', 'thursday-night-5k', 'riverside-run-club', 3, 'published', false, true, '#146aeb', 'Europe/Berlin', 9],
    ['Riverside Track Session', 'riverside-track-session', 'riverside-run-club', 2, 'published', false, true, '#3cbd2c', 'Europe/Berlin', 10],
    ['Sunrise Long Run', 'sunrise-long-run', 'riverside-run-club', 20, 'published', true, true, '#d69712', 'Europe/Berlin', 11],
    ['Harbour Loop Recovery Jog', 'harbour-loop-recovery-jog', 'riverside-run-club', 12, 'draft', false, false, '#007aff', 'Europe/Berlin', 12],
    ['Winter Reading Night', 'winter-reading-night', 'northside-reading-nights', 12, 'published', false, false, '#ab46dd', 'Europe/Lisbon', 13],
    ['Autumn Book Swap', 'autumn-book-swap', 'northside-reading-nights', 20, 'cancelled', false, false, '#f31a7c', 'Europe/Lisbon', 14],
    ['Riverside Winter Time Trial', 'riverside-winter-time-trial', 'riverside-run-club', 8, 'registration_closed', false, false, '#28cd41', 'Europe/Berlin', 15],
  ];
  for (const [title, slug, cal, capacity, state, appr, wait, theme, tz, hour] of events) {
    const exists = await pool.query(`SELECT 1 FROM events WHERE slug = $1`, [slug]);
    if (exists.rowCount) continue;
    const starts = at(hour);
    const ends = at(hour + 1);
    await pool.query(
      `INSERT INTO events (calendar_id, title, slug, category, city, time_zone, cover_seed,
                           theme_hex, description, starts_at, ends_at, capacity,
                           approval_required, waitlist_enabled, state, published_at,
                           cancelled_at, cancel_reason)
       VALUES ($1,$2,$3,(SELECT category FROM calendars WHERE slug=$4),(SELECT city FROM calendars WHERE slug=$4),$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
               CASE WHEN $14='published' THEN now() ELSE NULL END,
               CASE WHEN $14='cancelled' THEN now() ELSE NULL END,
               CASE WHEN $14='cancelled' THEN 'The venue lost its lease.' ELSE NULL END)
       ON CONFLICT (slug) DO NOTHING`,
      [calBySlug.get(cal), title, slug, cal, tz, slug, theme,
       `${title} — a ${cal === 'riverside-run-club' ? 'run' : 'reading'} with neighbours.`,
       starts, ends, capacity, appr, wait, state]);
  }

  const eventIds = (await pool.query(`SELECT id, slug FROM events WHERE slug = ANY($1)`, [
    ['thursday-night-5k', 'riverside-track-session', 'sunrise-long-run'],
  ])).rows;
  const evBySlug = new Map(eventIds.map((r: any) => [r.slug, r.id]));
  const guestIds = new Map((await pool.query(
    `SELECT id, email FROM accounts WHERE email = ANY($1)`,
    [['guest@example.com', 'guest2@example.com', 'guest3@example.com']])).rows.map((r: any) => [r.email, r.id]));

  const regRows: Array<[string, string, string, number | null, string | null]> = [
    ['thursday-night-5k', 'guest@example.com', 'confirmed', null, 'TKT-SEEDED01'],
    ['thursday-night-5k', 'guest2@example.com', 'confirmed', null, 'TKT-SEEDED02'],
    ['thursday-night-5k', 'guest3@example.com', 'waitlisted', 1, null],
    ['riverside-track-session', 'guest2@example.com', 'confirmed', null, 'TKT-SEEDED03'],
    ['sunrise-long-run', 'guest3@example.com', 'pending_approval', null, null],
  ];
  for (const [ev, email, status, pos, code] of regRows) {
    const has = await pool.query(
      `SELECT 1 FROM registrations WHERE event_id = $1 AND account_id = $2`,
      [evBySlug.get(ev), guestIds.get(email)]);
    if (has.rowCount) continue;
    await pool.query(
      `INSERT INTO registrations (event_id, account_id, status, waitlist_position, ticket_code)
       VALUES ($1,$2,$3,$4,$5)`,
      [evBySlug.get(ev), guestIds.get(email), status, pos, code]);
  }
}

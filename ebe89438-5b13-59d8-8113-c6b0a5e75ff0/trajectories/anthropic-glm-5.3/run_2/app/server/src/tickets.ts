import { Hono } from 'hono';
import { pool } from './db.js';
import { ApiError, iso, isoOrNull } from './domain.js';

const app = new Hono();

app.get('/:code', async c => {
  const { rows } = await pool.query(
    `SELECT r.id, r.status, r.ticket_code, r.checked_in_at, r.waitlist_position,
            e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone,
            e.city, e.theme_hex, e.state, e.cover_seed
       FROM registrations r JOIN events e ON e.id = r.event_id
      WHERE r.ticket_code = $1`, [c.req.param('code')]);
  const r = rows[0];
  if (!r) throw new ApiError(404, 'not_found', `No ticket carries that code.`);
  return c.json({
    id: r.id, status: r.status, ticket_code: r.ticket_code,
    checked_in_at: isoOrNull(r.checked_in_at), waitlist_position: r.waitlist_position,
    event_slug: r.event_slug, title: r.title, starts_at: iso(r.starts_at),
    ends_at: iso(r.ends_at), time_zone: r.time_zone, city: r.city,
    theme_hex: r.theme_hex, state: r.state, cover_seed: r.cover_seed,
  });
});

export default app;

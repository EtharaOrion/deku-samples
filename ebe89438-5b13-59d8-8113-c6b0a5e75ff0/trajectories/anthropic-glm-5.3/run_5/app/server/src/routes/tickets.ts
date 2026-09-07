import { Hono } from 'hono';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';
import { DomainError } from '../domain/registrations.js';
import { checkInTicket } from '../domain/service/lifecycle.js';
import { toRfc3339 } from '../time.js';

export const ticketRoutes = new Hono();

function domainError(c: any, err: DomainError) {
  return c.json({ message: err.message, field: err.field ?? null }, err.status as any);
}

ticketRoutes.get('/:code', async (c) => {
  const code = String(c.req.param('code'));
  const { rows } = await pool.query(
    `SELECT r.*, a.display_name, e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone, e.city, e.theme_hex, e.cover_seed
       FROM registrations r JOIN accounts a ON a.id = r.account_id JOIN events e ON e.id = r.event_id
      WHERE r.ticket_code = $1`,
    [code],
  );
  const row = rows[0];
  if (!row) return c.json({ message: 'That ticket does not exist.' }, 404);
  return c.json({
    id: row.id,
    event_slug: row.event_slug,
    title: row.title,
    starts_at: toRfc3339(row.starts_at),
    ends_at: toRfc3339(row.ends_at),
    time_zone: row.time_zone,
    city: row.city,
    status: row.status,
    ticket_code: row.ticket_code,
    checked_in_at: row.checked_in_at ? toRfc3339(row.checked_in_at) : null,
    theme_hex: row.theme_hex,
    cover_seed: row.cover_seed,
    display_name: row.display_name,
    waitlist_position: row.waitlist_position,
  });
});

ticketRoutes.post('/:code/check-in', requireAuth, async (c) => {
  const account = c.get('account');
  if (account.role !== 'host') return c.json({ message: 'That ticket does not exist.' }, 404);
  try {
    const out = await checkInTicket(account, String(c.req.param('code')));
    return c.json({ ...out.registration, note: out.note, already_checked_in: out.already });
  } catch (err) {
    if (err instanceof DomainError) return domainError(c, err);
    throw err;
  }
});

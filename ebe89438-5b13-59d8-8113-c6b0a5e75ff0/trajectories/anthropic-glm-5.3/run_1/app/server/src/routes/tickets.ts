import { Hono } from 'hono';
import { db } from '../db/client.js';
import { authAccount } from '../lib/auth.js';
import { ticketCode } from '../lib/util.js';

export const ticketRoutes = new Hono();

function rfc(d: any) { return new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z'); }

/** Anyone presenting a real code; the code is the credential. */
ticketRoutes.get('/:code', async (c) => {
  const { rows } = await db.query(
    `SELECT r.*, e.title, e.slug AS event_slug, e.starts_at, e.ends_at, e.time_zone, e.city, e.theme_hex, e.cover_seed, e.state AS event_state
       FROM registrations r JOIN events e ON e.id = r.event_id
      WHERE upper(r.ticket_code) = upper($1)`,
    [c.req.param('code')]
  );
  const t = rows[0];
  if (!t) return c.json({ message: `Page Not Found` }, 404);
  return c.json({
    id: t.id, event_id: t.event_id, status: t.status,
    ticket_code: t.ticket_code, checked_in_at: t.checked_in_at ? rfc(t.checked_in_at) : null,
    event_slug: t.event_slug, title: t.title, starts_at: rfc(t.starts_at), ends_at: rfc(t.ends_at),
    time_zone: t.time_zone, city: t.city, theme_hex: t.theme_hex, cover_seed: t.cover_seed,
    event_state: t.event_state,
  });
});

/** The owning host checks a ticket in. A second check-in records one arrival. */
ticketRoutes.post('/:code/check-in', async (c) => {
  const account = await authAccount(c);
  if (!account) return c.json({ message: `Sign in to check tickets in.` }, 401);
  const { rows } = await db.query(
    `SELECT r.*, e.title, c.owner_account_id FROM registrations r
       JOIN events e ON e.id = r.event_id JOIN calendars c ON c.id = e.calendar_id
      WHERE upper(r.ticket_code) = upper($1)`,
    [c.req.param('code')]
  );
  const t = rows[0];
  if (!t) return c.json({ message: `Page Not Found` }, 404);
  if (t.owner_account_id !== account.id || account.role !== 'host') {
    return c.json({ message: `Page Not Found` }, 404);
  }
  if (t.status === 'checked_in') {
    return c.json({
      id: t.id, event_id: t.event_id, status: t.status, ticket_code: t.ticket_code,
      checked_in_at: rfc(t.checked_in_at), already_checked_in: true,
    });
  }
  if (t.status !== 'confirmed') {
    return c.json({ message: `That ticket does not hold a seat to check in.` }, 400);
  }
  const tx = await db.connect();
  try {
    await tx.query('BEGIN');
    await tx.query(`SELECT id FROM events WHERE id=$1 FOR UPDATE`, [t.event_id]);
    const fresh = (await tx.query(`SELECT * FROM registrations WHERE id=$1 FOR UPDATE`, [t.id])).rows[0];
    if (fresh.status === 'checked_in') {
      await tx.query('COMMIT');
      return c.json({ id: fresh.id, event_id: fresh.event_id, status: fresh.status, ticket_code: fresh.ticket_code, checked_in_at: rfc(fresh.checked_in_at), already_checked_in: true });
    }
    await tx.query(`UPDATE registrations SET status='checked_in', checked_in_at=now(), updated_at=now() WHERE id=$1`, [t.id]);
    const out = (await tx.query(`SELECT * FROM registrations WHERE id=$1`, [t.id])).rows[0];
    await tx.query('COMMIT');
    return c.json({ id: out.id, event_id: out.event_id, status: out.status, ticket_code: out.ticket_code, checked_in_at: rfc(out.checked_in_at) });
  } catch (e) {
    await tx.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    tx.release();
  }
});

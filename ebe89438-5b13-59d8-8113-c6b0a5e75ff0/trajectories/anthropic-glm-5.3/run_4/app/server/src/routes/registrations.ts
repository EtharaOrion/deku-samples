import { Hono } from 'hono';
import { pool } from '../main.js';
import { requireAuth } from '../auth.js';
import {
  type Account, type EventRow, type Registration,
  query, seatCount, calendarById, registrationById, registrationByTicket, oneRegistration,
} from '../db.js';
import { registrationJson } from '../serialize.js';
import { HttpError } from '../errors.js';
import { log } from '../util.js';
import {
  registerGuest, cancelRegistration, approveRegistration, declineRegistration,
  type AfterMail,
} from '../registration.js';
import { sendTransitionMail } from '../mail.js';
import { rateLimitedResponse, rateLimit } from './auth.js';

export const registrationRoutes = new Hono();

registrationRoutes.post('/', async (c) => {
  const acc = requireAuth(c);
  if (!rateLimit('register', acc.id)) return rateLimitedResponse(c);

  const body = await c.req.json().catch(() => ({}));
  const slug = String(body.event_slug ?? '').trim();
  if (!slug) return c.json({ message: 'Name the event you want to join.', field: 'event_slug' }, 400);

  const client = await pool.connect();
  let reg: Registration;
  let event: EventRow;
  let after: AfterMail;
  let fresh = false;
  try {
    await client.query('begin');
    // Lock the event row: this serialises the last seat in the database.
    const lockedRows = await client.query('select * from events where slug = $1 for update', [slug]);
    const ev = lockedRows.rows[0] as EventRow | undefined;
    if (!ev) {
      await client.query('rollback');
      return c.json({ message: 'Not found.' }, 404);
    }
    if (ev.state === 'draft') {
      await client.query('rollback');
      return c.json({ message: 'Not found.' }, 404);
    }
    event = ev;
    const res = await registerGuest(client, ev, acc);
    reg = res.reg;
    after = res.after;
    fresh = reg.status !== 'declined';
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }

  for (const m of after) {
    await sendTransitionMail(pool, m.kind, {
      event,
      registration: m.recipient.id === acc.id ? reg : undefined,
      recipient: { email: m.recipient.email, display_name: m.recipient.display_name },
    });
  }

  log({ level: 'info', msg: 'registration', event: event.slug, account: acc.id, status: reg.status, fresh });
  return c.json(registrationJson(reg, acc), 201);
});

registrationRoutes.get('/me', async (c) => {
  const acc = requireAuth(c);
  const rows = await query<Registration & { [k: string]: any }>(pool,
    `select r.*, e.id as ev_id, e.slug as ev_slug, e.title as ev_title, e.category as ev_category, e.city as ev_city,
            e.time_zone as ev_time_zone, e.cover_seed as ev_cover_seed, e.theme_hex as ev_theme_hex,
            e.description as ev_description, e.starts_at as ev_starts_at, e.ends_at as ev_ends_at,
            e.capacity as ev_capacity, e.approval_required as ev_approval_required,
            e.waitlist_enabled as ev_waitlist_enabled, e.state as ev_state,
            e.cancel_reason as ev_cancel_reason
     from registrations r join events e on e.id = r.event_id
     where r.account_id = $1
     order by e.starts_at asc`, [acc.id]);
  return c.json(rows.map((r) => ({
    ...registrationJson(r, acc),
    event: {
      slug: r.ev_slug, title: r.ev_title, category: r.ev_category, city: r.ev_city,
      time_zone: r.ev_time_zone, cover_seed: r.ev_cover_seed, theme_hex: r.ev_theme_hex,
      starts_at: new Date(r.ev_starts_at).toISOString(), ends_at: new Date(r.ev_ends_at).toISOString(),
      state: r.ev_state, capacity: r.ev_capacity, cancel_reason: r.ev_cancel_reason,
      approval_required: r.ev_approval_required, waitlist_enabled: r.ev_waitlist_enabled,
    },
  })));
});

registrationRoutes.post('/:id/cancel', async (c) => {
  const acc = requireAuth(c);
  const id = c.req.param('id');
  const reg = await registrationById(pool, id);
  if (!reg || reg.account_id !== acc.id) return c.json({ message: 'Not found.' }, 404);
  const ev = (await query<EventRow>(pool, `select * from events where id = $1`, [reg.event_id]))[0];
  if (!ev) return c.json({ message: 'Not found.' }, 404);

  const client = await pool.connect();
  let updated: Registration;
  let after: AfterMail;
  try {
    await client.query('begin');
    await client.query('select * from events where id = $1 for update', [ev.id]);
    const fresh = await registrationById(client, id);
    if (!fresh) throw new HttpError(404, 'Not found.');
    const res = await cancelRegistration(client, ev, fresh, 'guest');
    updated = res.reg;
    after = res.after;
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }

  for (const m of after) {
    await sendTransitionMail(pool, m.kind, {
      event: ev,
      registration: (await oneRegistration(pool, ev.id, m.recipient.id)),
      recipient: { email: m.recipient.email, display_name: m.recipient.display_name },
    });
  }
  log({ level: 'info', msg: 'registration cancelled by guest', registration: updated.id });
  return c.json(registrationJson(updated, acc));
});

registrationRoutes.post('/:id/approve', async (c) => {
  const acc = requireAuth(c);
  if (acc.role !== 'host') return c.json({ message: 'Not found.' }, 404);
  const id = c.req.param('id');
  const reg = await registrationById(pool, id);
  if (!reg) return c.json({ message: 'Not found.' }, 404);
  const ev = (await query<EventRow>(pool, `select * from events where id = $1`, [reg.event_id]))[0];
  if (!ev) return c.json({ message: 'Not found.' }, 404);
  const cal = await calendarById(pool, ev.calendar_id);
  if (!cal || cal.owner_account_id !== acc.id) return c.json({ message: 'Not found.' }, 404);

  const client = await pool.connect();
  let updated: Registration;
  let after: AfterMail;
  try {
    await client.query('begin');
    await client.query('select * from events where id = $1 for update', [ev.id]);
    const fresh = await registrationById(client, id);
    if (!fresh) throw new HttpError(404, 'Not found.');
    const res = await approveRegistration(client, ev, fresh);
    updated = res.reg;
    after = res.after;
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }

  for (const m of after) {
    await sendTransitionMail(pool, m.kind, {
      event: ev,
      registration: await oneRegistration(pool, ev.id, m.recipient.id),
      recipient: { email: m.recipient.email, display_name: m.recipient.display_name },
    });
  }
  log({ level: 'info', msg: 'registration approved', registration: updated.id });
  return c.json(registrationJson(updated));
});

registrationRoutes.post('/:id/decline', async (c) => {
  const acc = requireAuth(c);
  if (acc.role !== 'host') return c.json({ message: 'Not found.' }, 404);
  const id = c.req.param('id');
  const reg = await registrationById(pool, id);
  if (!reg) return c.json({ message: 'Not found.' }, 404);
  const ev = (await query<EventRow>(pool, `select * from events where id = $1`, [reg.event_id]))[0];
  if (!ev) return c.json({ message: 'Not found.' }, 404);
  const cal = await calendarById(pool, ev.calendar_id);
  if (!cal || cal.owner_account_id !== acc.id) return c.json({ message: 'Not found.' }, 404);

  const client = await pool.connect();
  let updated: Registration;
  let after: AfterMail;
  try {
    await client.query('begin');
    const res = await declineRegistration(client, reg);
    updated = res.reg;
    after = res.after;
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }

  for (const m of after) {
    await sendTransitionMail(pool, m.kind, {
      event: ev,
      registration: updated,
      recipient: { email: m.recipient.email, display_name: m.recipient.display_name },
    });
  }
  log({ level: 'info', msg: 'registration declined', registration: updated.id });
  return c.json(registrationJson(updated));
});

export const ticketRoutes = new Hono();

ticketRoutes.get('/:ticket_code', async (c) => {
  const code = c.req.param('ticket_code').toUpperCase();
  const reg = await registrationByTicket(pool, code);
  if (!reg) return c.json({ message: 'Not found.' }, 404);
  const ev = (await query<EventRow>(pool, `select * from events where id = $1`, [reg.event_id]))[0];
  if (!ev) return c.json({ message: 'Not found.' }, 404);
  const seats = await seatCount(pool, ev.id);
  // A ticket is presentable at a door: it carries the code, never the guest list.
  const { email: _e, display_name: _d, account_id: _a, ...base } = registrationJson(reg) as Record<string, unknown>;
  return c.json({
    ...base,
    event_slug: ev.slug,
    title: ev.title,
    starts_at: ev.starts_at.toISOString(),
    ends_at: ev.ends_at.toISOString(),
    time_zone: ev.time_zone,
    theme_hex: ev.theme_hex,
    cover_seed: ev.cover_seed,
    city: ev.city,
    state: ev.state,
  });
});

ticketRoutes.post('/:ticket_code/check-in', async (c) => {
  const acc = requireAuth(c);
  if (acc.role !== 'host') return c.json({ message: 'Not found.' }, 404);
  const code = c.req.param('ticket_code').toUpperCase();
  const reg = await registrationByTicket(pool, code);
  if (!reg) return c.json({ message: 'Not found.' }, 404);
  const ev = (await query<EventRow>(pool, `select * from events where id = $1`, [reg.event_id]))[0];
  if (!ev) return c.json({ message: 'Not found.' }, 404);
  const cal = await calendarById(pool, ev.calendar_id);
  if (!cal || cal.owner_account_id !== acc.id) return c.json({ message: 'Not found.' }, 404);

  if (reg.status === 'checked_in') {
    // One arrival, not two.
    return c.json({ ...registrationJson(reg), already_checked_in: true, checked_in_at: reg.checked_in_at });
  }
  if (reg.status !== 'confirmed') {
    return c.json({ message: 'That ticket is not holding a seat.', field: 'ticket_code' }, 400);
  }

  const client = await pool.connect();
  let updated: Registration;
  try {
    await client.query('begin');
    await client.query('select * from events where id = $1 for update', [ev.id]);
    const rows = await client.query(
      `update registrations set status = 'checked_in', checked_in_at = now(), updated_at = now()
       where id = $1 and status = 'confirmed' returning *`, [reg.id]);
    if (rows.rows.length === 0) {
      const fresh = await registrationById(client, reg.id);
      if (fresh && fresh.status === 'checked_in') {
        await client.query('commit');
        return c.json({ ...registrationJson(fresh), already_checked_in: true, checked_in_at: fresh.checked_in_at });
      }
      throw new HttpError(400, 'That ticket is not holding a seat.');
    }
    updated = rows.rows[0] as Registration;
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
  log({ level: 'info', msg: 'ticket checked in', code });
  return c.json(registrationJson(updated));
});

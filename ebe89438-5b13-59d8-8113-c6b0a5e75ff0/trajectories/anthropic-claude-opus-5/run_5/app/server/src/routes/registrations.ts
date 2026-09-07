import { Hono } from 'hono';
import { query, tx } from '../db.js';
import { ApiError, badRequest, notFound, readBody, requireAccount, requireHost, str, type Vars } from '../http.js';
import { takeToken } from '../ratelimit.js';
import { serializeRegistration } from '../serialize.js';
import {
  approveRegistration,
  cancelOwnRegistration,
  declineRegistration,
  flushMail,
  lockEvent,
  registerForEvent,
  type EventRow,
  type PendingMail,
  type RegistrationRow,
} from '../registrations.js';
import { log } from '../log.js';

export const registrationRoutes = new Hono<{ Variables: Vars }>();

registrationRoutes.post('/', async (c) => {
  const account = requireAccount(c);
  const body = await readBody(c);
  const slug = str(body, 'event_slug', { required: true, max: 80 })!;

  const verdict = takeToken(`register:${account.id}`, 10);
  if (!verdict.allowed) {
    throw new ApiError(
      429,
      `Too many registration attempts. The limit is ${verdict.limit} requests per minute; try again in ${verdict.retryAfterSeconds} seconds.`,
      'event_slug',
      { rate_limit: verdict.limit, retry_after_seconds: verdict.retryAfterSeconds },
    );
  }

  const found = await query<{ id: number }>(`SELECT id FROM events WHERE slug = $1`, [slug]);
  if (!found.rows[0]) throw notFound();
  const eventId = found.rows[0].id;

  const mails: PendingMail[] = [];
  const registration = await tx(async (client) => {
    // The row lock is taken before anything is counted, so two guests reaching
    // for the same last seat are serialised by PostgreSQL itself.
    const ev = await lockEvent(client, eventId);
    const out = await registerForEvent(client, ev, {
      id: account.id,
      email: account.email,
      display_name: account.display_name,
    });
    mails.push(...out.mails);
    return out.registration;
  });

  await flushMail(mails);
  log.info('registration', { event: slug, account_id: account.id, status: registration.status });
  return c.json(serializeRegistration(registration, { event_slug: slug }), 201);
});

registrationRoutes.get('/me', async (c) => {
  const account = requireAccount(c);
  const r = await query(
    `SELECT r.id, r.event_id, r.account_id, r.status, r.waitlist_position, r.ticket_code, r.checked_in_at,
            r.created_at, r.updated_at,
            e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone, e.city, e.state AS event_state,
            e.theme_hex, e.cover_seed, e.capacity, e.cancel_reason
       FROM registrations r JOIN events e ON e.id = r.event_id
      WHERE r.account_id = $1
      ORDER BY e.starts_at ASC NULLS LAST, e.slug ASC`,
    [account.id],
  );
  return c.json(r.rows);
});

async function loadRegistrationAndEvent(id: number): Promise<{ reg: RegistrationRow; ev: EventRow; owner: number; guest: { id: number; email: string; display_name: string } } | null> {
  const r = await query(
    `SELECT r.*, c.owner_account_id, a.email AS guest_email, a.display_name AS guest_name
       FROM registrations r
       JOIN events e ON e.id = r.event_id
       JOIN calendars c ON c.id = e.calendar_id
       JOIN accounts a ON a.id = r.account_id
      WHERE r.id = $1`,
    [id],
  );
  const row = r.rows[0];
  if (!row) return null;
  const ev = await query<EventRow>(`SELECT * FROM events WHERE id = $1`, [row.event_id]);
  return {
    reg: row,
    ev: ev.rows[0],
    owner: Number(row.owner_account_id),
    guest: { id: Number(row.account_id), email: row.guest_email, display_name: row.guest_name },
  };
}

registrationRoutes.post('/:id/cancel', async (c) => {
  const account = requireAccount(c);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) throw notFound();
  const loaded = await loadRegistrationAndEvent(id);
  // A guest cancels their own registration alone.
  if (!loaded || Number(loaded.reg.account_id) !== account.id) throw notFound();

  const mails: PendingMail[] = [];
  const updated = await tx(async (client) => {
    const ev = await lockEvent(client, loaded.reg.event_id);
    const locked = await client.query<RegistrationRow>(`SELECT * FROM registrations WHERE id = $1 FOR UPDATE`, [id]);
    const out = await cancelOwnRegistration(client, locked.rows[0], ev);
    mails.push(...out.mails);
    return out.registration;
  });

  await flushMail(mails);
  log.info('registration cancelled by guest', { id, promoted: mails.length });
  return c.json(serializeRegistration(updated, { event_slug: loaded.ev.slug }));
});

async function hostAction(c: any, action: 'approve' | 'decline') {
  const account = requireHost(c);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) throw notFound();
  const loaded = await loadRegistrationAndEvent(id);
  // Scope is by ownership of the calendar; another host meets the not-found page.
  if (!loaded || loaded.owner !== account.id) throw notFound();

  const mails: PendingMail[] = [];
  const result = await tx(async (client) => {
    const ev = await lockEvent(client, loaded.reg.event_id);
    const locked = await client.query<RegistrationRow>(`SELECT * FROM registrations WHERE id = $1 FOR UPDATE`, [id]);
    if (action === 'approve') {
      const out = await approveRegistration(client, locked.rows[0], ev, loaded.guest);
      mails.push(...out.mails);
      return { registration: out.registration, waitlisted: out.waitlisted };
    }
    const out = await declineRegistration(client, locked.rows[0], ev, loaded.guest);
    mails.push(...out.mails);
    return { registration: out.registration, waitlisted: false };
  });

  await flushMail(mails);
  log.info(`registration ${action}d`, { id, status: result.registration.status });
  return c.json(
    serializeRegistration(result.registration, {
      event_slug: loaded.ev.slug,
      moved_to_waitlist: result.waitlisted,
    }),
  );
}

registrationRoutes.post('/:id/approve', (c) => hostAction(c, 'approve'));
registrationRoutes.post('/:id/decline', (c) => hostAction(c, 'decline'));

export const ticketRoutes = new Hono<{ Variables: Vars }>();

// Anyone presenting a real code, signed in or not: the code is the credential.
ticketRoutes.get('/:code', async (c) => {
  const code = c.req.param('code').toUpperCase();
  const r = await query(
    `SELECT r.id, r.status, r.ticket_code, r.checked_in_at, r.waitlist_position,
            e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone, e.city,
            e.theme_hex, e.cover_seed, e.state AS event_state, e.cancel_reason,
            c.name AS calendar_name, a.display_name AS guest_name
       FROM registrations r
       JOIN events e ON e.id = r.event_id
       JOIN calendars c ON c.id = e.calendar_id
       JOIN accounts a ON a.id = r.account_id
      WHERE r.ticket_code = $1`,
    [code],
  );
  if (!r.rows[0]) throw notFound();
  return c.json(r.rows[0]);
});

ticketRoutes.post('/:code/check-in', async (c) => {
  const account = requireHost(c);
  const code = c.req.param('code').toUpperCase();
  const found = await query(
    `SELECT r.id, r.event_id, c.owner_account_id, e.slug AS event_slug
       FROM registrations r
       JOIN events e ON e.id = r.event_id
       JOIN calendars c ON c.id = e.calendar_id
      WHERE r.ticket_code = $1`,
    [code],
  );
  const row = found.rows[0];
  if (!row || Number(row.owner_account_id) !== account.id) throw notFound();

  const updated = await tx(async (client) => {
    const locked = await client.query<RegistrationRow>(`SELECT * FROM registrations WHERE id = $1 FOR UPDATE`, [row.id]);
    const reg = locked.rows[0];
    if (reg.status === 'checked_in') {
      // A second check-in of the same code records one arrival, not two.
      return { registration: reg, already: true };
    }
    if (reg.status !== 'confirmed') {
      throw badRequest('That ticket is not a confirmed seat, so it cannot be checked in.');
    }
    const r = await client.query<RegistrationRow>(
      `UPDATE registrations SET status = 'checked_in', checked_in_at = now(), updated_at = now()
        WHERE id = $1 RETURNING *`,
      [row.id],
    );
    return { registration: r.rows[0], already: false };
  });

  log.info('check-in', { code, already: updated.already });
  return c.json(
    serializeRegistration(updated.registration, {
      event_slug: row.event_slug,
      already_checked_in: updated.already,
    }),
  );
});

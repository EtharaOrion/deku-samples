import { Hono } from 'hono';
import { pool, tx } from '../db.js';
import {
  EventRow,
  confirmedCount,
  isCapacityViolation,
  isUniqueViolation,
  issueTicketCode,
  lockEvent,
  nextWaitlistPosition,
  promoteFromWaitlist,
  registrationPublic,
  renumberWaitlist,
} from '../domain.js';
import {
  AppContext,
  handleError,
  notFound,
  rateLimit,
  readJson,
  requireAccount,
} from '../http.js';
import {
  SUBJECTS,
  bodyApproved,
  bodyConfirmed,
  bodyDeclined,
  bodyPending,
  bodyPromoted,
  bodyWaitlisted,
  sendMail,
} from '../mail.js';
import { FieldError, log, toUtcIso } from '../util.js';

export const registrationRoutes = new Hono();

type Outcome =
  | { kind: 'confirmed'; ticket: string }
  | { kind: 'pending' }
  | { kind: 'waitlisted'; position: number };

/**
 * The last seat.
 *
 * The event row is locked before the seat count is read, so two guests
 * arriving at the same instant are serialised: the second sees the first's
 * committed row. The database trigger is the backstop — even if this logic
 * were wrong, the insert itself would be refused. A refused attempt rolls
 * back whole, leaving no row, no held seat and no ticket.
 */
registrationRoutes.post('/registrations', async (c: AppContext) => {
  try {
    const account = await requireAccount(c);
    const body = await readJson(c);
    const slug = String(body.event_slug ?? '').trim().toLowerCase();
    if (!slug) throw new FieldError('event_slug', 'Name the event you want to join.');
    rateLimit(`register:${account.id}`);

    const result = await tx(async (client) => {
      const { rows: found } = await client.query(
        'SELECT id FROM events WHERE slug = $1',
        [slug],
      );
      if (!found.length) return null;
      const ev = await lockEvent(client, found[0].id);

      if (ev.state === 'draft') return null; // as if it never existed
      if (ev.state === 'cancelled') {
        throw new FieldError('event_slug', 'This event has been cancelled.', 409);
      }
      if (ev.state === 'registration_closed') {
        throw new FieldError(
          'event_slug',
          'The host has stopped taking registrations for this event.',
          409,
        );
      }

      const { rows: mineRows } = await client.query(
        'SELECT * FROM registrations WHERE event_id = $1 AND account_id = $2 FOR UPDATE',
        [ev.id, account.id],
      );
      const mine = mineRows[0];
      // A repeat submission updates the row and never adds a second one.
      if (
        mine &&
        ['confirmed', 'checked_in', 'waitlisted', 'pending_approval'].includes(mine.status)
      ) {
        return { event: ev, registration: mine, outcome: null, repeat: true } as const;
      }

      let outcome: Outcome;
      if (ev.approval_required) {
        // A pending request holds no seat.
        outcome = { kind: 'pending' };
      } else {
        const taken = await confirmedCount(client, ev.id);
        const free = ev.capacity === null ? Infinity : ev.capacity - taken;
        if (free > 0) {
          outcome = { kind: 'confirmed', ticket: await issueTicketCode(client) };
        } else if (ev.waitlist_enabled) {
          outcome = {
            kind: 'waitlisted',
            position: await nextWaitlistPosition(client, ev.id),
          };
        } else {
          throw new FieldError(
            'event_slug',
            'This event is full and its host is not keeping a waiting list.',
            409,
          );
        }
      }

      const status =
        outcome.kind === 'confirmed'
          ? 'confirmed'
          : outcome.kind === 'pending'
            ? 'pending_approval'
            : 'waitlisted';
      const ticket = outcome.kind === 'confirmed' ? outcome.ticket : null;
      const position = outcome.kind === 'waitlisted' ? outcome.position : null;

      const params = [ev.id, account.id, status, position, ticket];
      const { rows } = mine
        ? await client.query(
            `UPDATE registrations
                SET status = $3, waitlist_position = $4, ticket_code = $5,
                    checked_in_at = NULL, updated_at = now()
              WHERE event_id = $1 AND account_id = $2 RETURNING *`,
            params,
          )
        : await client.query(
            `INSERT INTO registrations
               (event_id, account_id, status, waitlist_position, ticket_code)
             VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            params,
          );
      return { event: ev, registration: rows[0], outcome, repeat: false } as const;
    }).catch(async (err) => {
      // The trigger refused the seat: the loser of the race takes the
      // waiting list instead, or is told the event is full.
      if (isCapacityViolation(err)) return 'raced' as const;
      if (isUniqueViolation(err, 'registrations_one_per_account')) return 'raced' as const;
      throw err;
    });

    if (result === null) return notFound(c);

    if (result === 'raced') {
      const retry = await registerAfterRace(slug, account.id);
      if (!retry) return notFound(c);
      await mailOutcome(retry, account.email, account.display_name);
      return c.json(registrationPublic(retry.registration), retry.created ? 201 : 200);
    }

    if (result.repeat) {
      return c.json(registrationPublic(result.registration), 200);
    }

    await mailOutcome(
      { event: result.event, registration: result.registration, outcome: result.outcome! },
      account.email,
      account.display_name,
    );
    log('info', 'registration_created', {
      event_id: result.event.id,
      account_id: account.id,
      status: result.registration.status,
    });
    return c.json(registrationPublic(result.registration), 201);
  } catch (err) {
    return handleError(err, c);
  }
});

/** The losing side of a seat race: take a waiting-list place instead. */
async function registerAfterRace(slug: string, accountId: string) {
  return tx(async (client) => {
    const { rows: found } = await client.query('SELECT id FROM events WHERE slug = $1', [
      slug,
    ]);
    if (!found.length) return null;
    const ev = await lockEvent(client, found[0].id);

    const { rows: mineRows } = await client.query(
      'SELECT * FROM registrations WHERE event_id = $1 AND account_id = $2 FOR UPDATE',
      [ev.id, accountId],
    );
    const mine = mineRows[0];
    if (
      mine &&
      ['confirmed', 'checked_in', 'waitlisted', 'pending_approval'].includes(mine.status)
    ) {
      return { event: ev, registration: mine, outcome: null, created: false };
    }

    const taken = await confirmedCount(client, ev.id);
    const free = ev.capacity === null ? Infinity : ev.capacity - taken;
    if (free > 0) {
      const ticket = await issueTicketCode(client);
      const { rows } = await upsert(client, ev.id, accountId, 'confirmed', null, ticket, !!mine);
      return {
        event: ev,
        registration: rows[0],
        outcome: { kind: 'confirmed', ticket } as Outcome,
        created: !mine,
      };
    }
    if (!ev.waitlist_enabled) {
      // rejected as full, leaving no partial row
      throw new FieldError(
        'event_slug',
        'This event just filled up and its host is not keeping a waiting list.',
        409,
      );
    }
    const position = await nextWaitlistPosition(client, ev.id);
    const { rows } = await upsert(
      client,
      ev.id,
      accountId,
      'waitlisted',
      position,
      null,
      !!mine,
    );
    return {
      event: ev,
      registration: rows[0],
      outcome: { kind: 'waitlisted', position } as Outcome,
      created: !mine,
    };
  });
}

async function upsert(
  client: Parameters<typeof renumberWaitlist>[0],
  eventId: string,
  accountId: string,
  status: string,
  position: number | null,
  ticket: string | null,
  exists: boolean,
) {
  const params = [eventId, accountId, status, position, ticket];
  return exists
    ? client.query(
        `UPDATE registrations SET status = $3, waitlist_position = $4,
             ticket_code = $5, checked_in_at = NULL, updated_at = now()
           WHERE event_id = $1 AND account_id = $2 RETURNING *`,
        params,
      )
    : client.query(
        `INSERT INTO registrations
           (event_id, account_id, status, waitlist_position, ticket_code)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        params,
      );
}

async function mailOutcome(
  result: {
    event: EventRow;
    registration: { id: string; status: string; ticket_code: string | null; waitlist_position: number | null };
    outcome: Outcome | null;
  },
  email: string,
  name: string,
) {
  const { event: ev, registration: reg, outcome } = result;
  if (!outcome) return;
  if (outcome.kind === 'confirmed') {
    await sendMail({
      to: email,
      subject: SUBJECTS.confirmed(ev.title),
      lines: bodyConfirmed(ev, name, outcome.ticket),
      eventId: ev.id,
      registrationId: reg.id,
    });
  } else if (outcome.kind === 'pending') {
    await sendMail({
      to: email,
      subject: SUBJECTS.pending(ev.title),
      lines: bodyPending(ev, name),
      eventId: ev.id,
      registrationId: reg.id,
    });
  } else {
    await sendMail({
      to: email,
      subject: SUBJECTS.waitlisted(ev.title),
      lines: bodyWaitlisted(ev, name, outcome.position),
      eventId: ev.id,
      registrationId: reg.id,
    });
  }
}

/* ------------------------------------------------------------- my own list */

registrationRoutes.get('/registrations/me', async (c: AppContext) => {
  try {
    const account = await requireAccount(c);
    const { rows } = await pool.query(
      `SELECT r.id, r.status, r.waitlist_position, r.ticket_code, r.checked_in_at,
              r.created_at, e.slug AS event_slug, e.title, e.starts_at, e.ends_at,
              e.time_zone, e.city, e.theme_hex, e.cover_seed, e.state AS event_state,
              e.capacity
         FROM registrations r JOIN events e ON e.id = r.event_id
        WHERE r.account_id = $1
        ORDER BY e.starts_at ASC NULLS LAST, e.slug ASC`,
      [account.id],
    );
    return c.json(
      rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        status: r.status,
        waitlist_position: r.waitlist_position,
        ticket_code: r.ticket_code,
        checked_in_at: toUtcIso(r.checked_in_at as Date | null),
        event_slug: r.event_slug,
        title: r.title,
        starts_at: toUtcIso(r.starts_at as Date | null),
        ends_at: toUtcIso(r.ends_at as Date | null),
        time_zone: r.time_zone,
        city: r.city,
        theme_hex: r.theme_hex,
        cover_seed: r.cover_seed,
        event_state: r.event_state,
        has_ended: r.ends_at
          ? new Date(r.ends_at as Date).getTime() < Date.now()
          : false,
      })),
    );
  } catch (err) {
    return handleError(err, c);
  }
});

/**
 * Cancelling frees the seat in the same request and promotes waiting-list
 * position 1 to confirmed with a ticket. A guest cancelling sends no mail to
 * themselves; the promoted guest is mailed.
 */
registrationRoutes.post('/registrations/:id/cancel', async (c: AppContext) => {
  try {
    const account = await requireAccount(c);
    const id = String(c.req.param('id'));

    const result = await tx(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM registrations WHERE id = $1 FOR UPDATE',
        [id],
      );
      const reg = rows[0];
      if (!reg || reg.account_id !== account.id) return null;
      const ev = await lockEvent(client, reg.event_id);

      if (['cancelled_by_guest', 'cancelled_by_host'].includes(reg.status)) {
        return { registration: reg, promoted: [], event: ev };
      }

      const wasWaitlisted = reg.status === 'waitlisted';
      const { rows: updated } = await client.query(
        `UPDATE registrations
            SET status = 'cancelled_by_guest', ticket_code = NULL,
                waitlist_position = NULL, checked_in_at = NULL, updated_at = now()
          WHERE id = $1 RETURNING *`,
        [id],
      );
      if (wasWaitlisted) await renumberWaitlist(client, ev.id);

      // While registration is closed a seat is freed without promoting anybody.
      const promoted =
        ev.state === 'published' ? await promoteFromWaitlist(client, ev, 1) : [];
      return { registration: updated[0], promoted, event: ev };
    });

    if (!result) return notFound(c);
    for (const p of result.promoted) {
      await sendMail({
        to: p.email,
        subject: SUBJECTS.promoted(result.event.title),
        lines: bodyPromoted(result.event, p.display_name, p.ticket_code),
        eventId: result.event.id,
        registrationId: p.registration_id,
      });
    }
    log('info', 'registration_cancelled', {
      registration_id: id,
      promoted: result.promoted.length,
    });
    return c.json(registrationPublic(result.registration));
  } catch (err) {
    return handleError(err, c);
  }
});

/* ------------------------------------------------------- the approval queue */

async function loadForHost(id: string, hostId: string) {
  const { rows } = await pool.query(
    `SELECT r.*, e.title, e.slug AS event_slug, e.time_zone, e.city, e.starts_at,
            e.id AS ev_id, e.capacity, e.state AS event_state,
            e.waitlist_enabled, cal.owner_account_id, a.email, a.display_name
       FROM registrations r
       JOIN events e ON e.id = r.event_id
       JOIN calendars cal ON cal.id = e.calendar_id
       JOIN accounts a ON a.id = r.account_id
      WHERE r.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row || row.owner_account_id !== hostId) return null;
  return row;
}

/** The host approves a pending request to confirmed, or waitlisted when full. */
registrationRoutes.post('/registrations/:id/approve', async (c: AppContext) => {
  try {
    const account = await requireAccount(c);
    const found = await loadForHost(String(c.req.param('id')), account.id);
    if (!found) return notFound(c);

    const result = await tx(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM registrations WHERE id = $1 FOR UPDATE',
        [found.id],
      );
      const reg = rows[0];
      const ev = await lockEvent(client, reg.event_id);
      if (reg.status !== 'pending_approval') {
        throw new FieldError(
          'status',
          'That request has already been decided.',
          409,
        );
      }
      const taken = await confirmedCount(client, ev.id);
      const free = ev.capacity === null ? Infinity : ev.capacity - taken;

      if (free > 0) {
        const ticket = await issueTicketCode(client);
        const { rows: out } = await client.query(
          `UPDATE registrations SET status = 'confirmed', ticket_code = $2,
                waitlist_position = NULL, updated_at = now()
             WHERE id = $1 RETURNING *`,
          [reg.id, ticket],
        );
        return { registration: out[0], ev, kind: 'confirmed' as const, ticket };
      }
      if (!ev.waitlist_enabled) {
        throw new FieldError(
          'capacity',
          'This event is full and its host is not keeping a waiting list.',
          409,
        );
      }
      // Approving into a full event moves that row to the waiting list.
      const position = await nextWaitlistPosition(client, ev.id);
      const { rows: out } = await client.query(
        `UPDATE registrations SET status = 'waitlisted', waitlist_position = $2,
              ticket_code = NULL, updated_at = now()
           WHERE id = $1 RETURNING *`,
        [reg.id, position],
      );
      return { registration: out[0], ev, kind: 'waitlisted' as const, position };
    });

    if (result.kind === 'confirmed') {
      await sendMail({
        to: found.email,
        subject: SUBJECTS.approved(result.ev.title),
        lines: bodyApproved(result.ev, found.display_name, result.ticket),
        eventId: result.ev.id,
        registrationId: result.registration.id,
      });
    } else {
      await sendMail({
        to: found.email,
        subject: SUBJECTS.waitlisted(result.ev.title),
        lines: bodyWaitlisted(result.ev, found.display_name, result.position),
        eventId: result.ev.id,
        registrationId: result.registration.id,
      });
    }
    log('info', 'registration_approved', {
      registration_id: found.id,
      status: result.registration.status,
    });
    return c.json(
      registrationPublic(result.registration) as Record<string, unknown>,
      200,
    );
  } catch (err) {
    return handleError(err, c);
  }
});

registrationRoutes.post('/registrations/:id/decline', async (c: AppContext) => {
  try {
    const account = await requireAccount(c);
    const found = await loadForHost(String(c.req.param('id')), account.id);
    if (!found) return notFound(c);

    const result = await tx(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM registrations WHERE id = $1 FOR UPDATE',
        [found.id],
      );
      const reg = rows[0];
      const ev = await lockEvent(client, reg.event_id);
      if (reg.status !== 'pending_approval') {
        throw new FieldError('status', 'That request has already been decided.', 409);
      }
      const { rows: out } = await client.query(
        `UPDATE registrations SET status = 'declined', ticket_code = NULL,
              waitlist_position = NULL, updated_at = now()
           WHERE id = $1 RETURNING *`,
        [reg.id],
      );
      return { registration: out[0], ev };
    });

    await sendMail({
      to: found.email,
      subject: SUBJECTS.declined(result.ev.title),
      lines: bodyDeclined(result.ev, found.display_name),
      eventId: result.ev.id,
      registrationId: result.registration.id,
    });
    log('info', 'registration_declined', { registration_id: found.id });
    return c.json(registrationPublic(result.registration));
  } catch (err) {
    return handleError(err, c);
  }
});

import { ticketCode } from './config.js';
import { withTxn, type Txn } from './db.js';
import { sendMail } from './mail.js';
import {
  ApiError, MAIL_SUBJECTS, isSeat, nextWaitlistPosition, renumberWaitlist, seatCount,
} from './domain.js';

export interface RegRow {
  id: string; event_id: string; account_id: string; status: string;
  waitlist_position: number | null; ticket_code: string | null;
  checked_in_at: Date | null; created_at: Date; updated_at: Date;
}

export interface EventLite {
  id: string; title: string; slug: string; state: string; capacity: number;
  approval_required: boolean; waitlist_enabled: boolean;
}

export function isEventFull(seats: number, capacity: number): boolean {
  return seats >= capacity;
}

/**
 * Places one account into one event. The last seat is decided by the database:
 * the BEFORE trigger on `registrations` raises for any insert or status change
 * that would take an event past capacity, aborting the whole transaction, so a
 * rejected attempt leaves no row, no seat and no ticket.
 */
export async function placeRegistration(
  tx: Txn,
  event: EventLite,
  account: { id: string; email: string; display_name: string },
  opts: { priorStatus?: string },
): Promise<{ row: RegRow; outcome: 'confirmed' | 'waitlisted' | 'pending_approval' | 'unchanged' | 'promoted' }> {
  const seats = await seatCount(tx, event.id);

  let target: 'confirmed' | 'waitlisted' | 'pending_approval';
  if (event.approval_required) {
    target = 'pending_approval';
  } else if (seats < event.capacity) {
    target = 'confirmed';
  } else if (event.waitlist_enabled) {
    target = 'waitlisted';
  } else {
    throw new ApiError(400, 'event_full', `This event just filled up.`);
  }

  const prior = opts.priorStatus;
  if (prior === target) return { row: null as any, outcome: 'unchanged' };

  let position: number | null = null;
  if (target === 'waitlisted') position = await nextWaitlistPosition(tx, event.id);

  const values: any[] = [event.id, account.id, target, position,
    target === 'confirmed' ? ticketCode() : null];
  const [row] = await tx.query<RegRow>(
    prior === undefined
      ? `INSERT INTO registrations (event_id, account_id, status, waitlist_position, ticket_code)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`
      : `UPDATE registrations
            SET status = $3, waitlist_position = $4, ticket_code = $5, updated_at = now()
          WHERE event_id = $1 AND account_id = $2 RETURNING *`,
    values,
  );
  await renumberWaitlist(tx, event.id);
  return { row, outcome: target };
}

export async function tryRegister(
  eventSlug: string,
  account: { id: string; email: string; display_name: string },
): Promise<{ row: RegRow; created: boolean }> {
  return withTxn(async tx => {
    const [event] = await tx.query<EventLite>(
      `SELECT id, title, slug, state, capacity, approval_required, waitlist_enabled
         FROM events WHERE slug = $1 FOR UPDATE`, [eventSlug]);
    if (!event) throw new ApiError(404, 'not_found', `This event does not exist.`);
    if (event.state === 'draft') throw new ApiError(404, 'not_found', `This event does not exist.`);
    if (event.state === 'cancelled') throw new ApiError(400, 'event_cancelled', `This event has been cancelled.`);
    if (event.state === 'registration_closed') {
      throw new ApiError(400, 'registration_closed', `Registration Is Closed. The host has stopped taking registrations for this event.`);
    }

    const [existing] = await tx.query<{ id: string; status: string; waitlist_position: number | null; ticket_code: string | null }>(
      `SELECT id, status, waitlist_position, ticket_code FROM registrations
        WHERE event_id = $1 AND account_id = $2 FOR UPDATE`,
      [event.id, account.id]);

    if (existing) {
      const reversible = ['declined', 'cancelled_by_guest', 'cancelled_by_host'].includes(existing.status);
      if (!reversible) {
        const [full] = await tx.query<RegRow>(`SELECT * FROM registrations WHERE id = $1`, [existing.id]);
        return { row: full, created: false };
      }
    }

    const placed = await placeRegistration(tx, event, account, {
      priorStatus: existing?.status,
    });
    return { row: placed.row, created: true };
  });
}

/**
 * Cancels one registration by its owner and, in the same transaction, promotes
 * waiting-list position 1 when the freed seat allows it.
 */
export async function cancelRegistration(
  regId: string,
  actor: { id: string; role: string },
  opts: { asHost?: boolean } = {},
): Promise<{ row: RegRow; promotedEmails: { email: string; regId: string }[] }> {
  return withTxn(async tx => {
    const [row] = await tx.query<RegRow & { ev_title: string; ev_slug: string; email: string; state: string; waitlist_enabled: boolean }>(
      `SELECT r.*, e.title AS ev_title, e.slug AS ev_slug, e.state, e.waitlist_enabled, a.email
         FROM registrations r JOIN events e ON e.id = r.event_id JOIN accounts a ON a.id = r.account_id
        WHERE r.id = $1 FOR UPDATE OF r`,
      [regId]);
    if (!row) throw new ApiError(404, 'not_found', `This registration does not exist.`);

    const isHostAction = !!opts.asHost;
    const ownsCalendar = await rowOwnerIs(tx, regId, actor.id);
    if (!isHostAction && row.account_id !== actor.id) {
      throw new ApiError(403, 'forbidden', `That registration belongs to somebody else.`);
    }
    if (isHostAction && !ownsCalendar) {
      throw new ApiError(403, 'forbidden', `That registration belongs to another calendar.`);
    }

    if (row.status === 'cancelled_by_guest' || row.status === 'cancelled_by_host') {
      return { row, promotedEmails: [] };
    }

    const newStatus = isHostAction ? 'cancelled_by_host' : 'cancelled_by_guest';
    const [updated] = await tx.query<RegRow>(
      `UPDATE registrations SET status = $2, ticket_code = NULL, waitlist_position = NULL, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [regId, newStatus]);

    await renumberWaitlist(tx, row.event_id);
    // While registration is closed a freed seat stays free: nobody is promoted.
    const promoted = row.state === 'registration_closed'
      ? []
      : await promoteFromWaitlist(tx, row.event_id, row.ev_title, row.waitlist_enabled);
    return { row: updated, promotedEmails: promoted };
  });
}

export async function rowOwnerIs(tx: Txn, regId: string, accountId: string): Promise<boolean> {
  const rows = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM registrations r JOIN events e ON e.id = r.event_id
       JOIN calendars c ON c.id = e.calendar_id
      WHERE r.id = $1 AND c.owner_account_id = $2`, [regId, accountId]);
  return Number(rows[0].n) > 0;
}

/** Fills seats that just appeared, in waitlist order, without mailing. */
export async function promoteFromWaitlist(
  tx: Txn, eventId: string, title: string, waitlistEnabled: boolean,
): Promise<{ email: string; regId: string }[]> {
  if (!waitlistEnabled) return [];
  const moved: { email: string; regId: string }[] = [];
  for (;;) {
    const seats = await seatCount(tx, eventId);
    const [ev] = await tx.query<{ capacity: number; state: string }>(
      `SELECT capacity, state FROM events WHERE id = $1`, [eventId]);
    if (seats >= ev.capacity) break;
    const [head] = await tx.query<{ id: string; account_id: string; email: string }>(
      `SELECT r.id, r.account_id, a.email FROM registrations r JOIN accounts a ON a.id = r.account_id
        WHERE r.event_id = $1 AND r.status = 'waitlisted'
        ORDER BY r.waitlist_position ASC LIMIT 1 FOR UPDATE OF r`, [eventId]);
    if (!head) break;
    try {
      await tx.query(
        `UPDATE registrations SET status = 'confirmed', waitlist_position = NULL, ticket_code = $2, updated_at = now()
          WHERE id = $1`, [head.id, ticketCode()]);
    } catch (e) {
      if (String((e as any)?.message ?? '').includes('event_full')) break;
      throw e;
    }
    moved.push({ email: head.email, regId: head.id });
    await renumberWaitlist(tx, eventId);
  }
  return moved;
}

export async function approveRegistration(
  regId: string, hostAccountId: string,
): Promise<{ row: RegRow; outcome: string }> {
  return withTxn(async tx => {
    const [row] = await tx.query<any>(
      `SELECT r.*, e.title AS ev_title, e.capacity, e.approval_required, e.waitlist_enabled, a.email,
              c.owner_account_id
         FROM registrations r
         JOIN events e ON e.id = r.event_id
         JOIN accounts a ON a.id = r.account_id
         JOIN calendars c ON c.id = e.calendar_id
        WHERE r.id = $1 FOR UPDATE OF r`,
      [regId]);
    if (!row) throw new ApiError(404, 'not_found', `This registration does not exist.`);
    if (row.owner_account_id !== hostAccountId) {
      throw new ApiError(403, 'forbidden', `That registration belongs to another calendar.`);
    }
    if (row.status !== 'pending_approval') {
      return { row, outcome: 'unchanged' };
    }

    const seats = await seatCount(tx, row.event_id);
    let target: 'confirmed' | 'waitlisted';
    if (seats < row.capacity) target = 'confirmed';
    else if (row.waitlist_enabled) target = 'waitlisted';
    else throw new ApiError(400, 'event_full', `This event just filled up.`);

    const position = target === 'waitlisted' ? await nextWaitlistPosition(tx, row.event_id) : null;
    const [updated] = await tx.query<RegRow>(
      `UPDATE registrations SET status = $2, waitlist_position = $3,
              ticket_code = CASE WHEN $2 = 'confirmed' THEN $4 ELSE NULL END, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [regId, target, position, ticketCode()]);
    await renumberWaitlist(tx, row.event_id);
    return { row: updated, outcome: target };
  });
}

export async function declineRegistration(regId: string, hostAccountId: string): Promise<RegRow> {
  return withTxn(async tx => {
    const [row] = await tx.query<any>(
      `SELECT r.*, c.owner_account_id FROM registrations r
         JOIN events e ON e.id = r.event_id
         JOIN calendars c ON c.id = e.calendar_id
        WHERE r.id = $1 FOR UPDATE OF r`, [regId]);
    if (!row) throw new ApiError(404, 'not_found', `This registration does not exist.`);
    if (row.owner_account_id !== hostAccountId) {
      throw new ApiError(403, 'forbidden', `That registration belongs to another calendar.`);
    }
    if (row.status === 'pending_approval' || row.status === 'waitlisted') {
      const [updated] = await tx.query<RegRow>(
        `UPDATE registrations SET status = 'declined', waitlist_position = NULL, ticket_code = NULL, updated_at = now()
          WHERE id = $1 RETURNING *`, [regId]);
      await renumberWaitlist(tx, row.event_id);
      return updated;
    }
    const [full] = await tx.query<RegRow>(`SELECT * FROM registrations WHERE id = $1`, [regId]);
    return full;
  });
}

export async function checkInTicket(code: string, hostAccountId: string): Promise<RegRow> {
  return withTxn(async tx => {
    const [row] = await tx.query<any>(
      `SELECT r.*, c.owner_account_id FROM registrations r
         JOIN events e ON e.id = r.event_id
         JOIN calendars c ON c.id = e.calendar_id
        WHERE r.ticket_code = $1 FOR UPDATE OF r`, [code]);
    if (!row) throw new ApiError(404, 'not_found', `No ticket carries that code.`);
    if (row.owner_account_id !== hostAccountId) {
      throw new ApiError(403, 'forbidden', `That ticket belongs to another calendar.`);
    }
    if (row.status === 'checked_in') {
      const [again] = await tx.query<RegRow>(`SELECT * FROM registrations WHERE id = $1`, [row.id]);
      return again;
    }
    const [updated] = await tx.query<RegRow>(
      `UPDATE registrations SET status = 'checked_in', checked_in_at = now(), updated_at = now()
        WHERE id = $1 RETURNING *`, [row.id]);
    return updated;
  });
}

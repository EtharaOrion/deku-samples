import { tx, type Tx } from '../../db.js';
import { DomainError, serializeRegistration } from '../registrations.js';
import { loadEventBySlug, type EventRow } from '../events.js';
import { queueMail, dispatchMail, type QueuedMail } from '../mail.js';
import type { AuthAccount } from '../../auth.js';
import { freshCode } from './register.js';

export type RegisterOutcome = {
  registration: ReturnType<typeof serializeRegistration>;
  created: boolean;
};

const SERIALIZATION_RETRY = 8;

function isSerializationFailure(err: unknown): boolean {
  const e = err as { code?: string; message?: string; cause?: { code?: string } };
  return e?.code === '40001' || e?.cause?.code === '40001' || /could not serialize access/i.test(String(e?.message ?? ''));
}

function isSeatGuard(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? (err as { cause?: { message?: string } })?.cause?.message ?? '');
  return /EVENT_FULL/.test(msg);
}

function explainFull(): never {
  throw new DomainError('This event just filled up. Registration is full.', 409, 'event_slug');
}

function isDuplicateCode(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  return (e?.code ?? e?.cause?.code) === '23505' && String(e?.constraint ?? e?.cause?.constraint ?? '').includes('ticket_code');
}

/** Confirms a registration and issues its ticket in one statement. */
async function confirmRow(client: Tx, registrationId: string) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const { rows } = await client.query(
        `UPDATE registrations SET status = 'confirmed', waitlist_position = NULL, checked_in_at = NULL, updated_at = now(), ticket_code = $2
         WHERE id = $1 RETURNING *`,
        [registrationId, freshCode()],
      );
      return rows[0];
    } catch (err) {
      if (isDuplicateCode(err)) continue;
      throw err;
    }
  }
  throw new DomainError('A ticket code could not be issued. Try again.', 500);
}

/**
 * Runs a unit of host/guest work in one transaction — locking the event row so
 * concurrent writes to the same event are ordered — with retry on the rare
 * serialization failure, then dispatches the mail the transaction queued, all
 * inside the request that caused the transition.
 */
export async function transitional<T>(fn: (client: Tx, queued: QueuedMail[]) => Promise<T>): Promise<{ result: T; queued: QueuedMail[] }> {
  for (let attempt = 0; attempt <= SERIALIZATION_RETRY; attempt++) {
    const queued: QueuedMail[] = [];
    try {
      const result = await tx(async (client) => fn(client, queued), 'READ COMMITTED');
      await dispatchMail(queued);
      return { result, queued };
    } catch (err) {
      if (isSerializationFailure(err)) continue;
      throw err;
    }
  }
  throw new DomainError('That request could not be completed just now. Try again.', 409);
}

async function joinAccount(client: Tx, registrationId: string) {
  const { rows } = await client.query(
    `SELECT r.*, a.email, a.display_name FROM registrations r JOIN accounts a ON a.id = r.account_id WHERE r.id = $1`,
    [registrationId],
  );
  return rows[0];
}

async function countConfirmed(client: Tx, eventId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM registrations WHERE event_id = $1 AND status IN ('confirmed','checked_in')`,
    [eventId],
  );
  return rows[0].n as number;
}

async function renumber(client: Tx, eventId: string): Promise<void> {
  const { rows } = await client.query(
    `SELECT id FROM registrations WHERE event_id = $1 AND status = 'waitlisted' ORDER BY waitlist_position ASC, created_at ASC`,
    [eventId],
  );
  let pos = 1;
  for (const row of rows) {
    await client.query(`UPDATE registrations SET waitlist_position = $2, updated_at = now() WHERE id = $1`, [row.id, pos]);
    pos += 1;
  }
}

async function nextPosition(client: Tx, eventId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT coalesce(max(waitlist_position), 0)::int AS n FROM registrations WHERE event_id = $1 AND status = 'waitlisted'`,
    [eventId],
  );
  return (rows[0].n as number) + 1;
}

/** Promotes the head of the waiting list, queueing its mail. */
async function promoteHead(client: Tx, event: EventRow, queued: QueuedMail[]): Promise<void> {
  const confirmed = await countConfirmed(client, event.id);
  if (confirmed >= event.capacity) return;
  const head = (
    await client.query(
      `SELECT r.*, a.email, a.display_name FROM registrations r JOIN accounts a ON a.id = r.account_id
        WHERE r.event_id = $1 AND r.status = 'waitlisted'
        ORDER BY r.waitlist_position ASC, r.created_at ASC LIMIT 1`,
      [event.id],
    )
  ).rows[0];
  if (!head) return;
  const promoted = await confirmRow(client, head.id);
  await renumber(client, event.id);
  queued.push(
    queueMail(event, 'promoted', {
      registrationId: head.id,
      email: head.email,
      displayName: head.display_name,
      ticketCode: promoted.ticket_code,
    }),
  );
}

/** A guest cancels their own registration. No mail for the guest's own cancel. */
export async function cancelOwnRegistration(account: AuthAccount, registrationId: string) {
  const { result } = await transitional(async (client, queued) => {
    const row = await joinAccount(client, registrationId);
    if (!row || row.account_id !== account.id) throw new DomainError('That registration does not exist.', 404);
    const event = (await (
      await import('../events.js')
    ).loadEventById(client, row.event_id)) as EventRow;
    if (!event) throw new DomainError('That event does not exist.', 404);

    await client.query(`SELECT id FROM events WHERE id = $1 FOR UPDATE`, [event.id]);

    if (row.status === 'cancelled_by_guest' || row.status === 'cancelled_by_host' || row.status === 'declined') {
      return serializeRegistration(row);
    }

    const wasSeat = row.status === 'confirmed' || row.status === 'checked_in';
    const wasWaiting = row.status === 'waitlisted';
    await client.query(
      `UPDATE registrations SET status = 'cancelled_by_guest', waitlist_position = NULL, ticket_code = NULL, checked_in_at = NULL, updated_at = now()
       WHERE id = $1`,
      [registrationId],
    );
    if (wasWaiting) await renumber(client, event.id);

    // The seat frees in this same request. While registration is closed the
    // seat stays free: nobody is promoted.
    if (wasSeat && event.state === 'published') {
      await promoteHead(client, event, queued);
    }

    const fresh = await joinAccount(client, registrationId);
    return serializeRegistration(fresh);
  });
  return result;
}

/** Host approves a pending request: confirmed when a seat is free, waitlisted when full. */
export async function approveRegistration(account: AuthAccount, registrationId: string) {
  const { result } = await transitional(async (client, queued) => {
    const row = await joinAccount(client, registrationId);
    if (!row) throw new DomainError('That registration does not exist.', 404);
    const event = await (await import('../events.js')).loadEventById(client, row.event_id);
    if (!event) throw new DomainError('That event does not exist.', 404);
    await assertOwnsEvent(account, event);
    await client.query(`SELECT id FROM events WHERE id = $1 FOR UPDATE`, [event.id]);
    if (row.status !== 'pending_approval') {
      return { registration: serializeRegistration(row), note: 'This request was already decided.' };
    }
    const confirmed = await countConfirmed(client, event.id);
    if (confirmed < event.capacity) {
      const confirmedRow = await confirmRow(client, registrationId);
      queued.push(
        queueMail(event, 'approved', {
          registrationId,
          email: row.email,
          displayName: row.display_name,
          ticketCode: confirmedRow.ticket_code,
        }),
      );
      const fresh = await joinAccount(client, registrationId);
      return { registration: serializeRegistration(fresh), note: null };
    }
    if (event.waitlist_enabled) {
      const pos = await nextPosition(client, event.id);
      await client.query(
        `UPDATE registrations SET status = 'waitlisted', waitlist_position = $2, ticket_code = NULL, updated_at = now() WHERE id = $1`,
        [registrationId, pos],
      );
      queued.push(
        queueMail(event, 'waitlisted', {
          registrationId,
          email: row.email,
          displayName: row.display_name,
          waitlistPosition: pos,
        }),
      );
      const fresh = await joinAccount(client, registrationId);
      return {
        registration: serializeRegistration(fresh),
        note: 'This event is full, so the request took a waiting-list place.',
      };
    }
    throw new DomainError('This event just filled up. There is no waiting list to join.', 409);
  });
  return result;
}

export async function declineRegistration(account: AuthAccount, registrationId: string) {
  const { result } = await transitional(async (client, queued) => {
    const row = await joinAccount(client, registrationId);
    if (!row) throw new DomainError('That registration does not exist.', 404);
    const event = await (await import('../events.js')).loadEventById(client, row.event_id);
    if (!event) throw new DomainError('That event does not exist.', 404);
    await assertOwnsEvent(account, event);
    await client.query(`SELECT id FROM events WHERE id = $1 FOR UPDATE`, [event.id]);
    if (row.status !== 'pending_approval' && row.status !== 'waitlisted') {
      return { registration: serializeRegistration(row), note: 'This request was already decided.' };
    }
    await client.query(
      `UPDATE registrations SET status = 'declined', waitlist_position = NULL, ticket_code = NULL, updated_at = now() WHERE id = $1`,
      [registrationId],
    );
    if (row.status === 'waitlisted') await renumber(client, event.id);
    queued.push(queueMail(event, 'declined', { registrationId, email: row.email, displayName: row.display_name }));
    const fresh = await joinAccount(client, registrationId);
    return { registration: serializeRegistration(fresh), note: null };
  });
  return result;
}

export async function checkInTicket(account: AuthAccount, ticketCode: string) {
  const { result } = await transitional(async (client) => {
    const { rows } = await client.query(
      `SELECT r.*, a.email, a.display_name FROM registrations r JOIN accounts a ON a.id = r.account_id WHERE r.ticket_code = $1`,
      [ticketCode],
    );
    const row = rows[0];
    if (!row) throw new DomainError('That ticket code does not exist.', 404);
    const { loadEventById } = await import('../events.js');
    const event = await loadEventById(client, row.event_id);
    if (!event) throw new DomainError('That event does not exist.', 404);
    await assertOwnsEvent(account, event);
    await client.query(`SELECT id FROM events WHERE id = $1 FOR UPDATE`, [event.id]);
    if (row.status === 'checked_in') {
      return {
        registration: serializeRegistration(row),
        note: `Already checked in at ${new Date(row.checked_in_at).toISOString().replace(/\.\d{3}Z$/, 'Z')}.`,
        already: true,
      };
    }
    if (row.status !== 'confirmed') {
      throw new DomainError('That ticket is not holding a seat, so it cannot be checked in.', 409);
    }
    await client.query(
      `UPDATE registrations SET status = 'checked_in', checked_in_at = now(), updated_at = now() WHERE id = $1`,
      [row.id],
    );
    const fresh = await joinAccount(client, row.id);
    return { registration: serializeRegistration(fresh), note: null, already: false };
  });
  return result;
}

/** The host calls the whole event off. Every guest still holding a place is mailed the reason word for word. */
export async function cancelEvent(account: AuthAccount, slug: string, reason: string) {
  const { result } = await transitional(async (client, queued) => {
    const event = await loadEventBySlug(client, slug);
    if (!event || event.state === 'draft') throw new DomainError('That event does not exist.', 404);
    await assertOwnsEvent(account, event);
    if (event.state === 'cancelled') throw new DomainError('This event is already cancelled.', 409, 'reason');
    await client.query(
      `UPDATE events SET state = 'cancelled', cancelled_at = now(), cancel_reason = $2, updated_at = now() WHERE id = $1`,
      [event.id, reason],
    );
    const holders = (
      await client.query(
        `SELECT r.id, a.email, a.display_name, r.ticket_code, r.waitlist_position FROM registrations r JOIN accounts a ON a.id = r.account_id
          WHERE r.event_id = $1 AND r.status IN ('confirmed','checked_in','waitlisted','pending_approval')`,
        [event.id],
      )
    ).rows;
    for (const h of holders) {
      queued.push(
        queueMail(event, 'event_cancelled', {
          registrationId: h.id,
          email: h.email,
          displayName: h.display_name,
          ticketCode: h.ticket_code,
          waitlistPosition: h.waitlist_position,
        }, reason),
      );
    }
    return (await (await import('../events.js')).loadEventById(client, event.id)) as EventRow;
  });
  return result;
}

/**
 * Raising capacity fills the seats that just appeared from the waiting list, in
 * the same request that raised it. Returns the promoted registration ids.
 */
export async function promoteIntoNewSeats(client: Tx, event: EventRow, newCapacity: number, queued: QueuedMail[]): Promise<string[]> {
  const moved: string[] = [];
  for (;;) {
    const confirmed = await countConfirmed(client, event.id);
    if (confirmed >= newCapacity) break;
    const head = (
      await client.query(
        `SELECT r.*, a.email, a.display_name FROM registrations r JOIN accounts a ON a.id = r.account_id
          WHERE r.event_id = $1 AND r.status = 'waitlisted'
          ORDER BY r.waitlist_position ASC, r.created_at ASC LIMIT 1`,
        [event.id],
      )
    ).rows[0];
    if (!head) break;
    const promoted = await confirmRow(client, head.id);
    await renumber(client, event.id);
    queued.push(
      queueMail(event, 'promoted', {
        registrationId: head.id,
        email: head.email,
        displayName: head.display_name,
        ticketCode: promoted.ticket_code,
      }),
    );
    moved.push(head.id);
  }
  return moved;
}

export async function assertOwnsEvent(account: AuthAccount, event: EventRow): Promise<void> {
  if (account.role !== 'host' || event.owner_account_id !== account.id) {
    throw new DomainError('That event does not exist.', 404);
  }
}

export { isSeatGuard, explainFull };

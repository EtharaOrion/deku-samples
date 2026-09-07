import { tx, type Tx } from '../../db.js';
import { DomainError, serializeRegistration } from '../registrations.js';
import { loadEventBySlug, type EventRow } from '../events.js';
import { queueMail, dispatchMail, type QueuedMail } from '../mail.js';
import type { AuthAccount } from '../../auth.js';

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

function freshCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = new Uint8Array(8);
  (globalThis as any).crypto.getRandomValues(buf);
  let code = 'TKT-';
  for (let i = 0; i < 8; i++) code += alphabet[buf[i] % alphabet.length];
  return code;
}

function isDuplicateCode(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  return (e?.code ?? e?.cause?.code) === '23505' && String(e?.constraint ?? e?.cause?.constraint ?? '').includes('ticket_code');
}

export { freshCode };

/**
 * The one registration path. The event row is locked FOR UPDATE for the whole
 * transaction, so two guests taking the last seat at the same instant are
 * ordered by the database: exactly one row becomes confirmed, the other takes a
 * waiting-list place or is refused as full. The seat-guard trigger on the table
 * is the final word whatever the application logic does.
 */
export async function registerForEvent(account: AuthAccount, eventSlug: string): Promise<ReturnType<typeof serializeRegistration>> {
  for (let attempt = 0; attempt <= SERIALIZATION_RETRY; attempt++) {
    const queued: QueuedMail[] = [];
    try {
      const outcome = await tx(async (client) => {
        const event = await loadEventBySlug(client, eventSlug);
        if (!event || event.state === 'draft') throw new DomainError('That event does not exist.', 404);
        if (event.state === 'cancelled') {
          throw new DomainError('This event has been cancelled and takes no registrations.', 409, 'event_slug');
        }
        if (event.state === 'registration_closed') {
          throw new DomainError('Registration is closed for this event.', 409, 'event_slug');
        }
        if (new Date(event.ends_at).getTime() < Date.now()) {
          throw new DomainError('This event has already taken place.', 409, 'event_slug');
        }

        // Touch the event row so concurrent registrations on the same event
        // serialise against each other rather than both reading free seats.
        await client.query(`SELECT id FROM events WHERE id = $1 FOR UPDATE`, [event.id]);

        const prior = (
          await client.query(`SELECT * FROM registrations WHERE event_id = $1 AND account_id = $2`, [event.id, account.id])
        ).rows[0];
        const confirmed = await countConfirmed(client, event.id);
        const info = (await client.query(`SELECT email, display_name FROM accounts WHERE id = $1`, [account.id])).rows[0];
        const me = { registrationId: null as string | null, email: info.email as string, displayName: info.display_name as string };

        if (prior) {
          return await updateExisting(client, event, prior, confirmed, me, queued);
        }

        if (event.approval_required) {
          const inserted = await insertRow(client, event.id, account.id, 'pending_approval', null);
          queued.push(queueMail(event, 'awaiting', { ...me, registrationId: inserted.id }));
          return withEvent(serializeRegistration(inserted), event);
        }

        if (confirmed < event.capacity) {
          let inserted;
          try {
            inserted = await insertRow(client, event.id, account.id, 'confirmed', null);
          } catch (err) {
            if (isSeatGuard(err)) explainFull();
            throw err;
          }
          queued.push(queueMail(event, 'confirmed', { ...me, registrationId: inserted.id, ticketCode: inserted.ticket_code }));
          return withEvent(serializeRegistration(inserted), event);
        }

        if (event.waitlist_enabled) {
          const pos = await nextPosition(client, event.id);
          const inserted = await insertRow(client, event.id, account.id, 'waitlisted', pos);
          queued.push(queueMail(event, 'waitlisted', { ...me, registrationId: inserted.id, waitlistPosition: pos }));
          return withEvent(serializeRegistration(inserted), event);
        }

        explainFull();
      }, 'READ COMMITTED');
      await dispatchMail(queued);
      return outcome;
    } catch (err) {
      if (isSerializationFailure(err)) continue;
      if (isSeatGuard(err)) explainFull();
      throw err;
    }
  }
  throw new DomainError('That request could not be completed just now. Try again.', 409);
}

async function updateExisting(
  client: Tx,
  event: EventRow,
  prior: Record<string, any>,
  confirmed: number,
  me: { registrationId: string | null; email: string; displayName: string },
  queued: QueuedMail[],
) {
  const status = prior.status as string;

  if (status === 'cancelled_by_guest' || status === 'cancelled_by_host' || status === 'declined') {
    if (event.state !== 'published') {
      throw new DomainError(
        event.state === 'cancelled'
          ? 'This event has been cancelled and takes no registrations.'
          : 'Registration is closed for this event.',
        409,
        'event_slug',
      );
    }
    if (new Date(event.ends_at).getTime() < Date.now()) {
      throw new DomainError('This event has already taken place.', 409, 'event_slug');
    }
    if (event.approval_required) {
      const updated = await updateRow(client, prior.id, 'pending_approval', null);
      queued.push(queueMail(event, 'awaiting', { ...me, registrationId: updated.id }));
      return withEvent(serializeRegistration(updated), event);
    }
    if (confirmed < event.capacity) {
      let updated;
      try {
        updated = await updateRow(client, prior.id, 'confirmed', null);
      } catch (err) {
        if (isSeatGuard(err)) explainFull();
        throw err;
      }
      queued.push(queueMail(event, 'confirmed', { ...me, registrationId: updated.id, ticketCode: updated.ticket_code }));
      return withEvent(serializeRegistration(updated), event);
    }
    if (event.waitlist_enabled) {
      const pos = await nextPosition(client, event.id);
      const updated = await updateRow(client, prior.id, 'waitlisted', pos);
      queued.push(queueMail(event, 'waitlisted', { ...me, registrationId: updated.id, waitlistPosition: pos }));
      return withEvent(serializeRegistration(updated), event);
    }
    explainFull();
  }

  // Already holding a place: the row is returned unchanged, never a second row.
  return withEvent(serializeRegistration(prior as any), event);
}

async function countConfirmed(client: Tx, eventId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM registrations WHERE event_id = $1 AND status IN ('confirmed','checked_in')`,
    [eventId],
  );
  return rows[0].n as number;
}

async function nextPosition(client: Tx, eventId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT coalesce(max(waitlist_position), 0)::int AS n FROM registrations WHERE event_id = $1 AND status = 'waitlisted'`,
    [eventId],
  );
  return (rows[0].n as number) + 1;
}

async function insertRow(client: Tx, eventId: string, accountId: string, status: string, waitlistPosition: number | null) {
  if (status === 'confirmed') {
    // The ticket code is written in the same statement as the seat: the
    // ticket_status_link check refuses a confirmed row without one.
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const { rows } = await client.query(
          `INSERT INTO registrations (event_id, account_id, status, ticket_code)
           VALUES ($1, $2, 'confirmed', $3) RETURNING *`,
          [eventId, accountId, freshCode()],
        );
        return rows[0];
      } catch (err) {
        if (isDuplicateCode(err)) continue;
        throw err;
      }
    }
    throw new DomainError('A ticket code could not be issued. Try again.', 500);
  }
  const { rows } = await client.query(
    `INSERT INTO registrations (event_id, account_id, status, waitlist_position)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [eventId, accountId, status, waitlistPosition],
  );
  return rows[0];
}

async function updateRow(client: Tx, id: string, status: string, waitlistPosition: number | null) {
  if (status === 'confirmed') {
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const { rows } = await client.query(
          `UPDATE registrations SET status = 'confirmed', ticket_code = $2, waitlist_position = NULL, checked_in_at = NULL, updated_at = now()
           WHERE id = $1 RETURNING *`,
          [id, freshCode()],
        );
        return rows[0];
      } catch (err) {
        if (isDuplicateCode(err)) continue;
        throw err;
      }
    }
    throw new DomainError('A ticket code could not be issued. Try again.', 500);
  }
  const { rows } = await client.query(
    `UPDATE registrations SET status = $2, waitlist_position = $3, ticket_code = NULL, checked_in_at = NULL, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, status, waitlistPosition],
  );
  return rows[0];
}

function withEvent<T extends { event_slug: string | null; title: string | null }>(reg: T, event: EventRow): T {
  reg.event_slug = event.slug;
  reg.title = event.title;
  return reg;
}

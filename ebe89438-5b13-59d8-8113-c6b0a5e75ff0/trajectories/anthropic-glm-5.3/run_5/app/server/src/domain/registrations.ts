import type { Tx } from '../db.js';
import { toRfc3339 } from '../time.js';
import { newTicketCode } from '../slugs.js';

export type RegistrationStatus =
  | 'pending_approval'
  | 'confirmed'
  | 'waitlisted'
  | 'declined'
  | 'cancelled_by_guest'
  | 'cancelled_by_host'
  | 'checked_in';

export type RegistrationRow = {
  id: string;
  event_id: string;
  account_id: string;
  status: RegistrationStatus;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at: Date | null;
  created_at: Date;
  updated_at: Date;
  email?: string;
  display_name?: string;
  event_slug?: string;
  title?: string;
};

export function serializeRegistration(r: RegistrationRow) {
  return {
    id: r.id,
    event_id: r.event_id,
    account_id: r.account_id,
    email: r.email ?? null,
    display_name: r.display_name ?? null,
    status: r.status,
    waitlist_position: r.waitlist_position,
    ticket_code: r.ticket_code,
    checked_in_at: r.checked_in_at ? toRfc3339(r.checked_in_at) : null,
    created_at: toRfc3339(r.created_at),
    updated_at: toRfc3339(r.updated_at),
    event_slug: r.event_slug ?? null,
    title: r.title ?? null,
  };
}

export class DomainError extends Error {
  status: number;
  field?: string;
  meta?: Record<string, unknown>;
  constructor(message: string, status = 400, field?: string, meta?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.field = field;
    this.meta = meta;
  }
}

export async function loadRegistration(client: Tx, id: string): Promise<RegistrationRow | null> {
  const { rows } = await client.query(`SELECT * FROM registrations WHERE id = $1`, [id]);
  return (rows[0] as RegistrationRow) ?? null;
}

export async function loadRegistrationForEvent(
  client: Tx,
  eventId: string,
  accountId: string,
): Promise<RegistrationRow | null> {
  const { rows } = await client.query(
    `SELECT * FROM registrations WHERE event_id = $1 AND account_id = $2`,
    [eventId, accountId],
  );
  return (rows[0] as RegistrationRow) ?? null;
}

/** Issues a unique ticket code with a retry loop; the unique index is the final word. */
export async function issueTicket(client: Tx, registrationId: string): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = newTicketCode();
    const { rowCount } = await client.query(
      `UPDATE registrations SET ticket_code = $1, updated_at = now() WHERE id = $2 AND ticket_code IS NULL`,
      [code, registrationId],
    );
    if (rowCount === 1) return code;
    const existing = await client.query(`SELECT ticket_code FROM registrations WHERE id = $1`, [registrationId]);
    if (existing.rows[0]?.ticket_code) return existing.rows[0].ticket_code as string;
  }
  throw new DomainError('Could not issue a ticket code. Try again in a moment.', 500);
}

export async function clearTicket(client: Tx, registrationId: string): Promise<void> {
  await client.query(
    `UPDATE registrations SET ticket_code = NULL, checked_in_at = NULL, updated_at = now() WHERE id = $1`,
    [registrationId],
  );
}

/** Next free waitlist position on an event, 1-based. */
export async function nextWaitlistPosition(client: Tx, eventId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT coalesce(max(waitlist_position), 0)::int AS n FROM registrations WHERE event_id = $1 AND status = 'waitlisted'`,
    [eventId],
  );
  return (rows[0].n as number) + 1;
}

/** Renumber the remaining waiting list to 1..n with no gaps. */
export async function renumberWaitlist(client: Tx, eventId: string): Promise<void> {
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

export type PromoteResult = { promoted: string[] };

/**
 * Fill free seats from the waiting list, lowest position first.
 * Returns the promoted registration ids in promotion order.
 */
export async function promoteWaitlist(
  client: Tx,
  eventId: string,
  seats: number,
): Promise<PromoteResult> {
  if (seats <= 0) return { promoted: [] };
  const taken = await confirmedCount(client, eventId);
  const event = await client.query(`SELECT capacity FROM events WHERE id = $1 FOR UPDATE`, [eventId]);
  const capacity = event.rows[0]?.capacity as number | undefined;
  if (!capacity) return { promoted: [] };
  const free = capacity - taken;
  const canTake = Math.min(seats, free);
  if (canTake <= 0) return { promoted: [] };
  const { rows } = await client.query(
    `SELECT id FROM registrations WHERE event_id = $1 AND status = 'waitlisted' ORDER BY waitlist_position ASC, created_at ASC LIMIT $2`,
    [eventId, canTake],
  );
  const promoted: string[] = [];
  for (const row of rows) {
    await client.query(
      `UPDATE registrations SET status = 'confirmed', waitlist_position = NULL, updated_at = now() WHERE id = $1`,
      [row.id],
    );
    await issueTicket(client, row.id);
    promoted.push(row.id);
  }
  await renumberWaitlist(client, eventId);
  return { promoted };
}

export async function confirmedCount(client: Tx, eventId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM registrations WHERE event_id = $1 AND status IN ('confirmed','checked_in')`,
    [eventId],
  );
  return rows[0].n as number;
}

export function isFull(count: number, capacity: number): boolean {
  return count >= capacity;
}

import { newTicketCode } from './util.js';
import { HttpError } from './errors.js';
import {
  type Account, type Client, type EventRow, type Registration,
  query, seatCount, nextWaitlistPos, renumberWaitlist, waitlistHead, oneRegistration,
} from './db.js';
import type { MailKind } from './mail.js';



function isCodeCollision(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string; message?: string };
  return e?.code === '23505' && e?.constraint === 'registrations_ticket_code_key';
}

/**
 * Insert or update a registration with a freshly minted ticket code, retrying
 * on the (astronomically unlikely) code collision. The statement is atomic, so
 * a collision leaves nothing behind.
 */
async function writeWithTicket(
  client: Client,
  write: (code: string) => Promise<Registration>,
): Promise<Registration> {
  let lastErr: unknown;
  for (let i = 0; i < 12; i++) {
    try {
      return await write(newTicketCode());
    } catch (err) {
      if (isCodeCollision(err)) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new HttpError(500, 'Could not issue a ticket code.');
}

async function accountFor(client: Client, id: string): Promise<Account | undefined> {
  const rows = await query<Account>(client, `select * from accounts where id = $1`, [id]);
  return rows[0];
}

export type AfterMail = Array<{ kind: MailKind; recipient: Account }>;

/**
 * The core registration transition. The caller holds a transaction that has
 * already locked the event row, so the last seat is serialised in the
 * database: the second writer waits on the lock, then sees the seat taken and
 * takes a waiting-list place instead.
 */
export async function registerGuest(
  client: Client,
  event: EventRow,
  account: Account,
): Promise<{ reg: Registration; after: AfterMail }> {
  const after: AfterMail = [];

  const existing = await oneRegistration(client, event.id, account.id);
  if (existing) return { reg: existing, after };

  if (event.state === 'registration_closed') throw new HttpError(400, 'Registration is closed for this event.');
  if (event.state === 'cancelled') throw new HttpError(400, 'This event has been cancelled.');
  if (event.state === 'draft') throw new HttpError(404, 'Not found.');

  const id = `reg_${event.id}_${account.id}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);

  if (event.approval_required) {
    const reg = await insertReg(client, { id, event_id: event.id, account_id: account.id, status: 'pending_approval' });
    after.push({ kind: 'pending', recipient: account });
    return { reg, after };
  }

  const seats = await seatCount(client, event.id);
  if (seats < event.capacity) {
    try {
      const reg = await writeWithTicket(client, (code) =>
        insertReg(client, { id, event_id: event.id, account_id: account.id, status: 'confirmed', ticket_code: code }));
      after.push({ kind: 'confirmed', recipient: account });
      return { reg, after };
    } catch (err) {
      if (isCapacityViolation(err)) {
        // The database gate refused the seat: fall through to the waiting list.
        return await waitlistOrReject(client, event, account, id, after);
      }
      throw err;
    }
  }
  return waitlistOrReject(client, event, account, id, after);
}

function isCapacityViolation(err: unknown): boolean {
  const e = err as { message?: string };
  return typeof e?.message === 'string' && e.message.startsWith('EVENT_FULL');
}

async function waitlistOrReject(
  client: Client,
  event: EventRow,
  account: Account,
  id: string,
  after: AfterMail,
): Promise<{ reg: Registration; after: AfterMail }> {
  if (!event.waitlist_enabled) {
    throw new HttpError(400, 'This event just filled up.');
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const pos = await nextWaitlistPos(client, event.id);
    try {
      const reg = await insertReg(client, {
        id, event_id: event.id, account_id: account.id, status: 'waitlisted', waitlist_position: pos,
      });
      after.push({ kind: 'waitlisted', recipient: account });
      return { reg, after };
    } catch (err) {
      const e = err as { code?: string; constraint?: string };
      if (e?.code === '23505' && e?.constraint === 'registrations_waitlist_pos_idx') continue;
      throw err;
    }
  }
  throw new HttpError(409, 'That place was just taken. Please try again.');
}

async function insertReg(
  client: Client,
  row: { id: string; event_id: string; account_id: string; status: string; ticket_code?: string; waitlist_position?: number },
): Promise<Registration> {
  const rows = await query<Registration>(client,
    `insert into registrations (id, event_id, account_id, status, ticket_code, waitlist_position)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [row.id, row.event_id, row.account_id, row.status, row.ticket_code ?? null, row.waitlist_position ?? null]);
  return rows[0];
}

async function updateReg(client: Client, id: string, set: Record<string, unknown>): Promise<Registration> {
  const cols = Object.keys(set);
  const rows = await query<Registration>(client,
    `update registrations set ${cols.map((c, i) => `"${c}" = $${i + 2}`).join(', ')}, updated_at = now() where id = $1 returning *`,
    [id, ...Object.values(set)]);
  if (rows.length === 0) throw new HttpError(404, 'Not found.');
  return rows[0];
}

/** Promote the waiting list while seats are free and promotion is allowed. */
export async function promoteWaitlist(
  client: Client,
  event: EventRow,
  opts: { whenApprovalRequired?: boolean } = {},
): Promise<{ promoted: Registration[]; after: AfterMail }> {
  const after: AfterMail = [];
  const promoted: Registration[] = [];
  if (event.state === 'cancelled') return { promoted, after };
  if (event.state === 'registration_closed') return { promoted, after };
  if (event.approval_required && opts.whenApprovalRequired !== true) {
    // Seats freed under an approval gate are handed out by the host, not automatically.
    return { promoted, after };
  }
  for (;;) {
    const seats = await seatCount(client, event.id);
    if (seats >= event.capacity) break;
    const head = await waitlistHead(client, event.id);
    if (!head) break;
    const account = await accountFor(client, head.account_id);
    try {
      const row = await writeWithTicket(client, (code) =>
        updateReg(client, head.id, { status: 'confirmed', ticket_code: code, waitlist_position: null }));
      promoted.push(row);
      if (account) after.push({ kind: 'promoted', recipient: account });
    } catch (err) {
      if (isCapacityViolation(err)) break;
      throw err;
    }
  }
  await renumberWaitlist(client, event.id);
  return { promoted, after };
}

/** Cancel one registration; a freed seat promotes the head of the waiting list. */
export async function cancelRegistration(
  client: Client,
  event: EventRow,
  reg: Registration,
  actor: 'guest' | 'host',
): Promise<{ reg: Registration; after: AfterMail }> {
  const status = actor === 'guest' ? 'cancelled_by_guest' : 'cancelled_by_host';
  if (!['pending_approval', 'confirmed', 'waitlisted', 'checked_in'].includes(reg.status)) {
    return { reg, after: [] };
  }
  const updated = await updateReg(client, reg.id, {
    status, waitlist_position: null, ticket_code: null, checked_in_at: null,
  });
  await renumberWaitlist(client, event.id);
  const { after } = await promoteWaitlist(client, event);
  return { reg: updated, after };
}

/** Host approves a pending request: a seat if free, else the waiting list. */
export async function approveRegistration(
  client: Client,
  event: EventRow,
  reg: Registration,
): Promise<{ reg: Registration; after: AfterMail }> {
  if (reg.status !== 'pending_approval') throw new HttpError(400, 'Only a pending request can be approved.');
  const account = await accountFor(client, reg.account_id);
  const seats = await seatCount(client, event.id);
  if (seats < event.capacity) {
    const updated = await writeWithTicket(client, (code) =>
      updateReg(client, reg.id, { status: 'confirmed', ticket_code: code, waitlist_position: null }));
    return { reg: updated, after: account ? [{ kind: 'approved', recipient: account }] : [] };
  }
  if (!event.waitlist_enabled) throw new HttpError(400, 'This event just filled up and has no waiting list.');
  const pos = await nextWaitlistPos(client, event.id);
  const updated = await updateReg(client, reg.id, { status: 'waitlisted', waitlist_position: pos, ticket_code: null });
  return { reg: updated, after: account ? [{ kind: 'waitlisted', recipient: account }] : [] };
}

export async function declineRegistration(
  client: Client,
  reg: Registration,
): Promise<{ reg: Registration; after: AfterMail }> {
  const account = await accountFor(client, reg.account_id);
  const updated = await updateReg(client, reg.id, { status: 'declined', waitlist_position: null, ticket_code: null });
  return { reg: updated, after: account ? [{ kind: 'declined', recipient: account }] : [] };
}

/** Everyone still holding a place on an event, with their account details. */
export async function eventHolders(
  client: Client,
  eventId: string,
): Promise<Array<Registration & { email: string; display_name: string }>> {
  return query<Registration & { email: string; display_name: string }>(client,
    `select r.*, a.email, a.display_name from registrations r join accounts a on a.id = r.account_id
     where r.event_id = $1 and r.status in ('pending_approval','confirmed','waitlisted','checked_in')`, [eventId]);
}

/** Cancel an event: terminal state, everyone holding a place is mailed. */
export async function cancelEvent(
  client: Client,
  event: EventRow,
  reason: string,
): Promise<{ event: EventRow; after: AfterMail }> {
  const rows = await query<EventRow>(client,
    `update events set state = 'cancelled', cancelled_at = now(), cancel_reason = $2, updated_at = now()
     where id = $1 returning *`, [event.id, reason]);
  const holders = await eventHolders(client, event.id);
  const after: AfterMail = holders.map((h) => ({ kind: 'cancelled', recipient: h as unknown as Account }));
  return { event: rows[0], after };
}

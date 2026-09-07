import type { Tx } from './db.ts';
import { bad, notFound } from './errors.ts';
import { sendAndLog } from './mail.ts';
import {
  EventRow, MailJob, MailKind, mailBody, newTicketCode, promoteWaitlist,
  renumberWaitlist, subject,
} from './registrations.ts';

/** Allocate a unique ticket code. */
export async function allocateTicket(tx: Tx): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = newTicketCode();
    const dupe = await tx.query('select 1 from registrations where ticket_code = $1', [candidate]);
    if (dupe.rowCount === 0) return candidate;
  }
  throw new Error('could not allocate a ticket code');
}

async function nextWaitlistPosition(tx: Tx, eventId: number): Promise<number> {
  const r = await tx.query(
    `select coalesce(max(waitlist_position), 0)::int as n from registrations
      where event_id = $1 and status = 'waitlisted'`,
    [eventId]
  );
  return r.rows[0].n + 1;
}

async function seatCount(tx: Tx, eventId: number): Promise<number> {
  const r = await tx.query(
    `select count(*)::int as n from registrations
      where event_id = $1 and status in ('confirmed','checked_in')`,
    [eventId]
  );
  return r.rows[0].n;
}

export type RegRow = {
  id: number; event_id: number; account_id: number; status: RegStatus;
  waitlist_position: number | null; ticket_code: string | null;
  checked_in_at: string | null; created_at: string; updated_at: string;
  email?: string; display_name?: string;
};
type RegStatus = import('./registrations.ts').RegStatus;

export type RegisterOutcome = {
  registration: RegRow;
  mails: MailJob[];
  notice?: string;
};

/**
 * Register one account for one event.
 *
 * Concurrency: the event row is locked FOR UPDATE for the whole decision, so two
 * simultaneous registrations for the last seat serialise here. The second one
 * sees the first's committed seat count and takes the waiting list. The
 * `seats_within_capacity` database trigger is the backstop that makes
 * overbooking impossible even if this lock were ever lost.
 */
export async function registerForEvent(
  tx: Tx,
  event: EventRow,
  accountId: number,
  account: { email: string; display_name: string }
): Promise<RegisterOutcome> {
  if (event.state === 'cancelled') {
    throw bad(`This event has been cancelled and is no longer taking registrations.`, { field: 'event_slug' });
  }
  if (event.state === 'draft') {
    throw notFound(`We could not find that event.`);
  }
  if (event.state === 'registration_closed') {
    throw bad(`Registration is closed for this event.`, { field: 'event_slug' });
  }

  // One registration per account per event, in any status: a repeat submission
  // updates the existing row and never adds a second one.
  const existing = await tx.query(
    `select * from registrations where event_id = $1 and account_id = $2 for update`,
    [event.id, accountId]
  );
  const prior: RegRow | undefined = existing.rows[0];

  const jobs: MailJob[] = [];
  const mk = (kind: MailKind, regId: number | null): MailJob => ({
    registration_id: regId,
    event_id: event.id,
    recipient: account.email,
    subject: subject(kind, event.title),
    body: mailBody(kind, event, undefined),
  });

  // Already holding a seat, or already checked in: return it unchanged.
  if (prior && (prior.status === 'confirmed' || prior.status === 'checked_in')) {
    return { registration: prior, mails: [] };
  }
  // Already waiting: return the place unchanged.
  if (prior && prior.status === 'waitlisted') {
    return { registration: prior, mails: [] };
  }
  // A pending request is already with the host.
  if (prior && prior.status === 'pending_approval') {
    return { registration: prior, mails: [] };
  }

  const held = await seatCount(tx, event.id);
  const full = held >= event.capacity;

  if (event.approval_required) {
    // Holds no seat until the host approves it.
    if (prior) {
      const r = await tx.query(
        `update registrations set status = 'pending_approval', waitlist_position = null,
                ticket_code = null, updated_at = now() where id = $1 returning *`,
        [prior.id]
      );
      return { registration: r.rows[0], mails: [] };
    }
    const r = await tx.query(
      `insert into registrations (event_id, account_id, status) values ($1, $2, 'pending_approval') returning *`,
      [event.id, accountId]
    );
    jobs.push(mk('pending', r.rows[0].id));
    await sendAll(tx, jobs);
    return { registration: r.rows[0], mails: jobs };
  }

  if (!full) {
    const code = await allocateTicket(tx);
    let row: RegRow;
    if (prior) {
      const r = await tx.query(
        `update registrations set status = 'confirmed', waitlist_position = null,
                ticket_code = $2, updated_at = now() where id = $1 returning *`,
        [prior.id, code]
      );
      row = r.rows[0];
    } else {
      const r = await tx.query(
        `insert into registrations (event_id, account_id, status, ticket_code)
         values ($1, $2, 'confirmed', $3) returning *`,
        [event.id, accountId, code]
      );
      row = r.rows[0];
    }
    jobs.push(mk('confirmed', row.id));
    await sendAll(tx, jobs);
    return { registration: row, mails: jobs };
  }

  // Full: waiting list if it is on, otherwise a refusal that leaves no row.
  if (event.waitlist_enabled) {
    if (prior) {
      const pos = await nextWaitlistPosition(tx, event.id);
      const r = await tx.query(
        `update registrations set status = 'waitlisted', waitlist_position = $2,
                ticket_code = null, updated_at = now() where id = $1 returning *`,
        [prior.id, pos]
      );
      jobs.push(mk('waitlisted', r.rows[0].id));
      await sendAll(tx, jobs);
      return { registration: r.rows[0], mails: jobs, notice: 'waitlisted' };
    }
    const pos = await nextWaitlistPosition(tx, event.id);
    const r = await tx.query(
      `insert into registrations (event_id, account_id, status, waitlist_position)
       values ($1, $2, 'waitlisted', $3) returning *`,
      [event.id, accountId, pos]
    );
    jobs.push(mk('waitlisted', r.rows[0].id));
    await sendAll(tx, jobs);
    return { registration: r.rows[0], mails: jobs, notice: 'waitlisted' };
  }

  throw bad(`This event just filled up.`, { field: 'event_slug' });
}

async function sendAll(tx: Tx, jobs: MailJob[]): Promise<void> {
  for (const j of jobs) {
    await sendAndLog(tx, {
      registration_id: j.registration_id,
      event_id: j.event_id,
      recipient: j.recipient,
      subject: j.subject,
      body: j.body,
    });
  }
}

/**
 * Cancel a registration. Cancelling a confirmed seat frees it in this same
 * request and promotes waiting-list position 1, which is mailed. A guest
 * cancelling their own registration sends no mail about the cancellation.
 */
export async function cancelRegistration(
  tx: Tx,
  event: EventRow,
  registration: RegRow,
  by: 'guest' | 'host'
): Promise<{ registration: RegRow; promoted: number }> {
  await tx.query('select 1 from events where id = $1 for update', [event.id]);
  await tx.query('select * from registrations where id = $1 for update', [registration.id]);

  const heldSeat = registration.status === 'confirmed' || registration.status === 'checked_in';
  const status = by === 'guest' ? 'cancelled_by_guest' : 'cancelled_by_host';
  const r = await tx.query(
    `update registrations set status = $2, waitlist_position = null, ticket_code = null,
            checked_in_at = null, updated_at = now() where id = $1 returning *`,
    [registration.id, status]
  );
  const updated: RegRow = r.rows[0];

  let promoted = 0;
  // While registration is closed a freed seat is not passed on.
  if (heldSeat && event.state !== 'registration_closed' && event.state !== 'cancelled') {
    const res = await promoteWaitlist(tx, event.id, event.capacity, () => ({
      registration_id: null,
      event_id: event.id,
      recipient: '',
      subject: '',
      body: '',
    }));
    // Recipient/subject filled in below per promoted registration.
    promoted = res.promoted.length;
    const promos = await tx.query(
      `select r.id, a.email from registrations r join accounts a on a.id = r.account_id
        where r.id = any($1::bigint[])`,
      [res.promoted.map((p) => p.registration_id)]
    );
    const jobs: MailJob[] = promos.rows.map((row: any) => ({
      registration_id: row.id,
      event_id: event.id,
      recipient: row.email,
      subject: subject('seat_from_waitlist', event.title),
      body: mailBody('seat_from_waitlist', event, undefined),
    }));
    await sendAll(tx, jobs);
  }
  await renumberWaitlist(tx, event.id);
  return { registration: updated, promoted };
}

/** Host approves a pending request: a seat, or the waiting list when full. */
export async function approveRegistration(
  tx: Tx,
  event: EventRow,
  registration: RegRow,
  guest: { email: string }
): Promise<{ registration: RegRow; notice?: string }> {
  if (registration.status !== 'pending_approval') {
    throw bad(`Only a request waiting for approval can be approved.`, { field: 'status' });
  }
  const held = await seatCount(tx, event.id);
  const jobs: MailJob[] = [];
  if (held < event.capacity) {
    const code = await allocateTicket(tx);
    const r = await tx.query(
      `update registrations set status = 'confirmed', waitlist_position = null,
              ticket_code = $2, updated_at = now() where id = $1 returning *`,
      [registration.id, code]
    );
    jobs.push({
      registration_id: r.rows[0].id, event_id: event.id, recipient: guest.email,
      subject: subject('approved', event.title), body: mailBody('approved', event, undefined),
    });
    await sendAll(tx, jobs);
    return { registration: r.rows[0] };
  }
  if (event.waitlist_enabled) {
    const pos = await nextWaitlistPosition(tx, event.id);
    const r = await tx.query(
      `update registrations set status = 'waitlisted', waitlist_position = $2,
              ticket_code = null, updated_at = now() where id = $1 returning *`,
      [registration.id, pos]
    );
    jobs.push({
      registration_id: r.rows[0].id, event_id: event.id, recipient: guest.email,
      subject: subject('waitlisted', event.title), body: mailBody('waitlisted', event, undefined),
    });
    await sendAll(tx, jobs);
    return { registration: r.rows[0], notice: `The event is full, so this request joined the waiting list.` };
  }
  throw bad(`This event is full and has no waiting list.`, { field: 'status' });
}

export async function declineRegistration(
  tx: Tx,
  event: EventRow,
  registration: RegRow,
  guest: { email: string }
): Promise<RegRow> {
  if (registration.status !== 'pending_approval') {
    throw bad(`Only a request waiting for approval can be declined.`, { field: 'status' });
  }
  const r = await tx.query(
    `update registrations set status = 'declined', waitlist_position = null,
            ticket_code = null, updated_at = now() where id = $1 returning *`,
    [registration.id]
  );
  await sendAndLog(tx, {
    registration_id: registration.id, event_id: event.id, recipient: guest.email,
    subject: subject('declined', event.title), body: mailBody('declined', event, undefined),
  });
  return r.rows[0];
}

/** Check a ticket in. A second check-in of the same code records one arrival. */
export async function checkInTicket(
  tx: Tx,
  event: EventRow,
  registration: RegRow
): Promise<{ registration: RegRow; already: boolean }> {
  if (registration.status === 'checked_in') {
    return { registration, already: true };
  }
  if (registration.status !== 'confirmed') {
    throw bad(`That ticket does not hold a seat, so it cannot be checked in.`, { field: 'ticket_code' });
  }
  const r = await tx.query(
    `update registrations set status = 'checked_in', checked_in_at = now(), updated_at = now()
      where id = $1 returning *`,
    [registration.id]
  );
  return { registration: r.rows[0], already: false };
}

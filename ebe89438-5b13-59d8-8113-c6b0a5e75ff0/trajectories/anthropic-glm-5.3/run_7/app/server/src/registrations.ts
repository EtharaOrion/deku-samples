import { PoolClient } from 'pg';
import { ticketCode } from './constants.js';

export class RuleError extends Error {
  status: number;
  field?: string;
  code: string;
  constructor(message: string, status = 400, code = 'invalid', field?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

export type MailOutbox = {
  registrationId: string | null;
  eventId: string;
  to: string;
  subject: string;
  body: string;
};

type EventRow = {
  id: string;
  slug: string;
  title: string;
  city: string;
  starts_at: Date;
  ends_at: Date;
  time_zone: string;
  capacity: number;
  state: string;
  approval_required: boolean;
  waitlist_enabled: boolean;
};

export type RegRow = {
  id: string;
  status: string;
  waitlist_position: number | null;
  ticket_code: string | null;
  checked_in_at?: Date | null;
};

const SEATS = "('confirmed','checked_in')";

export async function loadEvent(db: PoolClient, slug: string): Promise<EventRow | null> {
  const { rows } = await db.query<EventRow>(
    `SELECT id, slug, title, city, starts_at, ends_at, time_zone, capacity,
            state, approval_required, waitlist_enabled
     FROM events WHERE slug = $1 FOR UPDATE`,
    [slug],
  );
  return rows[0] ?? null;
}

function newCode(): string {
  return ticketCode();
}

async function insertRegistration(
  db: PoolClient, eventId: string, accountId: string, status: string, code: string | null,
): Promise<RegRow> {
  const { rows } = await db.query<RegRow>(
    `INSERT INTO registrations (event_id, account_id, status, ticket_code)
     VALUES ($1, $2, $3, $4) RETURNING id, status, waitlist_position, ticket_code`,
    [eventId, accountId, status, code],
  );
  return rows[0];
}

async function updateStatus(
  db: PoolClient, regId: string, status: string, code: string | null,
): Promise<RegRow> {
  const { rows } = await db.query<RegRow>(
    `UPDATE registrations SET status = $2, ticket_code = $3 WHERE id = $1
     RETURNING id, status, waitlist_position, ticket_code`,
    [regId, status, code],
  );
  return rows[0];
}

async function seatsTaken(db: PoolClient, eventId: string): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM registrations WHERE event_id = $1 AND status IN ${SEATS}`,
    [eventId],
  );
  return Number(rows[0].n);
}

async function waitlistHead(db: PoolClient, eventId: string): Promise<RegRow | null> {
  const { rows } = await db.query<RegRow>(
    `SELECT id, status, waitlist_position, ticket_code FROM registrations
     WHERE event_id = $1 AND status = 'waitlisted' ORDER BY waitlist_position ASC, created_at ASC LIMIT 1`,
    [eventId],
  );
  return rows[0] ?? null;
}

/* -------------------------------------------------------------------------
 * The seat engine. Every transition below runs inside one transaction with
 * the event row locked, and the database triggers enforce the capacity
 * ceiling independently of anything here.
 * ---------------------------------------------------------------------- */

export async function register(
  db: PoolClient, ev: EventRow, accountId: string, email: string,
): Promise<{ reg: RegRow; mails: MailOutbox[] }> {
  const mails: MailOutbox[] = [];
  const { rows: existingRows } = await db.query<RegRow>(
    `SELECT id, status, waitlist_position, ticket_code FROM registrations
     WHERE event_id = $1 AND account_id = $2`,
    [ev.id, accountId],
  );
  const existing = existingRows[0];

  if (ev.state === 'cancelled') {
    throw new RuleError('This event has been cancelled and takes no registrations.', 400, 'event_cancelled');
  }
  if (ev.state === 'registration_closed') {
    throw new RuleError('Registration is closed for this event.', 400, 'registration_closed');
  }
  if (ev.state === 'draft') {
    throw new RuleError('This event is not open for registration yet.', 404, 'not_found');
  }

  // A repeat submission updates the registration it finds; no second row.
  if (existing) {
    if (existing.status === 'cancelled_by_guest' || existing.status === 'cancelled_by_host') {
      return applyForSeat(db, ev, existing, accountId, email, mails, true);
    }
    const { rows } = await db.query<RegRow>(
      `SELECT id, status, waitlist_position, ticket_code FROM registrations WHERE id = $1`,
      [existing.id],
    );
    return { reg: rows[0], mails };
  }

  if (ev.approval_required) {
    const reg = await insertRegistration(db, ev.id, accountId, 'pending_approval', null);
    mails.push(pendingMail(ev, email, reg.id));
    return { reg, mails };
  }

  const taken = await seatsTaken(db, ev.id);
  if (taken < ev.capacity) {
    let reg: RegRow;
    try {
      reg = await insertRegistration(db, ev.id, accountId, 'confirmed', newCode());
    } catch (e: any) {
      if (String(e.message) === 'event_full') throw full(ev);
      throw e;
    }
    mails.push(confirmedMail(ev, email, reg.id, reg.ticket_code!));
    return { reg, mails };
  }

  if (ev.waitlist_enabled) {
    const reg = await insertRegistration(db, ev.id, accountId, 'waitlisted', null);
    mails.push(waitlistMail(ev, email, reg.id, reg.waitlist_position!));
    return { reg, mails };
  }
  throw full(ev);
}

function full(ev: EventRow): RuleError {
  return new RuleError(
    ev.waitlist_enabled
      ? 'This event just filled up. You are on the waiting list.'
      : 'This event is full and has no waiting list.',
    409, 'event_full',
  );
}

/** Placing an existing (previously cancelled) registration back into the pool. */
async function applyForSeat(
  db: PoolClient, ev: EventRow, existing: RegRow, _accountId: string, email: string,
  mails: MailOutbox[], rejoining: boolean,
): Promise<{ reg: RegRow; mails: MailOutbox[] }> {
  void rejoining;
  if (ev.approval_required) {
    const reg = await updateStatus(db, existing.id, 'pending_approval', null);
    mails.push(pendingMail(ev, email, reg.id));
    return { reg, mails };
  }
  const taken = await seatsTaken(db, ev.id);
  if (taken < ev.capacity) {
    let reg: RegRow;
    try {
      reg = await updateStatus(db, existing.id, 'confirmed', newCode());
    } catch (e: any) {
      if (String(e.message) === 'event_full') throw full(ev);
      throw e;
    }
    mails.push(confirmedMail(ev, email, reg.id, reg.ticket_code!));
    return { reg, mails };
  }
  if (ev.waitlist_enabled) {
    const reg = await updateStatus(db, existing.id, 'waitlisted', null);
    mails.push(waitlistMail(ev, email, reg.id, reg.waitlist_position!));
    return { reg, mails };
  }
  throw full(ev);
}

/** A guest cancelling their own place; frees the seat and promotes in the same request. */
export async function cancelByGuest(
  db: PoolClient, ev: EventRow, reg: RegRow, email: string,
): Promise<{ reg: RegRow; mails: MailOutbox[]; promoted: RegRow | null }> {
  const mails: MailOutbox[] = [];
  const heldSeat = reg.status === 'confirmed' || reg.status === 'checked_in';
  const updated = await updateStatus(db, reg.id, 'cancelled_by_guest', null);

  if (heldSeat && ev.state !== 'registration_closed' && ev.state !== 'cancelled') {
    await promoteIfRoom(db, ev, mails);
  }
  return { reg: updated, mails, promoted: null };
}

/** Fills every free seat from the waiting list, lowest position first. */
export async function promoteIfRoom(db: PoolClient, ev: EventRow, mails: MailOutbox[]) {
  for (;;) {
    const taken = await seatsTaken(db, ev.id);
    if (taken >= ev.capacity) return 0;
    const head = await waitlistHead(db, ev.id);
    if (!head) return 0;
    let reg: RegRow;
    try {
      reg = await updateStatus(db, head.id, 'confirmed', newCode());
    } catch (e: any) {
      if (String(e.message) === 'event_full') return 0;
      throw e;
    }
    const { rows: acct } = await db.query<{ email: string }>(
      'SELECT email FROM accounts WHERE id = (SELECT account_id FROM registrations WHERE id = $1)',
      [reg.id],
    );
    mails.push(seatOpenedMail(ev, acct[0].email, reg.id, reg.ticket_code!));
  }
}

export async function decide(
  db: PoolClient, ev: EventRow, reg: RegRow, email: string, decision: 'approve' | 'decline',
): Promise<{ reg: RegRow; mails: MailOutbox[] }> {
  const mails: MailOutbox[] = [];
  if (reg.status !== 'pending_approval') {
    throw new RuleError('Only a pending request can be decided.', 400, 'not_pending');
  }
  if (decision === 'decline') {
    const updated = await updateStatus(db, reg.id, 'declined', null);
    mails.push({
      registrationId: reg.id, eventId: ev.id, to: email,
      subject: `About your request to join ${ev.title}`,
      body: declinedBody(ev),
    });
    return { reg: updated, mails };
  }

  const taken = await seatsTaken(db, ev.id);
  if (taken < ev.capacity) {
    let updated: RegRow;
    try {
      updated = await updateStatus(db, reg.id, 'confirmed', newCode());
    } catch (e: any) {
      if (String(e.message) === 'event_full') {
        return decideFull(db, ev, reg, email, mails);
      }
      throw e;
    }
    mails.push(approvedMail(ev, email, reg.id, updated.ticket_code!));
    return { reg: updated, mails };
  }
  return decideFull(db, ev, reg, email, mails);
}

async function decideFull(
  db: PoolClient, ev: EventRow, reg: RegRow, email: string, mails: MailOutbox[],
): Promise<{ reg: RegRow; mails: MailOutbox[] }> {
  if (!ev.waitlist_enabled) {
    throw new RuleError('This event just filled up, so the request cannot be approved.', 409, 'event_full');
  }
  const updated = await updateStatus(db, reg.id, 'waitlisted', null);
  mails.push(waitlistMail(ev, email, reg.id, updated.waitlist_position!));
  return { reg: updated, mails };
}

export async function checkIn(
  db: PoolClient, ev: EventRow, reg: RegRow,
): Promise<{ reg: RegRow; alreadyAt: Date | null }> {
  if (reg.status === 'checked_in') {
    return { reg, alreadyAt: reg.checked_in_at ?? null };
  }
  if (reg.status !== 'confirmed') {
    throw new RuleError('Only a confirmed registration can be checked in.', 400, 'not_confirmed');
  }
  const { rows: written } = await db.query<RegRow>(
    `UPDATE registrations SET status = 'checked_in', ticket_code = $2, checked_in_at = now()
     WHERE id = $1 RETURNING id, status, waitlist_position, ticket_code, checked_in_at`,
    [reg.id, reg.ticket_code],
  );
  return { reg: written[0], alreadyAt: null };
}

export async function cancelEvent(
  db: PoolClient, ev: EventRow, reason: string,
): Promise<{ mails: MailOutbox[] }> {
  const mails: MailOutbox[] = [];
  const { rows: holders } = await db.query<{ id: string; email: string }>(
    `SELECT r.id, a.email FROM registrations r JOIN accounts a ON a.id = r.account_id
     WHERE r.event_id = $1 AND r.status IN ('pending_approval','confirmed','waitlisted','checked_in')`,
    [ev.id],
  );
  await db.query(
    `UPDATE events SET state = 'cancelled', cancelled_at = now(), cancel_reason = $2 WHERE id = $1`,
    [ev.id, reason],
  );
  for (const h of holders) {
    mails.push({
      registrationId: h.id, eventId: ev.id, to: h.email,
      subject: `${ev.title} has been cancelled`,
      body: eventCancelledBody(ev, reason),
    });
  }
  return { mails };
}

/* ----------------------------- mail bodies ----------------------------- */

const fmt = (d: Date, tz: string) => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d) + ` (${tz})`;
  } catch {
    return d.toISOString();
  }
};

const when = (ev: EventRow) => `${fmt(ev.starts_at, ev.time_zone)} until ${fmt(ev.ends_at, ev.time_zone)}`;

function confirmedMail(ev: EventRow, to: string, regId: string, code: string): MailOutbox {
  return {
    registrationId: regId, eventId: ev.id, to,
    subject: `You're going to ${ev.title}`,
    body: `Your place at ${ev.title} is confirmed.\n\nWhen: ${when(ev)}\nWhere: ${ev.city}\nTicket code: ${code}\n\nShow this code at the door. See you there.`,
  };
}

function approvedMail(ev: EventRow, to: string, regId: string, code: string): MailOutbox {
  return {
    registrationId: regId, eventId: ev.id, to,
    subject: `You're in: ${ev.title}`,
    body: `The host approved your request to join ${ev.title}.\n\nWhen: ${when(ev)}\nWhere: ${ev.city}\nTicket code: ${code}\n\nShow this code at the door.`,
  };
}

function pendingMail(ev: EventRow, to: string, regId: string): MailOutbox {
  return {
    registrationId: regId, eventId: ev.id, to,
    subject: `Your request to join ${ev.title}`,
    body: `The host of ${ev.title} has your request and will decide shortly.\n\nWhen: ${when(ev)}\nWhere: ${ev.city}\n\nWe will write to you as soon as there is an answer.`,
  };
}

function waitlistMail(ev: EventRow, to: string, regId: string, position: number): MailOutbox {
  return {
    registrationId: regId, eventId: ev.id, to,
    subject: `You're on the waiting list for ${ev.title}`,
    body: `${ev.title} has filled up, so you hold waiting-list position ${position}.\n\nWhen: ${when(ev)}\nWhere: ${ev.city}\n\nIf a place opens you are moved up and written to at once.`,
  };
}

function seatOpenedMail(ev: EventRow, to: string, regId: string, code: string): MailOutbox {
  return {
    registrationId: regId, eventId: ev.id, to,
    subject: `A spot opened up for ${ev.title}`,
    body: `A place at ${ev.title} opened up and it is yours.\n\nWhen: ${when(ev)}\nWhere: ${ev.city}\nTicket code: ${code}\n\nShow this code at the door.`,
  };
}

function declinedBody(ev: EventRow): string {
  return `The host of ${ev.title} is not able to take your request this time.\n\nWhen it was: ${when(ev)}\n\nThere will be another evening; nothing is owed and nothing was paid.`;
}

function eventCancelledBody(ev: EventRow, reason: string): string {
  return `${ev.title} has been cancelled.\n\nThe host's reason, word for word:\n\n"${reason}"\n\nIt was to run ${when(ev)} in ${ev.city}. No action is needed from you.`;
}

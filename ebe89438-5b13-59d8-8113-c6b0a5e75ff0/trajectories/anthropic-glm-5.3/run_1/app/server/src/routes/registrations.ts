import { Hono } from 'hono';
import { db } from '../db/client.js';
import { authAccount } from '../lib/auth.js';
import { id as newId, ticketCode } from '../lib/util.js';
import { rateLimit, RATE_LIMIT_MESSAGE } from '../lib/ratelimit.js';
import {
  confirmationMail, waitlistMail, pendingMail, promotedMail, sendMail,
} from '../mail/mailer.js';
import { renumberWaitlist } from '../lib/registration.js';

export const registrationRoutes = new Hono();

function rfc(d: Date | string): string {
  return new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

const eventById = `SELECT e.*, c.owner_account_id FROM events e JOIN calendars c ON c.id = e.calendar_id`;

async function loadEvent(slug: string) {
  const { rows } = await db.query(`${eventById} WHERE lower(e.slug)=$1`, [slug.toLowerCase()]);
  return rows[0] ?? null;
}

function shapeRegistration(r: any) {
  return {
    id: r.id, event_id: r.event_id, account_id: r.account_id, status: r.status,
    waitlist_position: r.waitlist_position ?? null, ticket_code: r.ticket_code ?? null,
    checked_in_at: r.checked_in_at ? rfc(r.checked_in_at) : null,
    created_at: rfc(r.created_at), updated_at: rfc(r.updated_at),
  };
}

/** POST /api/registrations */
registrationRoutes.post('/', async (c) => {
  const account = await authAccount(c);
  if (!account) return c.json({ message: `Sign in to register for an event.` }, 401);
  const body = await c.req.json().catch(() => ({}));
  const slug = typeof body?.event_slug === 'string' ? body.event_slug.trim() : '';
  if (!slug) return c.json({ field: 'event_slug', message: `Name the event you are registering for.` }, 400);

  const key = `reg:${account.id}`;
  if (!(await rateLimit(key, 10, 60))) {
    return c.json({ message: RATE_LIMIT_MESSAGE }, 429);
  }

  const ev = await loadEvent(slug);
  if (!ev) return c.json({ message: `Page Not Found` }, 404);
  if (ev.state === 'draft') {
    return c.json({ field: 'event_slug', message: `Page Not Found` }, 404);
  }
  if (ev.state === 'cancelled') {
    return c.json({ field: 'event_slug', message: `This event has been cancelled by the host.` }, 400);
  }
  if (ev.state === 'registration_closed') {
    return c.json({ field: 'event_slug', message: `Registration is closed for this event.` }, 400);
  }

  const mail: any[] = [];
  const tx = await db.connect();
  try {
    await tx.query('BEGIN');
    await tx.query(`SELECT id FROM events WHERE id=$1 FOR UPDATE`, [ev.id]);

    const existing = (await tx.query(`SELECT * FROM registrations WHERE event_id=$1 AND account_id=$2`, [ev.id, account.id])).rows[0];

    if (existing && ['confirmed', 'checked_in', 'pending_approval', 'waitlisted'].includes(existing.status)) {
      await tx.query('COMMIT');
      const shaped = shapeRegistration(existing);
      return c.json(shaped);
    }

    const regId = existing ? existing.id : newId();
    if (!existing) {
      await tx.query(
        `INSERT INTO registrations (id, event_id, account_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'pending_approval', now(), now())`,
        [regId, ev.id, account.id]
      );
    } else {
      await tx.query(`UPDATE registrations SET status='pending_approval', waitlist_position=NULL, ticket_code=NULL, updated_at=now() WHERE id=$1`, [regId]);
    }

    let outcome: any;
    if (ev.approval_required) {
      outcome = { status: 'pending_approval', waitlist_position: null, ticket_code: null };
      mail.push({ to: account.email, ...pendingMail(ev), registrationId: regId, eventId: ev.id });
    } else {
      const seats = Number((await tx.query(`SELECT count(*)::int AS n FROM registrations WHERE event_id=$1 AND status IN ('confirmed','checked_in')`, [ev.id])).rows[0].n);
      if (seats < ev.capacity) {
        const code = ticketCode();
        await tx.query(`UPDATE registrations SET status='confirmed', ticket_code=$2, waitlist_position=NULL, updated_at=now() WHERE id=$1`, [regId, code]);
        outcome = { status: 'confirmed', waitlist_position: null, ticket_code: code };
        mail.push({ to: account.email, ...confirmationMail({ ...ev, ticket_code: code }), registrationId: regId, eventId: ev.id });
      } else if (ev.waitlist_enabled) {
        const pos = Number((await tx.query(`SELECT coalesce(max(waitlist_position),0)::int AS n FROM registrations WHERE event_id=$1 AND status='waitlisted'`, [ev.id])).rows[0].n) + 1;
        await tx.query(`UPDATE registrations SET status='waitlisted', waitlist_position=$2, ticket_code=NULL, updated_at=now() WHERE id=$1`, [regId, pos]);
        outcome = { status: 'waitlisted', waitlist_position: pos, ticket_code: null };
        mail.push({ to: account.email, ...waitlistMail(ev, pos), registrationId: regId, eventId: ev.id });
      } else {
        await tx.query('ROLLBACK');
        return c.json({ field: 'event_slug', message: `This event just filled up.` }, 409);
      }
    }

    const final = (await tx.query(`SELECT * FROM registrations WHERE id=$1`, [regId])).rows[0];
    await tx.query('COMMIT');
    for (const m of mail) {
      try { await sendMail({ to: m.to, subject: m.subject, text: m.text, registrationId: m.registrationId, eventId: m.eventId }); } catch { console.error(JSON.stringify({ level: 'warn', msg: 'mail_failed' })); }
    }
    return c.json(shapeRegistration(final), 201);
  } catch (e: any) {
    await tx.query('ROLLBACK').catch(() => {});
    if (e && e.message && /capacity exceeded|registration is closed|duplicate key/i.test(e.message)) {
      return c.json({ field: 'event_slug', message: `This event just filled up.` }, 409);
    }
    throw e;
  } finally {
    tx.release();
  }
});

/** GET /api/registrations/me */
registrationRoutes.get('/me', async (c) => {
  const account = await authAccount(c);
  if (!account) return c.json({ message: `Sign in to see your registrations.` }, 401);
  const { rows } = await db.query(
    `SELECT r.*, e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone, e.city, e.theme_hex, e.cover_seed, e.category, e.state, e.capacity
       FROM registrations r JOIN events e ON e.id = r.event_id
      WHERE r.account_id = $1
      ORDER BY e.starts_at ASC`,
    [account.id]
  );
  return c.json(rows.map((r) => ({
    ...shapeRegistration(r),
    event: {
      slug: r.event_slug, title: r.title, starts_at: rfc(r.starts_at), ends_at: rfc(r.ends_at),
      time_zone: r.time_zone, city: r.city, theme_hex: r.theme_hex, cover_seed: r.cover_seed,
      category: r.category, state: r.state, capacity: r.capacity,
    },
  })));
});

/** POST /api/registrations/:id/cancel */
registrationRoutes.post('/:id/cancel', async (c) => {
  const account = await authAccount(c);
  if (!account) return c.json({ message: `Sign in to cancel your registration.` }, 401);
  const reg = (await db.query(`SELECT * FROM registrations WHERE id=$1`, [c.req.param('id')])).rows[0];
  if (!reg || reg.account_id !== account.id) return c.json({ message: `Page Not Found` }, 404);
  if (!['confirmed', 'checked_in', 'waitlisted', 'pending_approval'].includes(reg.status)) {
    return c.json(shapeRegistration(reg));
  }
  const mail: any[] = [];
  const tx = await db.connect();
  try {
    await tx.query('BEGIN');
    await tx.query(`SELECT id FROM events WHERE id=$1 FOR UPDATE`, [reg.event_id]);
    const fresh = (await tx.query(`SELECT * FROM registrations WHERE id=$1 FOR UPDATE`, [reg.id])).rows[0];
    if (!['confirmed', 'checked_in', 'waitlisted', 'pending_approval'].includes(fresh.status)) {
      await tx.query('COMMIT');
      return c.json(shapeRegistration(fresh));
    }
    await tx.query(
      `UPDATE registrations SET status='cancelled_by_guest', ticket_code=NULL, waitlist_position=NULL, checked_in_at=NULL, updated_at=now() WHERE id=$1`,
      [reg.id]
    );
    const ev = (await tx.query(`${eventById} WHERE e.id=$1`, [reg.event_id])).rows[0];
    // the seat frees now; promote the head of the waiting list in this same request
    if (fresh.status === 'confirmed' || fresh.status === 'checked_in') {
      await promote(tx, ev, mail);
    }
    await renumberWaitlist(tx, ev.id);
    const out = (await tx.query(`SELECT * FROM registrations WHERE id=$1`, [reg.id])).rows[0];
    await tx.query('COMMIT');
    for (const m of mail) {
      try { await sendMail({ to: m.to, subject: m.subject, text: m.text, registrationId: m.registrationId, eventId: m.eventId }); } catch { console.error(JSON.stringify({ level: 'warn', msg: 'mail_failed' })); }
    }
    return c.json(shapeRegistration(out));
  } catch (e) {
    await tx.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    tx.release();
  }
});

async function promote(tx: any, ev: any, mail: any[]) {
  if (ev.state === 'registration_closed') return;
  const seats = Number((await tx.query(`SELECT count(*)::int AS n FROM registrations WHERE event_id=$1 AND status IN ('confirmed','checked_in')`, [ev.id])).rows[0].n);
  if (seats >= ev.capacity) return;
  const head = (await tx.query(
    `SELECT r.id, a.email FROM registrations r JOIN accounts a ON a.id=r.account_id
      WHERE r.event_id=$1 AND r.status='waitlisted' ORDER BY r.waitlist_position ASC LIMIT 1`, [ev.id])
  ).rows[0];
  if (!head) return;
  const code = ticketCode();
  await tx.query(`UPDATE registrations SET status='confirmed', ticket_code=$2, waitlist_position=NULL, updated_at=now() WHERE id=$1`, [head.id, code]);
  mail.push({ to: head.email, subject: `A spot opened up for ${ev.title}`, text: `A seat opened up at ${ev.title} and it is yours. Your ticket code is ${code}.`, registrationId: head.id, eventId: ev.id });
}

/** POST /api/registrations/:id/approve and /decline (host only, owning host) */
async function hostGuard(c: any, regId: string) {
  const account = await authAccount(c);
  if (!account) return { denied: c.json({ message: `Sign in first.` }, 401) };
  const reg = (await db.query(`SELECT r.*, e.slug AS event_slug FROM registrations r JOIN events e ON e.id=r.event_id WHERE r.id=$1`, [regId])).rows[0];
  if (!reg) return { denied: c.json({ message: `Page Not Found` }, 404) };
  const ev = (await db.query(`${eventById} WHERE e.id=$1`, [reg.event_id])).rows[0];
  if (!ev || ev.owner_account_id !== account.id || account.role !== 'host') {
    return { denied: c.json({ message: `Page Not Found` }, 404) };
  }
  return { account, reg, ev };
}

registrationRoutes.post('/:id/approve', async (c) => {
  const g = await hostGuard(c, c.req.param('id'));
  if (g.denied) return g.denied;
  const { reg, ev } = g;
  if (reg.status !== 'pending_approval') {
    return c.json({ message: `Only a request awaiting the host can be approved.` }, 400);
  }
  const mail: any[] = [];
  const tx = await db.connect();
  try {
    await tx.query('BEGIN');
    await tx.query(`SELECT id FROM events WHERE id=$1 FOR UPDATE`, [ev.id]);
    const guest = (await tx.query(`SELECT a.email FROM accounts a WHERE a.id=$1`, [reg.account_id])).rows[0];
    const seats = Number((await tx.query(`SELECT count(*)::int AS n FROM registrations WHERE event_id=$1 AND status IN ('confirmed','checked_in')`, [ev.id])).rows[0].n);
    let outcome: string;
    if (seats < ev.capacity) {
      const code = ticketCode();
      await tx.query(`UPDATE registrations SET status='confirmed', ticket_code=$2, waitlist_position=NULL, updated_at=now() WHERE id=$1`, [reg.id, code]);
      outcome = 'confirmed';
      mail.push({ to: guest.email, subject: `You're in: ${ev.title}`, text: `The host approved your request for ${ev.title}. Your ticket code is ${code}.`, registrationId: reg.id, eventId: ev.id });
    } else if (ev.waitlist_enabled) {
      const pos = Number((await tx.query(`SELECT coalesce(max(waitlist_position),0)::int AS n FROM registrations WHERE event_id=$1 AND status='waitlisted'`, [ev.id])).rows[0].n) + 1;
      await tx.query(`UPDATE registrations SET status='waitlisted', waitlist_position=$2, ticket_code=NULL, updated_at=now() WHERE id=$1`, [reg.id, pos]);
      outcome = 'waitlisted';
      mail.push({ to: guest.email, subject: `You're on the waiting list for ${ev.title}`, text: `The event filled up, so you are number ${pos} on the waiting list for ${ev.title}.`, registrationId: reg.id, eventId: ev.id });
    } else {
      await tx.query('ROLLBACK');
      return c.json({ message: `This event just filled up and there is no waiting list.` }, 409);
    }
    const out = (await tx.query(`SELECT * FROM registrations WHERE id=$1`, [reg.id])).rows[0];
    await tx.query('COMMIT');
    for (const m of mail) {
      try { await sendMail({ to: m.to, subject: m.subject, text: m.text, registrationId: m.registrationId, eventId: m.eventId }); } catch { console.error(JSON.stringify({ level: 'warn', msg: 'mail_failed' })); }
    }
    return c.json(shapeRegistration(out));
  } catch (e) {
    await tx.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    tx.release();
  }
});

registrationRoutes.post('/:id/decline', async (c) => {
  const g = await hostGuard(c, c.req.param('id'));
  if (g.denied) return g.denied;
  const { reg, ev } = g;
  if (reg.status !== 'pending_approval') {
    return c.json({ message: `Only a request awaiting the host can be declined.` }, 400);
  }
  const guest = (await db.query(`SELECT email FROM accounts WHERE id=$1`, [reg.account_id])).rows[0];
  await db.query(`UPDATE registrations SET status='declined', ticket_code=NULL, waitlist_position=NULL, updated_at=now() WHERE id=$1`, [reg.id]);
  try {
    await sendMail({ to: guest.email, subject: `About your request to join ${ev.title}`, text: `The host of ${ev.title} could not take your request this time.`, registrationId: reg.id, eventId: ev.id });
  } catch { console.error(JSON.stringify({ level: 'warn', msg: 'mail_failed' })); }
  const out = (await db.query(`SELECT * FROM registrations WHERE id=$1`, [reg.id])).rows[0];
  return c.json(shapeRegistration(out));
});

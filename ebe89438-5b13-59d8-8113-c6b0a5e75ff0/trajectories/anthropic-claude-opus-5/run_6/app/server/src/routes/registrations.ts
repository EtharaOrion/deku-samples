import { Hono } from 'hono';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { requireAccount } from '../auth.js';
import { AppError, denied, notFound } from '../errors.js';
import { parseBody, readJson, toIso } from '../shape.js';
import { serializeRegistration } from '../serialize.js';
import { rateLimit } from '../ratelimit.js';
import { PendingMail, sendMails } from '../mailer.js';
import {
  EventRow, confirmedCount, freeSeat, loadEventForUpdate, lockEvent, mailBase,
  nextWaitlistPosition, promoteFromWaitlist, renumberWaitlist, setConfirmed, setPlain,
  setWaitlisted,
} from '../registrations.js';

export const registrationRoutes = new Hono();

const createSchema = z.object({
  event_slug: z.string().trim().min(1, 'Name the event you want to join.'),
});

const isSerializationFailure = (e: any) =>
  e && (e.code === '40001' || e.code === '40P01' || e.code === '23505' || e.code === '23514');

/**
 * POST /api/registrations
 *
 * The seat is a numbered row, not a counter. Two requests racing for the last
 * seat both try to insert the same seat_no; the unique index on
 * (event_id, seat_no) lets exactly one of them through and the loser retries,
 * finds no free seat, and takes a waiting-list place instead. The transaction
 * means a refused attempt leaves no row behind.
 */
registrationRoutes.post('/', async (c) => {
  const account = requireAccount(c);
  const body = parseBody(createSchema, await readJson(c));
  await rateLimit(`registration:${account.id}`, 10);

  let lastErr: any = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const out = await tx(async (client) => {
        const ev = await loadEventForUpdate(client, body.event_slug.toLowerCase());
        if (!ev) throw notFound();
        if (ev.state === 'draft' && Number(ev.owner_account_id) !== account.id) throw notFound();
        if (ev.state === 'cancelled') {
          throw new AppError(409, 'This event has been called off, so it is taking no registrations.', { code: 'event_cancelled' });
        }
        if (ev.state === 'registration_closed') {
          throw new AppError(409, 'Registration is closed. The host has stopped taking registrations for this event.', { code: 'registration_closed' });
        }
        if (ev.state === 'draft') {
          throw new AppError(409, 'This event is still a draft, so it is taking no registrations.', { code: 'event_draft' });
        }

        await lockEvent(client, ev.id);

        // One registration per account per event, in any status: a repeat
        // submission updates the row it finds and never adds a second.
        const existing = await client.query(
          'SELECT * FROM registrations WHERE event_id = $1 AND account_id = $2 FOR UPDATE',
          [ev.id, account.id],
        );
        let reg = existing.rows[0] ?? null;
        const holdsPlace = reg && ['confirmed', 'checked_in', 'waitlisted', 'pending_approval'].includes(reg.status);
        if (holdsPlace) {
          return { reg, mails: [] as PendingMail[], repeat: true };
        }
        if (!reg) {
          const ins = await client.query(
            `INSERT INTO registrations (event_id, account_id, status) VALUES ($1,$2,'declined')
             ON CONFLICT (event_id, account_id) DO NOTHING RETURNING *`,
            [ev.id, account.id],
          );
          reg = ins.rows[0];
          if (!reg) {
            const again = await client.query(
              'SELECT * FROM registrations WHERE event_id = $1 AND account_id = $2',
              [ev.id, account.id],
            );
            reg = again.rows[0];
          }
        }

        const mails: PendingMail[] = [];

        // With approval on, the registration starts pending and holds no seat.
        if (ev.approval_required) {
          const updated = await setPlain(client, reg.id, 'pending_approval');
          mails.push({ kind: 'pending', ...mailBase(ev, account.email, account.display_name, updated.id) });
          return { reg: updated, mails, repeat: false };
        }

        const seat = await freeSeat(client, ev.id, ev.capacity);
        if (seat !== null) {
          const updated = await setConfirmed(client, reg.id, seat);
          mails.push({
            kind: 'confirmed',
            ...mailBase(ev, account.email, account.display_name, updated.id),
            ticketCode: updated.ticket_code,
          });
          return { reg: updated, mails, repeat: false };
        }

        if (!ev.waitlist_enabled) {
          // Nothing is left behind: the placeholder row goes with the rollback.
          throw new AppError(409, 'This event is full and it keeps no waiting list.', { code: 'event_full' });
        }

        const pos = await nextWaitlistPosition(client, ev.id);
        const updated = await setWaitlisted(client, reg.id, pos);
        mails.push({
          kind: 'waitlisted',
          ...mailBase(ev, account.email, account.display_name, updated.id),
          waitlistPosition: updated.waitlist_position,
        });
        return { reg: updated, mails, repeat: false };
      });

      await sendMails(out.mails);
      return c.json(serializeRegistration(out.reg), out.repeat ? 200 : 201);
    } catch (e: any) {
      if (e instanceof AppError) throw e;
      if (isSerializationFailure(e) && attempt < 5) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 12 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr ?? new AppError(409, 'That seat was taken while you were registering. Try again.', { code: 'contended' });
});

registrationRoutes.get('/me', async (c) => {
  const account = requireAccount(c);
  const rows = await query(
    `SELECT r.*, e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone,
            e.city, e.theme_hex, e.cover_seed, e.state AS event_state, e.capacity
       FROM registrations r JOIN events e ON e.id = r.event_id
      WHERE r.account_id = $1
      ORDER BY e.starts_at ASC NULLS LAST, e.slug ASC`,
    [account.id],
  );
  return c.json(rows.rows.map((r) => ({
    ...serializeRegistration(r),
    event_slug: r.event_slug,
    title: r.title,
    starts_at: toIso(r.starts_at),
    ends_at: toIso(r.ends_at),
    time_zone: r.time_zone,
    city: r.city,
    theme_hex: r.theme_hex,
    cover_seed: r.cover_seed,
    event_state: r.event_state,
  })));
});

/**
 * Cancelling frees the seat in the same request and hands it to the head of
 * the waiting list. A guest cancelling their own registration sends no mail to
 * that guest; the guest promoted into the seat is mailed.
 */
registrationRoutes.post('/:id/cancel', async (c) => {
  const account = requireAccount(c);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) throw notFound();

  const out = await tx(async (client) => {
    const r = await client.query(
      `SELECT r.*, e.slug FROM registrations r JOIN events e ON e.id = r.event_id WHERE r.id = $1`,
      [id],
    );
    const reg = r.rows[0];
    if (!reg) throw notFound();
    if (Number(reg.account_id) !== account.id) throw denied();

    const ev = await loadEventForUpdate(client, reg.slug);
    if (!ev) throw notFound();
    await lockEvent(client, ev.id);

    const fresh = await client.query('SELECT * FROM registrations WHERE id = $1 FOR UPDATE', [id]);
    const cur = fresh.rows[0];
    if (['cancelled_by_guest', 'cancelled_by_host', 'declined'].includes(cur.status)) {
      return { reg: cur, mails: [] as PendingMail[] };
    }
    const heldSeat = cur.status === 'confirmed' || cur.status === 'checked_in';
    const updated = await setPlain(client, id, 'cancelled_by_guest');
    if (cur.status === 'waitlisted') await renumberWaitlist(client, ev.id);

    let mails: PendingMail[] = [];
    // While registration is closed a freed seat promotes nobody.
    if (heldSeat && ev.state === 'published') {
      const promo = await promoteFromWaitlist(client, ev, 1);
      mails = promo.mails;
    }
    return { reg: updated, mails };
  });

  await sendMails(out.mails);
  return c.json(serializeRegistration(out.reg));
});

async function hostOwnedRegistration(client: any, id: number, accountId: number, role: string) {
  const r = await client.query(
    `SELECT r.*, e.slug AS event_slug, cal.owner_account_id, a.email, a.display_name
       FROM registrations r
       JOIN events e ON e.id = r.event_id
       JOIN calendars cal ON cal.id = e.calendar_id
       JOIN accounts a ON a.id = r.account_id
      WHERE r.id = $1`,
    [id],
  );
  const reg = r.rows[0];
  if (!reg) throw notFound();
  if (Number(reg.owner_account_id) !== accountId) throw role === 'host' ? denied() : notFound();
  return reg;
}

/** The host approves a pending request to a seat, or to the waiting list when full. */
registrationRoutes.post('/:id/approve', async (c) => {
  const account = requireAccount(c);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) throw notFound();

  const out = await tx(async (client) => {
    const reg = await hostOwnedRegistration(client, id, account.id, account.role);
    const ev = await loadEventForUpdate(client, reg.event_slug);
    if (!ev) throw notFound();
    await lockEvent(client, ev.id);
    if (ev.state === 'cancelled') {
      throw new AppError(409, 'This event has been called off.', { code: 'event_cancelled' });
    }
    const fresh = await client.query('SELECT * FROM registrations WHERE id = $1 FOR UPDATE', [id]);
    if (fresh.rows[0].status !== 'pending_approval') {
      throw new AppError(409, 'That request is no longer waiting on you.', { code: 'not_pending' });
    }

    const seat = await freeSeat(client, ev.id, ev.capacity);
    if (seat !== null) {
      const updated = await setConfirmed(client, id, seat);
      return {
        reg: updated, waitlisted: false,
        mails: [{
          kind: 'approved' as const,
          ...mailBase(ev, reg.email, reg.display_name, id),
          ticketCode: updated.ticket_code,
        }],
      };
    }
    if (!ev.waitlist_enabled) {
      throw new AppError(409, 'This event is full and it keeps no waiting list, so this request cannot be approved.', { code: 'event_full' });
    }
    const pos = await nextWaitlistPosition(client, ev.id);
    const updated = await setWaitlisted(client, id, pos);
    return {
      reg: updated, waitlisted: true,
      mails: [{
        kind: 'waitlisted' as const,
        ...mailBase(ev, reg.email, reg.display_name, id),
        waitlistPosition: updated.waitlist_position,
      }],
    };
  });

  await sendMails(out.mails);
  return c.json({ ...serializeRegistration(out.reg), moved_to_waitlist: out.waitlisted });
});

registrationRoutes.post('/:id/decline', async (c) => {
  const account = requireAccount(c);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) throw notFound();

  const out = await tx(async (client) => {
    const reg = await hostOwnedRegistration(client, id, account.id, account.role);
    const ev = await loadEventForUpdate(client, reg.event_slug);
    if (!ev) throw notFound();
    await lockEvent(client, ev.id);
    const fresh = await client.query('SELECT * FROM registrations WHERE id = $1 FOR UPDATE', [id]);
    const cur = fresh.rows[0];
    if (cur.status === 'declined') return { reg: cur, mails: [] as PendingMail[] };
    const heldSeat = cur.status === 'confirmed' || cur.status === 'checked_in';
    const updated = await setPlain(client, id, 'declined');
    if (cur.status === 'waitlisted') await renumberWaitlist(client, ev.id);
    let mails: PendingMail[] = [{
      kind: 'declined' as const, ...mailBase(ev, reg.email, reg.display_name, id),
    }];
    if (heldSeat && ev.state === 'published') {
      const promo = await promoteFromWaitlist(client, ev, 1);
      mails = mails.concat(promo.mails);
    }
    return { reg: updated, mails };
  });

  await sendMails(out.mails);
  return c.json(serializeRegistration(out.reg));
});

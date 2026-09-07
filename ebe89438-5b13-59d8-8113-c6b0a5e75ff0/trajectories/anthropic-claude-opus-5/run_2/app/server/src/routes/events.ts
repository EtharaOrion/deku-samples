import { Hono } from 'hono';
import type { PoolClient } from 'pg';
import { pool, tx } from '../db.js';
import {
  confirmedCount,
  EventRow,
  eventDetail,
  eventPublic,
  lockEvent,
  promoteFromWaitlist,
} from '../domain.js';
import {
  Account,
  AppContext,
  accountFromRequest,
  handleError,
  notFound,
  readJson,
  requireAccount,
  requireHost,
} from '../http.js';
import {
  SUBJECTS,
  bodyEventCancelled,
  bodyEventChanged,
  bodyPromoted,
  sendMail,
} from '../mail.js';
import { checkNamespaceFree, deriveFreeSlug } from '../namespace.js';
import {
  CATEGORIES,
  FieldError,
  csvCell,
  isIanaZone,
  isRfc3339Utc,
  kebab,
  log,
  themeHexFromSeed,
} from '../util.js';

export const eventRoutes = new Hono();

/** The events open to discovery are published and registration_closed alone. */
const DISCOVERABLE = ['published', 'registration_closed'];

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parsePaging(c: AppContext) {
  const rawLimit = c.req.query('limit');
  const rawOffset = c.req.query('offset');
  let limit = rawLimit === undefined ? DEFAULT_LIMIT : Number(rawLimit);
  let offset = rawOffset === undefined ? 0 : Number(rawOffset);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  limit = Math.min(Math.floor(limit), MAX_LIMIT);
  return { limit, offset: Math.floor(offset) };
}

/**
 * category, city and q combine as one condition: q narrows what the other two
 * already selected rather than widening it. Ranking is fixed: soonest
 * starts_at first, ties broken by slug ascending.
 */
eventRoutes.get('/events', async (c: AppContext) => {
  try {
    const { limit, offset } = parsePaging(c);
    const category = (c.req.query('category') || '').trim().toLowerCase();
    const city = (c.req.query('city') || '').trim();
    const qRaw = c.req.query('q') || '';
    const q = qRaw.trim(); // a q of only whitespace is treated as absent

    const where: string[] = ['e.state = ANY($1)'];
    const params: unknown[] = [DISCOVERABLE];

    if (category && (CATEGORIES as readonly string[]).includes(category)) {
      params.push(category);
      where.push(`e.category = $${params.length}`);
    }
    if (city) {
      params.push(city.toLowerCase());
      where.push(`lower(e.city) = $${params.length}`);
    }
    if (q) {
      // matched against title, description and the holding calendar's name,
      // case-insensitively, on any part of a word; the city is never q's job.
      params.push(`%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
      const i = params.length;
      where.push(
        `(e.title ILIKE $${i} ESCAPE '\\' OR e.description ILIKE $${i} ESCAPE '\\' OR cal.name ILIKE $${i} ESCAPE '\\')`,
      );
    }

    const whereSql = where.join(' AND ');
    const countSql = `SELECT count(*)::int AS n FROM events e
                        JOIN calendars cal ON cal.id = e.calendar_id
                       WHERE ${whereSql}`;
    const { rows: countRows } = await pool.query(countSql, params);
    const total = countRows[0].n as number;

    const listParams = [...params, limit, offset];
    const { rows } = await pool.query(
      `SELECT e.*,
              (SELECT count(*)::int FROM registrations r
                WHERE r.event_id = e.id AND r.status IN ('confirmed','checked_in')
              ) AS confirmed_count
         FROM events e
         JOIN calendars cal ON cal.id = e.calendar_id
        WHERE ${whereSql}
        ORDER BY e.starts_at ASC NULLS LAST, e.slug ASC
        LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams,
    );

    // present on an empty page too, where it reads 0
    c.header('X-Total-Count', String(total));
    c.header('Access-Control-Expose-Headers', 'X-Total-Count');
    return c.json(
      rows.map((r: EventRow & { confirmed_count: number }) =>
        eventPublic(r, r.confirmed_count),
      ),
    );
  } catch (err) {
    return handleError(err, c);
  }
});

async function loadEventBySlug(
  slug: string,
  client: PoolClient | typeof pool = pool,
): Promise<(EventRow & { calendar_name: string; calendar_slug: string; owner_account_id: string; calendar_is_public: boolean }) | null> {
  const { rows } = await client.query(
    `SELECT e.*, cal.name AS calendar_name, cal.slug AS calendar_slug,
            cal.owner_account_id, cal.is_public AS calendar_is_public
       FROM events e JOIN calendars cal ON cal.id = e.calendar_id
      WHERE e.slug = $1`,
    [slug],
  );
  return rows[0] ?? null;
}

/** A draft event returns, to everyone but its host, the not-found response. */
eventRoutes.get('/events/:slug', async (c: AppContext) => {
  try {
    const ev = await loadEventBySlug(String(c.req.param('slug')));
    if (!ev) return notFound(c);

    const { account } = await accountFromRequest(c);
    const isOwner = !!account && account.id === ev.owner_account_id;
    if (ev.state === 'draft' && !isOwner) return notFound(c);

    const confirmed = await confirmedCount(pool as unknown as PoolClient, ev.id);
    let mine: Record<string, unknown> | null = null;
    if (account) {
      const { rows } = await pool.query(
        `SELECT id, status, waitlist_position, ticket_code, checked_in_at
           FROM registrations WHERE event_id = $1 AND account_id = $2`,
        [ev.id, account.id],
      );
      mine = rows[0] ?? null;
    }

    return c.json(
      eventDetail(ev, confirmed, {
        calendar_name: ev.calendar_name,
        calendar_slug: ev.calendar_slug,
        calendar_is_public: ev.calendar_is_public,
        is_owner: isOwner,
        my_registration: mine,
      }),
    );
  } catch (err) {
    return handleError(err, c);
  }
});

/* ------------------------------------------------------------- create/edit */

interface EventInput {
  title?: string;
  category?: string;
  city?: string;
  time_zone?: string;
  starts_at?: string | null;
  ends_at?: string | null;
  capacity?: number | null;
  description?: string;
  approval_required?: boolean;
  waitlist_enabled?: boolean;
}

function readEventInput(body: Record<string, unknown>): EventInput {
  const out: EventInput = {};
  if (body.title !== undefined) out.title = String(body.title).trim();
  if (body.category !== undefined) {
    out.category = String(body.category).trim().toLowerCase();
  }
  if (body.city !== undefined) out.city = String(body.city).trim();
  if (body.description !== undefined) out.description = String(body.description);
  if (body.time_zone !== undefined) {
    const tz = String(body.time_zone).trim();
    if (tz && !isIanaZone(tz)) {
      throw new FieldError('time_zone', 'Use an IANA zone name such as Europe/Berlin.');
    }
    out.time_zone = tz || 'UTC';
  }
  for (const key of ['starts_at', 'ends_at'] as const) {
    if (body[key] !== undefined) {
      const raw = body[key];
      if (raw === null || raw === '') {
        out[key] = null;
      } else if (!isRfc3339Utc(raw)) {
        throw new FieldError(key, 'Use an RFC 3339 instant in UTC ending in Z.');
      } else {
        out[key] = String(raw);
      }
    }
  }
  if (body.capacity !== undefined) {
    if (body.capacity === null || body.capacity === '') {
      out.capacity = null;
    } else {
      const n = Number(body.capacity);
      if (!Number.isInteger(n) || n < 1 || n > 500) {
        throw new FieldError('capacity', 'Capacity runs from 1 to 500.');
      }
      out.capacity = n;
    }
  }
  if (body.approval_required !== undefined) {
    out.approval_required = Boolean(body.approval_required);
  }
  if (body.waitlist_enabled !== undefined) {
    out.waitlist_enabled = Boolean(body.waitlist_enabled);
  }
  return out;
}

/** Publishing needs a title, category, city, starts_at, ends_at after it and capacity. */
function publishable(v: {
  title?: string | null;
  category?: string | null;
  city?: string | null;
  starts_at?: string | Date | null;
  ends_at?: string | Date | null;
  capacity?: number | null;
}): boolean {
  if (!v.title || !v.category) return false;
  if (!(CATEGORIES as readonly string[]).includes(v.category)) return false;
  if (!v.city) return false;
  if (!v.starts_at || !v.ends_at) return false;
  if (new Date(v.ends_at).getTime() <= new Date(v.starts_at).getTime()) return false;
  if (v.capacity === null || v.capacity === undefined) return false;
  return v.capacity >= 1 && v.capacity <= 500;
}

eventRoutes.post('/events', async (c: AppContext) => {
  try {
    const account = await requireHost(c);
    const body = await readJson(c);
    const input = readEventInput(body);
    const calendarSlug = String(body.calendar_slug ?? '').trim().toLowerCase();
    if (!calendarSlug) {
      throw new FieldError('calendar_slug', 'Choose the calendar this event lives on.');
    }
    if (!input.title) throw new FieldError('title', 'Give the event a name.');

    const created = await tx(async (client) => {
      const { rows: cals } = await client.query(
        'SELECT * FROM calendars WHERE slug = $1',
        [calendarSlug],
      );
      const calendar = cals[0];
      // Scope is by ownership of the calendar, not by role.
      if (!calendar || calendar.owner_account_id !== account.id) {
        throw new FieldError('calendar_slug', 'That calendar is not one of yours.', 404);
      }

      if (input.starts_at && input.ends_at) {
        if (new Date(input.ends_at) <= new Date(input.starts_at)) {
          throw new FieldError('ends_at', 'The end time must come after the start time.');
        }
      }

      let slug: string;
      if (body.slug !== undefined && String(body.slug).trim()) {
        slug = String(body.slug).trim().toLowerCase();
        const check = await checkNamespaceFree(slug, client);
        if (!check.ok) {
          throw new FieldError(
            'slug',
            check.reason === 'shape'
              ? 'Use lowercase letters, numbers and single hyphens.'
              : 'That address is already taken.',
            409,
          );
        }
      } else {
        slug = await deriveFreeSlug(kebab(input.title!), client);
      }

      const category = input.category || calendar.category;
      const city = input.city || calendar.city;
      const coverSeed = `${slug}-${Date.now().toString(36)}`;
      // theme_hex is derived once at creation from cover_seed
      const themeHex = themeHexFromSeed(coverSeed);

      const state = publishable({
        title: input.title,
        category,
        city,
        starts_at: input.starts_at ?? null,
        ends_at: input.ends_at ?? null,
        capacity: input.capacity ?? null,
      })
        ? 'published'
        : 'draft';

      const { rows } = await client.query(
        `INSERT INTO events (
           calendar_id, title, slug, category, city, time_zone, cover_seed, theme_hex,
           description, starts_at, ends_at, capacity, approval_required,
           waitlist_enabled, state, published_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING *`,
        [
          calendar.id,
          input.title,
          slug,
          category,
          city,
          input.time_zone || 'UTC',
          coverSeed,
          themeHex,
          input.description ?? '',
          input.starts_at ?? null,
          input.ends_at ?? null,
          input.capacity ?? null,
          input.approval_required ?? false,
          input.waitlist_enabled ?? true,
          state,
          state === 'published' ? new Date() : null,
        ],
      );
      return rows[0] as EventRow;
    });

    log('info', 'event_created', {
      event_id: created.id,
      slug: created.slug,
      state: created.state,
    });
    return c.json(eventDetail(created, 0), 201);
  } catch (err) {
    return handleError(err, c);
  }
});

eventRoutes.patch('/events/:slug', async (c: AppContext) => {
  try {
    const account = await requireHost(c);
    const body = await readJson(c);
    const input = readEventInput(body);

    const result = await tx(async (client) => {
      const existing = await loadEventBySlug(String(c.req.param('slug')), client);
      if (!existing || existing.owner_account_id !== account.id) return null;
      const ev = await lockEvent(client, existing.id);

      if (ev.state === 'cancelled') {
        // A cancellation is the one edit that cannot be undone.
        throw new FieldError(
          'state',
          'This event has been cancelled and cannot be changed again.',
          409,
        );
      }

      const nextState = body.state === undefined ? undefined : String(body.state);
      if (nextState !== undefined) {
        const allowed: Record<string, string[]> = {
          draft: ['draft', 'published'],
          published: ['published', 'registration_closed'],
          registration_closed: ['registration_closed', 'published'],
        };
        if (!allowed[ev.state]?.includes(nextState)) {
          throw new FieldError(
            'state',
            nextState === 'draft' && ev.state !== 'draft'
              ? 'A published event cannot be returned to draft.'
              : `An event in ${ev.state} cannot move to ${nextState}.`,
            409,
          );
        }
      }

      const merged = {
        title: input.title ?? ev.title,
        category: input.category ?? ev.category,
        city: input.city ?? ev.city,
        starts_at: input.starts_at !== undefined ? input.starts_at : ev.starts_at,
        ends_at: input.ends_at !== undefined ? input.ends_at : ev.ends_at,
        capacity: input.capacity !== undefined ? input.capacity : ev.capacity,
      };

      if (input.category && !(CATEGORIES as readonly string[]).includes(input.category)) {
        throw new FieldError('category', 'Choose one of the twelve categories.');
      }
      if (merged.starts_at && merged.ends_at) {
        if (new Date(merged.ends_at) <= new Date(merged.starts_at)) {
          throw new FieldError('ends_at', 'The end time must come after the start time.');
        }
      }

      const confirmed = await confirmedCount(client, ev.id);
      if (
        input.capacity !== undefined &&
        input.capacity !== null &&
        input.capacity < confirmed
      ) {
        // Lowering capacity below the current confirmed count is rejected.
        throw new FieldError(
          'capacity',
          `You already have ${confirmed} guests confirmed.`,
          409,
        );
      }

      let state = ev.state;
      if (nextState !== undefined) {
        if (nextState === 'published' && ev.state === 'draft') {
          if (!publishable(merged)) {
            throw new FieldError(
              'state',
              'Add a title, category, city, start, end and capacity before publishing.',
            );
          }
          state = 'published';
        } else {
          state = nextState;
        }
      } else if (ev.state === 'draft' && publishable(merged)) {
        state = 'published';
      }

      const changes: string[] = [];
      if (input.starts_at !== undefined || input.ends_at !== undefined) {
        const before = ev.starts_at ? new Date(ev.starts_at).getTime() : null;
        const after = merged.starts_at ? new Date(merged.starts_at).getTime() : null;
        const beforeEnd = ev.ends_at ? new Date(ev.ends_at).getTime() : null;
        const afterEnd = merged.ends_at ? new Date(merged.ends_at).getTime() : null;
        if (before !== after || beforeEnd !== afterEnd) changes.push('The time has changed.');
      }
      if (input.city !== undefined && input.city !== ev.city) {
        changes.push('The location has changed.');
      }

      const { rows } = await client.query(
        `UPDATE events SET
           title = $2, category = $3, city = $4,
           time_zone = coalesce($5, time_zone),
           description = coalesce($6, description),
           starts_at = $7, ends_at = $8, capacity = $9,
           approval_required = coalesce($10, approval_required),
           waitlist_enabled = coalesce($11, waitlist_enabled),
           state = $12,
           published_at = CASE WHEN $12 <> 'draft' AND published_at IS NULL
                               THEN now() ELSE published_at END,
           updated_at = now()
         WHERE id = $1 RETURNING *`,
        [
          ev.id,
          merged.title,
          merged.category,
          merged.city,
          input.time_zone ?? null,
          input.description ?? null,
          merged.starts_at,
          merged.ends_at,
          merged.capacity,
          input.approval_required ?? null,
          input.waitlist_enabled ?? null,
          state,
        ],
      );
      const updated = rows[0] as EventRow;

      // Raising capacity fills the seats that just appeared, in this request.
      let promoted: Awaited<ReturnType<typeof promoteFromWaitlist>> = [];
      const raised =
        input.capacity !== undefined &&
        input.capacity !== null &&
        (ev.capacity === null || input.capacity > ev.capacity);
      if (raised && updated.state !== 'cancelled') {
        promoted = await promoteFromWaitlist(client, updated);
      }

      // Guests holding a seat when the time or the location moves are mailed.
      let notifyChanged: { email: string; display_name: string }[] = [];
      if (changes.length) {
        const { rows: seated } = await client.query(
          `SELECT a.email, a.display_name FROM registrations r
             JOIN accounts a ON a.id = r.account_id
            WHERE r.event_id = $1 AND r.status IN ('confirmed','checked_in')`,
          [ev.id],
        );
        notifyChanged = seated;
      }

      return { updated, promoted, changes, notifyChanged };
    });

    if (!result) return notFound(c);
    const { updated, promoted, changes, notifyChanged } = result;

    for (const p of promoted) {
      await sendMail({
        to: p.email,
        subject: SUBJECTS.promoted(updated.title),
        lines: bodyPromoted(updated, p.display_name, p.ticket_code),
        eventId: updated.id,
        registrationId: p.registration_id,
      });
    }
    for (const g of notifyChanged) {
      await sendMail({
        to: g.email,
        subject: `An update about ${updated.title}`,
        lines: bodyEventChanged(updated, g.display_name, changes),
        eventId: updated.id,
      });
    }

    const confirmed = await confirmedCount(pool as unknown as PoolClient, updated.id);
    log('info', 'event_updated', {
      event_id: updated.id,
      state: updated.state,
      promoted: promoted.length,
    });
    return c.json(eventDetail(updated, confirmed, { promoted_count: promoted.length }));
  } catch (err) {
    return handleError(err, c);
  }
});

/** Cancelling needs a non-empty reason and mails every guest still holding a place. */
eventRoutes.post('/events/:slug/cancel', async (c: AppContext) => {
  try {
    const account = await requireHost(c);
    const body = await readJson(c);
    const reason = String(body.reason ?? body.cancel_reason ?? '').trim();
    if (!reason) {
      throw new FieldError('reason', 'Tell your guests why the event is off.');
    }

    const result = await tx(async (client) => {
      const existing = await loadEventBySlug(String(c.req.param('slug')), client);
      if (!existing || existing.owner_account_id !== account.id) return null;
      const ev = await lockEvent(client, existing.id);
      if (ev.state === 'cancelled') {
        throw new FieldError('state', 'This event has already been cancelled.', 409);
      }

      const { rows: holders } = await client.query(
        `SELECT r.id, a.email, a.display_name FROM registrations r
           JOIN accounts a ON a.id = r.account_id
          WHERE r.event_id = $1
            AND r.status IN ('confirmed','checked_in','waitlisted','pending_approval')`,
        [ev.id],
      );

      await client.query(
        `UPDATE registrations
            SET status = 'cancelled_by_host', ticket_code = NULL,
                waitlist_position = NULL, updated_at = now()
          WHERE event_id = $1
            AND status IN ('confirmed','checked_in','waitlisted','pending_approval')`,
        [ev.id],
      );

      const { rows } = await client.query(
        `UPDATE events SET state = 'cancelled', cancelled_at = now(),
                cancel_reason = $2, updated_at = now()
          WHERE id = $1 RETURNING *`,
        [ev.id, reason],
      );
      return { cancelled: rows[0] as EventRow, holders };
    });

    if (!result) return notFound(c);
    const { cancelled, holders } = result;

    for (const h of holders) {
      await sendMail({
        to: h.email,
        subject: SUBJECTS.cancelled(cancelled.title),
        // carrying cancel_reason word for word
        lines: bodyEventCancelled(cancelled, h.display_name, reason),
        eventId: cancelled.id,
        registrationId: h.id,
      });
    }

    log('info', 'event_cancelled', {
      event_id: cancelled.id,
      notified: holders.length,
    });
    return c.json(eventDetail(cancelled, 0));
  } catch (err) {
    return handleError(err, c);
  }
});

/* -------------------------------------------------------------- guest list */

const STATUS_ORDER = `CASE status
  WHEN 'cancelled_by_guest' THEN 0 WHEN 'cancelled_by_host' THEN 1
  WHEN 'checked_in' THEN 2 WHEN 'confirmed' THEN 3 WHEN 'declined' THEN 4
  WHEN 'pending_approval' THEN 5 WHEN 'waitlisted' THEN 6 ELSE 7 END`;

async function ownedEventOr404(c: AppContext, account: Account) {
  const ev = await loadEventBySlug(String(c.req.param('slug')));
  if (!ev || ev.owner_account_id !== account.id) return null;
  return ev;
}

eventRoutes.get('/events/:slug/registrations', async (c: AppContext) => {
  try {
    const account = await requireAccount(c);
    const ev = await ownedEventOr404(c, account);
    if (!ev) return notFound(c);
    const { rows } = await pool.query(
      `SELECT r.id, r.account_id, a.email, a.display_name, r.status,
              r.waitlist_position, r.ticket_code, r.checked_in_at, r.created_at
         FROM registrations r JOIN accounts a ON a.id = r.account_id
        WHERE r.event_id = $1
        ORDER BY ${STATUS_ORDER.replace(/status/g, 'r.status')} ASC,
                 r.waitlist_position ASC NULLS LAST, a.email ASC`,
      [ev.id],
    );
    return c.json(
      rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        account_id: r.account_id,
        email: r.email,
        display_name: r.display_name,
        status: r.status,
        waitlist_position: r.waitlist_position,
        ticket_code: r.ticket_code,
        checked_in_at: r.checked_in_at
          ? new Date(r.checked_in_at as Date).toISOString()
          : null,
      })),
    );
  } catch (err) {
    return handleError(err, c);
  }
});

/** Same guest list as text/csv, named after the event slug. */
eventRoutes.get('/events/:slug/registrations.csv', async (c: AppContext) => {
  try {
    const account = await requireAccount(c);
    const ev = await ownedEventOr404(c, account);
    if (!ev) return notFound(c);
    const { rows } = await pool.query(
      `SELECT a.email, a.display_name, r.status, r.waitlist_position, r.ticket_code
         FROM registrations r JOIN accounts a ON a.id = r.account_id
        WHERE r.event_id = $1
        ORDER BY ${STATUS_ORDER.replace(/status/g, 'r.status')} ASC,
                 r.waitlist_position ASC NULLS LAST, a.email ASC`,
      [ev.id],
    );
    const header = 'email,display_name,status,waitlist_position,ticket_code';
    const lines = rows.map((r: Record<string, unknown>) =>
      [r.email, r.display_name, r.status, r.waitlist_position, r.ticket_code]
        .map(csvCell)
        .join(','),
    );
    const csv = [header, ...lines].join('\n') + '\n';
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="${ev.slug}.csv"`);
    return c.body(csv);
  } catch (err) {
    return handleError(err, c);
  }
});

/* ------------------------------------------------------------- ordering aid */

export { loadEventBySlug };

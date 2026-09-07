import { Hono } from 'hono';
import { pool, withTxn } from './db.js';
import { sendMail } from './mail.js';
import {
  ApiError, MAIL_SUBJECTS, assertAfter, assertCapacity, assertRfc3339Z,
  assertSlugFree, assertTimeZone, isValidSlug, iso, isoOrNull, seatCount,
  slugify,
} from './domain.js';
import { promoteFromWaitlist } from './registration.js';
import { themeFromSeed, CATEGORIES } from './config.js';
import type { AuthAccount } from './auth.js';

type Vars = { account?: AuthAccount };
const app = new Hono<{ Variables: Vars }>();

const SELECT_EVENT = `
  SELECT e.*, c.name AS calendar_name, c.slug AS calendar_slug,
         c.owner_account_id AS owner_account_id, c.is_public AS calendar_is_public
    FROM events e JOIN calendars c ON c.id = e.calendar_id`;

function shapeEvent(r: any) {
  return {
    id: r.id, slug: r.slug, title: r.title, category: r.category, city: r.city,
    time_zone: r.time_zone, cover_seed: r.cover_seed, theme_hex: r.theme_hex,
    description: r.description,
    starts_at: iso(r.starts_at), ends_at: iso(r.ends_at), capacity: r.capacity,
    approval_required: r.approval_required, waitlist_enabled: r.waitlist_enabled,
    state: r.state, published_at: isoOrNull(r.published_at),
    cancelled_at: isoOrNull(r.cancelled_at), cancel_reason: r.cancel_reason,
    created_at: iso(r.created_at), updated_at: iso(r.updated_at),
    calendar: r.calendar_slug ? {
      slug: r.calendar_slug, name: r.calendar_name,
      is_public: r.calendar_is_public, owner_account_id: r.owner_account_id,
    } : undefined,
  };
}

async function confirmedCount(eventId: string): Promise<number> {
  const res = await pool.query(
    `SELECT count(*)::int AS n FROM registrations
      WHERE event_id = $1 AND status IN ('confirmed','checked_in')`, [eventId]);
  return Number(res.rows[0].n);
}

async function getEventBySlug(slug: string) {
  const { rows } = await pool.query(`${SELECT_EVENT} WHERE e.slug = $1`, [slug]);
  return rows[0] ?? null;
}

async function requireOwner(slug: string, accountId: string) {
  const row = await getEventBySlug(slug);
  if (!row || row.owner_account_id !== accountId) {
    throw new ApiError(404, 'not_found', `No event lives at that address.`);
  }
  return row;
}

// --- discovery list -------------------------------------------------------
app.get('/', async c => {
  const q = (c.req.query('q') ?? '').trim();
  const category = (c.req.query('category') ?? '').trim();
  const city = (c.req.query('city') ?? '').trim();
  let limit = Number(c.req.query('limit') ?? 20);
  let offset = Number(c.req.query('offset') ?? 0);
  if (!Number.isFinite(limit) || limit < 1) limit = 20;
  limit = Math.min(Math.floor(limit), 100);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  offset = Math.floor(offset);

  const where: string[] = [`e.state IN ('published','registration_closed')`];
  const params: any[] = [];
  if (category) { params.push(category); where.push(`e.category = $${params.length}`); }
  if (city) { params.push(city); where.push(`e.city ILIKE $${params.length}`); }
  const calendar = (c.req.query('calendar') ?? '').trim();
  if (calendar) { params.push(calendar); where.push(`c.slug = $${params.length}`); }
  if (q) {
    params.push(`%${q}%`);
    const n = params.length;
    where.push(`(e.title ILIKE $${n} OR e.description ILIKE $${n} OR c.name ILIKE $${n})`);
  }
  const whereSql = where.join(' AND ');

  const totalRes = await pool.query(
    `SELECT count(*)::int AS n FROM events e JOIN calendars c ON c.id = e.calendar_id WHERE ${whereSql}`,
    params);
  const total = Number(totalRes.rows[0].n);
  const { rows } = await pool.query(
    `SELECT e.*, c.name AS calendar_name, c.slug AS calendar_slug
       FROM events e JOIN calendars c ON c.id = e.calendar_id
      WHERE ${whereSql}
      ORDER BY e.starts_at ASC, e.slug ASC
      LIMIT ${limit} OFFSET ${offset}`, params);

  const seats = rows.length
    ? await pool.query(
        `SELECT event_id, count(*)::int AS n FROM registrations
          WHERE status IN ('confirmed','checked_in') AND event_id = ANY($1::uuid[])
          GROUP BY event_id`, [rows.map(r => r.id)])
    : { rows: [] as any[] };
  const seatMap = new Map<string, number>(seats.rows.map((r: any) => [r.event_id, Number(r.n)]));

  c.header('X-Total-Count', String(total));
  c.header('Access-Control-Expose-Headers', 'X-Total-Count');
  return c.json(rows.map(r => {
    const cc = seatMap.get(r.id) ?? 0;
    return {
      slug: r.slug, title: r.title, category: r.category, city: r.city,
      time_zone: r.time_zone, starts_at: iso(r.starts_at), ends_at: iso(r.ends_at),
      capacity: r.capacity, confirmed_count: cc,
      remaining: Math.max(0, r.capacity - cc), state: r.state, theme_hex: r.theme_hex,
      cover_seed: r.cover_seed, calendar_name: r.calendar_name, calendar_slug: r.calendar_slug,
    };
  }));
});

// --- one event ------------------------------------------------------------
app.get('/:slug', async c => {
  const account = c.get('account') ?? null;
  const row = await getEventBySlug(c.req.param('slug'));
  if (!row) throw new ApiError(404, 'not_found', `No event lives at that address.`);
  const isOwner = !!account && account.id === row.owner_account_id;
  if (row.state === 'draft' && !isOwner) {
    throw new ApiError(404, 'not_found', `No event lives at that address.`);
  }
  const cc = await confirmedCount(row.id);
  const out: any = shapeEvent(row);
  out.confirmed_count = cc;
  out.remaining = Math.max(0, row.capacity - cc);
  if (account) {
    const res = await pool.query(
      `SELECT id, status, waitlist_position, ticket_code FROM registrations
        WHERE event_id = $1 AND account_id = $2`, [row.id, account.id]);
    out.my_registration = res.rows[0] ?? null;
  } else {
    out.my_registration = null;
  }
  return c.json(out);
});

// --- create ---------------------------------------------------------------
app.post('/', async c => {
  const account = c.get('account')!;
  const body = await c.req.json().catch(() => ({} as any));
  const b = body ?? {};

  const calendarSlug = typeof b.calendar_slug === 'string' ? b.calendar_slug : '';
  if (!calendarSlug) throw new ApiError(400, 'bad_calendar_slug', `Choose a calendar for this event.`, { calendar_slug: `Choose a calendar.` });

  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (!title) throw new ApiError(400, 'bad_title', `Give the event a name.`, { title: `Give the event a name.` });

  const category = typeof b.category === 'string' ? b.category : '';
  if (!(CATEGORIES as readonly string[]).includes(category)) {
    throw new ApiError(400, 'bad_category', `Choose one of the twelve categories.`, { category: `Choose a category.` });
  }
  const city = typeof b.city === 'string' ? b.city.trim() : '';
  if (!city) throw new ApiError(400, 'bad_city', `Say where the event happens.`, { city: `Say where it happens.` });

  const tz = assertTimeZone(b.time_zone);
  const startOk = typeof b.starts_at === 'string' && b.starts_at.trim() !== '';
  const endOk = typeof b.ends_at === 'string' && b.ends_at.trim() !== '';
  const capacity = assertCapacity(b.capacity);

  const publishable = !!title && !!category && !!city && startOk && endOk;

  const start = startOk ? assertRfc3339Z(b.starts_at, 'starts_at', 'The start') : new Date(0);
  const end = endOk ? assertRfc3339Z(b.ends_at, 'ends_at', 'The end') : new Date(start.getTime() + 3600_000);
  if (startOk && endOk) assertAfter(end, start);

  const approvalRequired = b.approval_required === true;
  const waitlistEnabled = b.waitlist_enabled === true;
  const description = typeof b.description === 'string' ? b.description : null;

  return withTxn(async tx => {
    const [cal] = await tx.query(
      `SELECT id, owner_account_id FROM calendars WHERE slug = $1`, [calendarSlug]);
    if (!cal || cal.owner_account_id !== account.id) {
      throw new ApiError(404, 'not_found', `No calendar of yours lives at that address.`);
    }
    let slug = typeof b.slug === 'string' && b.slug.trim()
      ? slugify(b.slug) : slugify(title);
    if (!slug) throw new ApiError(400, 'bad_slug', `Give the event a name that makes an address.`, { slug: `Give the event a name that makes an address.` });

    let suffix = 1;
    for (;;) {
      try {
        await assertSlugFree(tx, slug, `That address will not work.`);
        break;
      } catch (e: any) {
        if (e?.code === 'slug_taken' && suffix < 50) {
          slug = `${slugify(b.slug || title)}-${++suffix}`;
          continue;
        }
        throw e;
      }
    }

    const seed = `${slug}:${Math.random().toString(36).slice(2, 12)}`;
    const [row] = await tx.query(
      `INSERT INTO events (calendar_id, title, slug, category, city, time_zone, cover_seed,
                           theme_hex, description, starts_at, ends_at, capacity,
                           approval_required, waitlist_enabled, state, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
               CASE WHEN $15 = 'published' THEN now() ELSE NULL END)
       RETURNING *`,
      [cal.id, title, slug, category, city, tz, seed, themeFromSeed(seed), description,
       start, end, capacity, approvalRequired, waitlistEnabled,
       publishable ? 'published' : 'draft']);
    const [full] = await tx.query(`${SELECT_EVENT} WHERE e.id = $1`, [row.id]);
    const out: any = shapeEvent(full);
    out.confirmed_count = 0;
    out.remaining = row.capacity;
    return c.json(out, 201);
  });
});

// --- edit -----------------------------------------------------------------
app.patch('/:slug', async c => {
  const account = c.get('account')!;
  const body = await c.req.json().catch(() => ({} as any));
  const b = body ?? {};

  const result = await withTxn(async tx => {
    const [row] = await tx.query(
      `${SELECT_EVENT} WHERE e.slug = $1 FOR UPDATE OF e`, [c.req.param('slug')]);
    if (!row || row.owner_account_id !== account.id) {
      throw new ApiError(404, 'not_found', `No event of yours lives at that address.`);
    }
    if (row.state === 'cancelled') {
      throw new ApiError(400, 'bad_state', `A cancelled event cannot be edited.`);
    }

    const title = b.title !== undefined ? String(b.title).trim() : row.title;
    if (!title) throw new ApiError(400, 'bad_title', `Give the event a name.`, { title: `Give the event a name.` });
    const description = b.description !== undefined
      ? (b.description === null ? null : String(b.description)) : row.description;
    const city = b.city !== undefined ? String(b.city).trim() : row.city;
    if (!city) throw new ApiError(400, 'bad_city', `Say where the event happens.`, { city: `Say where it happens.` });
    const tz = b.time_zone !== undefined ? assertTimeZone(b.time_zone) : row.time_zone;
    const start = b.starts_at !== undefined ? assertRfc3339Z(b.starts_at, 'starts_at', 'The start') : new Date(iso(row.starts_at));
    const end = b.ends_at !== undefined ? assertRfc3339Z(b.ends_at, 'ends_at', 'The end') : new Date(iso(row.ends_at));
    assertAfter(end, start);
    const capacity = b.capacity !== undefined ? assertCapacity(b.capacity) : row.capacity;

    if (b.state !== undefined && !['draft', 'published', 'registration_closed'].includes(b.state)) {
      throw new ApiError(400, 'bad_state', `That is not a state an event can be set to.`);
    }
    if (b.state === 'draft' && row.state !== 'draft') {
      throw new ApiError(400, 'bad_state', `A published event cannot return to draft.`);
    }
    if (b.state === 'published' && row.state === 'cancelled') {
      throw new ApiError(400, 'bad_state', `A cancelled event cannot be republished.`);
    }
    if (b.state === 'registration_closed' && !['published', 'registration_closed'].includes(row.state)) {
      throw new ApiError(400, 'bad_state', `Only a published event can close registration.`);
    }
    const state = b.state !== undefined ? b.state : row.state;

    const seats = await seatCount(tx, row.id);
    if (capacity < seats) {
      throw new ApiError(400, 'bad_capacity', `You already have ${seats} guests confirmed.`, { capacity: `You already have ${seats} guests confirmed.` });
    }

    const [updated] = await tx.query(
      `UPDATE events SET title=$2, description=$3, city=$4, time_zone=$5, starts_at=$6,
              ends_at=$7, capacity=$8, state=$9,
              published_at = CASE WHEN $9 = 'published' AND $10::timestamptz IS NULL THEN now() ELSE $10::timestamptz END,
              updated_at = now()
        WHERE id = $1 RETURNING *`,
      [row.id, title, description, city, tz, start, end, capacity, state,
       row.published_at ? new Date(iso(row.published_at)) : null]);

    const timeOrPlaceChanged = iso(updated.starts_at) !== iso(row.starts_at)
      || iso(updated.ends_at) !== iso(row.ends_at)
      || String(updated.city) !== String(row.city);
    const guestsToNotify = timeOrPlaceChanged && seats > 0
      ? await tx.query<{ email: string; id: string }>(
          `SELECT a.email, r.id FROM registrations r JOIN accounts a ON a.id = r.account_id
            WHERE r.event_id = $1 AND r.status IN ('confirmed','checked_in')`, [row.id])
      : [];

    // Raising capacity moves the waiting list inside this request.
    const promoted = capacity > row.capacity
      ? await promoteFromWaitlist(tx, row.id, updated.title, row.waitlist_enabled)
      : [];

    const [full] = await tx.query(`${SELECT_EVENT} WHERE e.id = $1`, [row.id]);
    const out: any = shapeEvent(full);
    out.confirmed_count = await seatCount(tx, row.id);
    out.remaining = Math.max(0, updated.capacity - out.confirmed_count);
    out.promoted_count = promoted.length;
    return {
      response: out,
      notify: guestsToNotify.map((g: any) => ({
        to: g.email, registrationId: g.id, eventId: row.id,
        subject: `${row.title} has new details`,
        text: `${updated.title} has changed. It now runs ${iso(updated.starts_at)} to ${iso(updated.ends_at)} in ${updated.city}.`,
      })),
      promotedMail: promoted.map(p => ({ regId: p.regId, email: p.email, title: updated.title })),
    };
  });

  // Mail follows the committed change, never inside the transaction.
  for (const m of result.notify) await sendMail(m);
  for (const p of result.promotedMail) {
    await sendMail({
      to: p.email, registrationId: p.regId, eventId: result.response.id,
      subject: MAIL_SUBJECTS.promoted(p.title),
      text: `A spot opened up for ${p.title}. Your seat is confirmed and your ticket is ready.`,
    });
  }
  result.response.notified_count = result.notify.length;
  return c.json(result.response);
});

// --- cancel ---------------------------------------------------------------
app.post('/:slug/cancel', async c => {
  const account = c.get('account')!;
  const body = await c.req.json().catch(() => ({} as any));
  const reason = typeof (body ?? {}).reason === 'string' ? (body as any).reason.trim() : '';
  if (!reason) throw new ApiError(400, 'bad_reason', `Say why the event is called off.`, { reason: `Type a reason so guests know what happened.` });

  const outcome = await withTxn(async tx => {
    const [row] = await tx.query(`${SELECT_EVENT} WHERE e.slug = $1 FOR UPDATE OF e`, [c.req.param('slug')]);
    if (!row || row.owner_account_id !== account.id) {
      throw new ApiError(404, 'not_found', `No event of yours lives at that address.`);
    }
    if (row.state === 'cancelled') {
      return { already: true, row, guests: [] as { email: string; id: string }[] };
    }
    const guests = await tx.query<{ email: string; id: string }>(
      `SELECT a.email, r.id FROM registrations r JOIN accounts a ON a.id = r.account_id
        WHERE r.event_id = $1 AND r.status IN ('confirmed','checked_in','waitlisted','pending_approval')`,
      [row.id]);
    await tx.query(
      `UPDATE events SET state='cancelled', cancelled_at=now(), cancel_reason=$2, updated_at=now() WHERE id=$1`,
      [row.id, reason]);
    return { already: false, row, guests };
  });

  if (!outcome.already) {
    for (const g of outcome.guests) {
      await sendMail({
        to: g.email, registrationId: g.id, eventId: outcome.row.id,
        subject: MAIL_SUBJECTS.eventCancelled(outcome.row.title),
        text: `${outcome.row.title} has been cancelled.\n\nThe host's reason, in their own words:\n\n${reason}\n\nNo seat is held any longer.`,
      });
    }
  }
  const full = await getEventBySlug(c.req.param('slug'));
  const out: any = shapeEvent(full);
  out.confirmed_count = await confirmedCount(outcome.row.id);
  return c.json(out);
});

// --- guest list (JSON) ----------------------------------------------------
app.get('/:slug/registrations', async c => {
  const account = c.get('account')!;
  const row = await requireOwner(c.req.param('slug'), account.id);
  const { rows } = await pool.query(
    `SELECT r.id, r.account_id, a.email, a.display_name, r.status, r.waitlist_position, r.ticket_code
       FROM registrations r JOIN accounts a ON a.id = r.account_id
      WHERE r.event_id = $1
      ORDER BY r.status ASC, r.waitlist_position ASC NULLS LAST, a.email ASC`, [row.id]);
  return c.json(rows);
});

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// --- guest list (CSV) -----------------------------------------------------
app.get('/:slug/registrations.csv', async c => {
  const account = c.get('account')!;
  const row = await requireOwner(c.req.param('slug'), account.id);
  const { rows } = await pool.query(
    `SELECT a.email, a.display_name, r.status, r.waitlist_position, r.ticket_code
       FROM registrations r JOIN accounts a ON a.id = r.account_id
      WHERE r.event_id = $1
      ORDER BY r.status ASC, r.waitlist_position ASC NULLS LAST, a.email ASC`, [row.id]);
  const lines = ['email,display_name,status,waitlist_position,ticket_code'];
  for (const r of rows) {
    lines.push([r.email, r.display_name, r.status, r.waitlist_position, r.ticket_code].map(csvCell).join(','));
  }
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="${row.slug}.csv"`);
  return c.body(lines.join('\r\n') + '\r\n');
});

export default app;
export { getEventBySlug, requireOwner, shapeEvent, confirmedCount };

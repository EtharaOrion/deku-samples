import { Hono } from 'hono';
import { pool, tx } from '../db.js';
import { requireAuth, type AuthAccount } from '../auth.js';
import { DomainError } from '../domain/registrations.js';
import { serializeRegistration, type RegistrationRow } from '../domain/registrations.js';
import { registerForEvent } from '../domain/service/register.js';
import { cancelOwnRegistration, approveRegistration, declineRegistration, checkInTicket, assertOwnsEvent } from '../domain/service/lifecycle.js';
import { loadEventBySlug, loadEventById, EVENT_LIST_FIELDS, type EventRow } from '../domain/events.js';
import { rateLimit, rateLimitMessage } from '../ratelimit.js';
import { toRfc3339 } from '../time.js';

export const registrationRoutes = new Hono();

function domainError(c: any, err: DomainError) {
  return c.json({ message: err.message, field: err.field ?? null }, err.status as any);
}

registrationRoutes.post('/', requireAuth, async (c) => {
  const account = c.get('account');
  const body = await c.req.json().catch(() => ({}));
  const eventSlug = typeof body.event_slug === 'string' ? body.event_slug : '';
  if (!eventSlug) return c.json({ message: 'Say which event you are joining.', field: 'event_slug' }, 400);
  const limit = rateLimit(`register:${account.id}`, 10, 60_000);
  if (!limit.ok) {
    return c.json({ message: rateLimitMessage(limit.resetAt), field: 'event_slug', limit: '10 per minute' }, 429);
  }
  try {
    const registration = await registerForEvent(account, eventSlug);
    return c.json(registration, 201);
  } catch (err) {
    if (err instanceof DomainError) return domainError(c, err);
    throw err;
  }
});

registrationRoutes.get('/me', requireAuth, async (c) => {
  const account = c.get('account');
  const { rows } = await pool.query(
    `SELECT r.*, a.email, a.display_name, e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone, e.city, e.state AS event_state, e.theme_hex, e.category, e.cover_seed, e.capacity
       FROM registrations r
       JOIN accounts a ON a.id = r.account_id
       JOIN events e ON e.id = r.event_id
      WHERE r.account_id = $1
      ORDER BY e.starts_at ASC`,
    [account.id],
  );
  return c.json(
    rows.map((row) => ({
      ...serializeRegistration(row as RegistrationRow),
      event_slug: row.event_slug,
      title: row.title,
      starts_at: toRfc3339(row.starts_at),
      ends_at: toRfc3339(row.ends_at),
      time_zone: row.time_zone,
      city: row.city,
      event_state: row.event_state,
      theme_hex: row.theme_hex,
      category: row.category,
      cover_seed: row.cover_seed,
      capacity: row.capacity,
    })),
  );
});

registrationRoutes.post('/:id/cancel', requireAuth, async (c) => {
  const account = c.get('account');
  try {
    const row = await cancelOwnRegistration(account, String(c.req.param('id')));
    return c.json(row);
  } catch (err) {
    if (err instanceof DomainError) return domainError(c, err);
    throw err;
  }
});

registrationRoutes.post('/:id/approve', requireAuth, async (c) => {
  const account = c.get('account');
  if (account.role !== 'host') return c.json({ message: 'That registration does not exist.' }, 404);
  try {
    const out = await approveRegistration(account, String(c.req.param('id')));
    return c.json({ ...out.registration, note: out.note });
  } catch (err) {
    if (err instanceof DomainError) return domainError(c, err);
    throw err;
  }
});

registrationRoutes.post('/:id/decline', requireAuth, async (c) => {
  const account = c.get('account');
  if (account.role !== 'host') return c.json({ message: 'That registration does not exist.' }, 404);
  try {
    const out = await declineRegistration(account, String(c.req.param('id')));
    return c.json({ ...out.registration, note: out.note });
  } catch (err) {
    if (err instanceof DomainError) return domainError(c, err);
    throw err;
  }
});

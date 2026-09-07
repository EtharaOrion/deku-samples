import { Hono } from 'hono';
import { pool, type Tx } from '../db.js';
import { currentAccount, requireAuth } from '../auth.js';
import { loadEventBySlug, EVENT_LIST_FIELDS, type EventRow } from '../domain/events.js';
import { DomainError } from '../domain/registrations.js';

export const guestListRoutes = new Hono();

/** Host-only guest list. A guest, another host and an unauthenticated caller all meet the same refusal. */
async function loadGuestList(slug: string, token: string | null) {
  const account = token
    ? (async () => {
        const { rows } = await pool.query(
          `SELECT a.id, a.email, a.display_name, a.handle, a.role FROM auth_tokens t JOIN accounts a ON a.id = t.account_id
            WHERE t.token = $1 AND t.expires_at > now()`,
          [token],
        );
        return rows[0] ?? null;
      })()
    : Promise.resolve(null);
  const acct = await account;
  const { rows } = await pool.query(
    `SELECT ${EVENT_LIST_FIELDS} FROM events e JOIN calendars c ON c.id = e.calendar_id WHERE e.slug = $1`,
    [slug],
  );
  const event = rows[0] as EventRow | undefined;
  if (!event || event.state === 'draft') return { status: 404 as const, body: { message: 'That event does not exist.' } };
  if (!acct || acct.role !== 'host' || acct.id !== event.owner_account_id) {
    return { status: 404 as const, body: { message: 'That event does not exist.' } };
  }
  const regs = await pool.query(
    `SELECT r.id, r.account_id, a.email, a.display_name, r.status, r.waitlist_position, r.ticket_code
       FROM registrations r JOIN accounts a ON a.id = r.account_id
      WHERE r.event_id = $1
      ORDER BY r.status ASC, r.waitlist_position ASC NULLS LAST, a.email ASC`,
    [event.id],
  );
  return { status: 200 as const, body: { event, rows: regs.rows } };
}

guestListRoutes.get('/:slug/registrations', requireAuth, async (c) => {
  const token = bearer(c);
  const result = await loadGuestList(String(c.req.param('slug')), token);
  if (result.status !== 200) return c.json(result.body, result.status);
  return c.json(
    result.body.rows.map((r) => ({
      id: r.id,
      account_id: r.account_id,
      email: r.email,
      display_name: r.display_name,
      status: r.status,
      waitlist_position: r.waitlist_position,
      ticket_code: r.ticket_code,
    })),
  );
});

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

guestListRoutes.get('/:slug/registrations.csv', async (c) => {
  const token = bearer(c);
  const result = await loadGuestList(String(c.req.param('slug')), token);
  if (result.status !== 200) return c.json(result.body, result.status);
  const lines = ['email,display_name,status,waitlist_position,ticket_code'];
  for (const r of result.body.rows) {
    lines.push([r.email, r.display_name, r.status, r.waitlist_position, r.ticket_code].map(csvEscape).join(','));
  }
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="${result.body.event.slug}.csv"`);
  c.header('Access-Control-Expose-Headers', 'Content-Disposition');
  return c.body(lines.join('\r\n') + '\r\n');
});

function bearer(c: any): string | null {
  const h = c.req.header('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

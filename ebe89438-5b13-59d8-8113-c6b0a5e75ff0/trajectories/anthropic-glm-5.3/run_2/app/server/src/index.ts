import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { APP_PUBLIC_URL, CATEGORIES, HOST, PORT, hashPassword, verifyPassword } from './config.js';
import { migrate, pool, withTxn } from './db.js';
import { ApiError, iso } from './domain.js';
import { accountFromToken, bearer, newToken, rateLimit, requireAuth } from './auth.js';
import { sendMail } from './mail.js';
import eventsApp from './events.js';
import calendarsApp from './calendars.js';
import accountsApp from './accounts.js';
import ticketsApp from './tickets.js';
import { seed } from './seed.js';

type Vars = { account?: any };
const app = new Hono<{ Variables: Vars }>();
app.use('*', logger());

// ---- theme cookie: the key colour must be in the first painted document ----
const THEME_COOKIE = 'event_theme';

app.use('*', async (c, next) => {
  await next();
  // The event page reads its palette from this cookie on first paint.
});

app.get('/api/health', async c => {
  try {
    await pool.query('SELECT 1');
    return c.json({ status: 'ok' });
  } catch {
    return c.json({ status: 'starting' }, 503);
  }
});

app.get('/api/resolve/:slug', async c => {
  const slug = c.req.param('slug').toLowerCase();
  const RESERVED = ['api','app','login','signup','home','calendars','create','discover','settings','event','t'];
  if (RESERVED.includes(slug)) return c.json({ kind: 'system', slug });
  if ((CATEGORIES as readonly string[]).includes(slug)) return c.json({ kind: 'category', slug });
  const { rows } = await pool.query(
    `SELECT 'event' AS kind FROM events WHERE slug = $1
     UNION ALL SELECT 'calendar' FROM calendars WHERE slug = $1
     UNION ALL SELECT 'account' FROM accounts WHERE handle = $1
     LIMIT 1`, [slug]);
  if (!rows.length) throw new ApiError(404, 'not_found', `Nothing lives at that address.`);
  return c.json({ kind: rows[0].kind, slug });
});

// ---- auth ----------------------------------------------------------------
app.post('/api/auth/signup', async c => {
  const b = await c.req.json().catch(() => ({} as any));
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, 'bad_email', `Enter a valid email address.`, { email: `Enter a valid email address.` });
  }
  const password = typeof b.password === 'string' ? b.password : '';
  if (password.length < 8) {
    throw new ApiError(400, 'bad_password', `Choose a password of at least 8 characters.`, { password: `Choose at least 8 characters.` });
  }
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name) throw new ApiError(400, 'bad_name', `Add your name so hosts know who is coming.`, { name: `Add your name so hosts know who is coming.` });
  rateLimit(`signup:${email}`);
  const token = newToken();
  return withTxn(async tx => {
    const clash = await tx.query(`SELECT 1 FROM accounts WHERE email = $1`, [email]);
    if (clash.length) throw new ApiError(409, 'email_taken', `An account already uses that email. Sign in instead.`, { email: `An account already uses that email. Sign in instead.` });
    let handle = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'guest';
    let n = 1;
    for (;;) {
      const taken = await tx.query(`SELECT 1 FROM root_namespace WHERE value = $1`, [handle]);
      if (!taken.length) break;
      handle = `${handle.replace(/-\d+$/, '')}-${++n}`;
    }
    const [row] = await tx.query(
      `INSERT INTO accounts (email, password_hash, display_name, handle, role)
       VALUES ($1,$2,$3,$4,'guest') RETURNING id, email, display_name, handle, role, created_at`,
      [email, hashPassword(password), name, handle]);
    return c.json({ ...row, access_token: row.id, token_type: 'bearer' }, 201);
  });
});

app.post('/api/auth/login', async c => {
  const b = await c.req.json().catch(() => ({} as any));
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const password = typeof b.password === 'string' ? b.password : '';
  rateLimit(`login:${email || 'anon'}`);
  const { rows } = await pool.query(
    `SELECT id, email, display_name, handle, role, password_hash FROM accounts WHERE email = $1`, [email]);
  const row = rows[0];
  if (!row || !verifyPassword(password, row.password_hash)) {
    throw new ApiError(401, 'bad_credentials', `That email and password do not match. Check the spelling and try again.`);
  }
  return c.json({ id: row.id, email: row.email, display_name: row.display_name, handle: row.handle, role: row.role, access_token: row.id, token_type: 'bearer' });
});

// ---- mount authenticated apps -------------------------------------------
// /me is the caller's own account behind the token, and it is not a handle.
app.get('/api/accounts/me', async (c, next) => {
  const account = await accountFromToken(c);
  if (!account) throw new ApiError(401, 'unauthorized', `Sign in to continue.`);
  c.set('account', account);
  const res = await pool.query(
    `SELECT id, email, display_name, handle, role, created_at FROM accounts WHERE id = $1`, [account.id]);
  return c.json(res.rows[0]);
});

// A public profile needs no token; the handle is not an account identifier.
app.get('/api/accounts/:handle', async c => {
  if (c.req.param('handle').toLowerCase() === 'me') {
    throw new ApiError(401, 'unauthorized', `Sign in to continue.`);
  }
  const handle = c.req.param('handle').toLowerCase();
  const res = await pool.query(
    `SELECT display_name, handle, role FROM accounts WHERE handle = $1`, [handle]);
  if (!res.rows.length) throw new ApiError(404, 'not_found', `Nothing lives at that address.`);
  const cals = await pool.query(
    `SELECT slug, name, city, category FROM calendars
      WHERE owner_account_id = (SELECT id FROM accounts WHERE handle = $1) AND is_public
      ORDER BY name ASC`, [handle]);
  return c.json({ ...res.rows[0], calendars: cals.rows });
});
app.use('/api/accounts/*', async (c, next) => { await requireAuth(c, next); });
app.route('/api/accounts', accountsApp);

// The public calendar list needs no token; creation and listing your own do.
// Public calendar listing first so it is not swallowed by the auth pattern.
app.get('/api/calendars/public', async c => {
  const category = c.req.query('category') ?? '';
  const { rows } = await pool.query(
    `SELECT slug, name, city, category FROM calendars
      WHERE is_public AND ($1 = '' OR category = $1)
      ORDER BY name ASC LIMIT 50`, [category]);
  return c.json(rows);
});
app.get('/api/calendars/by-slug/:slug', async c => {
  const res = await pool.query(
    `SELECT slug, name, city, category, is_public FROM calendars WHERE slug = $1`,
    [c.req.param('slug')]);
  if (!res.rows.length) throw new ApiError(404, 'not_found', `Nothing lives at that address.`);
  return c.json(res.rows[0]);
});
app.use('/api/calendars/*', async (c, next) => { await requireAuth(c, next); });
app.route('/api/calendars', calendarsApp);

app.use('/api/events/:slug/registrations*', async (c, next) => { await requireAuth(c, next); });
app.use('/api/events/:slug/registrations.csv*', async (c, next) => { await requireAuth(c, next); });
app.use('/api/events/*', async (c, next) => {
  // GET /api/events and GET /api/events/:slug are public; the rest need auth.
  // A presented token is still resolved so an owner can read their own draft.
  const method = c.req.method;
  const p = c.req.path;
  if (method === 'GET' && (p === '/api/events' || /^\/api\/events\/[^/]+$/.test(p))) {
    const account = await accountFromToken(c);
    if (account) c.set('account', account);
    await next(); return;
  }
  await requireAuth(c, next);
});
app.route('/api/events', eventsApp);

app.use('/api/registrations/*', async (c, next) => { await requireAuth(c, next); });
app.use('/api/registrations', async (c, next) => { await requireAuth(c, next); });
app.use('/api/tickets/:code/check-in', async (c, next) => { await requireAuth(c, next); });
app.route('/api/tickets', ticketsApp);

app.post('/api/registrations', async c => {
  const account = c.get('account');
  const b = await c.req.json().catch(() => ({} as any));
  const slug = typeof b.event_slug === 'string' ? b.event_slug : '';
  rateLimit(`register:${account.email}`);
  const { tryRegister } = await import('./registration.js');
  const { row, created } = await tryRegister(slug, account);
  if (created) {
    const { rows } = await pool.query(`SELECT title FROM events WHERE id = $1`, [row.event_id]);
    const { rows: mine } = await pool.query(`SELECT email FROM accounts WHERE id = $1`, [account.id]);
    const title = rows[0]?.title ?? 'the event';
    const subj = row.status === 'confirmed' ? `You're going to ${title}`
      : row.status === 'waitlisted' ? `You're on the waiting list for ${title}`
      : `Your request to join ${title}`;
    await sendMail({ to: mine[0].email, registrationId: row.id, eventId: row.event_id,
      subject: subj,
      text: `${subj}\n\n${title}\nTicket code: ${row.ticket_code ?? 'none'}` });
  }
  return c.json({ id: row.id, status: row.status, waitlist_position: row.waitlist_position,
    ticket_code: row.ticket_code, event_id: row.event_id }, 201);
});

app.get('/api/registrations/me', async c => {
  const account = c.get('account');
  const { rows } = await pool.query(
    `SELECT r.id, r.status, r.waitlist_position, r.ticket_code, r.checked_in_at,
            e.slug AS event_slug, e.title, e.starts_at, e.ends_at, e.time_zone, e.city,
            e.theme_hex, e.state, e.cover_seed, e.capacity
       FROM registrations r JOIN events e ON e.id = r.event_id
      WHERE r.account_id = $1 ORDER BY e.starts_at ASC`, [account.id]);
  return c.json(rows.map(r => ({ ...r, starts_at: iso(r.starts_at), ends_at: iso(r.ends_at), checked_in_at: r.checked_in_at ? iso(r.checked_in_at) : null })));
});

app.post('/api/registrations/:id/cancel', async c => {
  const account = c.get('account');
  const { cancelRegistration, promoteFromWaitlist } = await import('./registration.js');
  const out = await cancelRegistration(c.req.param('id'), account, {});
  for (const p of out.promotedEmails) {
    const { rows } = await pool.query(`SELECT a.email, e.title FROM registrations r JOIN accounts a ON a.id=r.account_id JOIN events e ON e.id=r.event_id WHERE r.id=$1`, [p.regId]);
    if (rows[0]) await sendMail({ to: rows[0].email, registrationId: p.regId,
      subject: `A spot opened up for ${rows[0].title}`,
      text: `A spot opened up for ${rows[0].title}. Your ticket code is below.` });
  }
  return c.json({ id: out.row.id, status: out.row.status, waitlist_position: out.row.waitlist_position,
    ticket_code: out.row.ticket_code, promoted: out.promotedEmails.length });
});

app.post('/api/registrations/:id/approve', async c => {
  const account = c.get('account');
  const { approveRegistration } = await import('./registration.js');
  const out = await approveRegistration(c.req.param('id'), account.id);
  const { rows } = await pool.query(
    `SELECT a.email, e.title FROM registrations r JOIN accounts a ON a.id=r.account_id JOIN events e ON e.id=r.event_id WHERE r.id=$1`, [c.req.param('id')]);
  if (rows[0]) {
    const subj = out.outcome === 'confirmed' ? `You're in: ${rows[0].title}`
      : out.outcome === 'waitlisted' ? `You're on the waiting list for ${rows[0].title}` : null;
    if (subj) await sendMail({ to: rows[0].email, registrationId: c.req.param('id'),
      subject: subj, text: `${subj}\n\nTicket code: ${out.row.ticket_code ?? 'none'}` });
  }
  return c.json({ id: out.row.id, status: out.row.status, waitlist_position: out.row.waitlist_position,
    ticket_code: out.row.ticket_code });
});

app.post('/api/registrations/:id/decline', async c => {
  const account = c.get('account');
  const { declineRegistration } = await import('./registration.js');
  const row = await declineRegistration(c.req.param('id'), account.id);
  const { rows } = await pool.query(
    `SELECT a.email, e.title FROM registrations r JOIN accounts a ON a.id=r.account_id JOIN events e ON e.id=r.event_id WHERE r.id=$1`, [c.req.param('id')]);
  if (rows[0]) {
    await sendMail({ to: rows[0].email, registrationId: c.req.param('id'),
      subject: `About your request to join ${rows[0].title}`,
      text: `About your request to join ${rows[0].title}. The host has passed this time.` });
  }
  return c.json({ id: row.id, status: row.status, waitlist_position: row.waitlist_position, ticket_code: row.ticket_code });
});

app.post('/api/tickets/:code/check-in', async c => {
  const account = c.get('account');
  const { checkInTicket } = await import('./registration.js');
  const row = await checkInTicket(c.req.param('code'), account.id);
  return c.json({ id: row.id, status: row.status, ticket_code: row.ticket_code,
    checked_in_at: row.checked_in_at ? iso(row.checked_in_at) : null });
});

app.notFound(c => c.json({ message: `Nothing lives at that address.` }, 404));
app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json({ message: err.message, code: err.code, fields: err.fields ?? undefined }, err.status as any);
  }
  console.error(JSON.stringify({ level: 'error', msg: err.message, stack: err.stack?.split('\n').slice(0,6) }));
  return c.json({ message: `Something went wrong on our side. Try again in a moment.` }, 500);
});

// ---- static SPA ----------------------------------------------------------
const WEB_DIR = process.env.WEB_DIR ?? join(process.cwd(), 'web-dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.json': 'application/json', '.map': 'application/json',
  '.txt': 'text/plain', '.webmanifest': 'application/manifest+json',
};

let shellCache: string | null = null;
function shell(): string {
  if (shellCache) return shellCache;
  shellCache = readFileSync(join(WEB_DIR, 'index.html'), 'utf8');
  return shellCache;
}

app.use('*', async (c, next) => {
  const p = c.req.path;
  if (p.startsWith('/api/')) return next();
  // An event page sets its key colour as a cookie before the shell paints.
  const m = /^\/([^/]+)$/.exec(p);
  if (m && !p.includes('.')) {
    const slug = m[1].toLowerCase();
    const RESERVED = ['api','app','login','signup','home','calendars','create','discover','settings','event','t'];
    if (!RESERVED.includes(slug) && !(CATEGORIES as readonly string[]).includes(slug)) {
      const { rows } = await pool.query(
        `SELECT theme_hex FROM events WHERE slug = $1 AND state IN ('published','registration_closed','cancelled')`, [slug]);
      if (rows[0]) {
        c.header('Set-Cookie', `event_theme=${rows[0].theme_hex}; Path=/; Max-Age=60; SameSite=Lax`);
      }
    }
  }
  await next();
});

app.get('*', async c => {
  const p = c.req.path;
  if (p.startsWith('/api/')) return c.notFound();
  const wanted = join(WEB_DIR, p === '/' ? 'index.html' : p.slice(1));
  if (p !== '/' && existsSync(wanted) && statSync(wanted).isFile() && extname(p)) {
    return c.body(readFileSync(wanted), 200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream' });
  }
  return c.body(shell(), 200, { 'Content-Type': 'text/html; charset=utf-8' });
});

const start = async () => {
  await migrate();
  await seed();
  const server = serve({ fetch: app.fetch, port: PORT, hostname: HOST });
  console.log(JSON.stringify({ level: 'info', msg: 'listening', port: PORT, url: APP_PUBLIC_URL }));
  return server;
};
start();

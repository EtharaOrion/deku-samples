import type { Hono } from 'hono';
import { customerForToken, bearerFrom } from '../auth.ts';
import { q } from '../db/pool.ts';
import { clientError, listResponse, ApiEnv } from './util.ts';
import { registerDevice, releaseDevice, renameDevice, deviceView, DeviceError, devicesForCustomer, deviceOwnedBy } from '../devices.ts';
import { orderView } from '../orders.ts';
import { latestRelease, releaseView } from '../releases.ts';
import { lastSeenReleaseBuild } from '../auth.ts';

export async function requireCustomer(c: any) {
  // A bearer token from the Authorization header, or the session cookie the
  // browser holds. Both are checked server-side on every account endpoint.
  const headerToken = bearerFrom(c.req.header('authorization'));
  const cookieToken = readCookie(c.req.header('cookie'), 'vela_token');
  return customerForToken(headerToken || cookieToken);
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function registerAccountRoutes(app: Hono<ApiEnv>) {
  app.get('/api/account/overview', async (c) => {
    const customer = await requireCustomer(c);
    if (!customer) return clientError(c, 401, 'unauthorized', 'You need to sign in first.');
    const devices = await devicesForCustomer(customer.id, 100, null);
    const orders = await q(
      `SELECT * FROM order_row WHERE customer_id = $1 ORDER BY placed_at DESC NULLS LAST, id DESC LIMIT 2`,
      [customer.id]
    );
    const latest = await latestRelease();
    const lastSeen = await lastSeenReleaseBuild(customer.id);
    return c.json({
      customer: { id: String(customer.id), email: customer.email, name: customer.name },
      devices: await Promise.all(devices.rows.map((d: any) => deviceView(d))),
      orders: await Promise.all(orders.rows.map((o: any) => orderView(o))),
      app: {
        latest_version: latest ? latest.version : null,
        latest_build: latest ? Number(latest.build) : null,
        last_seen_build: lastSeen,
        newer_than_last_seen: latest ? lastSeen === null || Number(latest.build) > lastSeen : false,
      },
    });
  });

  app.get('/api/account/orders', async (c) => {
    const customer = await requireCustomer(c);
    if (!customer) return clientError(c, 401, 'unauthorized', 'You need to sign in first.');
    let pageSize = 20;
    const raw = c.req.query('page_size') ?? c.req.query('limit');
    if (raw) {
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1) return clientError(c, 400, 'page_size_invalid', 'page_size must be a positive whole number.');
      if (parsed > 100) return clientError(c, 400, 'page_size_invalid', 'page_size is capped at 100.');
      pageSize = parsed;
    }
    const cursor = c.req.query('cursor') || null;
    const params: any[] = [customer.id];
    let where = `customer_id = $1`;
    if (cursor) {
      params.push(Number(cursor));
      where += ` AND (placed_at, id) < (SELECT placed_at, id FROM order_row WHERE id = $${params.length})`;
    }
    params.push(pageSize + 1);
    const res = await q(
      `SELECT * FROM order_row WHERE ${where} ORDER BY placed_at DESC NULLS LAST, id DESC LIMIT $${params.length}`,
      params
    );
    const hasMore = res.rows.length > pageSize;
    const rows = hasMore ? res.rows.slice(0, pageSize) : res.rows;
    return listResponse(c, await Promise.all(rows.map((o: any) => orderView(o))), hasMore && rows.length > 0 ? String(rows[rows.length - 1].id) : null, hasMore);
  });

  app.get('/api/account/orders/:number', async (c) => {
    const customer = await requireCustomer(c);
    if (!customer) return clientError(c, 401, 'unauthorized', 'You need to sign in first.');
    const res = await q(`SELECT * FROM order_row WHERE number = $1`, [c.req.param('number')]);
    if (res.rows.length === 0) return clientError(c, 404, 'not_found', 'That page does not exist.');
    const order = res.rows[0];
    // Another customer's order reads as not found, never forbidden.
    if (!order.customer_id || String(order.customer_id) !== String(customer.id)) {
      return clientError(c, 404, 'not_found', 'That page does not exist.');
    }
    return c.json({ order: await orderView(order) });
  });

  app.get('/api/account/devices', async (c) => {
    const customer = await requireCustomer(c);
    if (!customer) return clientError(c, 401, 'unauthorized', 'You need to sign in first.');
    let pageSize = 20;
    const raw = c.req.query('page_size') ?? c.req.query('limit');
    if (raw) {
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1) return clientError(c, 400, 'page_size_invalid', 'page_size must be a1 positive whole number.');
      if (parsed > 100) return clientError(c, 400, 'page_size_invalid', 'page_size is capped at 100.');
      pageSize = parsed;
    }
    const { rows, hasMore, nextCursor } = await devicesForCustomer(customer.id, pageSize, c.req.query('cursor') || null);
    return listResponse(c, await Promise.all(rows.map((d: any) => deviceView(d))), nextCursor, hasMore);
  });

  app.post('/api/account/devices', async (c) => {
    const customer = await requireCustomer(c);
    if (!customer) return clientError(c, 401, 'unauthorized', 'You need to sign in first.');
    const body = await c.req.json().catch(() => ({}));
    const serial = String(body.serial || '').trim();
    if (!serial) return clientError(c, 400, 'missing_serial', 'Serial is required.');
    try {
      const device = await registerDevice(customer.id, serial, 'manual', null);
      return c.json({ device }, 201);
    } catch (err: any) {
      if (err instanceof DeviceError) return clientError(c, err.status, err.code, err.message);
      throw err;
    }
  });

  app.get('/api/account/devices/:serial', async (c) => {
    const customer = await requireCustomer(c);
    if (!customer) return clientError(c, 401, 'unauthorized', 'You need to sign in first.');
    const device = await deviceOwnedBy(customer.id, c.req.param('serial'));
    if (!device) return clientError(c, 404, 'not_found', 'That page does not exist.');
    return c.json({ device: await deviceView(device) });
  });

  app.patch('/api/account/devices/:serial', async (c) => {
    const customer = await requireCustomer(c);
    if (!customer) return clientError(c, 401, 'unauthorized', 'You need to sign in first.');
    const body = await c.req.json().catch(() => ({}));
    const nickname = String(body.nickname ?? '').trim();
    try {
      const device = await renameDevice(customer.id, c.req.param('serial'), nickname);
      return c.json({ device });
    } catch (err: any) {
      if (err instanceof DeviceError) return clientError(c, err.status, err.code, err.message);
      throw err;
    }
  });

  app.delete('/api/account/devices/:serial', async (c) => {
    const customer = await requireCustomer(c);
    if (!customer) return clientError(c, 401, 'unauthorized', 'You need to sign in first.');
    try {
      const device = await releaseDevice(customer.id, c.req.param('serial'));
      return c.json({ device });
    } catch (err: any) {
      if (err instanceof DeviceError) return clientError(c, err.status, err.code, err.message);
      throw err;
    }
  });
}

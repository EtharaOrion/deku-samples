import type { Hono } from 'hono';
import { findOrCreateCart, cartView, addLine, setLineQuantity, removeLine, setProtection, setDelivery, CartError } from '../cart.ts';
import { clientError, ApiEnv } from './util.ts';
import { customerForToken, bearerFrom } from '../auth.ts';

export function cartCookie(c: any) {
  const header = c.req.header('cookie') || '';
  const match = header.match(/(?:^|;\s*)vela_cart=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function currentCart(c: any, create: boolean) {
  const token = cartCookie(c);
  const bearer = bearerFrom(c.req.header('authorization'));
  const customer = bearer ? await customerForToken(bearer) : null;
  if (!token && !create) return null;
  return findOrCreateCart({ token, customerId: customer ? String(customer.id) : null });
}

function cartErrorToResponse(c: any, err: CartError) {
  const status = err.code === 'unknown_line' || err.code === 'unknown_variant' ? 404 : 400;
  return clientError(c, status, err.code, err.message);
}

export function registerCartRoutes(app: Hono<ApiEnv>) {
  app.get('/api/cart', async (c) => {
    const cart = await currentCart(c, false);
    if (!cart) {
      const fresh = await findOrCreateCart({ token: null });
      return withCookie(c, c.json(await cartView(fresh)), fresh.token);
    }
    return c.json(await cartView(cart));
  });

  app.post('/api/cart/lines', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const sku = String(body.sku || '');
    const quantity = Number(body.quantity ?? 1);
    if (!sku) return clientError(c, 400, 'missing_sku', 'We need to know which item.');
    const cart = await currentCart(c, true);
    try {
      await addLine(cart.id, sku, Number.isFinite(quantity) ? quantity : 1);
    } catch (err: any) {
      if (err instanceof CartError) return cartErrorToResponse(c, err);
      throw err;
    }
    return withCookie(c, c.json(await cartView(cart)), cart.token);
  });

  app.patch('/api/cart/lines/:lineId', async (c) => {
    const cart = await currentCart(c, false);
    if (!cart) return clientError(c, 404, 'unknown_cart', 'That cart is no longer here.');
    const body = await c.req.json().catch(() => ({}));
    const quantity = Number(body.quantity);
    try {
      await setLineQuantity(cart.id, c.req.param('lineId'), quantity);
    } catch (err: any) {
      if (err instanceof CartError) return cartErrorToResponse(c, err);
      throw err;
    }
    return c.json(await cartView(cart));
  });

  app.delete('/api/cart/lines/:lineId', async (c) => {
    const cart = await currentCart(c, false);
    if (!cart) return clientError(c, 404, 'unknown_cart', 'That cart is no longer here.');
    try {
      await removeLine(cart.id, c.req.param('lineId'));
    } catch (err: any) {
      if (err instanceof CartError) return cartErrorToResponse(c, err);
      throw err;
    }
    return c.json(await cartView(cart));
  });

  app.post('/api/cart/protection', async (c) => {
    const cart = await currentCart(c, false);
    if (!cart) return clientError(c, 404, 'unknown_cart', 'That cart is no longer here.');
    const body = await c.req.json().catch(() => ({}));
    await setProtection(cart.id, Boolean(body.enabled));
    return c.json(await cartView(await findOrCreateCart({ token: cart.token })));
  });

  app.post('/api/cart/delivery', async (c) => {
    const cart = await currentCart(c, false);
    if (!cart) return clientError(c, 404, 'unknown_cart', 'That cart is no longer here.');
    const body = await c.req.json().catch(() => ({}));
    if (body.shipping_method && !['Standard', 'Express'].includes(body.shipping_method)) {
      return clientError(c, 400, 'unknown_shipping_method', 'Choose how it gets there.');
    }
    await setDelivery(cart.id, {
      email: body.email !== undefined ? (body.email ? String(body.email).trim().toLowerCase() : null) : undefined,
      shipping_address: body.shipping_address !== undefined ? body.shipping_address : undefined,
      shipping_method: body.shipping_method !== undefined ? body.shipping_method : undefined,
    });
    return c.json(await cartView(await findOrCreateCart({ token: cart.token })));
  });
}

function withCookie(c: any, response: Response, token: string) {
  response.headers.append('set-cookie', `vela_cart=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
  return response;
}

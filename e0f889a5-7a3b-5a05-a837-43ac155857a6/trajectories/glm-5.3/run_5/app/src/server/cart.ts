import { randomToken } from './auth.js';
import { q, one, tx } from './db.js';
import { dollars, taxOf } from './money.js';
import { variantBySku, protectionRungFor, deliveryMethod, PROTECTION_PRODUCT_HANDLE } from './catalogue.js';

export const CART_COOKIE = 'vela_cart';

export type CartNotice = { kind: 'price_change' | 'availability'; item: string; old_price: string; new_price: string } & Record<string, unknown>;

export type CartState = {
  id: number;
  token: string;
  email: string | null;
  lines: Array<{
    id: number;
    variant_id: number;
    sku: string;
    title: string;
    product_title: string;
    option_value: string;
    quantity: number;
    unit_price_minor: number;
    current_price_minor: number;
    line_total_minor: number;
    available: number;
    image: string;
  }>;
  subtotal_minor: number;
  protection: { enabled: boolean; rung: { sku: string; price_minor: number } | null };
  protection_rung: { sku: string; price_minor: number } | null;
  shipping_method: string | null;
  shipping_address: ShippingAddress | null;
  marketing_consent: boolean;
  shipping_minor: number;
  tax_minor: number;
  total_minor: number;
  notices: CartNotice[];
};

export async function ensureCart(cartToken: string | undefined, customerId: number | null): Promise<string> {
  if (cartToken) {
    const existing = await one<{ token: string }>(
      `SELECT token FROM cart WHERE token = $1 AND expires_at > now()`, [cartToken]);
    if (existing) {
      if (customerId) await q(`UPDATE cart SET customer_id = $1, updated_at = now() WHERE token = $2 AND customer_id IS DISTINCT FROM $1`, [customerId, cartToken]);
      return existing.token;
    }
  }
  const token = randomToken(18);
  await q(`INSERT INTO cart (token, customer_id) VALUES ($1, $2)`, [token, customerId]);
  return token;
}

type CartRow = { id: number; token: string; email: string | null; shipping_method: string | null; protection_enabled: boolean };


export async function getCartState(token: string, opts: { forOrder?: boolean } = {}): Promise<CartState | null> {
  const cart = await one<any>(`SELECT * FROM cart WHERE token = $1`, [token]);
  if (!cart) return null;

  const lines = await q<any>(
    `SELECT cl.id, cl.variant_id, cl.quantity, cl.unit_price_minor,
            v.sku, v.title, v.option_value, v.price_minor AS current_price_minor,
            p.title AS product_title, p.handle AS product_handle,
            COALESCE(i.available, 0) AS available
       FROM cart_line cl
       JOIN variant v ON v.id = cl.variant_id
       JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level i ON i.variant_id = v.id
      WHERE cl.cart_id = $1
      ORDER BY cl.id ASC`, [cart.id]);

  const notices: CartNotice[] = [];
  for (const line of lines) {
    if (Number(line.unit_price_minor) !== Number(line.current_price_minor)) {
      notices.push({
        kind: 'price_change',
        item: line.product_title,
        line_title: line.title,
        sku: line.sku,
        old_price: dollars(Number(line.unit_price_minor)),
        new_price: dollars(Number(line.current_price_minor)),
        message: `The price of ${line.product_title} changed from ${dollars(Number(line.unit_price_minor))} to ${dollars(Number(line.current_price_minor))} since you added it.`,
      });
    }
    if (Number(line.available) <= 0) {
      notices.push({
        kind: 'availability',
        item: line.product_title,
        sku: line.sku,
        old_price: '',
        new_price: '',
        message: `${line.product_title} is no longer available.`,
      });
    }
  }

  const subtotal = lines.reduce((sum: number, l: any) => sum + Number(l.unit_price_minor) * Number(l.quantity), 0);
  const rung = protectionRungFor(subtotal);
  const protectionPrice = cart.protection_enabled && rung ? rung.price_minor : 0;
  const method = deliveryMethod(cart.shipping_method);
  const shipping = method ? method.price_minor : 0;
  // Shipment protection is excluded from tax and from shipping weight.
  const tax = taxOf(subtotal);
  const total = subtotal + protectionPrice + shipping + tax;

  return {
    id: cart.id,
    token: cart.token,
    email: cart.email,
    lines: lines.map((l: any) => ({
      id: l.id,
      variant_id: l.variant_id,
      sku: l.sku,
      title: l.title,
      product_title: l.product_title,
      option_value: l.option_value,
      quantity: Number(l.quantity),
      unit_price_minor: Number(l.unit_price_minor),
      current_price_minor: Number(l.current_price_minor),
      line_total_minor: Number(l.unit_price_minor) * Number(l.quantity),
      available: Number(l.available),
      image: `/assets/${l.product_handle}.png`,
    })),
    subtotal_minor: subtotal,
    protection: { enabled: !!cart.protection_enabled, rung: rung ? { sku: rung.sku, price_minor: rung.price_minor } : null },
    protection_rung: rung ? { sku: rung.sku, price_minor: rung.price_minor } : null,
    shipping_method: cart.shipping_method,
    shipping_address: (cart.shipping_address as ShippingAddress | null) ?? null,
    marketing_consent: !!cart.marketing_consent,
    shipping_minor: shipping,
    tax_minor: tax,
    total_minor: total,
    notices,
  };
}

export async function addLine(token: string, sku: string, quantity: number) {
  const variant = await variantBySku(sku);
  if (!variant) return { error: 'unknown_sku' as const };
  const product = variant.product;
  if (product.status === 'discontinued') return { error: 'discontinued' as const };

  const result = await tx(async (client) => {
    const cart = (await client.query(`SELECT id FROM cart WHERE token = $1 FOR UPDATE`, [token])).rows[0];
    if (!cart) throw new Error('cart missing');
    const existing = (await client.query(
      `SELECT id, quantity FROM cart_line WHERE cart_id = $1 AND variant_id = $2 FOR UPDATE`, [cart.id, variant.id])).rows[0];
    const nextQty = Math.min(10, (existing ? Number(existing.quantity) : 0) + quantity);
    if (existing) {
      await client.query(`UPDATE cart_line SET quantity = $1 WHERE id = $2`, [nextQty, existing.id]);
    } else {
      await client.query(
        `INSERT INTO cart_line (cart_id, variant_id, quantity, unit_price_minor) VALUES ($1, $2, $3, $4)`,
        [cart.id, variant.id, nextQty, variant.price_minor]);
    }
    await client.query(`UPDATE cart SET updated_at = now() WHERE id = $1`, [cart.id]);
    return { quantity: nextQty };
  });
  return { ok: true as const, ...result };
}

export async function setLineQuantity(token: string, lineId: number, quantity: number) {
  const cart = await one<{ id: number }>(`SELECT id FROM cart WHERE token = $1`, [token]);
  if (!cart) return { error: 'no_cart' as const };
  if (quantity <= 0) {
    await q(`DELETE FROM cart_line WHERE id = $1 AND cart_id = $2`, [lineId, cart.id]);
    return { ok: true as const };
  }
  const updated = await one<{ id: number }>(
    `UPDATE cart_line SET quantity = $1 WHERE id = $2 AND cart_id = $3 RETURNING id`,
    [Math.min(10, Math.max(1, quantity)), lineId, cart.id]);
  if (!updated) return { error: 'no_line' as const };
  await q(`UPDATE cart SET updated_at = now() WHERE id = $1`, [cart.id]);
  return { ok: true as const };
}

export async function removeLine(token: string, lineId: number) {
  const cart = await one<{ id: number }>(`SELECT id FROM cart WHERE token = $1`, [token]);
  if (!cart) return { error: 'no_cart' as const };
  await q(`DELETE FROM cart_line WHERE id = $1 AND cart_id = $2`, [lineId, cart.id]);
  await q(`UPDATE cart SET updated_at = now() WHERE id = $1`, [cart.id]);
  return { ok: true as const };
}

export async function setProtection(token: string, enabled: boolean) {
  await q(`UPDATE cart SET protection_enabled = $1, updated_at = now() WHERE token = $2`, [enabled, token]);
  return { ok: true as const };
}

export type ShippingAddress = {
  name: string; line1: string; line2?: string; city: string; region: string;
  postal_code: string; country: string; phone?: string;
};

export async function setDelivery(
  token: string,
  input: { email?: string; shipping_address?: ShippingAddress; shipping_method?: string; marketingConsent?: boolean },
) {
  const method = deliveryMethod(input.shipping_method);
  if (input.shipping_method && !method) return { error: 'unknown_method' as const };
  await q(
    `UPDATE cart SET email = COALESCE($1, email), shipping_address = COALESCE($2, shipping_address),
            shipping_method = COALESCE($3, shipping_method),
            marketing_consent = COALESCE($4, marketing_consent), updated_at = now()
      WHERE token = $5`,
    [
      input.email ?? null,
      input.shipping_address ? JSON.stringify(input.shipping_address) : null,
      method ? method.name : null,
      typeof input.marketingConsent === 'boolean' ? input.marketingConsent : null,
      token,
    ],
  );
  return { ok: true as const };
}

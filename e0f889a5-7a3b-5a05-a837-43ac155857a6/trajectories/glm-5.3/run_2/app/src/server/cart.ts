import { randomToken, sha256Hex } from './crypto.ts';
import { q } from './db/pool.ts';
import { taxOf, protectionRung, protectionPriceMinor } from './money.ts';

export type CartLineView = {
  id: string;
  variant_id: string;
  sku: string;
  title: string;
  variant_title: string;
  option_value: string;
  product_handle: string;
  product_title: string;
  quantity: number;
  unit_price_minor: number;
  line_total_minor: number;
  current_price_minor: number;
  available: number;
  price_changed: boolean;
  availability_changed: boolean;
  kind: string;
  is_protection: boolean;
};

export type CartNotice = { code: string; message: string };

export type CartView = {
  token: string;
  email: string | null;
  shipping_address: any;
  shipping_method: string | null;
  protection_enabled: boolean;
  lines: CartLineView[];
  notices: CartNotice[];
  subtotal_minor: number;
  estimated_tax_minor: number;
  protection_minor: number;
  protection_rung: string | null;
  shipping_minor: number | null;
  tax_minor: number | null;
  total_minor: number;
  delivery_estimate: string | null;
  has_protection_line: boolean;
};

export const SHIPPING_METHODS: Record<string, { title: string; price_minor: number; window: string; zone: string }> = {
  Standard: { title: 'Standard', price_minor: 0, window: '5 to 7 days', zone: 'us-domestic' },
  Express: { title: 'Express', price_minor: 2500, window: '2 days', zone: 'us-domestic' },
};

export async function findOrCreateCart(input: {
  token?: string | null;
  customerId?: string | null;
  email?: string | null;
}): Promise<{ id: string; token: string; customer_id: string | null; email: string | null; shipping_address: any; shipping_method: string | null; protection_enabled: boolean }> {
  if (input.token) {
    const res = await q(`SELECT * FROM cart WHERE token = $1 AND expires_at > now()`, [input.token]);
    if (res.rows.length > 0) return res.rows[0];
  }
  const token = input.token || randomToken(24);
  const res = await q(
    `INSERT INTO cart (token, customer_id, email) VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET updated_at = now()
     RETURNING *`,
    [token, input.customerId ?? null, input.email ?? null]
  );
  return res.rows[0];
}

export async function touchCart(cartId: string | number): Promise<void> {
  await q(`UPDATE cart SET updated_at = now() WHERE id = $1`, [cartId]);
}

async function loadLines(cartId: string | number): Promise<CartLineView[]> {
  const res = await q(
    `SELECT cl.id, cl.variant_id, cl.quantity, cl.unit_price_minor,
            v.sku, v.title AS variant_title, v.option_value, v.price_minor AS current_price_minor,
            p.handle AS product_handle, p.title AS product_title, p.kind,
            il.available, il.committed
       FROM cart_line cl
       JOIN variant v ON v.id = cl.variant_id
       JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level il ON il.variant_id = v.id
      WHERE cl.cart_id = $1
      ORDER BY cl.id`,
    [cartId]
  );
  return res.rows.map((r: any) => ({
    id: String(r.id),
    variant_id: String(r.variant_id),
    sku: r.sku,
    title: r.product_title,
    variant_title: r.variant_title,
    option_value: r.option_value,
    product_handle: r.product_handle,
    product_title: r.product_title,
    quantity: r.quantity,
    unit_price_minor: Number(r.unit_price_minor),
    line_total_minor: Number(r.unit_price_minor) * r.quantity,
    current_price_minor: Number(r.current_price_minor),
    available: r.available === null ? 0 : Number(r.available),
    price_changed: Number(r.unit_price_minor) !== Number(r.current_price_minor),
    availability_changed: false,
    kind: r.kind,
    is_protection: r.kind === 'protection',
  }));
}

export function noticesFor(lines: CartLineView[], previouslyAvailable: Record<string, number> | null): CartNotice[] {
  const notices: CartNotice[] = [];
  for (const line of lines) {
    if (line.price_changed) {
      notices.push({
        code: 'price_changed',
        message: `The price of ${line.title} changed from ${money(line.unit_price_minor)} to ${money(line.current_price_minor)} since you added it.`,
      });
    }
  }
  return notices;
}

function money(minor: number): string {
  const abs = Math.abs(Math.trunc(minor));
  return `${minor < 0 ? '-' : ''}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export async function cartView(cart: any): Promise<CartView> {
  const lines = await loadLines(cart.id);
  const merchandise = lines.filter((l) => !l.is_protection);
  const subtotal = merchandise.reduce((sum, l) => sum + l.current_price_minor * l.quantity, 0);
  const snapshotSubtotal = merchandise.reduce((sum, l) => sum + l.unit_price_minor * l.quantity, 0);
  const rung = merchandise.length > 0 ? protectionRung(subtotal) : null;
  const protectionLine = lines.find((l) => l.is_protection);
  const hasProtectionLine = Boolean(protectionLine);
  const protectionEnabled = cart.protection_enabled === true;
  const protectionMinor = protectionEnabled && rung ? protectionPriceMinor(rung) : 0;

  const shippingMethod = cart.shipping_method && SHIPPING_METHODS[cart.shipping_method] ? cart.shipping_method : null;
  const shippingMinor = shippingMethod ? SHIPPING_METHODS[shippingMethod].price_minor : null;
  const taxBase = subtotal;
  const taxMinor = taxOf(taxBase);
  const total = subtotal + protectionMinor + (shippingMinor ?? 0) + taxMinor;

  return {
    token: cart.token,
    email: cart.email,
    shipping_address: cart.shipping_address,
    shipping_method: shippingMethod,
    protection_enabled: protectionEnabled,
    lines,
    notices: noticesFor(lines, null),
    subtotal_minor: subtotal,
    estimated_tax_minor: taxMinor,
    protection_minor: protectionMinor,
    protection_rung: rung,
    shipping_minor: shippingMinor,
    tax_minor: taxMinor,
    total_minor: total,
    delivery_estimate: shippingMethod ? SHIPPING_METHODS[shippingMethod].window : null,
    has_protection_line: hasProtectionLine,
  };
}

export async function addLine(cartId: string | number, sku: string, quantity: number): Promise<void> {
  const variant = await q(
    `SELECT v.id, v.price_minor, v.product_id, p.kind, p.status, v.inventory_policy AS policy,
            (SELECT available FROM inventory_level WHERE variant_id = v.id) AS available
       FROM variant v JOIN product p ON p.id = v.product_id
      WHERE v.sku = $1`,
    [sku]
  );
  if (variant.rows.length === 0) throw new CartError('unknown_variant', 'We do not sell that item.');
  const v = variant.rows[0];
  const available = v.available === null ? 0 : Number(v.available);
  if (v.policy === 'deny' && available < 1) throw new CartError('sold_out', 'That item is sold out.');
  const clampedQuantity = Math.max(1, Math.min(10, quantity));
  await q(
    `INSERT INTO cart_line (cart_id, variant_id, quantity, unit_price_minor)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (cart_id, variant_id)
     DO UPDATE SET quantity = LEAST(cart_line.quantity + EXCLUDED.quantity, 10), unit_price_minor = EXCLUDED.unit_price_minor`,
    [cartId, v.id, clampedQuantity, v.price_minor]
  );
  await touchCart(cartId);
}

export async function setLineQuantity(cartId: string | number, lineId: string, quantity: number): Promise<void> {
  if (quantity < 1 || quantity > 10) throw new CartError('invalid_quantity', 'Quantity must be between 1 and 10.');
  const line = await q(
    `SELECT cl.*, v.sku, (SELECT available FROM inventory_level WHERE variant_id = cl.variant_id) AS available
       FROM cart_line cl WHERE cl.id = $1 AND cl.cart_id = $2`,
    [lineId, cartId]
  );
  if (line.rows.length === 0) throw new CartError('unknown_line', 'That line is not in this cart.');
  const available = line.rows[0].available === null ? 0 : Number(line.rows[0].available);
  if (available < quantity) throw new CartError('insufficient_stock', `Only ${available} left.`);
  await q(`UPDATE cart_line SET quantity = $3 WHERE id = $1 AND cart_id = $2`, [lineId, cartId, quantity]);
  await touchCart(cartId);
}

export async function removeLine(cartId: string | number, lineId: string): Promise<void> {
  const res = await q(`DELETE FROM cart_line WHERE id = $1 AND cart_id = $2`, [lineId, cartId]);
  if (res.rowCount === 0) throw new CartError('unknown_line', 'That line is not in this cart.');
  await touchCart(cartId);
}

export async function setProtection(cartId: string | number, enabled: boolean): Promise<void> {
  await q(`UPDATE cart SET protection_enabled = $2, updated_at = now() WHERE id = $1`, [cartId, enabled]);
}

export async function setDelivery(cartId: string | number, input: { email?: string | null; shipping_address?: any; shipping_method?: string | null }): Promise<void> {
  const method = input.shipping_method && SHIPPING_METHODS[input.shipping_method] ? input.shipping_method : input.shipping_method;
  await q(
    `UPDATE cart SET email = COALESCE($2, email), shipping_address = COALESCE($3, shipping_address),
            shipping_method = $4, updated_at = now() WHERE id = $1`,
    [cartId, input.email ?? null, input.shipping_address ? JSON.stringify(input.shipping_address) : null, method ?? null]
  );
}

export class CartError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

export function deliveryFromCart(cart: any) {
  return {
    email: cart.email,
    shipping_address: cart.shipping_address,
    shipping_method: cart.shipping_method,
  };
}

import { one, query, type Row, type Tx } from "./db";
import { opaqueToken, scopedToken } from "./auth";
import { deliveryMethod, formatMinor, rungFor, taxOn } from "./money";
import { notFound } from "./errors";

export const CART_COOKIE = "vela_cart";

export type CartLineView = {
  id: string;
  variant_id: string;
  sku: string;
  handle: string;
  title: string;
  option: string;
  quantity: number;
  unit_price_minor: number;
  current_price_minor: number;
  line_total_minor: number;
  available: number;
  availability: string;
};

export type CartNotice = {
  code: "price_changed" | "availability_changed";
  message: string;
  title: string;
  sku: string;
  previous_price_minor?: number;
  current_price_minor?: number;
  available?: number;
};

export type CartView = {
  token: string;
  status: string;
  email: string | null;
  marketing_consent: boolean;
  shipping_address: Record<string, unknown> | null;
  shipping_method: string | null;
  lines: CartLineView[];
  item_count: number;
  subtotal_minor: number;
  protection_enabled: boolean;
  protection_rung: { sku: string; price_minor: number; label: string } | null;
  protection_minor: number;
  shipping_minor: number;
  tax_minor: number;
  total_minor: number;
  currency: string;
  priced: boolean;
  notices: CartNotice[];
  quote: string;
};

export type CartRow = Row & { id: number; token: string };

export function cartQuoteFor(cart: CartRow): string {
  return scopedToken(
    "cart-quote",
    `${cart.token}:${new Date(cart.updated_at).toISOString()}`,
  );
}

export async function findCartByToken(token: string | null | undefined): Promise<CartRow | null> {
  if (!token) return null;
  return one<CartRow>(
    "SELECT * FROM cart WHERE token = $1 AND status = 'open' AND expires_at > now()",
    [token],
  );
}

export async function createCart(customerId: number | null): Promise<CartRow> {
  const row = await one<CartRow>(
    "INSERT INTO cart (token, customer_id) VALUES ($1, $2) RETURNING *",
    [opaqueToken(24), customerId],
  );
  if (!row) throw new Error("the store refused a new cart");
  return row;
}

export async function touchCart(id: number): Promise<void> {
  await query("UPDATE cart SET updated_at = now() WHERE id = $1", [id]);
}

/** A price notice has no meaning after its line is removed. Other notices stay:
 *  changing delivery or another line is not a dismissal of an accepted change. */
export async function forgetNoticesForVariant(
  cartId: number,
  variantId: number,
  tx?: Tx,
): Promise<void> {
  const run = tx ? tx.query.bind(tx) : query;
  await run(
    `UPDATE cart
        SET notices = COALESCE(
              (
                SELECT jsonb_agg(notice)
                  FROM jsonb_array_elements(notices) AS entries(notice)
                 WHERE notice->>'sku' <> (
                   SELECT sku FROM variant WHERE id = $2
                 )
              ),
              '[]'::jsonb
            ),
            updated_at = now()
      WHERE id = $1`,
    [cartId, variantId],
  );
}

export type LineRow = Row & {
  id: number;
  variant_id: number;
  quantity: number;
  unit_price_minor: number;
  sku: string;
  handle: string;
  product_title: string;
  option_value: string;
  price_minor: number;
  available: number;
  kind: string;
  product_status: string;
  inventory_policy: "deny" | "continue";
};

const LINE_SQL = `
  SELECT l.id, l.variant_id, l.quantity, l.unit_price_minor,
         v.sku, v.option_value, v.price_minor, v.inventory_policy,
         p.id AS product_id, p.handle, p.title AS product_title, p.kind,
         p.status AS product_status,
         COALESCE(i.available, 0) AS available
    FROM cart_line l
    JOIN variant v ON v.id = l.variant_id
    JOIN product p ON p.id = v.product_id
    LEFT JOIN inventory_level i ON i.variant_id = v.id
   WHERE l.cart_id = $1
   ORDER BY l.created_at, l.id`;

export async function cartLines(cartId: number, tx?: Tx): Promise<LineRow[]> {
  return tx ? tx.query<LineRow>(LINE_SQL, [cartId]) : query<LineRow>(LINE_SQL, [cartId]);
}

function availabilityOf(line: LineRow): string {
  if (line.product_status === "discontinued") return "discontinued";
  if (line.available <= 0) return "sold_out";
  if (line.available <= 10) return "low";
  return "available";
}

/** Every cart read compares the stored line price to the current variant price,
 *  and a difference renders as a notice naming the item, the old price and the new. */
export function noticesFor(lines: LineRow[]): CartNotice[] {
  const notices: CartNotice[] = [];
  for (const line of lines) {
    if (line.unit_price_minor !== line.price_minor) {
      notices.push({
        code: "price_changed",
        title: line.product_title,
        sku: line.sku,
        previous_price_minor: line.unit_price_minor,
        current_price_minor: line.price_minor,
        message: `The price of ${line.product_title} changed from ${formatMinor(line.unit_price_minor)} to ${formatMinor(line.price_minor)} since you added it.`,
      });
    }
    if (line.available < line.quantity) {
      notices.push({
        code: "availability_changed",
        title: line.product_title,
        sku: line.sku,
        available: line.available,
        message:
          line.available <= 0
            ? `${line.product_title} sold out since you added it.`
            : `Only ${line.available} of ${line.product_title} remain, and you asked for ${line.quantity}.`,
      });
    }
  }
  return notices;
}

export async function viewCart(cart: CartRow, tx?: Tx): Promise<CartView> {
  const rows = await cartLines(cart.id, tx);
  const remembered = Array.isArray(cart.notices)
    ? (cart.notices as CartNotice[])
    : [];
  const lines: CartLineView[] = rows.map((line) => ({
    id: String(line.id),
    variant_id: String(line.variant_id),
    sku: line.sku,
    handle: line.handle,
    title: line.product_title,
    option: line.option_value,
    quantity: line.quantity,
    unit_price_minor: line.unit_price_minor,
    current_price_minor: line.price_minor,
    line_total_minor: line.unit_price_minor * line.quantity,
    available: line.available,
    availability: availabilityOf(line),
  }));

  const subtotalMinor = lines.reduce((sum, line) => sum + line.line_total_minor, 0);
  const rung = rungFor(subtotalMinor);
  const protectionMinor = cart.protection_enabled && rung ? rung.priceMinor : 0;
  const method = deliveryMethod(cart.shipping_method);
  const shippingMinor = method ? method.priceMinor : 0;
  const taxMinor = taxOn(subtotalMinor);
  const priced = Boolean(cart.email && cart.shipping_address && method);

  return {
    token: cart.token,
    status: cart.status,
    email: cart.email ?? null,
    marketing_consent: Boolean(cart.marketing_consent),
    shipping_address: (cart.shipping_address as Record<string, unknown> | null) ?? null,
    shipping_method: cart.shipping_method ?? null,
    lines,
    item_count: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotal_minor: subtotalMinor,
    protection_enabled: Boolean(cart.protection_enabled),
    protection_rung: rung
      ? {
          sku: rung.sku,
          price_minor: rung.priceMinor,
          label: `Protect this shipment against loss, theft and damage for ${formatMinor(rung.priceMinor)}`,
        }
      : null,
    protection_minor: protectionMinor,
    shipping_minor: shippingMinor,
    tax_minor: taxMinor,
    total_minor: subtotalMinor + protectionMinor + shippingMinor + taxMinor,
    currency: "usd",
    priced,
    notices: [...remembered, ...noticesFor(rows)],
    quote: cartQuoteFor(cart),
  };
}

export async function requireLine(cartId: number, lineId: string, tx?: Tx): Promise<Row> {
  const id = Number(lineId);
  if (!Number.isSafeInteger(id) || id < 1) throw notFound("That line is not in this cart.");
  const row = tx
    ? await tx.one("SELECT * FROM cart_line WHERE id = $1 AND cart_id = $2", [id, cartId])
    : await one("SELECT * FROM cart_line WHERE id = $1 AND cart_id = $2", [id, cartId]);
  if (!row) throw notFound("That line is not in this cart.");
  return row;
}

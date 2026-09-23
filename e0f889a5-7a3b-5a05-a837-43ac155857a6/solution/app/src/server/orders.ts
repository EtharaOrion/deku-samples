import { createHmac, randomBytes } from "node:crypto";
import { one, PG, pgCode, query, transaction, type Row, type Tx } from "./db";
import { signingSecret } from "./env";
import {
  AppError,
  badRequest,
  conflict,
  notFound,
  unavailable,
  unprocessable,
} from "./errors";
import { deliveryMethod, formatMinor, rungFor, taxOn } from "./money";
import {
  cartLines,
  cartQuoteFor,
  type CartRow,
  type LineRow,
  noticesFor,
} from "./carts";
import { tokenMatches } from "./auth";
import { invoiceOrder, reportBillingFailure } from "./killbill";
import { sendOrderConfirmation } from "./mailer";
import { logEvent } from "./log";
import { SERIAL_ALPHABET } from "./serial";

/** The order access token is derived rather than stored in the clear, so a token
 *  can be handed back on a replay while the store keeps only its hash. */
export function accessTokenFor(orderId: number | string): string {
  return createHmac("sha256", signingSecret()).update(`order-access:${orderId}`).digest("base64url");
}

export function accessTokenHash(token: string): string {
  return createHmac("sha256", signingSecret()).update(`order-hash:${token}`).digest("hex");
}

async function allocateNumber(tx: Tx): Promise<string> {
  // One allocator at a time, so two checkouts never take the same number.
  await tx.query("SELECT pg_advisory_xact_lock($1)", [847123093]);
  const year = new Date().getUTCFullYear();
  const prefix = `VE-${year}-`;
  const row = await tx.one<{ highest: string | null }>(
    `SELECT max(split_part(number, '-', 3)::bigint)::text AS highest
       FROM "order"
      WHERE number LIKE $1`,
    [`${prefix}%`],
  );
  const current = row?.highest ? Number(row.highest) : 0;
  return `${prefix}${String(current + 1).padStart(4, "0")}`;
}

export type PlacedOrder = Row & { id: number; number: string };

export type PlaceInput = {
  cart: CartRow;
  idempotencyKey: string;
  customerId: number | null;
  requestId: string;
  publicUrl: string;
  cartQuote: string | null;
};

export async function findOrderByKey(key: string): Promise<PlacedOrder | null> {
  return one<PlacedOrder>('SELECT * FROM "order" WHERE idempotency_key = $1', [key]);
}

/** Place one order: re-price every line, commit stock in the same statement that
 *  takes it, allocate the next number and write the order with its line snapshots.
 *  Nothing here reaches the billing platform; the invoice follows the committed row. */
async function writeOrder(
  input: PlaceInput,
): Promise<{ order: PlacedOrder; replayed: boolean }> {
  const outcome:
    | { order: PlacedOrder; replayed: boolean }
    | { moved: LineRow[] } = await transaction(async (tx) => {
    const cart = await tx.one<CartRow>("SELECT * FROM cart WHERE id = $1 FOR UPDATE", [input.cart.id]);
    if (!cart) throw notFound("That cart is gone.");
    if (cart.status !== "open") {
      // A cart becomes exactly one order. Submitting it again, from a page the
      // browser walked back to or with a key it minted afresh, is that same
      // order coming back rather than a second one.
      const existing = await tx.one<PlacedOrder>(
        'SELECT * FROM "order" WHERE cart_id = $1 ORDER BY id LIMIT 1',
        [cart.id],
      );
      if (existing) return { order: existing, replayed: true };
      throw conflict("cart_already_ordered", "This cart has already been ordered.");
    }
    if (!tokenMatches(input.cartQuote, cartQuoteFor(cart))) {
      throw conflict(
        "cart_changed",
        "Your cart changed after this total was shown. Review it before placing the order.",
      );
    }

    const lines = await cartLines(cart.id, tx);
    const goods = lines.filter((line) => line.kind !== "protection");
    if (goods.length === 0) throw unprocessable("cart_empty", "Your cart is empty.");
    const discontinued = goods.find((line) => line.product_status === "discontinued");
    if (discontinued) {
      throw unprocessable(
        "product_discontinued",
        `${discontinued.product_title} is no longer sold.`,
        { sku: discontinued.sku, resource: discontinued.sku },
      );
    }

    if (!cart.email) throw unprocessable("email_required", "Email is required.");
    if (!cart.shipping_address) throw unprocessable("address_required", "A delivery address is required.");
    const method = deliveryMethod(cart.shipping_method);
    if (!method) throw unprocessable("shipping_method_required", "Choose how it gets there.");

    // Re-price every line against the current variant price. A line that moved
    // stops the placement and leaves the cart carrying the notice.
    const moved = goods.filter((line) => line.unit_price_minor !== line.price_minor);
    if (moved.length > 0) {
      for (const line of moved) {
        await tx.query("UPDATE cart_line SET unit_price_minor = $1 WHERE id = $2", [
          line.price_minor,
          line.id,
        ]);
      }
      await tx.query(
        "UPDATE cart SET notices = $1::jsonb, updated_at = now() WHERE id = $2",
        [JSON.stringify(noticesFor(moved)), cart.id],
      );
      return { moved };
    }

    const subtotalMinor = goods.reduce((sum, line) => sum + line.price_minor * line.quantity, 0);
    const rung = rungFor(subtotalMinor);
    const protectionMinor = cart.protection_enabled && rung ? rung.priceMinor : 0;
    const shippingMinor = method.priceMinor;
    const taxMinor = taxOn(subtotalMinor);
    const totalMinor = subtotalMinor + protectionMinor + shippingMinor + taxMinor;

    // Stock moves in the statement that takes it. The store refuses the loser of
    // a race, and available can never read below zero.
    for (const line of [...goods].sort(
      (left, right) => Number(left.variant_id) - Number(right.variant_id),
    )) {
      const taken = await tx.query(
        `UPDATE inventory_level
            SET available = CASE
                              WHEN $3 = 'continue' THEN greatest(available - $1, 0)
                              ELSE available - $1
                            END,
                committed = committed + $1
          WHERE variant_id = $2
            AND ($3 = 'continue' OR available >= $1)
        RETURNING variant_id`,
        [line.quantity, line.variant_id, line.inventory_policy],
      );
      if (taken.length === 0) {
        throw conflict(
          "stock_unavailable",
          `${line.product_title} is no longer available in the quantity you asked for.`,
          { sku: line.sku, resource: line.sku, requested: line.quantity },
        );
      }
    }

    const number = await allocateNumber(tx);
    const order = await tx.one<PlacedOrder>(
      `INSERT INTO "order" (number, customer_id, cart_id, idempotency_key, email,
                            subtotal_minor, shipping_minor, tax_minor, discount_minor,
                            total_minor, currency, status, payment_status, fulfilment_status,
                            shipping_method, shipping_address, killbill_external_key, placed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,'usd','pending','unpaid','unfulfilled',$10,$11::jsonb,$12, now())
       RETURNING *`,
      [
        number,
        input.customerId,
        cart.id,
        input.idempotencyKey,
        String(cart.email).trim().toLowerCase(),
        subtotalMinor + protectionMinor,
        shippingMinor,
        taxMinor,
        totalMinor,
        method.name,
        JSON.stringify(cart.shipping_address),
        String(cart.email).trim().toLowerCase(),
      ],
    );
    if (!order) throw new Error("the store refused the order");

    let position = 0;
    for (const line of goods) {
      position += 1;
      await tx.query(
        `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, option_snapshot,
                                 quantity, unit_price_minor, total_minor, taxable, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9)`,
        [
          order.id,
          line.variant_id,
          line.product_title,
          line.sku,
          line.option_value,
          line.quantity,
          line.price_minor,
          line.price_minor * line.quantity,
          position,
        ],
      );

      // A camera leaves the building as a numbered object, so buying one mints
      // the serial that outlives the order.
      if (line.kind === "camera") {
        await mintSerials(tx, {
          orderId: Number(order.id),
          productId: Number(line.product_id),
          variantId: Number(line.variant_id),
          handle: String(line.handle),
          quantity: Number(line.quantity),
          customerId: input.customerId,
        });
      }
    }

    if (protectionMinor > 0 && rung) {
      const protection = await tx.one<{ id: number }>("SELECT id FROM variant WHERE sku = $1", [rung.sku]);
      if (protection) {
        position += 1;
        await tx.query(
          `INSERT INTO order_line (order_id, variant_id, title_snapshot, sku_snapshot, option_snapshot,
                                   quantity, unit_price_minor, total_minor, taxable, position)
           VALUES ($1,$2,'Shipment protection',$3,'',1,$4,$4,false,$5)`,
          [order.id, protection.id, rung.sku, rung.priceMinor, position],
        );
      }
    }

    await tx.query(
      "UPDATE \"order\" SET access_token_hash = $1 WHERE id = $2",
      [accessTokenHash(accessTokenFor(order.id)), order.id],
    );
    await tx.query("UPDATE cart SET status = 'ordered', updated_at = now() WHERE id = $1", [cart.id]);

    return {
      order: { ...order, access_token_hash: accessTokenHash(accessTokenFor(order.id)) },
      replayed: false,
    };
  });

  if ("moved" in outcome) {
    const first = outcome.moved[0];
    throw conflict(
      "cart_price_changed",
      first
        ? `The price of ${first.product_title} changed from ${formatMinor(first.unit_price_minor)} to ${formatMinor(first.price_minor)} since you added it.`
        : "A price changed since you last saw this cart.",
      { notices: noticesFor(outcome.moved) },
    );
  }

  return outcome;
}

/** A serial is minted at the moment of sale: two letters of model code, the year
 *  and production week, then six characters from an alphabet that omits the
 *  glyphs misread off an engraved underside. */
function coinSerial(handle: string, when: Date): string {
  const code = handle === "flagship" ? "VA" : "VC";
  const year = String(when.getUTCFullYear() % 100).padStart(2, "0");
  const start = Date.UTC(when.getUTCFullYear(), 0, 1);
  const week = Math.min(
    52,
    Math.floor((when.getTime() - start) / (7 * 24 * 60 * 60 * 1000)) + 1,
  );
  let tail = "";
  const picks = randomBytes(6);
  for (const pick of picks) tail += SERIAL_ALPHABET[pick % SERIAL_ALPHABET.length];
  return `${code}${year}${String(week).padStart(2, "0")}${tail}`;
}

async function mintSerials(
  tx: Tx,
  input: {
    orderId: number;
    productId: number;
    variantId: number;
    handle: string;
    quantity: number;
    customerId: number | null;
  },
): Promise<void> {
  const now = new Date();
  const warranty = new Date(
    Date.UTC(now.getUTCFullYear() + 2, now.getUTCMonth(), now.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);

  for (let made = 0; made < input.quantity; made += 1) {
    let device: Row | null = null;
    // A collision on a twelve character serial is unlikely and still handled.
    for (let attempt = 0; attempt < 8 && !device; attempt += 1) {
      // A rejected insert aborts the surrounding transaction in Postgres unless
      // it is fenced, so each attempt gets its own savepoint.
      await tx.query("SAVEPOINT mint_serial");
      try {
        device = await tx.one<Row>(
          `INSERT INTO device (serial, product_id, variant_id, status, order_id, warranty_until)
           VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING id`,
          [
            coinSerial(input.handle, now),
            input.productId,
            input.variantId,
            input.customerId ? "registered" : "sold",
            input.orderId,
            warranty,
          ],
        );
        await tx.query("RELEASE SAVEPOINT mint_serial");
      } catch (error) {
        await tx.query("ROLLBACK TO SAVEPOINT mint_serial");
        if (pgCode(error) !== PG.uniqueViolation) throw error;
      }
    }
    if (!device) throw new Error("could not allocate a serial");

    // A buyer who is signed in owns the camera from the moment it is sold.
    if (input.customerId) {
      await tx.query(
        `INSERT INTO device_ownership (device_id, customer_id, order_id, method)
         VALUES ($1,$2,$3,'order')`,
        [device.id, input.customerId, input.orderId],
      );
    }
  }
}

export type OrderResult = { order: PlacedOrder; replayed: boolean; accessToken: string };

/** Billing is retried from the durable pending order. The row lock serializes
 *  concurrent replays; if a provider response or local commit is interrupted,
 *  Kill Bill's order description lets the next attempt reuse the same invoice. */
async function ensureBilled(order: PlacedOrder, input: PlaceInput): Promise<PlacedOrder> {
  try {
    return await transaction(async (tx) => {
      const current = await tx.one<PlacedOrder>(
        'SELECT * FROM "order" WHERE id = $1 FOR UPDATE',
        [order.id],
      );
      if (!current) throw notFound("That order is gone.");
      if (current.status === "confirmed") return current;
      if (current.status === "cancelled") {
        throw conflict(
          "order_not_confirmed",
          "That order could not be confirmed.",
          { resource: current.number },
        );
      }

      const name =
        (current.shipping_address as { name?: string } | null)?.name ?? current.email;
      const invoice = await invoiceOrder({
        email: String(current.email),
        name: String(name),
        totalMinor: Number(current.total_minor),
        orderNumber: current.number,
        requestId: input.requestId,
      });
      const confirmed = await tx.one<PlacedOrder>(
        `UPDATE "order"
            SET status = 'confirmed', payment_status = 'invoiced',
                killbill_external_key = $1, killbill_account_id = $2,
                killbill_invoice_id = $3, killbill_invoice_amount = $4
          WHERE id = $5 AND status = 'pending'
          RETURNING *`,
        [invoice.externalKey, invoice.accountId, invoice.invoiceId, invoice.amount, current.id],
      );
      if (!confirmed) throw new Error("the store refused the billing confirmation");
      return confirmed;
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    reportBillingFailure(input.requestId, order.number, error);
    throw unavailable(
      "billing_unavailable",
      "We could not confirm billing. Retry this same order.",
      { resource: order.number },
    );
  }
}

/** SMTP delivery is also serialized by the order row and marked only after the
 *  server accepts the message. A failed delivery remains retryable by the same
 *  idempotency key instead of being silently treated as success. */
async function ensureConfirmationMail(
  order: PlacedOrder,
  input: PlaceInput,
): Promise<{ order: PlacedOrder; sent: boolean }> {
  try {
    return await transaction(async (tx) => {
      const current = await tx.one<PlacedOrder>(
        'SELECT * FROM "order" WHERE id = $1 FOR UPDATE',
        [order.id],
      );
      if (!current) throw notFound("That order is gone.");
      if (current.status !== "confirmed") {
        throw conflict("order_not_confirmed", "That order is not confirmed.", {
          resource: current.number,
        });
      }
      if (current.confirmation_sent_at) return { order: current, sent: false };

      const lines = await tx.query<Row>(
        "SELECT * FROM order_line WHERE order_id = $1 ORDER BY position",
        [current.id],
      );
      await sendOrderConfirmation(
        {
          to: String(current.email),
          orderNumber: current.number,
          lines: lines.map((line) => ({
            title: String(line.title_snapshot),
            option: String(line.option_snapshot ?? ""),
            quantity: Number(line.quantity),
            totalMinor: Number(line.total_minor),
          })),
          subtotalMinor: Number(current.subtotal_minor),
          shippingMinor: Number(current.shipping_minor),
          taxMinor: Number(current.tax_minor),
          totalMinor: Number(current.total_minor),
          shippingMethod: String(current.shipping_method ?? "Standard"),
          trackUrl: `${input.publicUrl.replace(/\/+$/, "")}/orders/${current.number}?access_token=${accessTokenFor(current.id)}`,
        },
        input.requestId,
      );
      const marked = await tx.one<PlacedOrder>(
        `UPDATE "order" SET confirmation_sent_at = now()
          WHERE id = $1 AND confirmation_sent_at IS NULL
          RETURNING *`,
        [current.id],
      );
      if (!marked) throw new Error("the store refused the mail confirmation");
      return { order: marked, sent: true };
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw unavailable(
      "mail_unavailable",
      "Your order is confirmed, but its email is still being delivered. Retry this same order.",
      { resource: order.number },
    );
  }
}

async function finishOrder(order: PlacedOrder, input: PlaceInput): Promise<PlacedOrder> {
  const confirmed = await ensureBilled(order, input);
  const mailed = await ensureConfirmationMail(confirmed, input);
  if (mailed.sent) {
    logEvent("order_confirmed", {
      request_id: input.requestId,
      order: mailed.order.number,
      total_minor: Number(mailed.order.total_minor),
    });
  }
  return mailed.order;
}

function assertSameCart(order: PlacedOrder, input: PlaceInput): void {
  if (Number(order.cart_id) !== Number(input.cart.id)) {
    throw conflict(
      "idempotency_key_reused",
      "That submission reference belongs to a different cart.",
      { resource: input.idempotencyKey },
    );
  }
}

/** A replayed key returns the order it returned the first time and creates no
 *  second invoice, no second mail and no second row. */
export async function placeOrder(input: PlaceInput): Promise<OrderResult> {
  const held = await findOrderByKey(input.idempotencyKey);
  if (held) {
    assertSameCart(held, input);
    const order = await finishOrder(held, input);
    return { order, replayed: true, accessToken: accessTokenFor(order.id) };
  }

  let written: { order: PlacedOrder; replayed: boolean };
  try {
    written = await writeOrder(input);
  } catch (error) {
    if (pgCode(error) === PG.uniqueViolation) {
      const raced = await findOrderByKey(input.idempotencyKey);
      if (raced) {
        assertSameCart(raced, input);
        const order = await finishOrder(raced, input);
        return { order, replayed: true, accessToken: accessTokenFor(order.id) };
      }
    }
    throw error;
  }

  const order = await finishOrder(written.order, input);
  return {
    order,
    replayed: written.replayed,
    accessToken: accessTokenFor(order.id),
  };
}

export async function orderLines(orderId: number): Promise<Row[]> {
  return query("SELECT * FROM order_line WHERE order_id = $1 ORDER BY position, id", [orderId]);
}

export async function orderSerials(orderId: number): Promise<Row[]> {
  return query(
    `SELECT d.serial, d.status, d.firmware_version, v.sku,
            EXISTS (SELECT 1 FROM device_ownership o
                     WHERE o.device_id = d.id AND o.released_at IS NULL) AS registered
       FROM device d
       LEFT JOIN variant v ON v.id = d.variant_id
      WHERE d.order_id = $1
      ORDER BY d.serial`,
    [orderId],
  );
}

/** A status chip is derived from the three stored states rather than stored as a
 *  fourth. */
export function orderChip(order: Row): string {
  if (order.status === "cancelled") return "Cancelled";
  if (order.status === "pending") return "Placed, waiting on payment";
  if (order.fulfilment_status === "fulfilled") return "Confirmed, paid and delivered";
  if (order.payment_status === "invoiced") return "Confirmed and paid, not yet shipped";
  return "Confirmed, waiting on payment";
}

export function requireIdempotencyKey(header: string | null): string {
  const key = (header ?? "").trim();
  if (!key) {
    throw badRequest(
      "idempotency_key_required",
      "Name this order submission with an Idempotency-Key header.",
    );
  }
  if (key.length > 200) throw badRequest("idempotency_key_invalid", "That submission reference is too long.");
  return key;
}

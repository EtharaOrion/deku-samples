import type { Customer } from "./auth";
import { one, query, type Row, type Tx } from "./db";
import { notFound } from "./errors";
import { normaliseSerial } from "./serial";

const DEVICE_SQL = `
  SELECT d.*, p.handle, p.title AS model, p.support_until,
         o.claimed_at, o.id AS ownership_id
    FROM device d
    JOIN product p ON p.id = d.product_id
    JOIN device_ownership o ON o.device_id = d.id AND o.released_at IS NULL`;

const CAMERA_NOT_FOUND = "We cannot find that camera on your account.";

/** Every read and write restricted to the signed-in customer goes through one
 *  of these, so no handler carries its own ownership filter. Another customer's
 *  order or camera reads as not found, never as forbidden. */
export type AccountScope = {
  customer: Customer;
  ordersPage(afterDate: string | null, afterId: number | null, limit: number): Promise<Row[]>;
  order(number: string): Promise<Row | null>;
  recentOrders(limit: number): Promise<Row[]>;
  devicesPage(afterDate: string | null, afterId: number | null, limit: number): Promise<Row[]>;
  allDevices(): Promise<Row[]>;
  device(serial: string): Promise<Row>;
  renameDevice(deviceId: number, nickname: string | null): Promise<boolean>;
  releaseDevice(deviceId: number, tx?: Tx): Promise<boolean>;
};

export function scopeOf(customer: Customer): AccountScope {
  const id = Number(customer.id);
  return {
    customer,

    ordersPage: (afterDate, afterId, limit) =>
      query<Row>(
        `SELECT * FROM "order"
          WHERE customer_id = $1
            AND ($2::timestamptz IS NULL OR (placed_at, id) < ($2::timestamptz, $3::bigint))
          ORDER BY placed_at DESC, id DESC
          LIMIT $4`,
        [id, afterDate, afterId, limit],
      ),

    order: (number) =>
      one<Row>('SELECT * FROM "order" WHERE number = $1 AND customer_id = $2', [number, id]),

    recentOrders: (limit) =>
      query<Row>(
        'SELECT * FROM "order" WHERE customer_id = $1 ORDER BY placed_at DESC, id DESC LIMIT $2',
        [id, limit],
      ),

    devicesPage: (afterDate, afterId, limit) =>
      query<Row>(
        `${DEVICE_SQL}
          WHERE o.customer_id = $1
            AND ($2::timestamptz IS NULL OR
                 (o.claimed_at, o.id) > ($2::timestamptz, $3::bigint))
          ORDER BY o.claimed_at, o.id
          LIMIT $4`,
        [id, afterDate, afterId, limit],
      ),

    allDevices: () => query<Row>(`${DEVICE_SQL} WHERE o.customer_id = $1 ORDER BY d.id`, [id]),

    device: async (serialRaw) => {
      const row = await one<Row>(
        `${DEVICE_SQL} WHERE upper(d.serial) = upper($1) AND o.customer_id = $2`,
        [normaliseSerial(serialRaw), id],
      );
      if (!row) throw notFound(CAMERA_NOT_FOUND);
      return row;
    },

    renameDevice: async (deviceId, nickname) => {
      const changed = await query(
        `UPDATE device d SET nickname = $1
          WHERE d.id = $2
            AND EXISTS (
              SELECT 1 FROM device_ownership o
               WHERE o.device_id = d.id
                 AND o.customer_id = $3
                 AND o.released_at IS NULL
            )
          RETURNING d.id`,
        [nickname, deviceId, id],
      );
      return changed.length > 0;
    },

    releaseDevice: async (deviceId, tx) => {
      const run = tx ? tx.query.bind(tx) : query;
      const released = await run(
        `UPDATE device_ownership SET released_at = now()
          WHERE device_id = $1 AND customer_id = $2 AND released_at IS NULL
          RETURNING id`,
        [deviceId, id],
      );
      return released.length > 0;
    },
  };
}

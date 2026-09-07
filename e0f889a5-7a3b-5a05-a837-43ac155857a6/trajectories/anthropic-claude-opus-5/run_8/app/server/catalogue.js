import { many, one } from './db.js';

const PRODUCT_COLS = `p.id, p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until, p.position`;

export function availabilityOf(variants, productStatus) {
  if (productStatus === 'discontinued') return { state: 'discontinued', label: 'Discontinued' };
  const total = variants.reduce((n, v) => n + v.available, 0);
  if (total <= 0) return { state: 'sold_out', label: 'Sold out' };
  if (total <= 10) return { state: 'low', label: `Only ${total} left`, count: total };
  return { state: 'available', label: 'Available' };
}

export function variantAvailability(v, productStatus) {
  if (productStatus === 'discontinued') return { state: 'discontinued', label: 'Discontinued' };
  if (v.available <= 0) return { state: 'sold_out', label: 'Sold out' };
  if (v.available <= 10) return { state: 'low', label: `Only ${v.available} left`, count: v.available };
  return { state: 'available', label: 'Available' };
}

async function variantsFor(productIds) {
  if (!productIds.length) return new Map();
  const rows = await many(
    `SELECT v.id, v.product_id, v.sku, v.title, v.option_value, v.price_minor, v.currency, v.position,
            v.inventory_policy, COALESCE(il.available,0) AS available, COALESCE(il.committed,0) AS committed
       FROM variant v LEFT JOIN inventory_level il ON il.variant_id = v.id
      WHERE v.product_id = ANY($1::bigint[])
      ORDER BY v.position, v.id`,
    [productIds]
  );
  const map = new Map();
  for (const r of rows) {
    const key = String(r.product_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      id: String(r.id), sku: r.sku, title: r.title, option_value: r.option_value,
      price_minor: r.price_minor, currency: r.currency, available: r.available,
      committed: r.committed, inventory_policy: r.inventory_policy,
    });
  }
  return map;
}

export function shapeProduct(p, variants) {
  const vs = variants.map((v) => ({ ...v, availability: variantAvailability(v, p.status) }));
  const prices = vs.map((v) => v.price_minor);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;
  return {
    id: String(p.id),
    handle: p.handle,
    title: p.title,
    subtitle: p.subtitle,
    kind: p.kind,
    status: p.status,
    support_until: p.support_until ? String(p.support_until).slice(0, 10) : null,
    position: p.position,
    price_minor: min,
    price_from: min !== max,
    variants: vs,
    availability: availabilityOf(vs, p.status),
  };
}

// The catalogue is ordered by editorial position, never by price or name.
export async function listProducts({ limit, cursorPosition }) {
  const params = [limit + 1];
  let where = `WHERE p.kind <> 'protection'`;
  if (cursorPosition !== null && cursorPosition !== undefined) {
    params.push(Number(cursorPosition));
    where += ` AND (p.position, p.id) > ($2, 0)`;
  }
  const rows = await many(
    `SELECT ${PRODUCT_COLS} FROM product p ${where} ORDER BY p.position ASC, p.id ASC LIMIT $1`,
    params
  );
  const vmap = await variantsFor(rows.map((r) => r.id));
  return rows.map((r) => shapeProduct(r, vmap.get(String(r.id)) ?? []));
}

export async function productByHandle(handle) {
  const p = await one(`SELECT ${PRODUCT_COLS} FROM product p WHERE p.handle = $1`, [String(handle ?? '')]);
  if (!p) return null;
  const vmap = await variantsFor([p.id]);
  const shaped = shapeProduct(p, vmap.get(String(p.id)) ?? []);
  const blocks = await many(
    'SELECT kind, position, payload FROM product_block WHERE product_id = $1 ORDER BY position, id',
    [p.id]
  );
  return { ...shaped, blocks };
}

export async function shippingMethods() {
  return many('SELECT code, label, price_minor, window_text FROM shipping_method ORDER BY position, id');
}

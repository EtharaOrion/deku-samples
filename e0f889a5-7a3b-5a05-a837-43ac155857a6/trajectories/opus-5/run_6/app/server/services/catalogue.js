import { many, one } from '../db.js';
import { notFound } from '../errors.js';

const PRODUCT_COLUMNS = `p.id, p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until, p.position`;

export function availabilityFor(product, variants) {
  if (product.status === 'discontinued') return 'discontinued';
  const total = variants.reduce((sum, v) => sum + (v.available || 0), 0);
  if (total <= 0) return 'sold_out';
  if (total <= 10) return 'low';
  return 'available';
}

export function variantAvailability(product, variant) {
  if (product.status === 'discontinued') return 'discontinued';
  if ((variant.available || 0) <= 0) return 'sold_out';
  if ((variant.available || 0) <= 10) return 'low';
  return 'available';
}

async function variantsForProducts(productIds) {
  if (!productIds.length) return new Map();
  const rows = await many(
    `SELECT v.id, v.product_id, v.sku, v.title, v.option_value, v.price_minor, v.currency, v.position,
            v.inventory_policy, COALESCE(i.available, 0) AS available, COALESCE(i.committed, 0) AS committed
       FROM variant v LEFT JOIN inventory_level i ON i.variant_id = v.id
      WHERE v.product_id = ANY($1::bigint[])
      ORDER BY v.position, v.id`,
    [productIds],
  );
  const map = new Map();
  for (const r of rows) {
    const key = String(r.product_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ ...r, id: String(r.id), product_id: key });
  }
  return map;
}

export function serialiseProduct(p, variants) {
  return {
    id: String(p.id),
    handle: p.handle,
    title: p.title,
    subtitle: p.subtitle,
    kind: p.kind,
    status: p.status,
    support_until: p.support_until,
    position: p.position,
    currency: 'usd',
    price_minor: variants.length ? Math.min(...variants.map((v) => v.price_minor)) : 0,
    price_varies: variants.length > 1 && new Set(variants.map((v) => v.price_minor)).size > 1,
    availability: availabilityFor(p, variants),
    variants: variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      title: v.title,
      option_value: v.option_value,
      price_minor: v.price_minor,
      currency: v.currency,
      available: v.available,
      inventory_policy: v.inventory_policy,
      availability: variantAvailability(p, v),
    })),
  };
}

// Keyset page over (position, id): stable, never repeats a row and never skips one.
export async function listProducts({ pageSize, cursor }) {
  const params = [pageSize + 1];
  let where = `p.kind <> 'protection'`;
  if (cursor) {
    params.push(cursor.position, cursor.id);
    where += ` AND (p.position, p.id) > ($2, $3)`;
  }
  const rows = await many(
    `SELECT ${PRODUCT_COLUMNS} FROM product p WHERE ${where} ORDER BY p.position, p.id LIMIT $1`,
    params,
  );
  const hasMore = rows.length > pageSize;
  const page = rows.slice(0, pageSize);
  const variantMap = await variantsForProducts(page.map((r) => r.id));
  const data = page.map((p) => serialiseProduct(p, variantMap.get(String(p.id)) || []));
  const last = page[page.length - 1];
  return { data, hasMore, lastKey: last ? { position: last.position, id: String(last.id) } : null };
}

export async function getProduct(handle) {
  const p = await one(`SELECT ${PRODUCT_COLUMNS} FROM product p WHERE p.handle = $1 AND p.kind <> 'protection'`, [
    handle,
  ]);
  if (!p) throw notFound('That product does not exist.');
  const variantMap = await variantsForProducts([p.id]);
  const variants = variantMap.get(String(p.id)) || [];
  const blocks = await many(
    `SELECT id, kind, position, payload FROM product_block WHERE product_id = $1 ORDER BY position, id`,
    [p.id],
  );
  return {
    ...serialiseProduct(p, variants),
    blocks: blocks.map((b) => ({ id: String(b.id), kind: b.kind, position: b.position, payload: b.payload })),
  };
}

export async function getVariantBySku(sku) {
  return one(
    `SELECT v.id, v.product_id, v.sku, v.title, v.option_value, v.price_minor, v.currency, v.inventory_policy,
            COALESCE(i.available, 0) AS available, p.handle, p.title AS product_title, p.status AS product_status,
            p.kind AS product_kind
       FROM variant v
       JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level i ON i.variant_id = v.id
      WHERE upper(v.sku) = upper($1)`,
    [sku],
  );
}

export async function deliveryMethods(country = 'US') {
  return many(
    `SELECT m.code, m.title, m.price_minor, m.window_label, m.position
       FROM delivery_method m JOIN delivery_zone z ON z.id = m.zone_id
      WHERE z.country = $1 ORDER BY m.position`,
    [country],
  );
}

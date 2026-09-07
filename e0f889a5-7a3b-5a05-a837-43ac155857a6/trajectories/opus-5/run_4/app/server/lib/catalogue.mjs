import { query } from './db.mjs';

/** Availability is a state, not a boolean. */
export function availabilityFor(product, variant) {
  if (product.status === 'discontinued') {
    return { state: 'discontinued', label: 'Discontinued', purchasable: false };
  }
  const available = Number(variant.available || 0);
  if (available <= 0) return { state: 'sold_out', label: 'Sold out', purchasable: false };
  if (available <= 10) return { state: 'low', label: `Only ${available} left`, purchasable: true, remaining: available };
  return { state: 'available', label: 'In stock', purchasable: true, remaining: available };
}

/** The state a product card shows, from the states of its variants. */
export function productAvailability(product) {
  if (product.status === 'discontinued') return { state: 'discontinued', label: 'Discontinued' };
  const totals = product.variants.reduce((n, v) => n + Number(v.available || 0), 0);
  if (totals <= 0) return { state: 'sold_out', label: 'Sold out' };
  const anyLow = product.variants.some((v) => Number(v.available) > 0 && Number(v.available) <= 10);
  if (anyLow && totals <= 10) return { state: 'low', label: `Only ${totals} left` };
  return { state: 'available', label: 'In stock' };
}

const PRODUCT_COLUMNS = `
  p.id, p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until, p.position`;

export async function listProducts({ includeProtection = false, afterPosition = null, limit = null } = {}) {
  const params = [];
  const where = [];
  if (!includeProtection) where.push(`p.kind <> 'protection'`);
  if (afterPosition !== null) {
    params.push(afterPosition.position, afterPosition.id);
    where.push(`(p.position, p.id) > ($${params.length - 1}, $${params.length})`);
  }
  let sql = `SELECT ${PRODUCT_COLUMNS} FROM product p
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY p.position ASC, p.id ASC`;
  if (limit) {
    params.push(limit);
    sql += ` LIMIT $${params.length}`;
  }
  const { rows } = await query(sql, params);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const { rows: variants } = await query(
    `SELECT v.id, v.product_id, v.sku, v.title, v.option_value, v.price_minor, v.currency,
            v.position, v.inventory_policy,
            COALESCE(i.available, 0) AS available, COALESCE(i.committed, 0) AS committed
       FROM variant v LEFT JOIN inventory_level i ON i.variant_id = v.id
      WHERE v.product_id = ANY($1::bigint[])
      ORDER BY v.position ASC, v.id ASC`, [ids]);
  const byProduct = new Map(ids.map((id) => [String(id), []]));
  for (const v of variants) byProduct.get(String(v.product_id))?.push(v);
  return rows.map((p) => {
    const product = { ...p, variants: byProduct.get(String(p.id)) || [] };
    product.availability = productAvailability(product);
    return product;
  });
}

export async function getProductByHandle(handle) {
  const { rows } = await query(
    `SELECT ${PRODUCT_COLUMNS} FROM product p WHERE p.handle = $1`, [handle]);
  if (!rows.length) return null;
  const product = rows[0];
  const { rows: variants } = await query(
    `SELECT v.id, v.sku, v.title, v.option_value, v.price_minor, v.currency, v.position,
            v.inventory_policy, COALESCE(i.available,0) AS available, COALESCE(i.committed,0) AS committed
       FROM variant v LEFT JOIN inventory_level i ON i.variant_id = v.id
      WHERE v.product_id = $1 ORDER BY v.position ASC, v.id ASC`, [product.id]);
  const { rows: blocks } = await query(
    `SELECT kind, position, payload FROM product_block WHERE product_id = $1 ORDER BY position ASC, id ASC`,
    [product.id]);
  product.variants = variants;
  product.blocks = blocks;
  product.availability = productAvailability(product);
  for (const v of product.variants) v.availability = availabilityFor(product, v);
  return product;
}

export async function getVariantBySku(sku) {
  const { rows } = await query(
    `SELECT v.id, v.sku, v.title, v.option_value, v.price_minor, v.currency, v.inventory_policy,
            p.id AS product_id, p.handle, p.title AS product_title, p.status AS product_status, p.kind,
            COALESCE(i.available,0) AS available
       FROM variant v
       JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level i ON i.variant_id = v.id
      WHERE v.sku = $1`, [sku]);
  return rows[0] || null;
}

export async function shippingMethods() {
  const { rows } = await query(
    `SELECT m.code, m.title, m.price_minor, m.window_text
       FROM shipping_method m JOIN shipping_zone z ON z.id = m.zone_id
      WHERE z.code = 'us-domestic' ORDER BY m.position ASC`);
  return rows;
}

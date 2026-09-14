import { query, one } from './db.js';
import { errors } from './errors.js';

export async function listProducts({ includeProtection = false } = {}) {
  const r = await query(
    `SELECT p.*,
            (SELECT json_agg(json_build_object(
              'id', v.id, 'sku', v.sku, 'title', v.title, 'option_value', v.option_value,
              'price_minor', v.price_minor, 'currency', v.currency, 'position', v.position,
              'available', COALESCE(il.available,0), 'committed', COALESCE(il.committed,0),
              'inventory_policy', v.inventory_policy
            ) ORDER BY v.position) AS variants)
     FROM product p
     LEFT JOIN variant v ON v.product_id = p.id
     LEFT JOIN inventory_level il ON il.variant_id = v.id
     WHERE ($1 OR p.kind <> 'protection')
     GROUP BY p.id
     ORDER BY p.position, p.id`,
    [includeProtection]
  );
  return r.rows.map((p) => ({ ...p, variants: p.variants || [] }));
}

export async function productByHandle(handle, { includeProtection = false } = {}) {
  const r = await query(
    `SELECT p.*,
            (SELECT json_agg(json_build_object(
              'id', v.id, 'sku', v.sku, 'title', v.title, 'option_value', v.option_value,
              'price_minor', v.price_minor, 'currency', v.currency, 'position', v.position,
              'available', COALESCE(il.available,0), 'committed', COALESCE(il.committed,0),
              'inventory_policy', v.inventory_policy
            ) ORDER BY v.position) AS variants)
     FROM product p
     LEFT JOIN variant v ON v.product_id = p.id
     LEFT JOIN inventory_level il ON il.variant_id = v.id
     WHERE p.handle = $1 AND ($2 OR p.kind <> 'protection')
     GROUP BY p.id`,
    [handle, includeProtection]
  );
  return r.rows[0] || null;
}

export async function productBlocks(productId) {
  const r = await query(`SELECT * FROM product_block WHERE product_id = $1 ORDER BY position`, [productId]);
  return r.rows;
}

/** Availability is a state, not a boolean. */
export function variantAvailability(variant, product) {
  const available = variant.available ?? 0;
  if (product.status === 'discontinued') {
    return {
      state: 'discontinued',
      label: 'Discontinued',
      disabled: true,
      support_until: product.support_until,
    };
  }
  if (available <= 0) {
    return { state: 'sold_out', label: 'Sold out', disabled: true };
  }
  if (available <= 10) {
    return { state: 'low', label: `Only ${available} left`, disabled: false };
  }
  return { state: 'available', label: 'Available', disabled: false };
}

export function productAvailability(product) {
  const variants = product.variants || [];
  if (product.status === 'discontinued') {
    return { state: 'discontinued', label: 'Discontinued' };
  }
  const total = variants.reduce((s, v) => s + (v.available ?? 0), 0);
  if (total <= 0) return { state: 'sold_out', label: 'Sold out' };
  if (variants.some((v) => v.available > 0 && v.available <= 10)) {
    const low = variants.filter((v) => v.available > 0 && v.available <= 10);
    return { state: 'low', label: `Only ${low.reduce((s, v) => s + v.available, 0)} left` };
  }
  return { state: 'available', label: 'Available' };
}

export function serializeProduct(p, { withBlocks = true } = {}) {
  const variants = (p.variants || []).map((v) => ({
    ...v,
    availability: variantAvailability(v, p),
  }));
  const prices = variants.map((v) => v.price_minor).filter((n) => typeof n === 'number');
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    subtitle: p.subtitle,
    kind: p.kind,
    status: p.status,
    support_until: p.support_until ? p.support_until.toISOString().slice(0, 10) : null,
    position: p.position,
    price_from_minor: prices.length ? Math.min(...prices) : null,
    price_from_display: prices.length ? `From $${(Math.min(...prices) / 100).toFixed(2)}` : null,
    variants,
    availability: productAvailability(p),
    blocks: withBlocks ? p.blocks || [] : undefined,
  };
}

export async function productBySku(sku) {
  return one(
    `SELECT v.*, p.handle AS product_handle, p.title AS product_title, p.status AS product_status
     FROM variant v JOIN product p ON p.id = v.product_id WHERE v.sku = $1`,
    [sku]
  );
}

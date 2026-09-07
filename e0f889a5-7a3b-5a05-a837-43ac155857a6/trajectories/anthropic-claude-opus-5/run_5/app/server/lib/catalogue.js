import { many, one } from './db.js';
import { notFound } from './errors.js';

/** Availability is a state, not a boolean. */
export function availabilityFor({ productStatus, available, inventoryPolicy = 'deny' }) {
  if (productStatus === 'discontinued') return { state: 'discontinued', available, purchasable: false };
  if (available <= 0 && inventoryPolicy === 'deny') return { state: 'sold_out', available, purchasable: false };
  if (available > 0 && available <= 10) return { state: 'low', available, purchasable: true };
  return { state: 'available', available, purchasable: true };
}

const VARIANT_SELECT = `
  v.id, v.sku, v.title, v.option_value, v.price_minor, v.currency, v.position,
  v.inventory_policy, COALESCE(i.available, 0) AS available, COALESCE(i.committed, 0) AS committed`;

export async function listProducts({ includeProtection = false } = {}) {
  const products = await many(
    `SELECT id, handle, title, subtitle, kind, status, support_until, position
       FROM product
      WHERE ($1::boolean OR kind <> 'protection')
      ORDER BY position ASC, id ASC`,
    [includeProtection],
  );
  if (!products.length) return [];
  const variants = await many(
    `SELECT ${VARIANT_SELECT}, v.product_id
       FROM variant v LEFT JOIN inventory_level i ON i.variant_id = v.id
      WHERE v.product_id = ANY($1::bigint[])
      ORDER BY v.position ASC, v.id ASC`,
    [products.map((p) => p.id)],
  );
  return products.map((p) => shapeProduct(p, variants.filter((v) => v.product_id === p.id)));
}

export async function getProductByHandle(handle) {
  const product = await one(
    `SELECT id, handle, title, subtitle, kind, status, support_until, position
       FROM product WHERE handle = $1`,
    [handle],
  );
  if (!product) return null;
  const variants = await many(
    `SELECT ${VARIANT_SELECT}
       FROM variant v LEFT JOIN inventory_level i ON i.variant_id = v.id
      WHERE v.product_id = $1 ORDER BY v.position ASC, v.id ASC`,
    [product.id],
  );
  const blocks = await many(
    `SELECT kind, position, payload FROM product_block WHERE product_id = $1 ORDER BY position ASC, id ASC`,
    [product.id],
  );
  return { ...shapeProduct(product, variants), blocks };
}

function shapeProduct(product, variants) {
  const shaped = variants.map((v) => ({
    id: v.id,
    sku: v.sku,
    title: v.title,
    option_value: v.option_value,
    price_minor: v.price_minor,
    currency: v.currency,
    available: v.available,
    inventory_policy: v.inventory_policy,
    availability: availabilityFor({
      productStatus: product.status,
      available: v.available,
      inventoryPolicy: v.inventory_policy,
    }),
  }));
  const prices = shaped.map((v) => v.price_minor);
  const from_price_minor = prices.length ? Math.min(...prices) : 0;
  const mixedPrice = prices.length > 1 && new Set(prices).size > 1;
  const productAvailable = shaped.some((v) => v.availability.purchasable);
  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    subtitle: product.subtitle,
    kind: product.kind,
    status: product.status,
    support_until: product.support_until ? isoDate(product.support_until) : null,
    position: product.position,
    variants: shaped,
    from_price_minor,
    price_is_from: mixedPrice,
    availability: {
      state:
        product.status === 'discontinued'
          ? 'discontinued'
          : productAvailable
            ? shaped.every((v) => !v.availability.purchasable || v.availability.state === 'low')
              ? 'low'
              : 'available'
            : 'sold_out',
    },
  };
}

export function isoDate(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  return new Date(d).toISOString().slice(0, 10);
}

/** `We will support it until September 1, 2029.` */
export function longDate(d) {
  if (!d) return null;
  const dt = typeof d === 'string' ? new Date(`${d.slice(0, 10)}T00:00:00Z`) : new Date(d);
  return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export async function variantBySku(sku) {
  return one(
    `SELECT ${VARIANT_SELECT}, p.handle, p.title AS product_title, p.status AS product_status, p.kind
       FROM variant v
       JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level i ON i.variant_id = v.id
      WHERE v.sku = $1`,
    [sku],
  );
}

export async function requireVariantBySku(sku) {
  const v = await variantBySku(sku);
  if (!v) throw notFound('That product does not exist.', 'variant_not_found');
  return v;
}

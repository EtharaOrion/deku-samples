import { query } from './db.mjs';

/** Availability is a state, not a boolean. */
export function availabilityFor(product, variant) {
  if (product.status === 'discontinued') {
    return { state: 'discontinued', label: 'Discontinued', purchasable: false };
  }
  if (variant.available <= 0) {
    return { state: 'sold_out', label: 'Sold out', purchasable: false };
  }
  if (variant.available <= 10) {
    return { state: 'low', label: `Only ${variant.available} left`, purchasable: true };
  }
  return { state: 'available', label: 'Available', purchasable: true };
}

/** A product is as available as its most available variant. */
export function productAvailability(product) {
  const states = product.variants.map((v) => availabilityFor(product, v));
  if (product.status === 'discontinued') {
    return { state: 'discontinued', label: 'Discontinued', purchasable: false };
  }
  const best = states.find((s) => s.purchasable);
  if (!best) return { state: 'sold_out', label: 'Sold out', purchasable: false };
  const low = states.every((s) => !s.purchasable || s.state === 'low');
  return low ? best : { state: 'available', label: 'Available', purchasable: true };
}

const shape = (row) => ({
  id: row.id,
  handle: row.handle,
  title: row.title,
  subtitle: row.subtitle,
  kind: row.kind,
  status: row.status,
  support_until: row.support_until ? row.support_until.toISOString().slice(0, 10) : null,
  position: row.position,
  variants: (row.variants || []).map((v) => ({
    id: v.id,
    sku: v.sku,
    title: v.title,
    option_value: v.option_value,
    price_minor: v.price_minor,
    currency: v.currency,
    position: v.position,
    available: v.available ?? 0,
  })),
});

const SELECT_PRODUCTS = `
  SELECT p.id, p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until, p.position,
         COALESCE(json_agg(
           json_build_object(
             'id', v.id, 'sku', v.sku, 'title', v.title, 'option_value', v.option_value,
             'price_minor', v.price_minor, 'currency', v.currency, 'position', v.position,
             'available', il.available
           ) ORDER BY v.position
         ) FILTER (WHERE v.id IS NOT NULL), '[]') AS variants
    FROM product p
    LEFT JOIN variant v ON v.product_id = p.id
    LEFT JOIN inventory_level il ON il.variant_id = v.id
`;

/** The catalogue is ordered by editorial position and never by price or name. */
export async function listProducts({ pageSize, cursor }) {
  const params = [];
  let where = "WHERE p.kind <> 'protection'";
  if (cursor) {
    params.push(cursor.position, cursor.id);
    where += ` AND (p.position, p.id) > ($${params.length - 1}, $${params.length})`;
  }
  params.push(pageSize + 1);
  const { rows } = await query(
    `${SELECT_PRODUCTS} ${where}
     GROUP BY p.id
     ORDER BY p.position, p.id
     LIMIT $${params.length}`,
    params,
  );
  return rows.map(shape);
}

export async function getProduct(handle) {
  const { rows } = await query(
    `${SELECT_PRODUCTS} WHERE p.handle = $1 GROUP BY p.id`,
    [handle],
  );
  if (!rows[0]) return null;
  const product = shape(rows[0]);
  const { rows: blocks } = await query(
    'SELECT kind, position, payload FROM product_block WHERE product_id = $1 ORDER BY position',
    [product.id],
  );
  product.blocks = blocks;
  return product;
}

export function withAvailability(product) {
  return {
    ...product,
    availability: productAvailability(product),
    variants: product.variants.map((v) => ({ ...v, availability: availabilityFor(product, v) })),
  };
}

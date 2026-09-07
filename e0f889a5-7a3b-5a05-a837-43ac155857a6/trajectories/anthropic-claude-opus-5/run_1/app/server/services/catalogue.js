import { many, one } from '../db.js';
import { notFound } from '../lib/errors.js';

export const PROTECTION_HANDLE = 'protection';

// Availability is a state, not a boolean.
export function availabilityFor({ productStatus, available, inventoryPolicy = 'deny' }) {
  if (productStatus === 'discontinued') return { state: 'discontinued', purchasable: false, label: 'Discontinued' };
  if (available <= 0 && inventoryPolicy === 'deny') return { state: 'sold_out', purchasable: false, label: 'Sold out' };
  if (available <= 10) return { state: 'low', purchasable: true, label: `Only ${available} left`, remaining: available };
  return { state: 'available', purchasable: true, label: 'Available' };
}

function shapeVariant(row, productStatus) {
  const available = Number(row.available ?? 0);
  return {
    id: Number(row.variant_id),
    sku: row.sku,
    title: row.variant_title,
    option_value: row.option_value,
    price_minor: Number(row.price_minor),
    currency: row.currency,
    position: Number(row.position),
    available,
    committed: Number(row.committed ?? 0),
    inventory_policy: row.inventory_policy,
    availability: availabilityFor({ productStatus, available, inventoryPolicy: row.inventory_policy }),
  };
}

function shapeProduct(rows) {
  const head = rows[0];
  const variants = rows
    .filter((r) => r.variant_id)
    .sort((a, b) => Number(a.position) - Number(b.position) || Number(a.variant_id) - Number(b.variant_id))
    .map((r) => shapeVariant(r, head.status));
  const prices = variants.map((v) => v.price_minor);
  const purchasable = variants.filter((v) => v.availability.purchasable);
  let availability;
  if (head.status === 'discontinued') availability = { state: 'discontinued', label: 'Discontinued' };
  else if (!purchasable.length) availability = { state: 'sold_out', label: 'Sold out' };
  else {
    const lowest = purchasable.reduce((m, v) => Math.min(m, v.available), Infinity);
    availability = lowest <= 10 ? { state: 'low', label: `Only ${lowest} left`, remaining: lowest } : { state: 'available', label: 'Available' };
  }

  return {
    id: Number(head.id),
    handle: head.handle,
    title: head.title,
    subtitle: head.subtitle,
    kind: head.kind,
    status: head.status,
    support_until: head.support_until ? String(head.support_until).slice(0, 10) : null,
    position: Number(head.position),
    price_minor: prices.length ? Math.min(...prices) : 0,
    price_varies: prices.length > 1 && Math.min(...prices) !== Math.max(...prices),
    variants,
    availability,
  };
}

const PRODUCT_SELECT = `
  SELECT p.id, p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until, p.position,
         v.id AS variant_id, v.sku, v.title AS variant_title, v.option_value, v.price_minor,
         v.currency, v.position AS position, v.inventory_policy,
         i.available, i.committed
  FROM product p
  LEFT JOIN variant v ON v.product_id = p.id
  LEFT JOIN inventory_level i ON i.variant_id = v.id
`;

export async function listProducts({ pageSize = 20, cursor = null } = {}) {
  // Ordered by the editorial position, never by price or name.
  const params = [pageSize + 1];
  let where = `WHERE p.kind <> 'protection'`;
  if (cursor) {
    params.push(cursor.position, cursor.id);
    where += ` AND (p.position, p.id) > ($2, $3)`;
  }
  const heads = await many(
    `SELECT p.id, p.position FROM product p ${where} ORDER BY p.position, p.id LIMIT $1`,
    params,
  );
  const hasMore = heads.length > pageSize;
  const wanted = hasMore ? heads.slice(0, pageSize) : heads;
  if (!wanted.length) return { data: [], next_cursor: null, has_more: false };

  const rows = await many(`${PRODUCT_SELECT} WHERE p.id = ANY($1::bigint[]) ORDER BY p.position, p.id, v.position, v.id`,
    [wanted.map((h) => Number(h.id))]);

  const byProduct = new Map();
  for (const r of rows) {
    if (!byProduct.has(Number(r.id))) byProduct.set(Number(r.id), []);
    byProduct.get(Number(r.id)).push(r);
  }
  const data = wanted.map((h) => shapeProduct(byProduct.get(Number(h.id))));
  const last = wanted[wanted.length - 1];
  return {
    data,
    next_cursor: hasMore ? { position: Number(last.position), id: Number(last.id) } : null,
    has_more: hasMore,
  };
}

export async function getProduct(handle) {
  const rows = await many(`${PRODUCT_SELECT} WHERE p.handle = $1 ORDER BY v.position, v.id`, [handle]);
  if (!rows.length) throw notFound('That product does not exist.', 'product_not_found');
  const product = shapeProduct(rows);
  const blocks = await many(
    'SELECT id, kind, position, payload FROM product_block WHERE product_id = $1 ORDER BY position, id',
    [product.id],
  );
  product.blocks = blocks.map((b) => ({ id: Number(b.id), kind: b.kind, position: Number(b.position), payload: b.payload }));
  return product;
}

export async function variantBySku(sku) {
  return one(
    `SELECT v.id, v.sku, v.title, v.option_value, v.price_minor, v.currency, v.inventory_policy,
            p.id AS product_id, p.handle, p.title AS product_title, p.status AS product_status, p.kind,
            i.available, i.committed
     FROM variant v
     JOIN product p ON p.id = v.product_id
     LEFT JOIN inventory_level i ON i.variant_id = v.id
     WHERE upper(v.sku) = upper($1)`,
    [sku],
  );
}

import { db } from './db.js';
import { errors } from './errors.js';
import { numericCursor } from './pagination.js';

export async function listProducts({ pageSize = 20, cursor, includeHidden = false }) {
  const sql = db();
  const offsetKey = numericCursor(cursor);
  const rows = await sql`
    SELECT p.id, p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until, p.position
    FROM product p
    WHERE (${includeHidden} OR p.kind <> 'protection')
      AND (${offsetKey}::int IS NULL OR p.position < ${offsetKey})
    ORDER BY p.position DESC
    LIMIT ${pageSize + 1}
  `;
  const hasMore = rows.length > pageSize;
  const data = rows.slice(0, pageSize);
  const ids = data.map((r) => r.id);
  const variants = ids.length
    ? await sql`
        SELECT v.id, v.product_id, v.sku, v.title, v.option_value, v.price_minor, v.currency, v.position,
               i.available, i.committed, v.inventory_policy
        FROM variant v
        JOIN inventory_level i ON i.variant_id = v.id
        WHERE v.product_id IN ${sql(ids)}
        ORDER BY v.position ASC
      `
    : [];
  const byProduct = new Map();
  for (const v of variants) {
    if (!byProduct.has(v.productId)) byProduct.set(v.productId, []);
    byProduct.get(v.productId).push({
      id: v.id, sku: v.sku, title: v.title, option_value: v.optionValue,
      price_minor: v.priceMinor, currency: v.currency, position: v.position,
      available: v.available, committed: v.committed, inventory_policy: v.inventoryPolicy
    });
  }
  return {
    data: data.map((p) => ({
      handle: p.handle, title: p.title, subtitle: p.subtitle, kind: p.kind,
      status: p.status, support_until: p.supportUntil,
      variants: byProduct.get(p.id) || [],
      availability: productAvailability(p, byProduct.get(p.id) || [])
    })),
    hasMore,
    nextCursor: hasMore ? String(data[data.length - 1].position) : null
  };
}

function productAvailability(product, variants) {
  if (product.status === 'discontinued') {
    return { state: 'discontinued', label: 'Discontinued', buyable: false };
  }
  const inStock = variants.some((v) => v.available > 0);
  if (!inStock) return { state: 'sold_out', label: 'Sold out', buyable: false };
  const lowest = Math.min(...variants.filter((v) => v.available > 0).map((v) => v.available));
  return {
    state: 'available', label: lowest <= 10 ? `Only ${lowest} left` : 'Available', buyable: true,
    from_price_minor: Math.min(...variants.map((v) => v.priceMinor))
  };
}

export async function getProduct(handle, { variantSku } = {}) {
  const sql = db();
  const [product] = await sql`
    SELECT id, handle, title, subtitle, kind, status, support_until, position
    FROM product WHERE handle = ${handle} LIMIT 1
  `;
  if (!product) return null;
  const variants = await sql`
    SELECT v.id, v.product_id, v.sku, v.title, v.option_value, v.price_minor, v.currency, v.position,
           i.available, i.committed, v.inventory_policy
    FROM variant v
    JOIN inventory_level i ON i.variant_id = v.id
    WHERE v.product_id = ${product.id}
    ORDER BY v.position ASC
  `;
  const blocks = await sql`
    SELECT kind, position, payload FROM product_block
    WHERE product_id = ${product.id} ORDER BY position ASC
  `;
  const shapedVariants = variants.map((v) => ({
    id: v.id, sku: v.sku, title: v.title, option_value: v.optionValue,
    price_minor: v.priceMinor, currency: v.currency, position: v.position,
    available: v.available, committed: v.committed, inventory_policy: v.inventoryPolicy
  }));
  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    subtitle: product.subtitle,
    kind: product.kind,
    status: product.status,
    support_until: product.supportUntil,
    availability: productAvailability(product, shapedVariants),
    variants: shapedVariants,
    blocks: blocks.map((b) => ({ kind: b.kind, position: b.position, payload: b.payload }))
  };
}

export function variantAvailability(variant, product) {
  if (product.status === 'discontinued') {
    return { state: 'discontinued', label: 'Discontinued', buyable: false };
  }
  if (variant.available <= 0) {
    return { state: 'sold_out', label: 'Sold out', buyable: false };
  }
  return {
    state: 'available',
    label: variant.available <= 10 ? `Only ${variant.available} left` : 'Available',
    buyable: true
  };
}

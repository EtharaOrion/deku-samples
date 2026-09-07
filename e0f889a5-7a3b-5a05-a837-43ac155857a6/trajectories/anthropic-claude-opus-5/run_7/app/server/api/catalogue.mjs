import { Hono } from 'hono';
import { many, one } from '../lib/db.mjs';
import { notFound } from '../lib/errors.mjs';
import { pageSizeFrom, decodeCursor, buildPage } from '../lib/pagination.mjs';

const app = new Hono();

/** Availability is a state, not a boolean. */
export function availabilityFor(product, variants) {
  if (product.status === 'discontinued') {
    return { state: 'discontinued', label: 'Discontinued', purchasable: false };
  }
  const total = variants.reduce((s, v) => s + (v.available || 0), 0);
  if (total <= 0) return { state: 'sold_out', label: 'Sold out', purchasable: false };
  if (total <= 10) return { state: 'low', label: `Only ${total} left`, purchasable: true };
  return { state: 'available', label: 'Available', purchasable: true };
}

export function variantAvailability(product, variant) {
  if (product.status === 'discontinued') {
    return { state: 'discontinued', label: 'Discontinued', purchasable: false };
  }
  const n = variant.available || 0;
  if (n <= 0) return { state: 'sold_out', label: 'Sold out', purchasable: false };
  if (n <= 10) return { state: 'low', label: `Only ${n} left`, purchasable: true };
  return { state: 'available', label: 'Available', purchasable: true };
}

async function variantsFor(productIds) {
  if (!productIds.length) return new Map();
  const rows = await many(
    `SELECT v.id, v.product_id, v.sku, v.title, v.option_value, v.price_minor, v.currency,
            v.position, v.inventory_policy, COALESCE(il.available,0) AS available,
            COALESCE(il.committed,0) AS committed
       FROM variant v LEFT JOIN inventory_level il ON il.variant_id = v.id
      WHERE v.product_id = ANY($1::bigint[])
      ORDER BY v.position, v.id`,
    [productIds],
  );
  const map = new Map();
  for (const r of rows) {
    const key = Number(r.product_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      id: Number(r.id),
      sku: r.sku,
      title: r.title,
      option_value: r.option_value,
      price_minor: r.price_minor,
      currency: r.currency,
      inventory_policy: r.inventory_policy,
      available: r.available,
    });
  }
  return map;
}

function shapeProduct(p, variants) {
  const availability = availabilityFor(p, variants);
  const prices = variants.map((v) => v.price_minor);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;
  return {
    handle: p.handle,
    title: p.title,
    subtitle: p.subtitle,
    kind: p.kind,
    status: p.status,
    support_until: p.support_until,
    position: p.position,
    price_minor: min,
    price_from: min !== max, // a product whose variants differ in price reads "From "
    variants: variants.map((v) => ({ ...v, availability: variantAvailability(p, v) })),
    availability,
  };
}

// The catalogue, ordered by editorial position and never by price or name.
app.get('/products', async (c) => {
  const pageSize = pageSizeFrom(c);
  const cursor = decodeCursor(c.req.query('cursor'));

  const rows = await many(
    `SELECT * FROM product
      WHERE kind <> 'protection'
        AND ($1::int IS NULL OR (position, id) > ($1::int, $2::bigint))
      ORDER BY position, id
      LIMIT $3`,
    [cursor?.position ?? null, cursor?.id ?? 0, pageSize + 1],
  );

  const page = buildPage(rows, pageSize, (r) => ({ position: r.position, id: Number(r.id) }));
  const byProduct = await variantsFor(page.data.map((p) => Number(p.id)));

  return c.json({
    data: page.data.map((p) => shapeProduct(p, byProduct.get(Number(p.id)) || [])),
    next_cursor: page.next_cursor,
    has_more: page.has_more,
  });
});

app.get('/products/:handle', async (c) => {
  const handle = c.req.param('handle');
  const product = await one(`SELECT * FROM product WHERE handle = $1 AND kind <> 'protection'`, [handle]);
  if (!product) throw notFound('That product does not exist.');

  const byProduct = await variantsFor([Number(product.id)]);
  const variants = byProduct.get(Number(product.id)) || [];
  const blocks = await many(
    'SELECT kind, position, payload FROM product_block WHERE product_id = $1 ORDER BY position',
    [product.id],
  );

  // A parameter naming a variant that does not exist renders the default.
  const asked = c.req.query('variant');
  const selected = variants.find((v) => v.sku === asked) || variants[0] || null;

  return c.json({
    ...shapeProduct(product, variants),
    blocks: blocks.map((b) => ({ kind: b.kind, payload: b.payload })),
    selected_sku: selected ? selected.sku : null,
    variant_known: Boolean(asked && variants.some((v) => v.sku === asked)),
  });
});

export default app;

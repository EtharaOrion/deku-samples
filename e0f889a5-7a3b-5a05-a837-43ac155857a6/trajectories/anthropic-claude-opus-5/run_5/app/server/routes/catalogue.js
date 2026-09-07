import { Hono } from 'hono';
import { listProducts, getProductByHandle } from '../lib/catalogue.js';
import { notFound } from '../lib/errors.js';
import { pageSizeFrom, decodeCursor, buildPage } from '../lib/pagination.js';

const routes = new Hono();

routes.get('/products', async (c) => {
  const pageSize = pageSizeFrom(c);
  const cursor = decodeCursor(c.req.query('cursor'));
  const all = await listProducts();
  // Ordered by the editorial position and never by price or name.
  const startIndex = cursor
    ? all.findIndex((p) => p.position > cursor.position || (p.position === cursor.position && Number(p.id) > Number(cursor.id)))
    : 0;
  const from = startIndex === -1 ? all.length : startIndex;
  const slice = all.slice(from, from + pageSize + 1);
  const page = buildPage(slice, pageSize, (p) => ({ position: p.position, id: Number(p.id) }));
  return c.json({
    ...page,
    data: page.data.map(publicProduct),
  });
});

routes.get('/products/:handle', async (c) => {
  const product = await getProductByHandle(c.req.param('handle'));
  if (!product || product.kind === 'protection') {
    throw notFound('That product does not exist.', 'product_not_found');
  }
  const requested = c.req.query('variant');
  // A parameter naming a variant that does not exist renders the default.
  const selected =
    product.variants.find((v) => v.sku === requested) ?? product.variants[0] ?? null;
  return c.json({
    ...publicProduct(product),
    blocks: product.blocks,
    selected_sku: selected?.sku ?? null,
    variant_param_valid: Boolean(requested && product.variants.some((v) => v.sku === requested)),
  });
});

function publicProduct(p) {
  return {
    handle: p.handle,
    title: p.title,
    subtitle: p.subtitle,
    kind: p.kind,
    status: p.status,
    support_until: p.support_until,
    position: p.position,
    from_price_minor: p.from_price_minor,
    price_is_from: p.price_is_from,
    availability: p.availability,
    variants: p.variants.map((v) => ({
      sku: v.sku,
      title: v.title,
      option_value: v.option_value,
      price_minor: v.price_minor,
      currency: v.currency,
      available: v.available,
      availability: v.availability,
    })),
  };
}

export default routes;

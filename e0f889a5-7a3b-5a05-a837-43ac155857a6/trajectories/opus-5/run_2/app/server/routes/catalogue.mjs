import { Hono } from 'hono';
import { listProducts, getProduct, withAvailability } from '../lib/catalogue.mjs';
import { pageSizeFrom, decodeCursor, paginate } from '../lib/pagination.mjs';
import { notFound } from '../lib/errors.mjs';

const app = new Hono();

app.get('/', async (c) => {
  const pageSize = pageSizeFrom(c);
  const cursor = decodeCursor(c.req.query('cursor'));
  const rows = await listProducts({ pageSize, cursor });
  const page = paginate(rows, pageSize, (last) => ({ position: last.position, id: last.id }));
  return c.json({ ...page, data: page.data.map(withAvailability) });
});

app.get('/:handle', async (c) => {
  const product = await getProduct(c.req.param('handle'));
  if (!product || product.kind === 'protection') {
    throw notFound('That product does not exist.');
  }
  const shaped = withAvailability(product);
  // A parameter naming a variant that does not exist renders the default.
  const requested = c.req.query('variant');
  const selected = shaped.variants.find((v) => v.sku === requested) || shaped.variants[0] || null;
  return c.json({ ...shaped, selected_sku: selected ? selected.sku : null });
});

export default app;

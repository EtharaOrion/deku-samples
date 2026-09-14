import type { Hono } from 'hono';
import { listProducts, productByHandle, productView, variantsForProducts, variantView, availabilityOf } from '../catalog.ts';
import { parsePagination, listResponse, clientError, ApiEnv } from './util.ts';

export function registerCatalogRoutes(app: Hono<ApiEnv>) {
  app.get('/api/products', async (c) => {
    let page;
    try { page = parsePagination(c); } catch (err: any) { return clientError(c, 400, 'page_size_invalid', err.message); }
    const { rows, hasMore, nextCursor } = await listProducts(page.pageSize, page.cursor);
    const variants = await variantsForProducts(rows.map((r: any) => r.id));
    const data = [];
    for (const row of rows) {
      const list = variants.get(String(row.id)) || [];
      const totalAvailable = list.reduce((sum: number, v: any) => sum + Number(v.available ?? 0), 0);
      data.push({
        handle: row.handle,
        title: row.title,
        subtitle: row.subtitle,
        kind: row.kind,
        status: row.status,
        support_until: row.support_until ? new Date(row.support_until).toISOString().slice(0, 10) : null,
        position: Number(row.position),
        variants: list.map((v: any) => ({
          sku: v.sku,
          title: v.title,
          option_value: v.option_value,
          price_minor: Number(v.price_minor),
          available: Number(v.available ?? 0),
          inventory_policy: v.inventory_policy,
        })),
        availability: availabilityOf(row, totalAvailable),
      });
    }
    return listResponse(c, data, nextCursor, hasMore);
  });

  app.get('/api/products/:handle', async (c) => {
    const handle = c.req.param('handle');
    const variantParam = c.req.query('variant');
    const row = await productByHandle(handle);
    if (!row) return clientError(c, 404, 'not_found', 'That page does not exist.');
    const view = await productView(row, true);
    let selected = view.variants[0]?.sku ?? null;
    if (variantParam) {
      const match = view.variants.find((v) => v.sku === variantParam);
      if (match) selected = match.sku;
    }
    return c.json({ product: view, selected_variant: selected });
  });
}

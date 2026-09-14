import type { Hono } from 'hono';
import { listReleases, releaseView, releaseByVersion } from '../releases.ts';
import { parsePagination, listResponse, clientError, ApiEnv } from './util.ts';

export function registerReleaseRoutes(app: Hono<ApiEnv>) {
  app.get('/api/releases', async (c) => {
    let page;
    try { page = parsePagination(c); } catch (err: any) { return clientError(c, 400, 'page_size_invalid', err.message); }
    const { rows, hasMore, nextCursor } = await listReleases(page.pageSize, page.cursor);
    return listResponse(c, rows.map(releaseView), nextCursor, hasMore);
  });

  app.get('/api/releases/:version', async (c) => {
    const row = await releaseByVersion(c.req.param('version'));
    if (!row) return clientError(c, 404, 'not_found', 'That page does not exist.');
    return c.json({ release: releaseView(row) });
  });
}

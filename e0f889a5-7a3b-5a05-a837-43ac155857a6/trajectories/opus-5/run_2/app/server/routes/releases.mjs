import { Hono } from 'hono';
import { query } from '../lib/db.mjs';
import { pageSizeFrom, decodeCursor, paginate } from '../lib/pagination.mjs';
import { notFound } from '../lib/errors.mjs';

const app = new Hono();

// The four ordered groups, and none invented beyond those four.
export const NOTE_GROUPS = ['Newly Added', 'Improvements', 'Bug Fixes', 'Known Issues'];

const shape = (r) => ({
  version: r.version,
  build: r.build,
  released_on: r.released_on.toISOString().slice(0, 10),
  channel: r.channel,
  artifact_name: r.artifact_name,
  size_bytes: Number(r.size_bytes),
  sha256: r.sha256,
  description: r.description,
  notes: NOTE_GROUPS.reduce((acc, group) => {
    const items = r.notes?.[group];
    if (Array.isArray(items) && items.length) acc[group] = items;
    return acc;
  }, {}),
});

/** The archive orders by build descending and never by release date. */
app.get('/', async (c) => {
  const pageSize = pageSizeFrom(c);
  const cursor = decodeCursor(c.req.query('cursor'));
  const params = [];
  let where = '';
  if (cursor) {
    params.push(cursor.build);
    where = `WHERE build < $${params.length}`;
  }
  params.push(pageSize + 1);
  const { rows } = await query(
    `SELECT * FROM app_release ${where} ORDER BY build DESC LIMIT $${params.length}`,
    params,
  );
  const page = paginate(rows, pageSize, (last) => ({ build: last.build }));
  return c.json({ ...page, data: page.data.map(shape) });
});

app.get('/:version', async (c) => {
  const { rows } = await query('SELECT * FROM app_release WHERE version = $1', [c.req.param('version')]);
  if (!rows[0]) throw notFound('That release does not exist.');
  return c.json(shape(rows[0]));
});

export default app;

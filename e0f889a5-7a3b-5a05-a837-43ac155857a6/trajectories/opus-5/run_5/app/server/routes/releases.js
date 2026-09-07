import { Hono } from 'hono';
import { many, one } from '../lib/db.js';
import { pageSizeFrom, decodeCursor, buildPage } from '../lib/pagination.js';
import { notFound } from '../lib/errors.js';
import { isoDate } from '../lib/catalogue.js';

const routes = new Hono();

// The four ordered groups, and none invented beyond them.
export const NOTE_GROUPS = ['Newly Added', 'Improvements', 'Bug Fixes', 'Known Issues'];

function shapeRelease(r) {
  const notes = r.notes && typeof r.notes === 'object' ? r.notes : {};
  return {
    version: r.version,
    build: Number(r.build),
    released_on: isoDate(r.released_on),
    channel: r.channel,
    artifact_name: r.artifact_name,
    size_bytes: Number(r.size_bytes),
    sha256: r.sha256,
    description: r.description,
    // Always in the fixed order, each group optional.
    notes: NOTE_GROUPS.filter((g) => Array.isArray(notes[g]) && notes[g].length).map((g) => ({
      group: g,
      items: notes[g],
    })),
  };
}

routes.get('/', async (c) => {
  const pageSize = pageSizeFrom(c);
  const cursor = decodeCursor(c.req.query('cursor'));
  const params = [pageSize + 1];
  let keyset = '';
  if (cursor?.build !== undefined) {
    params.push(cursor.build);
    keyset = ` WHERE build < $${params.length}`;
  }
  // Sort by build descending; released_on is not a sort key, so 1.4.3 and 1.4.2
  // sharing a date still order deterministically.
  const rows = await many(
    `SELECT * FROM app_release${keyset} ORDER BY build DESC LIMIT $1`,
    params,
  );
  const page = buildPage(rows, pageSize, (r) => ({ build: Number(r.build) }));
  return c.json({ ...page, data: page.data.map(shapeRelease) });
});

routes.get('/:version', async (c) => {
  const row = await one(`SELECT * FROM app_release WHERE version = $1`, [c.req.param('version')]);
  if (!row) throw notFound('That release does not exist.', 'release_not_found');
  return c.json(shapeRelease(row));
});

export { shapeRelease };
export default routes;

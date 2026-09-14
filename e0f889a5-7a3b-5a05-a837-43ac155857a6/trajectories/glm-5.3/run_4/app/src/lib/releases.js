import { query, one } from './db.js';
import { encodeCursor, decodeCursor } from './pagination.js';

export const NOTE_GROUP_ORDER = ['Newly Added', 'Improvements', 'Bug Fixes', 'Known Issues'];

export async function releasesPage(pageSize, cursor) {
  const after = decodeCursor(cursor);
  const params = [];
  let where = '';
  if (after !== null) {
    params.push(Number(after));
    where = ` WHERE build < $${params.length}`;
  }
  params.push(pageSize + 1);
  const r = await query(
    `SELECT * FROM app_release${where} ORDER BY build DESC LIMIT $${params.length}`,
    params
  );
  const hasMore = r.rows.length > pageSize;
  const page = hasMore ? r.rows.slice(0, pageSize) : r.rows;
  const last = page[page.length - 1];
  return {
    data: page.map(serializeRelease),
    has_more: hasMore,
    next_cursor: hasMore && last ? encodeCursor(last.build) : null,
  };
}

export async function listReleases({ limit = 100 } = {}) {
  const r = await query(`SELECT * FROM app_release ORDER BY build DESC LIMIT $1`, [limit]);
  return r.rows;
}

export async function releaseByVersion(version) {
  return one(`SELECT * FROM app_release WHERE version = $1`, [version]);
}

export function serializeRelease(r) {
  return {
    id: r.id,
    version: r.version,
    build: r.build,
    released_on: r.released_on.toISOString().slice(0, 10),
    channel: r.channel,
    artifact_name: r.artifact_name,
    size_bytes: Number(r.size_bytes),
    sha256: r.sha256,
    description: r.description,
    notes: normaliseNotes(r.notes),
  };
}

/** notes must carry only the four ordered groups, each optional. */
export function normaliseNotes(notes) {
  const arr = Array.isArray(notes) ? notes : [];
  return NOTE_GROUP_ORDER.map((group) => {
    const found = arr.find((g) => g && (g.group === group || g.title === group));
    return { group, items: found ? found.items || [] : [] };
  }).filter((g) => g.items.length > 0);
}

export function latestRelease() {
  return one(`SELECT * FROM app_release ORDER BY build DESC LIMIT 1`);
}

export async function releasesForArchive({ pageSize = 100 } = {}) {
  return listReleases({ limit: pageSize });
}

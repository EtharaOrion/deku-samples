import { q as query } from './server_SMyiD-DF.mjs';

// The four groups, in this fixed order, and none invented beyond them.
const NOTE_GROUPS = ['Newly Added', 'Improvements', 'Bug Fixes', 'Known Issues'];
function shape(row) {
  const notes = row.notes || {};
  return {
    version: row.version,
    build: Number(row.build),
    released_on: row.released_on,
    channel: row.channel,
    artifact_name: row.artifact_name,
    size_bytes: Number(row.size_bytes),
    sha256: row.sha256,
    description: row.description,
    notes: NOTE_GROUPS.filter(g => Array.isArray(notes[g]) && notes[g].length).map(g => ({
      group: g,
      items: notes[g]
    }))
  };
}

/**
 * Ordered by build descending and never by release date: 1.4.3 and 1.4.2 share
 * a release date and must still order deterministically.
 */
async function listReleases({
  afterBuild = null,
  limit = 21
} = {}) {
  const params = [];
  let where = '';
  if (afterBuild !== null) {
    params.push(afterBuild);
    where = `WHERE build < $${params.length}`;
  }
  // A null limit reads the whole archive, which is what the downloads page
  // needs; the API always passes a page size.
  let tail = '';
  if (limit !== null) {
    params.push(limit);
    tail = ` LIMIT $${params.length}`;
  }
  const {
    rows
  } = await query(`SELECT * FROM app_release ${where} ORDER BY build DESC${tail}`, params);
  return rows.map(shape);
}
async function getRelease(version) {
  const {
    rows
  } = await query(`SELECT * FROM app_release WHERE version = $1`, [version]);
  return rows.length ? shape(rows[0]) : null;
}
async function newestRelease() {
  const {
    rows
  } = await query(`SELECT * FROM app_release ORDER BY build DESC LIMIT 1`);
  return rows.length ? shape(rows[0]) : null;
}

export { getRelease as g, listReleases as l, newestRelease as n };

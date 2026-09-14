import { q } from "./pool_DifDkjYx.mjs";
function releaseView(row) {
  return {
    version: row.version,
    build: Number(row.build),
    released_on: new Date(row.released_on).toISOString().slice(0, 10),
    channel: row.channel,
    artifact_name: row.artifact_name,
    size_bytes: Number(row.size_bytes),
    sha256: row.sha256,
    description: row.description ?? null,
    notes: typeof row.notes === "string" ? JSON.parse(row.notes) : row.notes ?? {}
  };
}
async function listReleases(limit, cursor) {
  const params = [];
  let where = "TRUE";
  if (cursor) {
    params.push(Number(cursor));
    where = `build < $${params.length}`;
  }
  params.push(limit + 1);
  const res = await q(
    `SELECT * FROM app_release WHERE ${where} ORDER BY build DESC LIMIT $${params.length}`,
    params
  );
  const hasMore = res.rows.length > limit;
  const rows = hasMore ? res.rows.slice(0, limit) : res.rows;
  return { rows, hasMore, nextCursor: hasMore && rows.length > 0 ? String(rows[rows.length - 1].build) : null };
}
async function releaseByVersion(version) {
  const res = await q(`SELECT * FROM app_release WHERE version = $1`, [version]);
  return res.rows[0] ?? null;
}
async function latestRelease() {
  const res = await q(`SELECT * FROM app_release ORDER BY build DESC LIMIT 1`);
  return res.rows[0] ?? null;
}
function groupOrder() {
  return ["Newly Added", "Improvements", "Bug Fixes", "Known Issues"];
}
function orderedNotes(notes) {
  return groupOrder().filter((g) => Array.isArray(notes?.[g]) && notes[g].length > 0).map((g) => ({ title: g, items: notes[g] }));
}
export {
  listReleases as a,
  releaseByVersion as b,
  latestRelease as l,
  orderedNotes as o,
  releaseView as r
};

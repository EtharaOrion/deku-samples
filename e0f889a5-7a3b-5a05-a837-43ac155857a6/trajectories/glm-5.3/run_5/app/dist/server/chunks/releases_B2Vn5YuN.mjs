import { q, o as one } from "./db_C-9WqIXq.mjs";
function parse(v) {
  return v.trim().split(".").map((p) => Number(p) || 0);
}
function compare(a, b) {
  const A = parse(a);
  const B = parse(b);
  const len = Math.max(A.length, B.length);
  for (let i = 0; i < len; i++) {
    const x = A[i] ?? 0;
    const y = B[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
const NOTE_GROUPS = ["Newly Added", "Improvements", "Bug Fixes", "Known Issues"];
async function listReleases() {
  const rows = await q(`SELECT * FROM app_release ORDER BY build DESC`);
  return rows.map(toReleaseView);
}
async function getRelease(version) {
  const row = await one(`SELECT * FROM app_release WHERE version = $1`, [version]);
  return row ? toReleaseView(row) : null;
}
function toReleaseView(r) {
  const notes = [];
  for (const group of NOTE_GROUPS) {
    const items = Array.isArray(r.notes) ? r.notes.find((n) => n.group === group)?.items ?? [] : [];
    if (items.length > 0) notes.push({ group, items });
  }
  return {
    version: r.version,
    build: Number(r.build),
    released_on: String(r.released_on).slice(0, 10),
    channel: r.channel,
    artifact_name: r.artifact_name,
    size_bytes: Number(r.size_bytes),
    sha256: r.sha256,
    description: r.description ?? null,
    notes
  };
}
async function firmwareForProduct(productHandleOrModel, opts = {}) {
  const rows = await q(
    `SELECT f.*, p.title AS product_title, p.handle AS product_handle
       FROM firmware f JOIN product p ON p.id = f.product_id
      WHERE p.handle = $1 OR p.title = $1
      ORDER BY f.build DESC`,
    [productHandleOrModel]
  );
  const channel = opts.channel ?? null;
  const entries = rows.filter((r) => channel ? r.channel === channel : r.channel !== "internal" && r.channel !== "yanked");
  return { product: rows[0]?.product_title ?? productHandleOrModel, entries };
}
async function latestFirmware(productHandle) {
  const { entries } = await firmwareForProduct(productHandle, { channel: "general" });
  return entries[0] ?? null;
}
function meetsMinimum(reported, minimum) {
  if (!minimum) return true;
  if (!reported) return false;
  return compare(reported, minimum) >= 0;
}
export {
  NOTE_GROUPS,
  firmwareForProduct,
  getRelease,
  latestFirmware,
  listReleases,
  meetsMinimum
};

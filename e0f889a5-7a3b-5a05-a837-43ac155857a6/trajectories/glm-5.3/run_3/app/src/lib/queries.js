import pg from 'pg';

let pool = null;
export function db() {
  if (!pool) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || process.env.DB_URL, max: 10, idleTimeoutMillis: 30000 });
    pool.on('error', (e) => console.error(JSON.stringify({ level: 'error', scope: 'pg', message: e.message })));
  }
  return pool;
}
export const rows = async (text, params) => (await db().query(text, params)).rows;
export const one = async (text, params) => (await db().query(text, params)).rows[0] || null;

export async function catalogueProducts() {
  const ps = await rows(`SELECT * FROM product WHERE kind <> 'protection' ORDER BY position ASC`);
  const out = [];
  for (const p of ps) {
    const vs = await rows(
      `SELECT v.sku, v.title, v.option_value, v.price_minor, v.currency, v.position, il.available
         FROM variant v LEFT JOIN inventory_level il ON il.variant_id = v.id
        WHERE v.product_id = $1 ORDER BY v.position ASC`, [p.id]);
    out.push({ ...p, variants: vs.map((v) => ({ ...v, price_minor: Number(v.price_minor), available: v.available === null ? null : Number(v.available) })) });
  }
  return out;
}

export async function productByHandle(handle) {
  const p = await one(`SELECT * FROM product WHERE handle=$1`, [handle]);
  if (!p) return null;
  const vs = await rows(
    `SELECT v.*, il.available FROM variant v LEFT JOIN inventory_level il ON il.variant_id=v.id
      WHERE v.product_id=$1 ORDER BY v.position ASC`, [p.id]);
  const blocks = await rows(`SELECT kind, payload, position FROM product_block WHERE product_id=$1 ORDER BY position ASC`, [p.id]);
  const fw = await rows(
    `SELECT version, build, channel, min_firmware, min_app_version, size_bytes, sha256 FROM firmware
      WHERE product_id=$1 AND channel='general' ORDER BY build DESC`, [p.id]);
  return {
    ...p,
    variants: vs.map((v) => ({ sku: v.sku, title: v.title, option_value: v.option_value, price_minor: Number(v.price_minor), currency: v.currency, available: v.available === null ? null : Number(v.available), inventory_policy: v.inventory_policy })),
    blocks: blocks.map((b) => ({ kind: b.kind, payload: b.payload, position: b.position })),
    firmware: fw.map((f) => ({ ...f, size_bytes: Number(f.size_bytes) }))
  };
}

export const availabilityOf = (p) => {
  if (p.status === 'discontinued') return { state: 'discontinued', support_until: p.support_until };
  const total = p.variants.reduce((s, v) => s + (v.available || 0), 0);
  if (total <= 0) return { state: 'sold_out' };
  return { state: 'available' };
};

export async function releasesList() {
  return (await rows(`SELECT * FROM app_release ORDER BY build DESC`))
    .map((r) => ({ ...r, size_bytes: Number(r.size_bytes) }));
}

export async function latestRelease() {
  const r = await one(`SELECT * FROM app_release ORDER BY build DESC LIMIT 1`);
  return r ? { ...r, size_bytes: Number(r.size_bytes) } : null;
}

export async function firmwareFor(handle) {
  return (await rows(
    `SELECT f.*, p.handle AS product_handle, p.title AS product_title FROM firmware f JOIN product p ON p.id=f.product_id
      WHERE p.handle=$1 AND f.channel='general' ORDER BY f.build DESC`, [handle]))
    .map((f) => ({ ...f, size_bytes: Number(f.size_bytes) }));
}

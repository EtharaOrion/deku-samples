import { q } from "./pool_DifDkjYx.mjs";
function availabilityOf(product, available) {
  if (product.status === "discontinued") {
    return { state: "discontinued", label: "Discontinued", buyable: false };
  }
  if (available <= 0) return { state: "sold_out", label: "Sold out", buyable: false };
  if (available <= 10) return { state: "low", label: `Only ${available} left`, buyable: true };
  return { state: "available", label: null, buyable: true };
}
async function listProducts(limit, cursor) {
  const params = [];
  let where = `p.kind <> 'protection' AND p.status IN ('active','discontinued')`;
  if (cursor) {
    params.push(Number(cursor));
    where += ` AND p.position > $${params.length}`;
  }
  params.push(limit + 1);
  const res = await q(
    `SELECT p.* FROM product p WHERE ${where} ORDER BY p.position ASC LIMIT $${params.length}`,
    params
  );
  const hasMore = res.rows.length > limit;
  const rows = hasMore ? res.rows.slice(0, limit) : res.rows;
  return { rows, hasMore, nextCursor: hasMore && rows.length > 0 ? String(rows[rows.length - 1].position) : null };
}
async function variantsForProducts(productIds) {
  if (productIds.length === 0) return /* @__PURE__ */ new Map();
  const res = await q(
    `SELECT v.*, il.available, il.committed
       FROM variant v LEFT JOIN inventory_level il ON il.variant_id = v.id
      WHERE v.product_id = ANY($1::bigint[])
      ORDER BY v.position ASC`,
    [productIds]
  );
  const map = /* @__PURE__ */ new Map();
  for (const row of res.rows) {
    const list = map.get(String(row.product_id)) || [];
    list.push(row);
    map.set(String(row.product_id), list);
  }
  return map;
}
async function productView(row, withBlocks = false) {
  const variants = await q(
    `SELECT v.*, il.available, il.committed FROM variant v
       LEFT JOIN inventory_level il ON il.variant_id = v.id
      WHERE v.product_id = $1 ORDER BY v.position ASC`,
    [row.id]
  );
  const totalAvailable = variants.rows.reduce((sum, v) => sum + Number(v.available ?? 0), 0);
  const view = {
    id: String(row.id),
    handle: row.handle,
    title: row.title,
    subtitle: row.subtitle,
    kind: row.kind,
    status: row.status,
    support_until: row.support_until ? new Date(row.support_until).toISOString().slice(0, 10) : null,
    position: Number(row.position),
    variants: variants.rows.map((v) => variantView(v, row)),
    availability: availabilityOf(row, totalAvailable)
  };
  if (withBlocks) {
    const blocks = await q(
      `SELECT kind, payload FROM product_block WHERE product_id = $1 ORDER BY position ASC`,
      [row.id]
    );
    view.blocks = blocks.rows.map((b) => ({ kind: b.kind, ...b.payload }));
  }
  return view;
}
function variantView(v, product) {
  const available = Number(v.available ?? 0);
  return {
    id: String(v.id),
    sku: v.sku,
    title: v.title,
    option_value: v.option_value,
    price_minor: Number(v.price_minor),
    currency: v.currency,
    available,
    committed: Number(v.committed ?? 0),
    inventory_policy: v.inventory_policy,
    availability: availabilityOf(product, available)
  };
}
async function productByHandle(handle) {
  const res = await q(`SELECT * FROM product WHERE handle = $1`, [handle]);
  return res.rows[0] ?? null;
}
export {
  productView as a,
  availabilityOf as b,
  listProducts as l,
  productByHandle as p,
  variantsForProducts as v
};

import { q, one } from './db.js';

export type VariantRow = {
  id: number; product_id: number; sku: string; title: string; option_value: string;
  price_minor: number; currency: string; position: number; inventory_policy: string;
};

export type ProductRow = {
  id: number; handle: string; title: string; subtitle: string; kind: string;
  status: string; support_until: string | null; position: number;
};

export type ProductWithVariants = ProductRow & {
  variants: Array<VariantRow & { available: number; committed: number }>;
  blocks: BlockRow[];
  availability: ProductAvailability;
};

export type BlockRow = { id: number; kind: string; position: number; payload: any };

export type ProductAvailability =
  | { state: 'available' }
  | { state: 'low'; count: number }
  | { state: 'sold_out' }
  | { state: 'discontinued'; support_until: string | null };

export const PROTECTION_PRODUCT_HANDLE = 'shipment-protection';

export async function listProducts(opts: { includeProtection?: boolean } = {}): Promise<ProductWithVariants[]> {
  const products = await q<ProductRow>(
    `SELECT * FROM product ${opts.includeProtection ? '' : "WHERE handle <> $1"} ORDER BY position ASC, id ASC`,
    opts.includeProtection ? [] : [PROTECTION_PRODUCT_HANDLE],
  );
  if (products.length === 0) return [];
  const ids = products.map((p) => p.id);
  const variants = await q<any>(
    `SELECT v.*, COALESCE(i.available, 0) AS available, COALESCE(i.committed, 0) AS committed
       FROM variant v LEFT JOIN inventory_level i ON i.variant_id = v.id
      WHERE v.product_id = ANY($1::bigint[]) ORDER BY v.position ASC, v.id ASC`, [ids],
  );
  const blocks = await q<BlockRow>(
    `SELECT id, product_id, kind, position, payload FROM product_block
      WHERE product_id = ANY($1::bigint[]) ORDER BY position ASC, id ASC`, [ids],
  );
  return products.map((p) => {
    const vs = variants.filter((v) => v.product_id === p.id);
    return {
      ...p,
      variants: vs,
      blocks: blocks.filter((b) => (b as any).product_id === p.id),
      availability: productAvailability(p, vs),
    };
  });
}

export function productAvailability(p: ProductRow, vs: Array<{ available: number }>): ProductAvailability {
  if (p.status === 'discontinued') return { state: 'discontinued', support_until: p.support_until };
  const lowest = vs.length ? Math.min(...vs.map((v) => v.available)) : 0;
  if (lowest <= 0) return { state: 'sold_out' };
  if (lowest <= 10) return { state: 'low', count: lowest };
  return { state: 'available' };
}

export async function getProduct(handle: string): Promise<ProductWithVariants | null> {
  const products = await listProducts({ includeProtection: true });
  return products.find((p) => p.handle === handle) ?? null;
}

export async function variantBySku(sku: string): Promise<(VariantRow & { available: number; committed: number; product: ProductRow }) | null> {
  return one<any>(
    `SELECT v.*, COALESCE(i.available, 0) AS available, COALESCE(i.committed, 0) AS committed,
            jsonb_build_object('id', p.id, 'handle', p.handle, 'title', p.title, 'subtitle', p.subtitle,
                               'kind', p.kind, 'status', p.status, 'support_until', p.support_until,
                               'position', p.position) AS product
       FROM variant v
       JOIN product p ON p.id = v.product_id
       LEFT JOIN inventory_level i ON i.variant_id = v.id
      WHERE v.sku = $1`, [sku],
  );
}

/* ------------------------------ shipment protection ------------------------------ */

export const PROTECTION_RUNGS = [
  { sku: 'VELA-PROTECT-1', price_minor: 98, from: 1, to: 9999 },
  { sku: 'VELA-PROTECT-2', price_minor: 298, from: 10000, to: 49999 },
  { sku: 'VELA-PROTECT-3', price_minor: 598, from: 50000, to: 99999 },
  { sku: 'VELA-PROTECT-4', price_minor: 1198, from: 100000, to: Number.MAX_SAFE_INTEGER },
];

export function protectionRungFor(subtotalMinor: number) {
  return PROTECTION_RUNGS.find((r) => subtotalMinor >= r.from && subtotalMinor <= r.to) ?? null;
}

/* --------------------------------- delivery --------------------------------- */

export const DELIVERY_ZONE = 'us-domestic';

export const DELIVERY_METHODS = [
  { code: 'standard', name: 'Standard', price_minor: 0, min_days: 5, max_days: 7, zone: DELIVERY_ZONE },
  { code: 'express', name: 'Express', price_minor: 2500, min_days: 2, max_days: 2, zone: DELIVERY_ZONE },
];

export function deliveryMethod(name: string | null | undefined) {
  if (!name) return null;
  const folded = String(name).toLowerCase();
  return DELIVERY_METHODS.find((m) => m.name.toLowerCase() === folded || m.code === folded) ?? null;
}

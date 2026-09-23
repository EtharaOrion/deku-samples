/** The shapes the HTTP API under /api answers with. Fields the brief pins are
 *  required; everything the brief leaves to the server is optional here. */

export type ApiError = {
  code?: string;
  message?: string;
  request_id?: string;
};

export type ListResponse<T> = {
  data: T[];
  next_cursor: string | null;
  has_more: boolean;
};

export type Variant = {
  id?: string;
  sku: string;
  title?: string;
  option_value?: string;
  price_minor: number;
  currency?: string;
  available?: number;
  position?: number;
  inventory_policy?: string;
};

export type ProductBlock = {
  kind: "lede" | "spec_group" | "in_the_box" | "compatibility" | "support_note";
  position?: number;
  payload: Record<string, unknown>;
};

export type Product = {
  id?: string;
  handle: string;
  title: string;
  subtitle?: string;
  kind: "camera" | "accessory" | "spare" | "protection";
  status: "active" | "discontinued";
  support_until?: string | null;
  position?: number;
  variants: Variant[];
  blocks?: ProductBlock[];
  availability?: string;
};

export type CartLine = {
  id: string;
  variant_id?: string;
  sku?: string;
  title?: string;
  variant_title?: string;
  option_value?: string;
  product_handle?: string;
  quantity: number;
  unit_price_minor: number;
  current_price_minor?: number;
  total_minor?: number;
  available?: number;
};

export type CartNotice = {
  kind?: string;
  sku?: string;
  title?: string;
  old_price_minor?: number;
  new_price_minor?: number;
  message?: string;
};

export type Cart = {
  token?: string;
  quote?: string;
  email?: string | null;
  lines: CartLine[];
  subtotal_minor: number;
  shipping_minor?: number | null;
  tax_minor?: number | null;
  total_minor?: number | null;
  discount_minor?: number | null;
  protection_enabled?: boolean;
  protection_rung?: { sku: string; price_minor: number } | null;
  protection_minor?: number | null;
  shipping_method?: string | null;
  shipping_address?: ShippingAddress | null;
  notices: CartNotice[];
  item_count?: number;
};

export type ShippingAddress = {
  name?: string;
  line1?: string;
  line2?: string | null;
  city?: string;
  region?: string;
  postal_code?: string;
  country?: string;
  phone?: string | null;
};

export type OrderLine = {
  id?: string;
  title_snapshot: string;
  sku_snapshot: string;
  quantity: number;
  unit_price_minor: number;
  total_minor: number;
  serials?: string[];
};

export type Order = {
  number: string;
  email: string;
  status: "pending" | "confirmed" | "cancelled";
  payment_status?: "unpaid" | "invoiced";
  fulfilment_status?: "unfulfilled" | "fulfilled";
  subtotal_minor: number;
  shipping_minor: number;
  tax_minor: number;
  discount_minor?: number;
  total_minor: number;
  currency?: string;
  shipping_method?: string;
  shipping_address?: ShippingAddress | null;
  placed_at?: string;
  lines: OrderLine[];
  serials?: { serial: string; sku?: string; registered?: boolean }[];
  access_token?: string;
  killbill_external_key?: string;
};

export type Device = {
  serial: string;
  model?: string;
  product_handle?: string;
  variant_title?: string;
  nickname?: string | null;
  status?: string;
  firmware_version?: string | null;
  latest_firmware_version?: string | null;
  update_available?: boolean;
  warranty_until?: string | null;
  order_number?: string | null;
};

export type ReleaseNotes = Record<string, string[]>;

export type Release = {
  version: string;
  build: number;
  released_on: string;
  channel?: string;
  artifact_name: string;
  size_bytes: number;
  sha256: string;
  description?: string;
  notes?: ReleaseNotes | null;
  artifact_available?: boolean;
  download_url?: string | null;
};

export type FirmwareEntry = {
  version: string;
  build: number;
  channel: string;
  min_firmware: string | null;
  min_app_version: string;
  size_bytes: number;
  sha256: string;
  artifact_available?: boolean;
  download_url?: string | null;
};

export type FirmwareManifest = {
  product: string;
  generated_at: string;
  entries: FirmwareEntry[];
};

export type Customer = {
  id?: string;
  email: string;
  name?: string;
};

export const NOTE_GROUPS = [
  "Newly Added",
  "Improvements",
  "Bug Fixes",
  "Known Issues",
] as const;

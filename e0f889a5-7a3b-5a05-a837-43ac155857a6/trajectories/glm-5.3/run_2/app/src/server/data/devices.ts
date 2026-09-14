import { createHash } from 'node:crypto';

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export const SERIAL_RE = /^(VA|VC)\d{2}(0[1-9]|[1-4]\d|5[0-3])[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

export function serialShapeOk(serial: string): boolean {
  return SERIAL_RE.test((serial || '').trim().toUpperCase());
}

export function modelCodeOf(serial: string): 'VA' | 'VC' | null {
  const m = (serial || '').trim().toUpperCase().match(/^(VA|VC)/);
  return m ? (m[1] as 'VA' | 'VC') : null;
}

export function digestFor(kind: string, key: string): string {
  // A deterministic, uppercase-free, 64-character lowercase hex digest for seed artifacts.
  return createHash('sha256').update(`vela:${kind}:${key}`).digest('hex');
}

export function firmwareSeed(productHandle: string) {
  return {
    handle: productHandle,
  };
}

export const SEED_FIRMWARE = [
  { handle: 'compact', version: '7.2', build: 720, channel: 'general', min_firmware: '6.11', min_app_version: '1.4.0', size_bytes: 24_117_248, released_on: '2026-02-10' },
  { handle: 'compact', version: '7.0', build: 700, channel: 'general', min_firmware: '6.11', min_app_version: '1.4.0', size_bytes: 23_842_816, released_on: '2025-10-02' },
  { handle: 'compact', version: '6.11', build: 611, channel: 'general', min_firmware: null, min_app_version: '1.0.0', size_bytes: 22_911_488, released_on: '2025-04-18' },
  { handle: 'flagship', version: '2.4', build: 240, channel: 'general', min_firmware: '2.0', min_app_version: '2.0.0', size_bytes: 31_457_280, released_on: '2025-09-12' }
];

export const SEED_DEVICES = [
  { serial: 'VC2609PVDA7Q', handle: 'compact', variant_sku: 'VELA-CRICKET-GRAPHITE', status: 'registered', firmware_version: '7.0', firmware_reported_at: '2026-05-14T10:12:00Z', nickname: 'The little one', owner_email: 'customer@example.com', order_number: 'VE-2026-0001', method: 'order', warranty_until: '2028-06-01' },
  { serial: 'VA2609NRWB2Z', handle: 'flagship', variant_sku: 'VELA-A1-SAND', status: 'registered', firmware_version: '2.4', firmware_reported_at: '2026-05-02T08:30:00Z', nickname: null, owner_email: 'customer2@example.com', order_number: null, method: 'manual', warranty_until: '2028-06-01' },
  { serial: 'VA2609KTMHX4', handle: 'flagship', variant_sku: 'VELA-A1-GRAPHITE', status: 'sold', firmware_version: null, firmware_reported_at: null, nickname: null, owner_email: null, order_number: null, method: null, warranty_until: '2028-06-01' },
  { serial: 'VC2609WJ3DKT', handle: 'compact', variant_sku: 'VELA-CRICKET-YELLOW', status: 'blocked', blocked_reason: 'reported_stolen', firmware_version: null, firmware_reported_at: null, nickname: null, owner_email: null, order_number: null, method: null, warranty_until: null }
];

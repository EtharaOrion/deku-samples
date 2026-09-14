import { cmpVersion } from './env.mjs';

export const CURRENCY = 'USD';
export const TAX_RATE_BPS = 1000; // ten percent
export const STANDARD_MINOR = 0;
export const EXPRESS_MINOR = 2500;
export const SHIPPING_METHODS = [
  { id: 'standard', code: 'Standard', minor: STANDARD_MINOR, window: '5 to 7 days', zone: 'us-domestic' },
  { id: 'express', code: 'Express', minor: EXPRESS_MINOR, window: '2 days', zone: 'us-domestic' },
];
export const SHIPPING_ZONE = { id: 'us-domestic', country: 'US' };
export const PROTECTION_RUNGS = [
  { sku: 'VELA-PROTECT-1', minor: 98, from: 1, to: 9999 },
  { sku: 'VELA-PROTECT-2', minor: 298, from: 10000, to: 49999 },
  { sku: 'VELA-PROTECT-3', minor: 598, from: 50000, to: 99999 },
  { sku: 'VELA-PROTECT-4', minor: 1198, from: 100000, to: null },
];

export function protectionRungFor(subtotalMinor) {
  return PROTECTION_RUNGS.find((r) => subtotalMinor >= r.from && (r.to === null || subtotalMinor <= r.to)) || null;
}

export function taxFor(subtotalMinor) {
  return Math.trunc((subtotalMinor * TAX_RATE_BPS) / 10000);
}

export function methodByCode(code) {
  return SHIPPING_METHODS.find((m) => m.code.toLowerCase() === String(code || '').toLowerCase()) || null;
}

/** cart total = subtotal + shipping + tax (+ protection when enabled). Protection is never taxed. */
export function computeTotals({ lines, shippingMinor = 0, protectionEnabled = false }) {
  const subtotal = lines.reduce((s, l) => s + l.unit_price_minor * l.quantity, 0);
  const protection = protectionEnabled ? (protectionRungFor(subtotal)?.minor ?? 0) : 0;
  const tax = taxFor(subtotal);
  const total = subtotal + shippingMinor + tax + protection;
  return { subtotal_minor: subtotal, shipping_minor: shippingMinor, tax_minor: tax, protection_minor: protection, total_minor: total };
}

export function priceNotices(lines) {
  const out = [];
  for (const l of lines) {
    if (l.current_price_minor !== null && l.current_price_minor !== undefined && l.current_price_minor !== l.unit_price_minor) {
      out.push({
        code: 'PRICE_CHANGED',
        sku: l.sku,
        title: l.product_title,
        old_minor: l.unit_price_minor,
        new_minor: l.current_price_minor,
        message: `The price of ${l.product_title} changed from ${usd(l.unit_price_minor)} to ${usd(l.current_price_minor)} since you added it.`,
      });
    }
  }
  return out;
}

export function usd(minor) {
  const n = Math.trunc(Number(minor) || 0);
  const a = Math.abs(n);
  return `${n < 0 ? '-' : ''}$${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

export function variantAvailability({ status, inventory, policy }) {
  if (status === 'discontinued') return { state: 'discontinued', buyable: false, available: 0, label: 'Discontinued' };
  const available = inventory?.available ?? 0;
  if (available <= 0) {
    if (policy === 'continue') return { state: 'made_to_order', buyable: true, available: 0, label: 'Available' };
    return { state: 'sold_out', buyable: false, available: 0, label: 'Sold out' };
  }
  return { state: 'available', buyable: true, available, label: available <= 10 ? `Only ${available} left` : 'Available' };
}

export function newestFirmware(list) {
  return list.filter((f) => f.channel === 'general').slice().sort((a, b) => b.build - a.build)[0] || null;
}

export function firmwareUpdateAvailable(deviceVersion, generalList) {
  const newest = newestFirmware(generalList);
  if (!newest) return { available: false, newest: null };
  const cur = String(deviceVersion || '').trim();
  if (!cur) return { available: false, newest };
  return { available: cmpVersion(newest.version, cur) > 0, newest };
}

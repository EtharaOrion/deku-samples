// Shape rules and derived state. Derived rather than stored: an order's status
// chip, a variant's availability state, whether a device has newer firmware,
// and the shipment-protection rung for a cart.

// Two uppercase letters of model code, two digits of year, two of production
// week, then six characters from an alphabet that omits I, O, 0 and 1 because
// those are misread off an engraved underside.
export const SERIAL_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const SERIAL_RE = /^(VA|VC)\d{2}\d{2}[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

export function normaliseSerial(input) {
  return String(input || '').replace(/[\s-]/g, '').toUpperCase();
}

/** A serial that does not match the shape is refused before any lookup happens. */
export function isValidSerial(input) {
  const s = normaliseSerial(input);
  return s.length === 12 && SERIAL_RE.test(s);
}

/** Group as it is typed, stored unformatted: VC26 09PV DA7Q */
export function groupSerial(serial) {
  const s = normaliseSerial(serial);
  return s.replace(/(.{4})(?=.)/g, '$1 ').trim();
}

/** Availability is a state, not a boolean. */
export function availabilityOf({ productStatus, available, inventoryPolicy = 'deny' }) {
  if (productStatus === 'discontinued') return { state: 'discontinued', label: 'Discontinued', buyable: false };
  if (available <= 0 && inventoryPolicy === 'deny') return { state: 'sold_out', label: 'Sold out', buyable: false };
  if (available > 0 && available <= 10) return { state: 'low', label: `Only ${available} left`, buyable: true };
  return { state: 'available', label: 'Available', buyable: true };
}

/** Compare dotted version strings numerically: 7.10 is above 7.2. */
export function compareVersions(a, b) {
  const pa = String(a ?? '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b ?? '').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function formatDateLong(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

export function formatDateShort(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

/** One chip combining the order, payment and fulfilment states into a phrase. */
export function orderChip(order) {
  if (order.status === 'cancelled') return { text: 'Cancelled', tone: 'error' };
  if (order.status === 'pending') return { text: 'Not yet confirmed', tone: 'progress' };
  if (order.fulfilment_status === 'fulfilled') return { text: 'Confirmed and delivered', tone: 'done' };
  if (order.payment_status === 'invoiced') return { text: 'Confirmed, preparing to ship', tone: 'progress' };
  return { text: 'Confirmed', tone: 'done' };
}

export const DELIVERY_METHODS = [
  { code: 'Standard', price_minor: 0, window: 'Arrives in 5 to 7 days' },
  { code: 'Express', price_minor: 2500, window: 'Arrives in 2 days' },
];

export function deliveryMethod(code) {
  return DELIVERY_METHODS.find((m) => m.code === code) ?? null;
}

export const NOTE_GROUPS = ['Newly Added', 'Improvements', 'Bug Fixes', 'Known Issues'];

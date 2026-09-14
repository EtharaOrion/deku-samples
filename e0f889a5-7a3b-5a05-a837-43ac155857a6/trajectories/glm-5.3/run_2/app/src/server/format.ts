export function money(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return '—';
  const abs = Math.abs(Math.trunc(minor));
  return `${minor < 0 ? '-' : ''}$${Math.floor(abs / 100).toLocaleString('en-US')}.${String(abs % 100).padStart(2, '0')}`;
}

export function bytes(size: number): string {
  if (!Number.isFinite(size)) return '—';
  const mb = size / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export function bytesExact(size: number): string {
  return `${size.toLocaleString('en-US')} bytes`;
}

export function longDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

export function shortDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function orderChip(order: { status: string; payment_status: string; fulfilment_status: string }): string {
  if (order.status === 'cancelled') return 'Cancelled';
  if (order.status === 'pending') return 'Awaiting payment';
  if (order.payment_status === 'invoiced' && order.fulfilment_status === 'fulfilled') return 'Confirmed and fulfilled';
  if (order.payment_status === 'invoiced') return 'Confirmed, awaiting dispatch';
  return 'Confirmed';
}

export function availabilityChip(state: string, label: string | null) {
  if (state === 'discontinued') return { text: 'Discontinued', cls: 'chip' };
  if (state === 'sold_out') return { text: 'Sold out', cls: 'chip chip-sold' };
  if (state === 'low') return { text: label || 'Low stock', cls: 'chip chip-low' };
  return null;
}

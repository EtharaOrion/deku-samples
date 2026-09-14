// Money is an integer count of minor units everywhere in this app. No floats.

export function formatUsd(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(minor));
  const dollars = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${sign}$${dollars.toLocaleString('en-US')}.${String(cents).padStart(2, '0')}`;
}

export function formatUsdPlain(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(minor));
  return `${sign}$${(Math.floor(abs / 100)).toString()}.${String(abs % 100).padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes;
  let i = -1;
  do { value = Math.floor(value / 1024); i++; } while (value >= 1024 && i < units.length - 1);
  return `${value.toLocaleString('en-US')} ${units[i]}`;
}

export function minorToDecimalString(minor: number): string {
  const abs = Math.abs(Math.trunc(minor));
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return minor < 0 ? `-${s}` : s;
}

export function taxOf(subtotal: number): number {
  // Ten percent of the line subtotal, on integers, truncated toward zero.
  return Math.trunc((subtotal * 10) / 100);
}

export function protectionRung(subtotal: number): string {
  if (subtotal < 10000) return subtotal >= 1 ? 'VELA-PROTECT-1' : 'VELA-PROTECT-1';
  if (subtotal < 50000) return 'VELA-PROTECT-2';
  if (subtotal < 100000) return 'VELA-PROTECT-3';
  return 'VELA-PROTECT-4';
}

export function protectionPriceMinor(sku: string): number {
  switch (sku) {
    case 'VELA-PROTECT-1': return 98;
    case 'VELA-PROTECT-2': return 298;
    case 'VELA-PROTECT-3': return 598;
    case 'VELA-PROTECT-4': return 1198;
    default: return 0;
  }
}

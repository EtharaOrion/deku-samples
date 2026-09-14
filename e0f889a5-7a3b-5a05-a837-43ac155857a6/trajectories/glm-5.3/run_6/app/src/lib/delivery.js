// Delivery. One zone, us-domestic, for country US.
export const DELIVERY_METHODS = [
  {
    code: 'standard',
    name: 'Standard',
    zone: 'us-domestic',
    priceMinor: 0,
    windowDays: [5, 7],
    windowText: '5 to 7 days'
  },
  {
    code: 'express',
    name: 'Express',
    zone: 'us-domestic',
    priceMinor: 2500,
    windowDays: [2, 2],
    windowText: '2 days'
  }
];

export function zoneForCountry(country) {
  const c = String(country || '').trim().toUpperCase();
  if (c === 'US') return 'us-domestic';
  return null;
}

export function methodsForCountry(country) {
  if (zoneForCountry(country) !== 'us-domestic') return [];
  return DELIVERY_METHODS;
}

export function findMethod(code) {
  return DELIVERY_METHODS.find((m) => m.code === code) || null;
}

export function methodByName(name) {
  const n = String(name || '').trim().toLowerCase();
  return DELIVERY_METHODS.find((m) => m.name.toLowerCase() === n) || null;
}

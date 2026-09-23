/** Number and unit rendering, written once so a figure reads the same everywhere. */

function groupDigits(digits: string): string {
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return out;
}

function sign(value: number): string {
  return value < 0 ? '-' : '';
}

function digitsOf(value: number): string {
  return String(value).replace('-', '');
}

function group(value: number): string {
  return `${sign(value)}${groupDigits(digitsOf(value))}`;
}

// Every figure arrives as an integer already scaled by its unit, so the point is
// placed by splitting digits, never by dividing: the client derives no figure.
function scaled(value: number, decimals: number, places: number): string {
  const digits = digitsOf(value).padStart(decimals + 1, '0');
  const cut = digits.length - decimals;
  return `${sign(value)}${groupDigits(digits.slice(0, cut))}.${digits.slice(cut, cut + places)}`;
}

export function grams(value: number): string {
  return `${group(value)} g`;
}

export function kilograms(value: number): string {
  return `${group(value)} kg`;
}

export function percent(basis_points: number): string {
  return `${scaled(basis_points, 2, 2)} per cent`;
}

export function carbonPerKilogram(milligrams_per_kilogram: number): string {
  return `${scaled(milligrams_per_kilogram, 6, 2)} kg CO2e per kg`;
}

export function sentenceCase(value: string): string {
  const words = value.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function words(value: string): string {
  return value.replace(/_/g, ' ');
}

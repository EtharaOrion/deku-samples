/**
 * A consequential state is a word before it is anything visual, and a derivation
 * reads as a definition list rather than as a payload.
 */

import { words } from '../../format';

/** Every consequential state carries its word, declared once here. */
const FLAG_WORDS: Record<string, string> = {
  collector_approval_lapsed: 'non-claimable',
  custody_link_missing: 'non-claimable',
  lapsed_calibration: 'lapsed calibration',
  open_deviation: 'open deviation',
  unreviewed_override: 'unreviewed override',
  losses: 'losses reduce the claim',
  quarantined: 'quarantined',
};

export function flagWord(flag: string): string {
  return FLAG_WORDS[flag] ?? words(flag);
}

/** A node states whether it is flagged, in words, without repeating one twice. */
export function flagWords(flags: string[]): string {
  if (flags.length === 0) return 'not flagged';
  return [...new Set(flags.map(flagWord))].join(', ');
}

export function categorySplitText(split: Record<string, number>): string {
  return `post ${split.post_consumer ?? 0} g / pre ${split.pre_consumer ?? 0} g`;
}

function readable(value: unknown): string {
  if (value === null || value === undefined) return 'none';
  if (Array.isArray(value)) return value.map((entry) => readable(entry)).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, held]) => `${words(key)}: ${readable(held)}`)
      .join('; ');
  }
  return String(value);
}

interface DerivationLine {
  label: string;
  statement: string;
}

/** A derivation reads as a definition list rather than as a payload. */
export function derivationLines(derivation: Record<string, unknown> | undefined): DerivationLine[] {
  if (!derivation) return [];
  return Object.entries(derivation).map(([key, value]) => ({
    label: words(key),
    statement: readable(value),
  }));
}

/** A count reads with the noun it counts, in the number the count calls for. */
export function counted(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

import { RETENTION_SCHEME_MONTHS, RETENTION_STATUTORY_MONTHS } from '../db/constants.js';
import type { LegalHoldRow } from '../db/read.js';
import type { RecordEntry } from '../record/entries.js';
import { addMonths, dateOnly, laterOf } from './dates.js';

export interface Retention {
  seq: number;
  recorded_on: string;
  scheme_months: number;
  statutory_months: number;
  scheme_until: string;
  statutory_until: string;
  referenced_until: string;
  retain_until: string;
  legal_hold: boolean;
  legal_hold_reference: string | null;
  deleted: boolean;
  deleted_on: string | null;
  derivation: Record<string, string>;
}

export function retentionOf(entry: RecordEntry, referencedUntil: string | null, hold: LegalHoldRow | null): Retention {
  const recorded_on = dateOnly(entry.at);
  const scheme_until = addMonths(recorded_on, RETENTION_SCHEME_MONTHS);
  const statutory_until = addMonths(recorded_on, RETENTION_STATUTORY_MONTHS);
  const referenced_until = referencedUntil ?? scheme_until;
  const retain_until = laterOf(scheme_until, statutory_until, referenced_until);
  return {
    seq: entry.seq,
    recorded_on,
    scheme_months: RETENTION_SCHEME_MONTHS,
    statutory_months: RETENTION_STATUTORY_MONTHS,
    scheme_until,
    statutory_until,
    referenced_until,
    retain_until,
    legal_hold: hold !== null,
    legal_hold_reference: hold?.reference ?? null,
    deleted: entry.deleted_on !== null,
    deleted_on: entry.deleted_on,
    derivation: {
      scheme_until: 'recorded_on + scheme_months',
      statutory_until: 'recorded_on + statutory_months',
      referenced_until: 'latest retain_until of any certificate or period that references this entry, else scheme_until',
      retain_until: 'the longest of scheme_until, statutory_until and referenced_until',
    },
  };
}

export function expiryRefusal(retention: Retention, today: string): { rule: string; detail: string } | null {
  if (retention.legal_hold) {
    return { rule: 'legal_hold_in_force', detail: `Entry ${retention.seq} is under legal hold ${retention.legal_hold_reference ?? ''} and cannot be expired.` };
  }
  if (retention.retain_until >= today) {
    return { rule: 'retention_not_elapsed', detail: `Entry ${retention.seq} must be retained until ${retention.retain_until}.` };
  }
  if (retention.deleted) {
    return { rule: 'already_expired', detail: `Entry ${retention.seq} was already deleted under retention on ${retention.deleted_on ?? ''}.` };
  }
  return null;
}

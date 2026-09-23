import type { Role } from '../../shared/enums';

/** Thresholds and pinned scheme literals, written once and imported everywhere. */
export const GRADE_N6 = 'N6';
export const CLAIM_TYPE_DEFAULT = 'mass_balance';
export const CARRY_OVER_LIMIT_BP = 2000;
export const DECLARATION_TOLERANCE_BP = 500;
export const PRIMARY_THRESHOLD_BP = 5000;
export const CALIBRATION_MONTHS = 12;
export const OVERRIDE_REASON_FLOOR_CHARS = 40;
export const RETENTION_SCHEME_MONTHS = 120;
export const RETENTION_STATUTORY_MONTHS = 84;
export const SCHEME = 'RCS-2026';
export const REGISTRATION = 'REG-RAVEL-0042';
export const COLLECTOR_EXPIRY_WARNING_DAYS = 14;
export const NOTICE_PERIOD_DAYS = 90;
export const GRANT_ENDS = '2027-06-30';
export const CERTIFICATE_ORDINAL_WIDTH = 6;
export const VERIFY_RATE_LIMIT_PER_MINUTE = 120;

export const SITE_PILOT = 'SITE-PILOT';
export const SITE_DEMO = 'SITE-DEMO';
export const SITE_COMM = 'SITE-COMM';

export interface Account {
  name: string;
  role: Role;
  sites: string[];
}

export const ACCOUNTS: Record<string, Account> = {
  'plant@example.com': { name: 'Ines Bekele', role: 'plant_operator', sites: [SITE_DEMO, SITE_PILOT] },
  'analyst@example.com': { name: 'Tomas Vlach', role: 'lab_analyst', sites: [SITE_DEMO, SITE_PILOT] },
  'quality@example.com': { name: 'Marit Solheim', role: 'quality_manager', sites: [SITE_DEMO, SITE_PILOT] },
  'claims@example.com': { name: 'Osei Danquah', role: 'claims_manager', sites: [SITE_DEMO, SITE_PILOT] },
  'signer@example.com': { name: 'Hana Ferreira', role: 'certificate_signer', sites: [SITE_DEMO, SITE_PILOT] },
  'signer2@example.com': { name: 'Pavel Ostrowski', role: 'certificate_signer', sites: [SITE_PILOT] },
  'auditor@example.com': { name: 'Ruth Lindqvist', role: 'auditor', sites: [SITE_DEMO, SITE_PILOT] },
};

export const ENQUIRY_ROUTING: Record<string, { destination: string; response_days: number }> = {
  waste_supply: { destination: 'feedstock@example.com', response_days: 3 },
  polymer_purchase: { destination: 'sales@example.com', response_days: 2 },
  partnership: { destination: 'partners@example.com', response_days: 5 },
  press: { destination: 'press@example.com', response_days: 1 },
};

export const MAIL_FROM = 'Ravel Materials <no-reply@ravel.example.com>';

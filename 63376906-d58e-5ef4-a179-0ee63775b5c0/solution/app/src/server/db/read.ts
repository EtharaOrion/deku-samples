import { one, query, type Queryable, type Row } from './pool.js';
import type {
  ApprovalState, Category, CertificateState, ClaimType, Confidence, Disposition, InboundSource,
  MovementKind, OutputKind, PeriodState, RunState, RunType,
} from '../../shared/enums.js';

/** Typed rows. Every coercion from the database happens in pool.ts type parsers; nothing is re-coerced here. */
export interface SiteRow extends Row {
  reference: string; name: string; confidence: Confidence; nameplate_kg: number; contracted_kg: number;
  capacity_basis: string; capacity_revised_on: string;
  certification_history: { state: string; effective_from: string; recorded_on: string; reason: string | null }[];
}
export interface CollectorRow extends Row {
  reference: string; country: string; registration: string; registration_expiry: string;
  collection_site_types: string[]; declared_streams: string[]; scheme_status: string;
}
export interface ApprovalPeriodRow extends Row {
  reference: string; collector: string; state: ApprovalState; valid_from: string; valid_to: string | null;
  condition: string | null; condition_closes_on: string | null; recorded_by: string; recorded_at: string; effective_on: string;
}
export interface WeighingRow extends Row { reference: string; site: string; calibrated_on: string; calibration_months: number }
export interface CustodyLink { kind: string; on: string; party: string; arrived_on?: string }
export interface BatchRow extends Row {
  reference: string; collector: string; site: string; grade: string; category: Category;
  gross_g: number; tare_g: number; net_g: number; moisture_bp: number; moisture_method: string; device: string;
  received_on: string;
  composition: { polymer: string; fraction_bp: number; basis: string; measured_fraction_bp?: number };
  contamination: Record<string, unknown>; custody: CustodyLink[];
  rejected_g: number; rejected_reason: string | null; rejected_destination: string | null;
  booked_by: string; event_at: string; recorded_at: string; effective_on: string;
}
export interface RunRow extends Row {
  reference: string; run_type: RunType; site: string; equipment: string; recipe_version: string;
  recipe: Record<string, unknown>; set_points_achieved: Record<string, number>; operator: string;
  started_at: string; ended_at: string | null; state: RunState; losses_g: number | null; closed_by: string | null;
  event_at: string; recorded_at: string; effective_on: string;
}
export interface ConsumptionRow extends Row {
  reference: string; run: string; input: string; mass_g: number; recorded_by: string;
  event_at: string; recorded_at: string; effective_on: string;
}
export interface OutputRow extends Row {
  reference: string; run: string; kind: OutputKind; mass_g: number; disposition: string | null;
  recorded_by: string; event_at: string; recorded_at: string; effective_on: string;
}
export interface LotRow extends Row {
  reference: string; grade: string; site: string; mass_g: number; output: string | null;
  components: { lot: string; mass_g: number; content_bp: number }[]; sites: string[];
  disposition: Disposition; claim_type: ClaimType; dispositioned_by: string | null; dispositioned_at: string | null;
  produced_on: string; event_at: string; recorded_at: string; effective_on: string;
}
export interface TestResultRow extends Row {
  reference: string; lot: string | null; batch: string | null; property: string; method: string; instrument: string;
  analyst: string; value: string; unit: string; uncertainty_bp: number; method_mismatch: boolean;
  usable_for_release: boolean; recorded_by: string; event_at: string; recorded_at: string; effective_on: string;
}
export interface DeviationRow extends Row {
  reference: string; description: string; state: string; outcome: string | null; runs: string[]; lots: string[];
  raised_by: string; raised_at: string; closed_by: string | null; closed_at: string | null; effective_on: string;
}
export interface OverrideRow extends Row {
  reference: string; separation: string; reason: string; lot: string; authorised_by: string; authorised_on: string;
  reviewed: boolean; reviewed_by: string | null; reviewed_at: string | null; recorded_at: string;
}
export interface PeriodRow extends Row {
  reference: string; site: string; grade: string; starts_on: string; ends_on: string; state: PeriodState;
  closed_on: string | null; cut_off: string | null; closed_by: string | null; carry_over_limit_bp: number; allocation_basis: string;
}
export interface MovementRow extends Row {
  reference: string; period: string; category: Category; kind: MovementKind; mass_g: number; lot: string | null;
  batch: string | null; consumption: string | null; transfer: string | null; origin_site: string | null;
  recorded_by: string; event_at: string; recorded_at: string; effective_on: string;
}
export interface FactorRow extends Row {
  reference: string; site: string; version: number; factor_bp: number; derived_from: string | null; derived_to: string | null;
  derived_in_g: number; derived_out_g: number; provisional: boolean; published_by: string; published_on: string;
  superseded_by: string | null; recorded_at: string;
}
export interface CarbonMethodRow extends Row {
  reference: string; version: string; standard: string; functional_unit: string; boundary: string; allocation_basis: string;
  reviewer: string; published_on: string; published_by: string; data_quality_rules: Record<string, unknown>;
  emission_factors: { source: string; year: string }[]; state: string; recorded_at: string;
}
interface BreakdownLine { line: string; mg_per_kg: number; tag: string }
export interface CarbonFigureRow extends Row {
  reference: string; lot: string; version: number; method: string; method_version: string; value_mg_per_kg: number;
  uncertainty_bp: number; primary_share_bp: number; breakdown: BreakdownLine[];
  energy: { energy_location_mg_per_kg: number; energy_market_mg_per_kg: number; metered_kwh: number; retired_kwh: number; unmatched_kwh: number };
  comparator: { material: string; dataset: string; dataset_year: string; region: string };
  input_versions: Record<string, string>; reason: string | null; computed_by: string; computed_on: string;
  superseded_by: string | null; recorded_at: string;
}
export interface EnergyInstrumentRow extends Row {
  reference: string; quantity_kwh: number; vintage: string; region: string; state: string; period: string | null;
  retired_by: string | null; retired_on: string | null; recorded_at: string;
}
export interface SpecificationRow extends Row {
  grade: string; version: string; issued_on: string; properties: Record<string, unknown>[];
  virgin_reference: { reference: string; source: string; date: string }; state: string; issued_by: string; recorded_at: string;
}
export interface ConformanceRow extends Row { reference: string; customer: string; grade: string; version: string; issued_on: string; issued_by: string }
export interface ChangeNoticeRow extends Row {
  reference: string; what_changes: string; against_version: string; parameter: string; qualification_relevant: boolean;
  specifications_affected: string[]; customers_affected: string[]; qualifications_affected: string[]; notice_period_days: number;
  notified: string[]; waived: string[]; state: string; raised_by: string; raised_at: string; released_at: string | null;
}
export interface ContractRow extends Row {
  reference: string; customer: string; site: string; period_label: string; committed_kg: number; floor_bp: number;
  delivered_kg: number; shortfall_consequence: string;
}
export interface ContractAllocationRow extends Row {
  reference: string; contract: string; lot: string; mass_kg: number; decided_by: string; favoured_over: string | null;
  recorded_by: string; recorded_at: string; effective_on: string;
}
export interface CertificateRow extends Row {
  number: string; version: number; site: string; lot: string; lots: { reference: string; mass_g: number }[]; grade: string;
  specification_version: string; claim_type: ClaimType; content_bp: number; category_split: Record<string, number>;
  period: string | null; carbon: { value_mg_per_kg: number; boundary: string; method_version: string; uncertainty_bp: number } | null;
  carbon_figure: string | null; primary_share_bp: number | null; recipient: string; test_results: Record<string, unknown>[];
  signer: string; signed_at: string; state: CertificateState; withdrawn_on: string | null; withdrawal_reason: string | null;
  withdrawn_by: string | null; provisional_factor: boolean; input_versions: Record<string, string>; document: string | null;
  supersedes: string | null; recorded_at: string;
}
export interface RestatementRow extends Row {
  reference: string; period: string; reason: string; revised_factor_bp: number | null; certificates: string[];
  content_movements: Record<string, unknown>[]; state: string; opened_by: string; opened_at: string; effective_on: string;
}
export interface ResolutionRow extends Row { reference: string; restatement: string; certificate: string; outcome: string; reason: string; resolved_by: string; resolved_at: string }
export interface PartyVersionRow extends Row {
  reference: string; party: string; kind: string; name: string; effective_from: string; email: string | null;
  application: string | null; industry: string | null;
}
export interface InboundRow extends Row { reference: string; source: InboundSource; received_at: string; payload_verbatim: string; recorded_by: string; recorded_at: string }
export interface LegalHoldRow extends Row { reference: string; seq: number; reason: string; placed_by: string; placed_at: string; lifted_by: string | null; lifted_at: string | null }
export interface EnquiryRow extends Row { reference: string; type: string; name: string; organisation: string | null; email: string; message: string; destination: string; response_days: number; received_at: string }

const IDENT = /^[a-z_]+$/;
function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`bad identifier ${name}`);
  return name;
}

// A version label is stored as text but orders as the ordinal it is; the boundary
// settles that order once so no caller re-reads the column as a number.
export function byVersion(left: { version: string }, right: { version: string }): number {
  return left.version.localeCompare(right.version, 'en', { numeric: true });
}

export function all<T extends Row>(table: string, orderBy = 'reference', q?: Queryable): Promise<T[]> {
  return query<T>(`SELECT * FROM ${ident(table)} ORDER BY ${ident(orderBy)}`, [], q);
}

export function where<T extends Row>(table: string, column: string, value: unknown, orderBy = 'reference', q?: Queryable): Promise<T[]> {
  return query<T>(`SELECT * FROM ${ident(table)} WHERE ${ident(column)} = $1 ORDER BY ${ident(orderBy)}`, [value], q);
}

export function byKey<T extends Row>(table: string, column: string, value: unknown, q?: Queryable): Promise<T | null> {
  return one<T>(`SELECT * FROM ${ident(table)} WHERE ${ident(column)} = $1`, [value], q);
}

export function byReference<T extends Row>(table: string, reference: string, q?: Queryable): Promise<T | null> {
  return byKey<T>(table, 'reference', reference, q);
}

export async function exists(table: string, column: string, value: unknown, q?: Queryable): Promise<boolean> {
  return (await byKey(table, column, value, q)) !== null;
}

/** Next reference in a prefixed counter such as BATCH-1006 or CRM-0006, computed from stored rows (no counter table). */
export async function nextReference(table: string, column: string, prefix: string, width: number, q?: Queryable): Promise<string> {
  const row = await one<{ n: number | null }>(
    `SELECT max(substring(${ident(column)} from $1)::bigint) AS n FROM ${ident(table)} WHERE ${ident(column)} LIKE $2`,
    [`^${prefix.replace(/[-]/g, '\\-')}(\\d+)$`, `${prefix}%`],
    q,
  );
  const next = (row?.n ?? 0) + 1;
  return `${prefix}${String(next).padStart(width, '0')}`;
}

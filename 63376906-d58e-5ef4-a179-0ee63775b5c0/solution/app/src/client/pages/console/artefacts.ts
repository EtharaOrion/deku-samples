/**
 * The issued artefacts and the read-only answers built on them: a certificate,
 * its conditions, its replay, the six reconciliation figures and the panels
 * beside them.
 */

import type { CarbonSummary } from './views';

export interface CertificateView {
  number: string;
  version: number;
  site: string;
  grade: string;
  lots: { reference: string; mass_g: number }[];
  specification_version: string;
  claim_type: string;
  claim_type_label: string;
  content_bp: number;
  category_split: Record<string, number>;
  period: string | null;
  carbon: CarbonSummary | null;
  primary_share_bp: number | null;
  scheme: string;
  registration: string;
  permitted_statement: string;
  prohibited_statement: string;
  signer: string;
  signed_at: string;
  verification_url: string;
  state: string;
  provisional_factor: boolean;
  recipient: string;
  recipient_name: string;
  withdrawn_on: string | null;
  withdrawal_reason: string | null;
  deviations: string[];
}

export interface WithdrawalView {
  number: string;
  state: string;
  reason: string;
  withdrawn_by: string;
  withdrawn_on: string;
  notified_recipients: { reference: string; name: string; email: string | null }[];
  void_statements: string[];
  derived_certificates: string[];
  batch_traversal: string[];
  consequences: string[];
}

export interface ConditionView {
  condition: string;
  statement: string;
  satisfied: boolean;
  blocking_reference: string | null;
}

export interface PreviewView {
  lot: string;
  recipient: string;
  conditions: ConditionView[];
  all_satisfied: boolean;
}

export interface SiteView {
  reference: string;
  name: string;
  confidence: string;
  certification_state: string;
  nameplate_kg: number;
  contracted_kg: number;
}

export interface CollectorView {
  reference: string;
  name: string;
  country: string;
  approval_state: string;
}

export interface CustomerView {
  reference: string;
  name: string;
  email: string;
  holds_specification_version: string;
  application: string;
  industry: string;
}

export interface RestatementView {
  reference: string;
  period: string;
  reason: string;
  state: string;
  certificates: string[];
  opened_by: string;
  opened_at: string;
}

export interface RecordEntryView {
  seq: number;
  digest: string;
  prev_digest: string;
  person: string;
  at: string;
  act: string;
  object: string | null;
  outcome: string;
  deleted: boolean;
}

export interface ChainView {
  holds: boolean;
  first_failure: number | null;
  entries: number;
}

export interface ExportView {
  reference: string;
  read_at: string;
  exported_by: string;
  digests: { seq: number; digest: string }[];
}

export interface ReconciliationView {
  mass_balance_residual_g: number;
  credit_margin_g: number;
  consumptions_on_open_runs: number;
  batches_with_broken_custody: number;
  certificates_with_superseded_figures: number;
  integration_ages: Record<string, number | null>;
  read_at: string;
  derivation: Record<string, unknown>;
}

export interface ProjectionView {
  contract: string;
  customer: string;
  site: string;
  period: string;
  delivered_kg: number;
  committed_kg: number;
  running_content_bp: number;
  floor_bp: number;
  required_remaining_bp: number;
  state: string;
  unreachable_since: string | null;
  planned_site_flag: boolean;
  flag_dismissible: boolean;
  shortfall_consequence: string;
  allocations: { reference: string; lot: string; mass_kg: number; content_bp: number }[];
}

export interface CarbonView {
  lot: string;
  value_mg_per_kg: number;
  boundary: string;
  method: string;
  method_version: string;
  uncertainty_bp: number;
  comparator: { material: string; dataset: string; dataset_year: string; region: string };
  primary_share_bp: number;
  default_led: boolean;
  breakdown: { line: string; mg_per_kg: number; tag: string }[];
  energy_location_mg_per_kg: number;
  energy_market_mg_per_kg: number;
  metered_kwh: number;
  retired_kwh: number;
  unmatched_kwh: number;
}

export interface ReplayView {
  certificate: string;
  issued: number;
  recomputed: number;
  agrees: boolean;
  differing_input: string | null;
  reproducible: boolean;
  reason: string | null;
  carbon_issued: number | null;
  carbon_recomputed: number | null;
}

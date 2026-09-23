/**
 * The operational record and the ledger, as the console reads them. Every field
 * keeps the unit suffix the API gives it: _g for grams, _bp for basis points.
 */

import type { GenealogyKind } from '../../../shared/enums';

export interface CategoryFigures {
  post_consumer: number;
  pre_consumer: number;
}

export interface CarbonSummary {
  value_mg_per_kg: number;
  boundary: string;
  method_version: string;
  uncertainty_bp: number;
}

export interface RunView {
  reference: string;
  run_type: string;
  site: string;
  equipment: string;
  recipe_version: string;
  state: string;
  losses_g: number | null;
  stage: string;
  within_tolerance: boolean;
  consumed_g: number;
  produced_g: number;
}

export interface BatchView {
  reference: string;
  collector: string;
  collector_name: string;
  site: string;
  category: string;
  net_g: number;
  dry_mass_g: number;
  moisture_bp: number;
  received_on: string;
  claimable: boolean;
  claimable_reason: string | null;
  claimable_from: string | null;
  approval_lapsed_on: string | null;
  custody_complete: boolean;
  missing_custody: string[];
  flags: string[];
  statements: string[];
}

export interface OverrideView {
  reference: string;
  separation: string;
  reason?: string;
  lot?: string;
  authorised_by: string;
  authorised_on: string;
  reviewed: boolean;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

export interface DeviationView {
  reference: string;
  description: string;
  state: string;
  outcome: string | null;
  runs: string[];
  lots: string[];
  raised_by: string;
  raised_at: string;
  closed_by: string | null;
  closed_at: string | null;
}

export interface LotView {
  reference: string;
  grade: string;
  site: string;
  mass_g: number;
  disposition: string;
  claim_type: string;
  content_bp: number;
  claim_g: number;
  category_split: Record<string, number>;
  provisional_factor: boolean;
  deviations: string[];
  open_deviations: string[];
  overrides: OverrideView[];
  unreviewed_overrides: string[];
  flags: string[];
  periods_drawn: string[];
  carbon: CarbonSummary | null;
  statements: string[];
  derivation: Record<string, unknown>;
}

interface FactorView {
  reference: string;
  version: number;
  factor_bp: number;
  derived_from: string | null;
  derived_to: string | null;
  derived_in_g: number;
  derived_out_g: number;
  provisional: boolean;
}

interface MovementView {
  reference: string;
  kind: string;
  category: string;
  mass_g: number;
  lot: string | null;
  batch: string | null;
  consumption: string | null;
  transfer: string | null;
  origin_site: string | null;
  effective_on: string;
}

interface InboundCreditView {
  reference: string;
  movement: string;
  mass_g: number;
  category: string;
  origin_site: string | null;
  on: string;
  fresh_credit: boolean;
}

export interface PeriodView {
  reference: string;
  site: string;
  grade: string;
  starts_on: string;
  ends_on: string;
  state: string;
  closed_on: string | null;
  cut_off: string | null;
  carry_over_limit_bp: number;
  allocation_basis: string;
  credits_in_g: CategoryFigures;
  credits_out_g: CategoryFigures;
  credits_available_g: CategoryFigures;
  credit_margin_g: number;
  carried_forward_g: CategoryFigures;
  expired_g: CategoryFigures;
  conversion_factors: FactorView[];
  override_count: number;
  open_restatement_count: number;
  open_finding_count: number;
  non_claimable_input_g: number;
  inbound_credits: InboundCreditView[];
  movements: MovementView[];
  lots: string[];
  read_at: string;
  derivation: Record<string, unknown>;
}

export interface GenealogyNode {
  kind: GenealogyKind;
  reference: string;
  mass_g: number;
  category_split: Record<string, number>;
  flags: string[];
}

export interface GenealogyView {
  lot: string;
  nodes: GenealogyNode[];
  edges: { from: string; to: string; mass_g: number }[];
  flagged: boolean;
  text_equivalent: string;
}

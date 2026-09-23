// Shared vocabularies. Declared once; imported by server and client alike.

const ROLES = [
  'plant_operator',
  'lab_analyst',
  'quality_manager',
  'claims_manager',
  'certificate_signer',
  'auditor',
] as const;
export type Role = (typeof ROLES)[number];

export const CATEGORIES = ['post_consumer', 'pre_consumer'] as const;
export type Category = (typeof CATEGORIES)[number];

const CONFIDENCES = ['commissioned', 'under_construction', 'consented', 'planned'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const CERTIFICATION_STATES = ['certified', 'not_certified', 'suspended'] as const;

export const APPROVAL_STATES = ['approved', 'conditional', 'suspended', 'lapsed'] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

export const CUSTODY_KINDS = ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'] as const;

export const COMPOSITION_BASES = ['declared', 'sampled', 'assayed'] as const;

export const RUN_TYPES = ['dissolution', 'depolymerisation', 'purification', 'repolymerisation'] as const;
export type RunType = (typeof RUN_TYPES)[number];

const RUN_STATES = ['open', 'closed'] as const;
export type RunState = (typeof RUN_STATES)[number];

export const OUTPUT_KINDS = ['intermediate', 'lot', 'byproduct'] as const;
export type OutputKind = (typeof OUTPUT_KINDS)[number];

/** The four hops a lot descends through, in the order genealogy walks and draws them. */
export const GENEALOGY_KINDS = ['batch', 'run', 'output', 'lot'] as const;
export type GenealogyKind = (typeof GENEALOGY_KINDS)[number];

export const BYPRODUCT_DISPOSITIONS = ['sold', 'disposed'] as const;

export const DISPOSITIONS = ['pending', 'released', 'quarantined', 'rejected'] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

const CLAIM_TYPES = ['physically_segregated', 'controlled_blending', 'mass_balance'] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export const DEVIATION_OUTCOMES = ['root_cause_found', 'cause_not_established'] as const;

export const SEPARATIONS = [
  'analyst_not_dispositioner',
  'publisher_not_closer',
  'signer_not_data_enterer',
  'booker_not_approver',
] as const;

const PERIOD_STATES = ['open', 'closed'] as const;
export type PeriodState = (typeof PERIOD_STATES)[number];

const MOVEMENT_KINDS = [
  'opening',
  'consumption_credit',
  'allocation',
  'transfer_out',
  'transfer_in',
  'carried_out',
  'carried_in',
  'expired',
] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export const ALLOCATION_BASES = ['mass', 'energy', 'economic'] as const;

const DATA_QUALITY_TAGS = ['primary', 'secondary', 'supplier_specific'] as const;

const INSTRUMENT_STATES = ['held', 'retired'] as const;

const CERTIFICATE_STATES = ['issued', 'withdrawn', 'superseded'] as const;
export type CertificateState = (typeof CERTIFICATE_STATES)[number];

export const RESOLUTION_OUTCOMES = ['reissued', 'withdrawn', 'unaffected'] as const;

const PROJECTION_STATES = ['on_track', 'unreachable'] as const;
export type ProjectionState = (typeof PROJECTION_STATES)[number];

export const INBOUND_SOURCES = ['weighbridge', 'control_system', 'laboratory', 'customer_reporting'] as const;
export type InboundSource = (typeof INBOUND_SOURCES)[number];

export const ENQUIRY_TYPES = ['waste_supply', 'polymer_purchase', 'partnership', 'press'] as const;

const NEWS_TAGS = ['funding', 'partnership', 'technical', 'recognition'] as const;

export const RECORD_QUERIES = [
  'lots_from_batch',
  'certificates_on_period',
  'certificates_under_method_version',
  'lots_released_under_unreviewed_override',
  'allocations_in_final_fortnight',
  'refused_allocations',
  'collector_declaration_departures',
  'acts_by_person',
  'exports_by_auditor',
] as const;
export type RecordQuery = (typeof RECORD_QUERIES)[number];

export const PAGINATION_PARAMS = ['page', 'limit', 'offset', 'cursor'] as const;

export const CONDITION_NAMES = [
  'lot_released',
  'no_open_deviation',
  'no_unreviewed_override',
  'period_closed',
  'balance_invariant_holds',
  'carbon_figure_complete',
  'signer_holds_site_scope',
  'signer_did_not_enter_data',
] as const;
export type ConditionName = (typeof CONDITION_NAMES)[number];

export const RUN_STAGES: readonly { run_type: RunType; label: string }[] = [
  { run_type: 'dissolution', label: 'Dissolution' },
  { run_type: 'depolymerisation', label: 'Depolymerisation' },
  { run_type: 'purification', label: 'Purification' },
  { run_type: 'repolymerisation', label: 'Repolymerisation' },
];

export const CLAIM_TYPE_LABEL: Record<ClaimType, string> = {
  physically_segregated: 'physically segregated',
  controlled_blending: 'controlled blending',
  mass_balance: 'mass balance',
};

export const CLAIM_TYPE_STRENGTH: Record<ClaimType, number> = {
  physically_segregated: 3,
  controlled_blending: 2,
  mass_balance: 1,
};

export const IDEMPOTENCY_REUSE = 'idempotency_key_reuse';

import { query } from './pool.js';

const DDL = `
CREATE TABLE IF NOT EXISTS site (
  reference text PRIMARY KEY,
  name text NOT NULL,
  confidence text NOT NULL,
  nameplate_kg bigint NOT NULL,
  contracted_kg bigint NOT NULL,
  capacity_basis text NOT NULL,
  capacity_revised_on date NOT NULL,
  certification_history jsonb NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS collector (
  reference text PRIMARY KEY,
  country text NOT NULL,
  registration text NOT NULL,
  registration_expiry date NOT NULL,
  collection_site_types jsonb NOT NULL DEFAULT '[]',
  declared_streams jsonb NOT NULL DEFAULT '[]',
  scheme_status text NOT NULL
);
CREATE TABLE IF NOT EXISTS approval_period (
  reference text PRIMARY KEY,
  collector text NOT NULL REFERENCES collector(reference),
  state text NOT NULL,
  valid_from date NOT NULL,
  valid_to date,
  condition text,
  condition_closes_on date,
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL,
  effective_on date NOT NULL
);
CREATE TABLE IF NOT EXISTS weighing (
  reference text PRIMARY KEY,
  site text NOT NULL REFERENCES site(reference),
  calibrated_on date NOT NULL,
  calibration_months integer NOT NULL
);
CREATE TABLE IF NOT EXISTS batch (
  reference text PRIMARY KEY,
  collector text NOT NULL REFERENCES collector(reference),
  site text NOT NULL REFERENCES site(reference),
  grade text NOT NULL,
  category text NOT NULL,
  gross_g bigint NOT NULL,
  tare_g bigint NOT NULL,
  net_g bigint NOT NULL,
  moisture_bp bigint NOT NULL,
  moisture_method text NOT NULL,
  device text NOT NULL REFERENCES weighing(reference),
  received_on date NOT NULL,
  composition jsonb NOT NULL,
  contamination jsonb NOT NULL,
  custody jsonb NOT NULL DEFAULT '[]',
  rejected_g bigint NOT NULL DEFAULT 0,
  rejected_reason text,
  rejected_destination text,
  booked_by text NOT NULL,
  event_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  effective_on date NOT NULL
);
CREATE TABLE IF NOT EXISTS run (
  reference text PRIMARY KEY,
  run_type text NOT NULL,
  site text NOT NULL REFERENCES site(reference),
  equipment text NOT NULL,
  recipe_version text NOT NULL,
  recipe jsonb NOT NULL,
  set_points_achieved jsonb NOT NULL DEFAULT '{}',
  operator text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  state text NOT NULL,
  losses_g bigint,
  closed_by text,
  event_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  effective_on date NOT NULL
);
CREATE TABLE IF NOT EXISTS consumption (
  reference text PRIMARY KEY,
  run text NOT NULL REFERENCES run(reference),
  input text NOT NULL,
  mass_g bigint NOT NULL,
  recorded_by text NOT NULL,
  event_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  effective_on date NOT NULL
);
CREATE TABLE IF NOT EXISTS output (
  reference text PRIMARY KEY,
  run text NOT NULL REFERENCES run(reference),
  kind text NOT NULL,
  mass_g bigint NOT NULL,
  disposition text,
  recorded_by text NOT NULL,
  event_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  effective_on date NOT NULL
);
CREATE TABLE IF NOT EXISTS lot (
  reference text PRIMARY KEY,
  grade text NOT NULL,
  site text NOT NULL REFERENCES site(reference),
  mass_g bigint NOT NULL,
  output text REFERENCES output(reference),
  components jsonb NOT NULL DEFAULT '[]',
  sites jsonb NOT NULL DEFAULT '[]',
  disposition text NOT NULL,
  claim_type text NOT NULL,
  dispositioned_by text,
  dispositioned_at timestamptz,
  produced_on date NOT NULL,
  event_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  effective_on date NOT NULL
);
CREATE TABLE IF NOT EXISTS test_result (
  reference text PRIMARY KEY,
  lot text REFERENCES lot(reference),
  batch text REFERENCES batch(reference),
  property text NOT NULL,
  method text NOT NULL,
  instrument text NOT NULL,
  analyst text NOT NULL,
  value text NOT NULL,
  unit text NOT NULL,
  uncertainty_bp bigint NOT NULL,
  method_mismatch boolean NOT NULL,
  usable_for_release boolean NOT NULL,
  recorded_by text NOT NULL,
  event_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  effective_on date NOT NULL
);
CREATE TABLE IF NOT EXISTS deviation (
  reference text PRIMARY KEY,
  description text NOT NULL,
  state text NOT NULL,
  outcome text,
  runs jsonb NOT NULL DEFAULT '[]',
  lots jsonb NOT NULL DEFAULT '[]',
  raised_by text NOT NULL,
  raised_at timestamptz NOT NULL,
  closed_by text,
  closed_at timestamptz,
  effective_on date NOT NULL
);
CREATE TABLE IF NOT EXISTS override (
  reference text PRIMARY KEY,
  separation text NOT NULL,
  reason text NOT NULL,
  lot text REFERENCES lot(reference),
  authorised_by text NOT NULL,
  authorised_on date NOT NULL,
  reviewed boolean NOT NULL DEFAULT false,
  reviewed_by text,
  reviewed_at timestamptz,
  recorded_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS balance_period (
  reference text PRIMARY KEY,
  site text NOT NULL REFERENCES site(reference),
  grade text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  state text NOT NULL,
  closed_on date,
  cut_off date,
  closed_by text,
  carry_over_limit_bp bigint NOT NULL,
  allocation_basis text NOT NULL
);
CREATE TABLE IF NOT EXISTS credit_movement (
  reference text PRIMARY KEY,
  period text NOT NULL REFERENCES balance_period(reference),
  category text NOT NULL,
  kind text NOT NULL,
  mass_g bigint NOT NULL,
  lot text,
  batch text,
  consumption text,
  transfer text,
  origin_site text,
  recorded_by text NOT NULL,
  event_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  effective_on date NOT NULL
);
CREATE TABLE IF NOT EXISTS conversion_factor (
  reference text PRIMARY KEY,
  site text NOT NULL REFERENCES site(reference),
  version integer NOT NULL,
  factor_bp bigint NOT NULL,
  derived_from date,
  derived_to date,
  derived_in_g bigint NOT NULL,
  derived_out_g bigint NOT NULL,
  provisional boolean NOT NULL,
  published_by text NOT NULL,
  published_on date NOT NULL,
  superseded_by text,
  recorded_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS carbon_method (
  reference text NOT NULL,
  version text NOT NULL,
  standard text NOT NULL,
  functional_unit text NOT NULL,
  boundary text NOT NULL,
  allocation_basis text NOT NULL,
  reviewer text NOT NULL,
  published_on date NOT NULL,
  published_by text NOT NULL,
  data_quality_rules jsonb NOT NULL DEFAULT '[]',
  emission_factors jsonb NOT NULL DEFAULT '[]',
  state text NOT NULL,
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY (reference, version)
);
CREATE TABLE IF NOT EXISTS carbon_figure (
  reference text PRIMARY KEY,
  lot text NOT NULL REFERENCES lot(reference),
  version integer NOT NULL,
  method text NOT NULL,
  method_version text NOT NULL,
  value_mg_per_kg bigint NOT NULL,
  uncertainty_bp bigint NOT NULL,
  primary_share_bp bigint NOT NULL,
  breakdown jsonb NOT NULL,
  energy jsonb NOT NULL,
  comparator jsonb NOT NULL,
  input_versions jsonb NOT NULL,
  reason text,
  computed_by text NOT NULL,
  computed_on date NOT NULL,
  superseded_by text,
  recorded_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS energy_instrument (
  reference text PRIMARY KEY,
  quantity_kwh bigint NOT NULL,
  vintage text NOT NULL,
  region text NOT NULL,
  state text NOT NULL,
  period text,
  retired_by text,
  retired_on date,
  recorded_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS specification (
  grade text NOT NULL,
  version text NOT NULL,
  issued_on date NOT NULL,
  properties jsonb NOT NULL,
  virgin_reference jsonb NOT NULL,
  state text NOT NULL,
  issued_by text NOT NULL,
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY (grade, version)
);
CREATE TABLE IF NOT EXISTS conformance (
  reference text PRIMARY KEY,
  customer text NOT NULL,
  grade text NOT NULL,
  version text NOT NULL,
  issued_on date NOT NULL,
  issued_by text NOT NULL,
  recorded_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS change_notice (
  reference text PRIMARY KEY,
  what_changes text NOT NULL,
  against_version text NOT NULL,
  parameter text,
  qualification_relevant boolean NOT NULL,
  specifications_affected jsonb NOT NULL,
  customers_affected jsonb NOT NULL,
  qualifications_affected jsonb NOT NULL,
  notice_period_days integer NOT NULL,
  notified jsonb NOT NULL DEFAULT '[]',
  waived jsonb NOT NULL DEFAULT '[]',
  state text NOT NULL,
  raised_by text NOT NULL,
  raised_at timestamptz NOT NULL,
  released_at timestamptz
);
CREATE TABLE IF NOT EXISTS contract (
  reference text PRIMARY KEY,
  customer text NOT NULL,
  site text NOT NULL REFERENCES site(reference),
  period_label text NOT NULL,
  committed_kg bigint NOT NULL,
  floor_bp bigint NOT NULL,
  delivered_kg bigint NOT NULL,
  shortfall_consequence text NOT NULL
);
CREATE TABLE IF NOT EXISTS allocation (
  reference text PRIMARY KEY,
  contract text NOT NULL REFERENCES contract(reference),
  lot text NOT NULL REFERENCES lot(reference),
  mass_kg bigint NOT NULL,
  decided_by text NOT NULL,
  favoured_over text,
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL,
  effective_on date NOT NULL
);
CREATE TABLE IF NOT EXISTS certificate (
  number text PRIMARY KEY,
  version integer NOT NULL,
  site text NOT NULL REFERENCES site(reference),
  lot text NOT NULL REFERENCES lot(reference),
  lots jsonb NOT NULL,
  grade text NOT NULL,
  specification_version text NOT NULL,
  claim_type text NOT NULL,
  content_bp bigint NOT NULL,
  category_split jsonb NOT NULL,
  period text,
  carbon jsonb NOT NULL,
  carbon_figure text,
  primary_share_bp bigint NOT NULL,
  recipient text NOT NULL,
  test_results jsonb NOT NULL DEFAULT '[]',
  signer text NOT NULL,
  signed_at timestamptz NOT NULL,
  state text NOT NULL,
  withdrawn_on date,
  withdrawal_reason text,
  withdrawn_by text,
  provisional_factor boolean NOT NULL,
  input_versions jsonb NOT NULL,
  document text,
  supersedes text,
  recorded_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS restatement (
  reference text PRIMARY KEY,
  period text NOT NULL REFERENCES balance_period(reference),
  reason text NOT NULL,
  revised_factor_bp bigint,
  certificates jsonb NOT NULL,
  content_movements jsonb NOT NULL DEFAULT '[]',
  state text NOT NULL,
  opened_by text NOT NULL,
  opened_at timestamptz NOT NULL,
  effective_on date NOT NULL
);
CREATE TABLE IF NOT EXISTS resolution (
  reference text PRIMARY KEY,
  restatement text NOT NULL REFERENCES restatement(reference),
  certificate text NOT NULL,
  outcome text NOT NULL,
  reason text NOT NULL,
  resolved_by text NOT NULL,
  resolved_at timestamptz NOT NULL,
  UNIQUE (restatement, certificate)
);
CREATE TABLE IF NOT EXISTS record_entry (
  seq bigint PRIMARY KEY,
  digest text NOT NULL,
  prev_digest text NOT NULL,
  person text NOT NULL,
  at timestamptz NOT NULL,
  act text NOT NULL,
  object text,
  outcome text NOT NULL,
  content jsonb,
  idempotency_key text,
  request_digest text,
  response_status integer,
  response jsonb,
  deleted_on date
);
CREATE INDEX IF NOT EXISTS record_entry_object ON record_entry(object);
CREATE INDEX IF NOT EXISTS record_entry_idempotency ON record_entry(idempotency_key);
CREATE TABLE IF NOT EXISTS enquiry (
  reference text PRIMARY KEY,
  type text NOT NULL,
  name text NOT NULL,
  organisation text,
  email text NOT NULL,
  message text NOT NULL,
  destination text NOT NULL,
  response_days integer NOT NULL,
  received_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS position (
  reference text PRIMARY KEY,
  title text NOT NULL,
  location text NOT NULL,
  department text NOT NULL,
  contract_type text NOT NULL,
  closes_on date NOT NULL,
  summary text NOT NULL
);
CREATE TABLE IF NOT EXISTS news_item (
  reference text PRIMARY KEY,
  title text NOT NULL,
  tag text NOT NULL,
  outlet text NOT NULL,
  date date NOT NULL,
  link text NOT NULL,
  language text NOT NULL
);
CREATE TABLE IF NOT EXISTS statistic (
  key text PRIMARY KEY,
  value text NOT NULL,
  source text NOT NULL,
  year text NOT NULL,
  geography text NOT NULL
);
CREATE TABLE IF NOT EXISTS claim_substantiation (
  reference text PRIMARY KEY,
  claim text NOT NULL,
  grade text NOT NULL,
  claim_type text NOT NULL,
  scheme text NOT NULL,
  evidence text NOT NULL,
  recorded_on date NOT NULL
);
CREATE TABLE IF NOT EXISTS party_version (
  reference text PRIMARY KEY,
  party text NOT NULL,
  kind text NOT NULL,
  name text NOT NULL,
  effective_from date NOT NULL,
  email text,
  application text,
  industry text,
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS inbound_record (
  reference text PRIMARY KEY,
  source text NOT NULL,
  received_at text NOT NULL,
  payload_verbatim text NOT NULL,
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS transfer (
  reference text PRIMARY KEY,
  from_period text NOT NULL REFERENCES balance_period(reference),
  to_period text NOT NULL REFERENCES balance_period(reference),
  category text NOT NULL,
  mass_g bigint NOT NULL,
  recorded_by text NOT NULL,
  event_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  effective_on date NOT NULL
);
CREATE TABLE IF NOT EXISTS legal_hold (
  reference text PRIMARY KEY,
  seq bigint NOT NULL REFERENCES record_entry(seq),
  reason text NOT NULL,
  placed_by text NOT NULL,
  placed_at timestamptz NOT NULL,
  lifted_by text,
  lifted_at timestamptz
);
`;

export async function createSchema(): Promise<void> {
  await query(DDL);
}

-- Ravel operational schema. Fresh databases apply this in order.
CREATE TABLE IF NOT EXISTS site (
  reference text PRIMARY KEY,
  name text NOT NULL,
  confidence text NOT NULL,
  certification_state text NOT NULL,
  nameplate_kg integer NOT NULL,
  contracted_kg integer NOT NULL,
  capacity_basis text NOT NULL,
  last_revised date NOT NULL
);

CREATE TABLE IF NOT EXISTS site_certification (
  id bigserial PRIMARY KEY,
  site text NOT NULL,
  state text NOT NULL,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  recorded_on date NOT NULL,
  recorded_by text
);

CREATE TABLE IF NOT EXISTS party_version (
  id bigserial PRIMARY KEY,
  party_ref text NOT NULL,
  name text NOT NULL,
  effective_from date NOT NULL
);

CREATE TABLE IF NOT EXISTS collector (
  reference text PRIMARY KEY,
  name text NOT NULL,
  country text NOT NULL,
  registration text NOT NULL,
  registration_expiry date NOT NULL,
  site_types jsonb NOT NULL DEFAULT '[]',
  streams jsonb NOT NULL DEFAULT '[]',
  scheme_status jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS finding (
  id bigserial PRIMARY KEY,
  collector text NOT NULL,
  batch text,
  kind text NOT NULL,
  detail text NOT NULL,
  opened_on date NOT NULL,
  closes_by date,
  state text NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS approval_period (
  id bigserial PRIMARY KEY,
  collector text NOT NULL,
  state text NOT NULL,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  condition text,
  condition_closes_on date
);

CREATE TABLE IF NOT EXISTS weighing_device (
  reference text PRIMARY KEY,
  site text NOT NULL,
  calibrated_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS batch (
  reference text PRIMARY KEY,
  collector text NOT NULL,
  site text NOT NULL,
  grade text NOT NULL,
  category text NOT NULL,
  gross_g integer NOT NULL,
  tare_g integer NOT NULL,
  net_g integer NOT NULL,
  moisture_bp integer NOT NULL,
  moisture_method text NOT NULL,
  device text NOT NULL,
  received_on date NOT NULL,
  composition jsonb NOT NULL DEFAULT '[]',
  contamination jsonb NOT NULL DEFAULT '{}',
  custody jsonb NOT NULL DEFAULT '[]',
  accepted_g integer NOT NULL,
  rejected_g integer NOT NULL DEFAULT 0,
  rejected_destination text,
  collector_name text NOT NULL,
  claimable_from date,
  recorded_at timestamptz NOT NULL,
  entered_by text NOT NULL
);

CREATE TABLE IF NOT EXISTS run (
  reference text PRIMARY KEY,
  run_type text NOT NULL,
  site text NOT NULL,
  equipment text NOT NULL,
  recipe_version text NOT NULL,
  operator text NOT NULL,
  started_at timestamptz NOT NULL,
  closed_at timestamptz,
  losses_g integer,
  actual_parameters jsonb NOT NULL DEFAULT '{}',
  recorded_at timestamptz NOT NULL,
  entered_by text NOT NULL
);

CREATE TABLE IF NOT EXISTS consumption (
  id bigserial PRIMARY KEY,
  run text NOT NULL,
  input_kind text NOT NULL,
  input_ref text NOT NULL,
  mass_g integer NOT NULL,
  effective_on date NOT NULL,
  recorded_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS output (
  reference text PRIMARY KEY,
  run text NOT NULL,
  kind text NOT NULL,
  mass_g integer NOT NULL,
  disposition text,
  lot text,
  recorded_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS lot (
  reference text PRIMARY KEY,
  grade text NOT NULL,
  site text NOT NULL,
  mass_g integer NOT NULL,
  disposition text NOT NULL DEFAULT 'pending',
  claim_type text NOT NULL,
  produced_by_run text NOT NULL,
  provisional_factor boolean NOT NULL DEFAULT false,
  recorded_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS test_result (
  id bigserial PRIMARY KEY,
  lot text,
  batch text,
  property text NOT NULL,
  method text NOT NULL,
  instrument text NOT NULL,
  analyst text NOT NULL,
  value text NOT NULL,
  unit text NOT NULL,
  uncertainty_bp integer NOT NULL,
  method_mismatch boolean NOT NULL DEFAULT false,
  usable_for_release boolean NOT NULL DEFAULT true,
  recorded_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS deviation (
  reference text PRIMARY KEY,
  state text NOT NULL,
  affects_runs jsonb NOT NULL DEFAULT '[]',
  affects_lots jsonb NOT NULL DEFAULT '[]',
  outcome text,
  raised_by text NOT NULL,
  raised_on timestamptz NOT NULL,
  closed_at timestamptz,
  description text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS override (
  reference text PRIMARY KEY,
  separation text NOT NULL,
  reason text NOT NULL,
  lot text NOT NULL,
  authorised_by text NOT NULL,
  authorised_on date NOT NULL,
  reviewed boolean NOT NULL DEFAULT false,
  reviewed_by text,
  reviewed_on date
);

CREATE TABLE IF NOT EXISTS balance_period (
  id text PRIMARY KEY,
  site text NOT NULL,
  grade text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  state text NOT NULL,
  carry_over_limit_bp integer NOT NULL,
  allocation_basis text NOT NULL DEFAULT 'mass',
  carbon_method text,
  carbon_method_version integer,
  closed_on date,
  cut_off date,
  closed_by text
);

CREATE TABLE IF NOT EXISTS credit_movement (
  id bigserial PRIMARY KEY,
  period text NOT NULL,
  category text NOT NULL,
  direction text NOT NULL,
  kind text NOT NULL,
  mass_g integer NOT NULL,
  derivation jsonb NOT NULL DEFAULT '{}',
  effective_on date NOT NULL,
  recorded_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS transfer (
  reference text PRIMARY KEY,
  mass_g integer NOT NULL,
  category text NOT NULL,
  origin_period text NOT NULL,
  destination_period text NOT NULL,
  origin_site text NOT NULL,
  moved_on date NOT NULL,
  recorded_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS conversion_factor (
  reference text PRIMARY KEY,
  site text NOT NULL,
  factor_bp integer NOT NULL,
  derived_from date,
  derived_to date,
  derived_in_g integer NOT NULL,
  derived_out_g integer NOT NULL,
  provisional boolean NOT NULL DEFAULT false,
  published_by text NOT NULL,
  published_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS carbon_method (
  reference text NOT NULL,
  version integer NOT NULL,
  standard text NOT NULL,
  functional_unit text NOT NULL,
  boundary text NOT NULL,
  allocation_basis text NOT NULL,
  reviewer text NOT NULL,
  published_on date NOT NULL,
  data_quality jsonb NOT NULL DEFAULT '{}',
  emission_factors jsonb NOT NULL DEFAULT '[]',
  primary_share_threshold_bp integer NOT NULL DEFAULT 5000,
  superseded boolean NOT NULL DEFAULT false,
  published_by text NOT NULL,
  PRIMARY KEY (reference, version)
);

CREATE TABLE IF NOT EXISTS carbon_figure (
  id bigserial PRIMARY KEY,
  lot text NOT NULL,
  method text NOT NULL,
  method_version integer NOT NULL,
  value_mg_per_kg integer NOT NULL,
  uncertainty_bp integer NOT NULL,
  primary_share_bp integer NOT NULL,
  comparator jsonb NOT NULL,
  breakdown jsonb NOT NULL,
  energy_location_mg_per_kg integer,
  energy_market_mg_per_kg integer,
  metered_kwh integer,
  retired_kwh integer,
  unmatched_kwh integer,
  figure_version integer NOT NULL DEFAULT 1,
  cache_valid boolean NOT NULL DEFAULT true,
  input_versions jsonb NOT NULL DEFAULT '{}',
  recomputed_by text,
  recomputed_on date,
  recompute_reason text,
  superseded boolean NOT NULL DEFAULT false,
  computed_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS energy_instrument (
  reference text PRIMARY KEY,
  quantity_kwh integer NOT NULL,
  vintage integer NOT NULL,
  region text NOT NULL,
  state text NOT NULL,
  applied_period text,
  retired_on date
);

CREATE TABLE IF NOT EXISTS specification (
  grade text NOT NULL,
  version integer NOT NULL,
  rows jsonb NOT NULL,
  virgin_reference jsonb NOT NULL,
  issued_on date NOT NULL,
  state text NOT NULL DEFAULT 'current',
  PRIMARY KEY (grade, version)
);

CREATE TABLE IF NOT EXISTS customer (
  reference text PRIMARY KEY,
  contact text NOT NULL,
  holds_spec jsonb NOT NULL,
  application text NOT NULL,
  industry text NOT NULL
);

CREATE TABLE IF NOT EXISTS conformance (
  id bigserial PRIMARY KEY,
  customer text NOT NULL,
  application text NOT NULL,
  spec_grade text NOT NULL,
  spec_version integer NOT NULL,
  trials jsonb NOT NULL DEFAULT '[]',
  outcome text NOT NULL DEFAULT 'in_progress'
);

CREATE TABLE IF NOT EXISTS change_notice (
  reference text PRIMARY KEY,
  change text NOT NULL,
  change_kind text NOT NULL,
  parameter text,
  specifications_affected jsonb NOT NULL DEFAULT '[]',
  customers_affected jsonb NOT NULL DEFAULT '[]',
  qualifications_affected jsonb NOT NULL DEFAULT '[]',
  notice_period_days integer NOT NULL,
  state text NOT NULL DEFAULT 'proposed',
  proposed_by text NOT NULL,
  proposed_on date NOT NULL,
  released_on date
);

CREATE TABLE IF NOT EXISTS change_notice_customer (
  id bigserial PRIMARY KEY,
  notice text NOT NULL,
  customer text NOT NULL,
  notified_at timestamptz,
  waived_at timestamptz
);

CREATE TABLE IF NOT EXISTS contract (
  id text PRIMARY KEY,
  recipient text NOT NULL,
  site text NOT NULL,
  period text NOT NULL,
  committed_kg integer NOT NULL,
  floor_bp integer NOT NULL,
  delivered_kg integer NOT NULL DEFAULT 0,
  shortfall_consequence text NOT NULL DEFAULT '',
  unreachable_on date
);

CREATE TABLE IF NOT EXISTS contract_allocation (
  id bigserial PRIMARY KEY,
  contract text NOT NULL,
  lot text NOT NULL,
  mass_g integer NOT NULL,
  decided_by text,
  favoured_over jsonb NOT NULL DEFAULT '[]',
  recorded_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS certificate (
  number text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  site text NOT NULL,
  lots jsonb NOT NULL,
  grade text NOT NULL,
  specification_version integer NOT NULL,
  claim_type text NOT NULL,
  content_bp integer NOT NULL,
  category_split jsonb NOT NULL,
  period text NOT NULL,
  carbon jsonb NOT NULL,
  primary_share_bp integer NOT NULL,
  scheme text NOT NULL,
  registration text NOT NULL,
  test_results jsonb NOT NULL,
  permitted_statement jsonb NOT NULL,
  prohibited_statement jsonb NOT NULL,
  signer text NOT NULL,
  signed_at timestamptz NOT NULL,
  verification_url text NOT NULL,
  state text NOT NULL,
  provisional_factor boolean NOT NULL DEFAULT false,
  conditions jsonb NOT NULL,
  input_versions jsonb NOT NULL,
  document text NOT NULL,
  derived_from text,
  recipient text NOT NULL
);

CREATE TABLE IF NOT EXISTS withdrawal (
  number text PRIMARY KEY,
  reason text NOT NULL,
  withdrawn_by text NOT NULL,
  withdrawn_on date NOT NULL,
  notified_recipients jsonb NOT NULL DEFAULT '[]',
  void_statements jsonb NOT NULL DEFAULT '[]',
  derived_certificates jsonb NOT NULL DEFAULT '[]',
  batch_traversal jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS restatement (
  reference text PRIMARY KEY,
  period text NOT NULL,
  reason text NOT NULL,
  content_movements jsonb NOT NULL DEFAULT '[]',
  opened_by text NOT NULL,
  opened_on date NOT NULL,
  state text NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS resolution (
  id bigserial PRIMARY KEY,
  restatement text NOT NULL,
  certificate text NOT NULL,
  outcome text NOT NULL,
  reason text NOT NULL,
  resolved_by text NOT NULL,
  resolved_on date NOT NULL,
  UNIQUE (restatement, certificate)
);

CREATE TABLE IF NOT EXISTS record_entry (
  seq bigserial PRIMARY KEY,
  digest text NOT NULL,
  prev_digest text NOT NULL,
  person text NOT NULL,
  moment timestamptz NOT NULL,
  site text,
  object_ref text,
  kind text NOT NULL,
  content jsonb NOT NULL,
  content_deleted boolean NOT NULL DEFAULT false,
  deleted_on date
);

CREATE TABLE IF NOT EXISTS legal_hold (
  reference text PRIMARY KEY,
  seq integer NOT NULL,
  placed_by text NOT NULL,
  placed_on date NOT NULL,
  reason text NOT NULL
);

CREATE TABLE IF NOT EXISTS person_identity (
  person_id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL
);

CREATE TABLE IF NOT EXISTS app_session (
  token text PRIMARY KEY,
  email text NOT NULL,
  roles jsonb NOT NULL,
  sites jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS idempotency_key (
  key text NOT NULL,
  route text NOT NULL,
  body_hash text NOT NULL,
  status integer NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (key, route)
);

CREATE TABLE IF NOT EXISTS export_record (
  reference text PRIMARY KEY,
  scope jsonb NOT NULL,
  produced_by text NOT NULL,
  produced_on timestamptz NOT NULL,
  content jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS inbound_record (
  reference text PRIMARY KEY,
  source text NOT NULL,
  received_at timestamptz NOT NULL,
  payload_verbatim jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS enquiry (
  reference text PRIMARY KEY,
  type text NOT NULL,
  destination text NOT NULL,
  response_days integer NOT NULL,
  from_name text,
  from_email text NOT NULL,
  message text,
  recorded_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS position (
  id bigserial PRIMARY KEY,
  title text NOT NULL,
  location text NOT NULL,
  department text NOT NULL,
  contract_type text NOT NULL,
  closes_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS news_item (
  id bigserial PRIMARY KEY,
  title text NOT NULL,
  tag text NOT NULL,
  outlet text NOT NULL,
  published_on date NOT NULL,
  link text NOT NULL,
  language text NOT NULL
);

CREATE TABLE IF NOT EXISTS statistic (
  key text PRIMARY KEY,
  value text NOT NULL,
  source text NOT NULL,
  year integer NOT NULL,
  geography text NOT NULL
);

CREATE TABLE IF NOT EXISTS claim_substantiation (
  id bigserial PRIMARY KEY,
  claim text NOT NULL,
  route text NOT NULL,
  first_published_on date NOT NULL,
  evidence jsonb NOT NULL,
  method_version text NOT NULL,
  approver text NOT NULL,
  review_on date NOT NULL,
  withdrawn_on date
);

CREATE INDEX IF NOT EXISTS idx_consumption_run ON consumption (run);
CREATE INDEX IF NOT EXISTS idx_consumption_input ON consumption (input_kind, input_ref);
CREATE INDEX IF NOT EXISTS idx_output_run ON output (run);
CREATE INDEX IF NOT EXISTS idx_credit_movement_period ON credit_movement (period);
CREATE INDEX IF NOT EXISTS idx_record_kind ON record_entry (kind);

CREATE TABLE IF NOT EXISTS app_reference (
  prefix text PRIMARY KEY,
  last_n integer NOT NULL
);

CREATE TABLE IF NOT EXISTS app_account (
  email text PRIMARY KEY,
  name text NOT NULL,
  roles jsonb NOT NULL,
  sites jsonb NOT NULL,
  grant_end date NOT NULL
);

ALTER TABLE balance_period ADD COLUMN IF NOT EXISTS carried_forward jsonb;
ALTER TABLE balance_period ADD COLUMN IF NOT EXISTS expired jsonb;

ALTER TABLE carbon_figure ADD COLUMN IF NOT EXISTS boundary text;

CREATE TABLE IF NOT EXISTS app_account (
  email text PRIMARY KEY,
  name text NOT NULL,
  roles jsonb NOT NULL,
  sites jsonb NOT NULL,
  grant_end date NOT NULL
);

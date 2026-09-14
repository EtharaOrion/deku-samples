-- idempotent schema for Ravel

CREATE TABLE IF NOT EXISTS sites (
  reference text PRIMARY KEY,
  name text NOT NULL,
  confidence text NOT NULL,
  nameplate_kg bigint NOT NULL,
  contracted_kg bigint NOT NULL,
  capacity_basis text NOT NULL,
  certification_state text NOT NULL,
  last_revised date NOT NULL
);

CREATE TABLE IF NOT EXISTS parties (
  reference text PRIMARY KEY,
  kind text NOT NULL
);

CREATE TABLE IF NOT EXISTS party_versions (
  id bigserial PRIMARY KEY,
  party text NOT NULL,
  name text NOT NULL,
  effective_from date NOT NULL
);

CREATE TABLE IF NOT EXISTS collectors (
  reference text PRIMARY KEY,
  party text NOT NULL,
  country text NOT NULL,
  registration text NOT NULL,
  registration_expiry date NOT NULL,
  collection_site_types text[] NOT NULL,
  declared_streams text[] NOT NULL,
  scheme_status text NOT NULL
);

CREATE TABLE IF NOT EXISTS approval_periods (
  id bigserial PRIMARY KEY,
  collector text NOT NULL,
  state text NOT NULL,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  condition text,
  condition_closes_on date
);

CREATE TABLE IF NOT EXISTS findings (
  id bigserial PRIMARY KEY,
  reference text NOT NULL UNIQUE,
  collector text,
  batch text,
  description text NOT NULL,
  departure_bp integer,
  state text NOT NULL DEFAULT 'open',
  opened_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  reference text PRIMARY KEY,
  site text NOT NULL,
  calibrated_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS batches (
  reference text PRIMARY KEY,
  collector text NOT NULL,
  site text NOT NULL,
  grade text NOT NULL,
  category text NOT NULL,
  gross_g bigint NOT NULL,
  tare_g bigint NOT NULL,
  net_g bigint NOT NULL,
  moisture_bp integer NOT NULL,
  moisture_method text NOT NULL,
  device text NOT NULL,
  received_on date NOT NULL,
  composition jsonb NOT NULL,
  contamination jsonb NOT NULL,
  custody jsonb NOT NULL,
  accepted_g bigint,
  rejected_g bigint,
  rejected_destination text,
  reject_reason text,
  claimable_from date,
  state text NOT NULL DEFAULT 'accepted'
);

CREATE TABLE IF NOT EXISTS runs (
  reference text PRIMARY KEY,
  run_type text NOT NULL,
  site text NOT NULL,
  equipment text NOT NULL,
  recipe_version text NOT NULL,
  operator text NOT NULL,
  started_at timestamptz NOT NULL,
  closed_at timestamptz,
  losses_g bigint,
  actual_setpoints jsonb,
  within_tolerance boolean,
  annotated_by text,
  annotation text
);

CREATE TABLE IF NOT EXISTS consumptions (
  id bigserial PRIMARY KEY,
  run text NOT NULL,
  batch text,
  input_reference text,
  input_kind text NOT NULL,
  mass_g bigint NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  effective_on date NOT NULL,
  credit_reference text
);

CREATE TABLE IF NOT EXISTS outputs (
  reference text PRIMARY KEY,
  run text NOT NULL,
  kind text NOT NULL,
  mass_g bigint NOT NULL,
  disposition text,
  lot text
);

CREATE TABLE IF NOT EXISTS lots (
  reference text PRIMARY KEY,
  grade text NOT NULL,
  site text NOT NULL,
  run text,
  mass_g bigint NOT NULL,
  disposition text NOT NULL DEFAULT 'pending',
  claim_type text NOT NULL,
  blended_from jsonb
);

CREATE TABLE IF NOT EXISTS test_results (
  reference text PRIMARY KEY,
  subject_kind text NOT NULL,
  subject text NOT NULL,
  property text NOT NULL,
  method text NOT NULL,
  instrument text NOT NULL,
  analyst text NOT NULL,
  value text NOT NULL,
  unit text NOT NULL,
  uncertainty_bp integer NOT NULL,
  method_mismatch boolean NOT NULL DEFAULT false,
  usable_for_release boolean NOT NULL DEFAULT true,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deviations (
  reference text PRIMARY KEY,
  state text NOT NULL DEFAULT 'open',
  raised_by text NOT NULL,
  reason text NOT NULL,
  outcome text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS deviation_subjects (
  id bigserial PRIMARY KEY,
  deviation text NOT NULL,
  subject_kind text NOT NULL,
  subject text NOT NULL
);

CREATE TABLE IF NOT EXISTS overrides (
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

CREATE TABLE IF NOT EXISTS balance_periods (
  id text PRIMARY KEY,
  site text NOT NULL,
  grade text NOT NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  state text NOT NULL DEFAULT 'open',
  carry_over_limit_bp integer NOT NULL,
  allocation_basis text NOT NULL DEFAULT 'mass',
  closed_on date,
  cut_off date,
  closed_by text
);

CREATE TABLE IF NOT EXISTS credit_movements (
  reference text PRIMARY KEY,
  period text NOT NULL,
  category text NOT NULL,
  direction text NOT NULL,
  mass_g bigint NOT NULL,
  reason text NOT NULL,
  lot text,
  origin_site text,
  movement text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  effective_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS transfers (
  reference text PRIMARY KEY,
  from_period text NOT NULL,
  to_period text NOT NULL,
  mass_g bigint NOT NULL,
  category text NOT NULL,
  moved_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS conversion_factors (
  reference text PRIMARY KEY,
  site text NOT NULL,
  factor_bp integer NOT NULL,
  derived_from date,
  derived_to date,
  derived_in_g bigint NOT NULL,
  derived_out_g bigint NOT NULL,
  provisional boolean NOT NULL,
  published_on date NOT NULL,
  published_by text NOT NULL,
  superseded_by text
);

CREATE TABLE IF NOT EXISTS carbon_methods (
  id text NOT NULL,
  version integer NOT NULL,
  standard text NOT NULL,
  functional_unit text NOT NULL,
  boundary text NOT NULL,
  allocation_basis text NOT NULL,
  reviewer text NOT NULL,
  published_on date NOT NULL,
  published_by text NOT NULL,
  data_quality_rules jsonb NOT NULL,
  emission_factors jsonb NOT NULL,
  superseded_by integer,
  PRIMARY KEY (id, version)
);

CREATE TABLE IF NOT EXISTS carbon_figures (
  id text PRIMARY KEY,
  lot text NOT NULL,
  method_id text NOT NULL,
  method_version integer NOT NULL,
  value_mg_per_kg bigint NOT NULL,
  uncertainty_bp integer NOT NULL,
  primary_share_bp integer NOT NULL,
  breakdown jsonb NOT NULL,
  comparator jsonb NOT NULL,
  energy jsonb NOT NULL,
  computed_against jsonb NOT NULL,
  cache_valid boolean NOT NULL DEFAULT true,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS energy_instruments (
  reference text PRIMARY KEY,
  quantity_kwh bigint NOT NULL,
  vintage integer NOT NULL,
  region text NOT NULL,
  state text NOT NULL
);

CREATE TABLE IF NOT EXISTS energy_retirements (
  id bigserial PRIMARY KEY,
  instrument text NOT NULL,
  period text NOT NULL,
  quantity_kwh bigint NOT NULL,
  retired_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS specifications (
  grade text NOT NULL,
  version integer NOT NULL,
  issued_on date NOT NULL,
  virgin_reference jsonb NOT NULL,
  rows jsonb NOT NULL,
  state text NOT NULL DEFAULT 'current',
  PRIMARY KEY (grade, version)
);

CREATE TABLE IF NOT EXISTS customers (
  reference text PRIMARY KEY,
  party text NOT NULL,
  contact text NOT NULL,
  application text NOT NULL,
  industry text NOT NULL
);

CREATE TABLE IF NOT EXISTS specification_issues (
  id bigserial PRIMARY KEY,
  customer text NOT NULL,
  grade text NOT NULL,
  version integer NOT NULL,
  issued_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS conformances (
  reference text PRIMARY KEY,
  customer text NOT NULL,
  application text NOT NULL,
  grade text NOT NULL,
  spec_version integer NOT NULL,
  trials jsonb NOT NULL,
  outcome text NOT NULL DEFAULT 'in_trial'
);

CREATE TABLE IF NOT EXISTS change_notices (
  reference text PRIMARY KEY,
  title text NOT NULL,
  detail text NOT NULL,
  parameter text NOT NULL,
  notice_period_days integer NOT NULL,
  specifications_affected jsonb,
  customers_affected jsonb,
  qualifications_affected integer,
  state text NOT NULL DEFAULT 'proposed',
  raised_by text NOT NULL,
  released_at timestamptz
);

CREATE TABLE IF NOT EXISTS change_acknowledgements (
  id bigserial PRIMARY KEY,
  notice text NOT NULL,
  customer text NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  waived boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS contracts (
  id text PRIMARY KEY,
  customer text NOT NULL,
  site text NOT NULL,
  period text NOT NULL,
  committed_kg bigint NOT NULL,
  floor_bp integer NOT NULL,
  delivered_kg bigint NOT NULL DEFAULT 0,
  shortfall_consequence text NOT NULL,
  unreachable_since date
);

CREATE TABLE IF NOT EXISTS allocations (
  reference text PRIMARY KEY,
  contract text NOT NULL,
  lot text NOT NULL,
  mass_kg bigint NOT NULL,
  decided_by text,
  favoured_over jsonb,
  allocated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS certificates (
  number text PRIMARY KEY,
  version integer NOT NULL,
  site text NOT NULL,
  grade text NOT NULL,
  period text NOT NULL,
  claim_type text NOT NULL,
  content_bp integer NOT NULL,
  category_split jsonb NOT NULL,
  lots jsonb NOT NULL,
  specification_version integer NOT NULL,
  recipient text NOT NULL,
  carbon_figure text,
  scheme text NOT NULL,
  registration text NOT NULL,
  test_results jsonb NOT NULL,
  permitted_statement text NOT NULL,
  prohibited_statement text NOT NULL,
  provisional_factor boolean NOT NULL,
  conditions jsonb NOT NULL,
  derived_from jsonb NOT NULL,
  signer text NOT NULL,
  signed_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'issued',
  withdrawn_by text,
  withdrawn_on date,
  withdrawal_reason text,
  notified_recipients jsonb,
  void_statements jsonb,
  derived_certificates jsonb,
  batch_traversal jsonb
);

CREATE TABLE IF NOT EXISTS certificate_sequences (
  site text PRIMARY KEY,
  next_number bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS restatements (
  reference text PRIMARY KEY,
  period text NOT NULL,
  reason text NOT NULL,
  opened_by text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  opened_on date NOT NULL,
  certificates jsonb,
  content_movements jsonb,
  conversion_factor text,
  state text NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS resolutions (
  id bigserial PRIMARY KEY,
  restatement text NOT NULL,
  certificate text NOT NULL,
  outcome text NOT NULL,
  reason text NOT NULL,
  resolved_by text NOT NULL,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restatement, certificate)
);

CREATE TABLE IF NOT EXISTS site_certifications (
  id bigserial PRIMARY KEY,
  site text NOT NULL,
  state text NOT NULL,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  recorded_by text NOT NULL,
  note text
);

CREATE TABLE IF NOT EXISTS record_entries (
  seq bigserial PRIMARY KEY,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  event_at timestamptz,
  effective_on date,
  person text,
  site text,
  object_kind text,
  object_reference text,
  act text NOT NULL,
  detail jsonb NOT NULL,
  digest text NOT NULL,
  prev_digest text NOT NULL,
  content_deleted_on date,
  legal_hold boolean NOT NULL DEFAULT false,
  kind text NOT NULL DEFAULT 'act'
);

CREATE TABLE IF NOT EXISTS legal_holds (
  reference text PRIMARY KEY,
  seq bigint NOT NULL,
  placed_by text NOT NULL,
  placed_on date NOT NULL,
  lifted_on date
);

CREATE TABLE IF NOT EXISTS exports (
  reference text PRIMARY KEY,
  scope jsonb NOT NULL,
  performed_by text NOT NULL,
  performed_at timestamptz NOT NULL DEFAULT now(),
  result_count integer NOT NULL,
  digest text NOT NULL
);

CREATE TABLE IF NOT EXISTS inbound_records (
  reference text PRIMARY KEY,
  source text NOT NULL,
  received_at timestamptz NOT NULL,
  payload_verbatim text NOT NULL,
  payload jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token text PRIMARY KEY,
  email text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS grants (
  email text PRIMARY KEY,
  name text NOT NULL,
  role text NOT NULL,
  sites text[] NOT NULL,
  ends_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key text NOT NULL,
  route text NOT NULL,
  body_hash text NOT NULL,
  status integer NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, route)
);

CREATE TABLE IF NOT EXISTS enquiries (
  id bigserial PRIMARY KEY,
  reference text NOT NULL UNIQUE,
  type text NOT NULL,
  destination text NOT NULL,
  response_days integer NOT NULL,
  name text,
  email text,
  message text,
  deadline date,
  opened_record text,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS positions (
  id bigserial PRIMARY KEY,
  title text NOT NULL,
  location text NOT NULL,
  department text NOT NULL,
  contract_type text NOT NULL,
  closes_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS news_items (
  id bigserial PRIMARY KEY,
  title text NOT NULL,
  tag text NOT NULL,
  outlet text NOT NULL,
  published_on date NOT NULL,
  link text NOT NULL,
  language text NOT NULL
);

CREATE TABLE IF NOT EXISTS statistics (
  key text PRIMARY KEY,
  value text NOT NULL,
  source text NOT NULL,
  year integer NOT NULL,
  geography text NOT NULL
);

CREATE TABLE IF NOT EXISTS claim_substantiations (
  key text PRIMARY KEY,
  claim text NOT NULL,
  route text NOT NULL,
  first_published_on date NOT NULL,
  evidence jsonb NOT NULL,
  method_version text,
  approver text NOT NULL,
  review_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS site_events (
  id bigserial PRIMARY KEY,
  site text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  kind text NOT NULL,
  detail jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

CREATE INDEX IF NOT EXISTS idx_consumptions_run ON consumptions(run);
CREATE INDEX IF NOT EXISTS idx_consumptions_batch ON consumptions(batch);
CREATE INDEX IF NOT EXISTS idx_outputs_run ON outputs(run);
CREATE INDEX IF NOT EXISTS idx_test_results_subject ON test_results(subject);
CREATE INDEX IF NOT EXISTS idx_movements_period ON credit_movements(period);
CREATE INDEX IF NOT EXISTS idx_record_entries_act ON record_entries(act);

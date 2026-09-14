-- Ravel schema. Applied once at first start.

CREATE TABLE IF NOT EXISTS site (
  reference text PRIMARY KEY,
  name text NOT NULL,
  confidence text NOT NULL,
  certification_state text NOT NULL,
  nameplate_kg bigint NOT NULL,
  contracted_kg bigint NOT NULL,
  capacity_basis text NOT NULL,
  last_revised text NOT NULL
);

CREATE TABLE IF NOT EXISTS party_version (
  id serial PRIMARY KEY,
  reference text NOT NULL,
  name text NOT NULL,
  effective_from text NOT NULL
);
CREATE INDEX IF NOT EXISTS party_version_ref_idx ON party_version (reference, effective_from);

CREATE TABLE IF NOT EXISTS collector (
  reference text PRIMARY KEY,
  country text NOT NULL,
  registration text NOT NULL,
  registration_expiry text NOT NULL,
  site_types jsonb NOT NULL,
  streams jsonb NOT NULL,
  scheme_status text NOT NULL
);

CREATE TABLE IF NOT EXISTS approval_period (
  id serial PRIMARY KEY,
  collector text NOT NULL,
  state text NOT NULL,
  valid_from text NOT NULL,
  valid_to text NOT NULL,
  condition text,
  condition_closes_on text
);
CREATE INDEX IF NOT EXISTS approval_collector_idx ON approval_period (collector);

CREATE TABLE IF NOT EXISTS finding (
  id serial PRIMARY KEY,
  collector text NOT NULL,
  raised_on text NOT NULL,
  detail text NOT NULL,
  basis text NOT NULL,
  state text NOT NULL DEFAULT 'open',
  open boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS device (
  reference text PRIMARY KEY,
  site text NOT NULL,
  calibrated_on text NOT NULL
);

CREATE TABLE IF NOT EXISTS weighing (
  reference text PRIMARY KEY,
  site text NOT NULL,
  device text NOT NULL,
  calibrated_on text NOT NULL,
  net_g bigint NOT NULL,
  recorded_on text NOT NULL
);

CREATE TABLE IF NOT EXISTS batch (
  reference text PRIMARY KEY,
  collector text NOT NULL,
  collector_name text NOT NULL,
  site text NOT NULL,
  grade text NOT NULL,
  category text NOT NULL,
  gross_g bigint NOT NULL,
  tare_g bigint NOT NULL,
  net_g bigint NOT NULL,
  moisture_bp integer NOT NULL,
  moisture_method text NOT NULL,
  device text NOT NULL,
  received_on text NOT NULL,
  composition jsonb NOT NULL,
  contamination jsonb NOT NULL,
  custody jsonb NOT NULL,
  accepted_g bigint,
  rejected_g bigint NOT NULL DEFAULT 0,
  rejected_destination text,
  rejected_reason text,
  claimable_from text,
  finding_id integer,
  created_by text NOT NULL,
  accepted boolean NOT NULL DEFAULT false,
  delivered_g bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS batch_collector_idx ON batch (collector);

CREATE TABLE IF NOT EXISTS recipe (
  version text PRIMARY KEY,
  run_type text NOT NULL,
  set_points jsonb NOT NULL,
  reagents jsonb NOT NULL,
  residence_time_minutes integer NOT NULL,
  released_by text NOT NULL,
  released_on text NOT NULL
);

CREATE TABLE IF NOT EXISTS run (
  reference text PRIMARY KEY,
  run_type text NOT NULL,
  site text NOT NULL,
  equipment text NOT NULL,
  recipe_version text NOT NULL,
  operator text NOT NULL,
  started_at text NOT NULL,
  closed_at text,
  losses_g bigint,
  closed boolean NOT NULL DEFAULT false,
  within_tolerance boolean,
  set_points jsonb,
  close_attempts integer NOT NULL DEFAULT 0,
  created_by text NOT NULL
);
CREATE INDEX IF NOT EXISTS run_site_idx ON run (site);

CREATE TABLE IF NOT EXISTS consumption (
  id serial PRIMARY KEY,
  run text NOT NULL,
  batch text NOT NULL,
  mass_g bigint NOT NULL,
  effective_on text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  event_at text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS consumption_batch_idx ON consumption (batch);
CREATE INDEX IF NOT EXISTS consumption_run_idx ON consumption (run);

CREATE TABLE IF NOT EXISTS output (
  reference text PRIMARY KEY,
  run text NOT NULL,
  kind text NOT NULL,
  mass_g bigint NOT NULL,
  disposition text,
  lot text,
  created_by text NOT NULL
);
CREATE INDEX IF NOT EXISTS output_run_idx ON output (run);
CREATE INDEX IF NOT EXISTS output_lot_idx ON output (lot);

CREATE TABLE IF NOT EXISTS lot (
  reference text PRIMARY KEY,
  run text NOT NULL,
  site text NOT NULL,
  grade text NOT NULL,
  mass_g bigint NOT NULL,
  disposition text NOT NULL DEFAULT 'pending',
  claim_type text NOT NULL,
  specification_version text,
  provisional_factor boolean NOT NULL DEFAULT false,
  created_by text NOT NULL
);
CREATE INDEX IF NOT EXISTS lot_site_idx ON lot (site);

CREATE TABLE IF NOT EXISTS test_result (
  id serial PRIMARY KEY,
  lot text,
  batch text,
  property text NOT NULL,
  method text NOT NULL,
  instrument text NOT NULL,
  analyst text NOT NULL,
  value text NOT NULL,
  unit text NOT NULL,
  uncertainty_bp integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS test_lot_idx ON test_result (lot);

CREATE TABLE IF NOT EXISTS deviation (
  reference text PRIMARY KEY,
  runs jsonb NOT NULL,
  lots jsonb NOT NULL,
  raised_by text NOT NULL,
  raised_at text NOT NULL,
  description text NOT NULL,
  state text NOT NULL DEFAULT 'open',
  outcome text
);

CREATE TABLE IF NOT EXISTS override (
  reference text PRIMARY KEY,
  lot text NOT NULL,
  separation text NOT NULL,
  reason text NOT NULL,
  authorised_by text NOT NULL,
  authorised_on text NOT NULL,
  reviewed boolean NOT NULL DEFAULT false,
  reviewed_by text,
  reviewed_on text
);
CREATE INDEX IF NOT EXISTS override_lot_idx ON override (lot);

CREATE TABLE IF NOT EXISTS balance_period (
  id text PRIMARY KEY,
  site text NOT NULL,
  grade text NOT NULL,
  period_from text NOT NULL,
  period_to text NOT NULL,
  state text NOT NULL DEFAULT 'open',
  carry_over_limit_bp integer NOT NULL,
  closed_on text,
  cut_off text,
  allocation_basis text NOT NULL DEFAULT 'mass',
  carried_forward jsonb,
  expired jsonb,
  closed_by text
);

CREATE TABLE IF NOT EXISTS credit_movement (
  id serial PRIMARY KEY,
  balance_period text NOT NULL,
  category text NOT NULL,
  direction text NOT NULL,
  mass_g bigint NOT NULL,
  lot text,
  kind text NOT NULL,
  derivation jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_on text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  consumed_batch text,
  transfer text
);
CREATE INDEX IF NOT EXISTS movement_period_idx ON credit_movement (balance_period);

CREATE TABLE IF NOT EXISTS transfer (
  reference text PRIMARY KEY,
  from_period text NOT NULL,
  to_period text NOT NULL,
  mass_g bigint NOT NULL,
  category text NOT NULL,
  moved_on text NOT NULL
);

CREATE TABLE IF NOT EXISTS conversion_factor (
  reference text PRIMARY KEY,
  site text NOT NULL,
  factor_bp integer NOT NULL,
  derived_from text,
  derived_to text,
  derived_in_g bigint NOT NULL DEFAULT 0,
  derived_out_g bigint NOT NULL DEFAULT 0,
  provisional boolean NOT NULL DEFAULT false,
  published_by text NOT NULL,
  published_on text NOT NULL
);

CREATE TABLE IF NOT EXISTS carbon_method (
  id text NOT NULL,
  version integer NOT NULL,
  standard text NOT NULL,
  functional_unit text NOT NULL,
  boundary text NOT NULL,
  allocation_basis text NOT NULL,
  reviewer text NOT NULL,
  published_on text NOT NULL,
  data_quality jsonb NOT NULL,
  emission_factors jsonb NOT NULL,
  primary_threshold_bp integer NOT NULL,
  superseded boolean NOT NULL DEFAULT false,
  superseded_on text,
  published_by text NOT NULL,
  PRIMARY KEY (id, version)
);

CREATE TABLE IF NOT EXISTS carbon_figure (
  id serial PRIMARY KEY,
  lot text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  value_mg_per_kg bigint NOT NULL,
  uncertainty_bp integer NOT NULL,
  primary_share_bp integer NOT NULL,
  method_id text NOT NULL,
  method_version integer NOT NULL,
  boundary text NOT NULL,
  breakdown jsonb NOT NULL,
  energy_location_mg_per_kg bigint,
  energy_market_mg_per_kg bigint,
  comparator jsonb NOT NULL,
  input_versions jsonb NOT NULL,
  superseded boolean NOT NULL DEFAULT false,
  superseded_by integer,
  recomputed_by text,
  recomputed_on text,
  recomputed_reason text,
  cache_valid boolean NOT NULL DEFAULT true,
  computed_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS figure_lot_idx ON carbon_figure (lot);

CREATE TABLE IF NOT EXISTS energy_instrument (
  reference text PRIMARY KEY,
  quantity_kwh bigint NOT NULL,
  vintage text NOT NULL,
  region text NOT NULL,
  state text NOT NULL
);

CREATE TABLE IF NOT EXISTS energy_retirement (
  id serial PRIMARY KEY,
  instrument text NOT NULL,
  balance_period text NOT NULL,
  retired_kwh bigint NOT NULL,
  retired_on text NOT NULL,
  retired_by text NOT NULL,
  consumption_vintage text NOT NULL DEFAULT '2026',
  consumption_region text NOT NULL DEFAULT 'EU-27'
);

CREATE TABLE IF NOT EXISTS specification (
  id text NOT NULL,
  version integer NOT NULL,
  issued_on text NOT NULL,
  rows jsonb NOT NULL,
  virgin_reference jsonb NOT NULL,
  superseded boolean NOT NULL DEFAULT false,
  PRIMARY KEY (id, version)
);

CREATE TABLE IF NOT EXISTS spec_issue (
  id serial PRIMARY KEY,
  spec_id text NOT NULL,
  spec_version integer NOT NULL,
  customer text NOT NULL,
  issued_on text NOT NULL
);

CREATE TABLE IF NOT EXISTS customer (
  reference text PRIMARY KEY,
  contact text NOT NULL,
  holds jsonb NOT NULL,
  application text NOT NULL,
  industry text NOT NULL
);

CREATE TABLE IF NOT EXISTS conformance (
  id serial PRIMARY KEY,
  customer text NOT NULL,
  spec_id text NOT NULL,
  spec_version integer NOT NULL,
  application text NOT NULL,
  trials jsonb NOT NULL,
  outcome text NOT NULL
);

CREATE TABLE IF NOT EXISTS change_notice (
  reference text PRIMARY KEY,
  proposed_by text NOT NULL,
  raised_on text NOT NULL,
  change text NOT NULL,
  change_type text NOT NULL,
  parameter text,
  old_value text,
  new_value text,
  specifications_affected jsonb NOT NULL DEFAULT '[]'::jsonb,
  customers_affected jsonb NOT NULL DEFAULT '[]'::jsonb,
  qualifications_affected integer NOT NULL DEFAULT 0,
  notice_period_days integer NOT NULL DEFAULT 30,
  state text NOT NULL DEFAULT 'proposed',
  notified jsonb NOT NULL DEFAULT '[]'::jsonb,
  waivers jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS contract (
  id text PRIMARY KEY,
  recipient text NOT NULL,
  site text NOT NULL,
  period text NOT NULL,
  committed_kg bigint NOT NULL,
  floor_bp integer NOT NULL,
  delivered_kg bigint NOT NULL DEFAULT 0,
  shortfall_consequence text NOT NULL,
  unreachable_on text,
  unreachable_allocation text
);

CREATE TABLE IF NOT EXISTS allocation (
  id serial PRIMARY KEY,
  contract text NOT NULL,
  lot text NOT NULL,
  mass_g bigint NOT NULL,
  decided_by text NOT NULL,
  favoured_over jsonb NOT NULL DEFAULT '[]'::jsonb,
  allocated_on text NOT NULL
);

CREATE TABLE IF NOT EXISTS certificate (
  number text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  site text NOT NULL,
  lots jsonb NOT NULL,
  grade text NOT NULL,
  specification_version text NOT NULL,
  claim_type text NOT NULL,
  content_bp integer NOT NULL,
  category_split jsonb NOT NULL,
  balance_period text NOT NULL,
  carbon jsonb NOT NULL,
  primary_share_bp integer NOT NULL,
  scheme text NOT NULL,
  registration text NOT NULL,
  test_results jsonb NOT NULL,
  permitted_statement text NOT NULL,
  prohibited_statement text NOT NULL,
  signer text NOT NULL,
  signed_at text NOT NULL,
  verification_url text NOT NULL,
  state text NOT NULL DEFAULT 'issued',
  provisional_factor boolean NOT NULL DEFAULT false,
  conditions jsonb NOT NULL,
  figure_versions jsonb NOT NULL,
  recipient text NOT NULL,
  recipient_name text NOT NULL,
  withdrawn_on text,
  withdrawn_by text,
  withdrawal_reason text,
  notified_recipients jsonb,
  void_statements jsonb,
  derived_certificates jsonb,
  batch_traversal jsonb
);
CREATE INDEX IF NOT EXISTS cert_lot_idx ON certificate USING gin (lots);

CREATE TABLE IF NOT EXISTS restatement (
  reference text PRIMARY KEY,
  balance_period text NOT NULL,
  reason text NOT NULL,
  opened_on text NOT NULL,
  opened_by text NOT NULL,
  category text NOT NULL DEFAULT 'post_consumer',
  revised_factor_bp integer,
  content_movements jsonb,
  closed boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS resolution (
  id serial PRIMARY KEY,
  restatement text NOT NULL,
  certificate text NOT NULL,
  outcome text NOT NULL,
  reason text NOT NULL,
  resolved_on text NOT NULL DEFAULT (now()::text),
  resolved_by text NOT NULL,
  UNIQUE (restatement, certificate)
);

CREATE TABLE IF NOT EXISTS inbound_record (
  id serial PRIMARY KEY,
  source text NOT NULL,
  received_at text NOT NULL,
  payload_verbatim text NOT NULL,
  payload jsonb NOT NULL,
  reference text NOT NULL
);
CREATE INDEX IF NOT EXISTS inbound_source_idx ON inbound_record (source);

CREATE TABLE IF NOT EXISTS record_entry (
  seq bigserial PRIMARY KEY,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  event_at text NOT NULL DEFAULT '',
  effective_on text NOT NULL DEFAULT '',
  person text NOT NULL DEFAULT 'system',
  site text,
  object text,
  act text NOT NULL,
  payload text NOT NULL,
  digest text NOT NULL,
  prev_digest text NOT NULL,
  corrects bigint,
  kind text NOT NULL DEFAULT 'act',
  content_deleted_on text,
  legal_hold boolean NOT NULL DEFAULT false,
  refused boolean NOT NULL DEFAULT false,
  outcome text
);
CREATE UNIQUE INDEX IF NOT EXISTS record_seq_key ON record_entry (seq);

CREATE TABLE IF NOT EXISTS export_record (
  reference text PRIMARY KEY,
  scope jsonb NOT NULL,
  bundle jsonb NOT NULL,
  exported_by text NOT NULL,
  exported_on text NOT NULL,
  empty boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS legal_hold (
  reference text PRIMARY KEY,
  seq bigint NOT NULL,
  placed_on text NOT NULL,
  placed_by text NOT NULL,
  note text NOT NULL
);

CREATE TABLE IF NOT EXISTS idempotency (
  key text NOT NULL,
  route text NOT NULL,
  body_hash text NOT NULL,
  status integer NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, route, body_hash)
);

CREATE TABLE IF NOT EXISTS enquiry (
  reference text PRIMARY KEY,
  type text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  message text NOT NULL,
  destination text NOT NULL,
  response_days integer NOT NULL,
  created_on text NOT NULL,
  deadline text
);

CREATE TABLE IF NOT EXISTS position (
  id serial PRIMARY KEY,
  title text NOT NULL,
  location text NOT NULL,
  department text NOT NULL,
  contract_type text NOT NULL,
  closes_on text NOT NULL
);

CREATE TABLE IF NOT EXISTS news_item (
  id serial PRIMARY KEY,
  title text NOT NULL,
  tag text NOT NULL,
  outlet text NOT NULL,
  dated text NOT NULL,
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
  id serial PRIMARY KEY,
  claim text NOT NULL,
  route text NOT NULL,
  first_published text NOT NULL,
  evidence jsonb NOT NULL,
  method_version text NOT NULL,
  approver text NOT NULL,
  review_on text NOT NULL,
  state text NOT NULL DEFAULT 'published'
);

CREATE TABLE IF NOT EXISTS certification_period (
  id serial PRIMARY KEY,
  site text NOT NULL,
  state text NOT NULL,
  valid_from text NOT NULL,
  valid_to text,
  recorded_on text NOT NULL DEFAULT (now()::text),
  recorded_by text NOT NULL DEFAULT 'system'
);

CREATE TABLE IF NOT EXISTS enquiry_record (
  reference text PRIMARY KEY,
  kind text NOT NULL,
  opened_on text NOT NULL DEFAULT (now()::text),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS recompute_log (
  id serial PRIMARY KEY,
  figure_id integer NOT NULL,
  by_person text NOT NULL,
  on_date text NOT NULL,
  reason text NOT NULL,
  superseded_version integer NOT NULL,
  certificates jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS app_user (
  email text PRIMARY KEY,
  name text NOT NULL,
  role text NOT NULL,
  sites jsonb NOT NULL,
  grant_ends text NOT NULL
);

CREATE TABLE IF NOT EXISTS access_grant (
  id serial PRIMARY KEY,
  email text NOT NULL,
  sites jsonb NOT NULL,
  valid_to text NOT NULL,
  granted_on text NOT NULL,
  granted_by text NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  jti text PRIMARY KEY,
  email text NOT NULL,
  exp timestamptz NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  password_verified boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS ref_seq (
  kind text PRIMARY KEY,
  n integer NOT NULL
);

CREATE TABLE IF NOT EXISTS verify_hits (
  number text PRIMARY KEY,
  hits integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS close_queue (
  id serial PRIMARY KEY,
  run text NOT NULL,
  queued_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL DEFAULT 'queued',
  person text NOT NULL
);


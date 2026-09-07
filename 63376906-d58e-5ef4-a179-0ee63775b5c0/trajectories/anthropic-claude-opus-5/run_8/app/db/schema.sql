-- Ravel schema. Every record lives here.
-- Migration rule: a field's meaning never changes; a new field is added instead.

CREATE TABLE IF NOT EXISTS schema_migration (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS person (
  identifier text PRIMARY KEY,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  role text NOT NULL,
  sites text[] NOT NULL DEFAULT '{}',
  grant_ends_on date,
  retention_months int NOT NULL DEFAULT 120
);

CREATE TABLE IF NOT EXISTS site (
  reference text PRIMARY KEY,
  name text NOT NULL,
  confidence text NOT NULL,
  nameplate_kg bigint NOT NULL,
  contracted_kg bigint NOT NULL,
  certification_state text NOT NULL,
  capacity_basis text NOT NULL,
  last_revised date NOT NULL
);

CREATE TABLE IF NOT EXISTS site_certification (
  id bigserial PRIMARY KEY,
  site text NOT NULL REFERENCES site(reference),
  state text NOT NULL,
  grade text,
  effective_from date NOT NULL,
  effective_to date,
  reason text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by text
);

CREATE TABLE IF NOT EXISTS party_version (
  id bigserial PRIMARY KEY,
  reference text NOT NULL,
  kind text NOT NULL,
  name text NOT NULL,
  effective_from date NOT NULL,
  superseded_by bigint,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS party_version_ref ON party_version(reference, effective_from);

CREATE TABLE IF NOT EXISTS collector (
  reference text PRIMARY KEY,
  name text NOT NULL,
  country text NOT NULL,
  registration text NOT NULL,
  registration_expiry date NOT NULL,
  site_types jsonb NOT NULL DEFAULT '[]',
  declared_streams jsonb NOT NULL DEFAULT '[]',
  scheme_status text NOT NULL,
  account_email text
);

CREATE TABLE IF NOT EXISTS approval_period (
  id bigserial PRIMARY KEY,
  collector text NOT NULL REFERENCES collector(reference),
  state text NOT NULL,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  condition text,
  condition_closes_on date,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by text
);

CREATE TABLE IF NOT EXISTS finding (
  reference text PRIMARY KEY,
  collector text REFERENCES collector(reference),
  kind text NOT NULL,
  detail text NOT NULL,
  raised_on date NOT NULL,
  due_on date,
  state text NOT NULL DEFAULT 'open',
  batch text
);

CREATE TABLE IF NOT EXISTS weighing_device (
  reference text PRIMARY KEY,
  site text NOT NULL REFERENCES site(reference),
  calibrated_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS batch (
  reference text PRIMARY KEY,
  collector text NOT NULL REFERENCES collector(reference),
  site text NOT NULL REFERENCES site(reference),
  grade text NOT NULL DEFAULT 'N6',
  category text NOT NULL,
  gross_g bigint NOT NULL,
  tare_g bigint NOT NULL,
  net_g bigint NOT NULL,
  moisture_bp int NOT NULL,
  moisture_method text,
  device text REFERENCES weighing_device(reference),
  received_on date NOT NULL,
  composition jsonb NOT NULL DEFAULT '{}',
  contamination jsonb NOT NULL DEFAULT '{}',
  accepted_g bigint,
  rejected_g bigint NOT NULL DEFAULT 0,
  rejected_destination text,
  rejected_reason text,
  claimable_from date,
  accepted boolean NOT NULL DEFAULT true,
  event_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  effective_on date NOT NULL,
  created_by text NOT NULL
);

CREATE TABLE IF NOT EXISTS custody_link (
  id bigserial PRIMARY KEY,
  batch text NOT NULL REFERENCES batch(reference),
  ordinal int NOT NULL,
  kind text NOT NULL,
  link_date date NOT NULL,
  party text NOT NULL,
  arrived_on date,
  late boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS weighing (
  reference text PRIMARY KEY,
  batch text NOT NULL REFERENCES batch(reference),
  device text NOT NULL REFERENCES weighing_device(reference),
  gross_g bigint NOT NULL,
  tare_g bigint NOT NULL,
  net_g bigint NOT NULL,
  calibration_state text NOT NULL,
  weighed_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS recipe_version (
  reference text PRIMARY KEY,
  run_type text NOT NULL,
  version int NOT NULL,
  set_points jsonb NOT NULL,
  tolerances jsonb NOT NULL,
  reagents jsonb NOT NULL DEFAULT '[]',
  residence_time_min int,
  released_by text,
  published_on date
);

CREATE TABLE IF NOT EXISTS run (
  reference text PRIMARY KEY,
  run_type text NOT NULL,
  site text NOT NULL REFERENCES site(reference),
  equipment text NOT NULL,
  recipe_version text NOT NULL REFERENCES recipe_version(reference),
  operator text NOT NULL,
  started_at timestamptz NOT NULL,
  closed_at timestamptz,
  state text NOT NULL DEFAULT 'open',
  losses_g bigint,
  actual_set_points jsonb NOT NULL DEFAULT '{}',
  within_tolerance boolean,
  queued boolean NOT NULL DEFAULT false,
  event_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  effective_on date NOT NULL,
  created_by text NOT NULL
);

CREATE TABLE IF NOT EXISTS consumption (
  reference text PRIMARY KEY,
  run text NOT NULL REFERENCES run(reference),
  input_kind text NOT NULL,
  input_reference text NOT NULL,
  mass_g bigint NOT NULL,
  dry_mass_g bigint NOT NULL,
  event_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  effective_on date NOT NULL,
  created_by text NOT NULL
);
CREATE INDEX IF NOT EXISTS consumption_run ON consumption(run);
CREATE INDEX IF NOT EXISTS consumption_input ON consumption(input_reference);

CREATE TABLE IF NOT EXISTS output (
  reference text PRIMARY KEY,
  run text NOT NULL REFERENCES run(reference),
  kind text NOT NULL,
  mass_g bigint NOT NULL,
  disposition text,
  allocation_basis text,
  event_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  effective_on date NOT NULL,
  created_by text NOT NULL
);
CREATE INDEX IF NOT EXISTS output_run ON output(run);

CREATE TABLE IF NOT EXISTS lot (
  reference text PRIMARY KEY,
  grade text NOT NULL,
  site text NOT NULL REFERENCES site(reference),
  sites jsonb NOT NULL DEFAULT '[]',
  mass_g bigint NOT NULL,
  disposition text NOT NULL DEFAULT 'pending',
  disposition_by text,
  disposition_at timestamptz,
  claim_type text NOT NULL,
  output_reference text,
  specification_version int NOT NULL DEFAULT 3,
  blended_from jsonb,
  blend_content_bp int,
  provisional_factor boolean NOT NULL DEFAULT false,
  event_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  effective_on date NOT NULL,
  created_by text NOT NULL
);

CREATE TABLE IF NOT EXISTS test_result (
  reference text PRIMARY KEY,
  subject_kind text NOT NULL,
  subject_reference text NOT NULL,
  property text NOT NULL,
  method text NOT NULL,
  instrument text,
  analyst text NOT NULL,
  value text NOT NULL,
  unit text NOT NULL,
  uncertainty_bp int,
  method_mismatch boolean NOT NULL DEFAULT false,
  usable_for_release boolean NOT NULL DEFAULT true,
  entered_by text NOT NULL,
  event_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  effective_on date NOT NULL
);
CREATE INDEX IF NOT EXISTS test_result_subject ON test_result(subject_reference);

CREATE TABLE IF NOT EXISTS deviation (
  reference text PRIMARY KEY,
  state text NOT NULL DEFAULT 'open',
  runs text[] NOT NULL DEFAULT '{}',
  lots text[] NOT NULL DEFAULT '{}',
  detail text NOT NULL,
  outcome text,
  raised_by text NOT NULL,
  raised_on date NOT NULL,
  closed_by text,
  closed_on date
);

CREATE TABLE IF NOT EXISTS override (
  reference text PRIMARY KEY,
  separation text NOT NULL,
  reason text NOT NULL,
  lot text NOT NULL,
  authorised_by text NOT NULL,
  created_by text NOT NULL,
  created_on date NOT NULL,
  reviewed boolean NOT NULL DEFAULT false,
  reviewed_by text,
  reviewed_at timestamptz
);

CREATE TABLE IF NOT EXISTS conversion_factor (
  reference text PRIMARY KEY,
  site text NOT NULL REFERENCES site(reference),
  version int NOT NULL DEFAULT 1,
  factor_bp int NOT NULL,
  derived_from date,
  derived_to date,
  derived_in_g bigint NOT NULL,
  derived_out_g bigint NOT NULL,
  provisional boolean NOT NULL DEFAULT false,
  superseded_by text,
  published_by text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS balance_period (
  id text PRIMARY KEY,
  site text NOT NULL REFERENCES site(reference),
  grade text NOT NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  state text NOT NULL DEFAULT 'open',
  carry_over_limit_bp int NOT NULL,
  allocation_basis text NOT NULL DEFAULT 'mass',
  metered_kwh bigint NOT NULL DEFAULT 0,
  closed_on date,
  cut_off date,
  closed_by text,
  carried_forward jsonb,
  expired jsonb
);

CREATE TABLE IF NOT EXISTS credit_movement (
  id bigserial PRIMARY KEY,
  period text NOT NULL REFERENCES balance_period(id),
  category text NOT NULL,
  direction text NOT NULL,
  mass_g bigint NOT NULL,
  source_kind text NOT NULL,
  source_reference text,
  lot text,
  origin_site text,
  movement_reference text,
  fresh_credit boolean,
  derivation jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  effective_on date NOT NULL
);
CREATE INDEX IF NOT EXISTS credit_movement_period ON credit_movement(period);

CREATE TABLE IF NOT EXISTS transfer (
  reference text PRIMARY KEY,
  from_period text NOT NULL REFERENCES balance_period(id),
  to_period text NOT NULL REFERENCES balance_period(id),
  category text NOT NULL,
  mass_g bigint NOT NULL,
  moved_on date NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS carbon_method (
  id text PRIMARY KEY,
  name text NOT NULL,
  standard text NOT NULL,
  functional_unit text NOT NULL
);

CREATE TABLE IF NOT EXISTS carbon_method_version (
  id bigserial PRIMARY KEY,
  method text NOT NULL REFERENCES carbon_method(id),
  version int NOT NULL,
  standard text NOT NULL,
  functional_unit text NOT NULL,
  boundary text NOT NULL,
  allocation_basis text NOT NULL,
  reviewer text NOT NULL,
  published_on date NOT NULL,
  published_by text NOT NULL,
  data_quality_rules jsonb NOT NULL DEFAULT '[]',
  emission_factors jsonb NOT NULL DEFAULT '[]',
  primary_threshold_bp int NOT NULL DEFAULT 5000,
  superseded boolean NOT NULL DEFAULT false,
  retired boolean NOT NULL DEFAULT false,
  UNIQUE (method, version)
);

CREATE TABLE IF NOT EXISTS carbon_figure (
  id text PRIMARY KEY,
  lot text NOT NULL,
  version int NOT NULL DEFAULT 1,
  method text NOT NULL,
  method_version int NOT NULL,
  value_mg_per_kg bigint NOT NULL,
  uncertainty_bp int NOT NULL,
  primary_share_bp int NOT NULL,
  boundary text NOT NULL,
  allocation_basis text NOT NULL,
  comparator jsonb NOT NULL,
  breakdown jsonb NOT NULL,
  energy jsonb NOT NULL,
  input_versions jsonb NOT NULL DEFAULT '{}',
  cache_valid boolean NOT NULL DEFAULT true,
  superseded_by text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  computed_by text,
  reason text
);
CREATE INDEX IF NOT EXISTS carbon_figure_lot ON carbon_figure(lot);

CREATE TABLE IF NOT EXISTS energy_instrument (
  reference text PRIMARY KEY,
  quantity_kwh bigint NOT NULL,
  vintage int NOT NULL,
  region text NOT NULL,
  state text NOT NULL,
  retired_against text,
  retired_at timestamptz
);

CREATE TABLE IF NOT EXISTS specification (
  grade text NOT NULL,
  version int NOT NULL,
  issued_on date NOT NULL,
  properties jsonb NOT NULL,
  virgin_reference jsonb NOT NULL,
  superseded boolean NOT NULL DEFAULT false,
  PRIMARY KEY (grade, version)
);

CREATE TABLE IF NOT EXISTS specification_issue (
  id bigserial PRIMARY KEY,
  grade text NOT NULL,
  version int NOT NULL,
  customer text NOT NULL,
  issued_on date NOT NULL,
  issued_by text NOT NULL
);

CREATE TABLE IF NOT EXISTS customer (
  reference text PRIMARY KEY,
  name text NOT NULL,
  contact text NOT NULL,
  holds_specification_version int NOT NULL,
  application text NOT NULL,
  industry text NOT NULL,
  language text NOT NULL DEFAULT 'en'
);

CREATE TABLE IF NOT EXISTS conformance (
  id bigserial PRIMARY KEY,
  customer text NOT NULL REFERENCES customer(reference),
  application text NOT NULL,
  specification_version int NOT NULL,
  trials jsonb NOT NULL DEFAULT '[]',
  started_on date,
  completed_on date,
  outcome text NOT NULL
);

CREATE TABLE IF NOT EXISTS change_notice (
  reference text PRIMARY KEY,
  title text NOT NULL,
  detail text NOT NULL,
  parameter text,
  qualification_relevant boolean NOT NULL DEFAULT false,
  specifications_affected jsonb NOT NULL DEFAULT '[]',
  customers_affected jsonb NOT NULL DEFAULT '[]',
  qualifications_affected jsonb NOT NULL DEFAULT '[]',
  notice_period_days int NOT NULL,
  state text NOT NULL DEFAULT 'raised',
  raised_by text NOT NULL,
  raised_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);

CREATE TABLE IF NOT EXISTS change_notice_notification (
  id bigserial PRIMARY KEY,
  notice text NOT NULL REFERENCES change_notice(reference),
  customer text NOT NULL,
  notified_at timestamptz,
  waived boolean NOT NULL DEFAULT false,
  waived_reason text,
  recorded_by text NOT NULL
);

CREATE TABLE IF NOT EXISTS contract (
  id text PRIMARY KEY,
  recipient text NOT NULL,
  site text NOT NULL REFERENCES site(reference),
  period text NOT NULL,
  committed_kg bigint NOT NULL,
  floor_bp int NOT NULL,
  delivered_kg bigint NOT NULL DEFAULT 0,
  shortfall_consequence text NOT NULL,
  unreachable_on date,
  unreachable_allocation text
);

CREATE TABLE IF NOT EXISTS contract_allocation (
  reference text PRIMARY KEY,
  contract text NOT NULL REFERENCES contract(id),
  lot text NOT NULL,
  mass_kg bigint NOT NULL,
  content_bp int NOT NULL,
  decided_by text NOT NULL,
  favoured_over jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS certificate (
  number text PRIMARY KEY,
  version int NOT NULL DEFAULT 1,
  site text NOT NULL,
  lots jsonb NOT NULL,
  grade text NOT NULL,
  specification_version int NOT NULL,
  claim_type text NOT NULL,
  content_bp int NOT NULL,
  category_split jsonb NOT NULL,
  period text NOT NULL,
  carbon jsonb NOT NULL,
  primary_share_bp int NOT NULL,
  scheme text NOT NULL,
  registration text NOT NULL,
  test_results jsonb NOT NULL DEFAULT '[]',
  permitted_statement text NOT NULL,
  prohibited_statement text NOT NULL,
  signer text NOT NULL,
  signer_name text NOT NULL,
  signed_at timestamptz NOT NULL,
  verification_url text NOT NULL,
  state text NOT NULL DEFAULT 'issued',
  provisional_factor boolean NOT NULL DEFAULT false,
  recipient text NOT NULL,
  recipient_name text NOT NULL,
  recipient_language text NOT NULL DEFAULT 'en',
  conditions jsonb NOT NULL,
  document text NOT NULL,
  withdrawal jsonb,
  derived_from text,
  superseded_by text,
  issued_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS certificate_sequence (
  site text PRIMARY KEY,
  last_number bigint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS restatement (
  reference text PRIMARY KEY,
  period text NOT NULL,
  reason text NOT NULL,
  opened_by text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL DEFAULT 'open',
  certificates jsonb NOT NULL DEFAULT '[]',
  content_movements jsonb NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS resolution (
  id bigserial PRIMARY KEY,
  restatement text NOT NULL REFERENCES restatement(reference),
  certificate text NOT NULL,
  outcome text NOT NULL,
  reason text NOT NULL,
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restatement, certificate)
);

CREATE TABLE IF NOT EXISTS record_entry (
  seq bigserial PRIMARY KEY,
  act text NOT NULL,
  actor text NOT NULL,
  site text,
  object_kind text,
  object_reference text,
  content jsonb,
  refused boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  digest text NOT NULL,
  prev_digest text NOT NULL,
  content_deleted boolean NOT NULL DEFAULT false,
  content_deleted_on date,
  scheme_months int NOT NULL DEFAULT 120,
  statutory_months int NOT NULL DEFAULT 84
);
CREATE INDEX IF NOT EXISTS record_entry_object ON record_entry(object_reference);
CREATE INDEX IF NOT EXISTS record_entry_act ON record_entry(act);

CREATE TABLE IF NOT EXISTS legal_hold (
  reference text PRIMARY KEY,
  seq bigint NOT NULL,
  placed_by text NOT NULL,
  placed_at timestamptz NOT NULL DEFAULT now(),
  lifted_by text,
  lifted_at timestamptz
);

CREATE TABLE IF NOT EXISTS idempotency (
  route text NOT NULL,
  key text NOT NULL,
  body_hash text NOT NULL,
  status int NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (route, key)
);

CREATE TABLE IF NOT EXISTS inbound_record (
  reference text PRIMARY KEY,
  source text NOT NULL,
  received_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  payload_verbatim text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS enquiry (
  reference text PRIMARY KEY,
  type text NOT NULL,
  name text,
  email text,
  organisation text,
  message text,
  destination text NOT NULL,
  response_days int NOT NULL,
  deadline date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS position (
  reference text PRIMARY KEY,
  title text NOT NULL,
  location text NOT NULL,
  department text NOT NULL,
  contract_type text NOT NULL,
  closes_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS news_item (
  reference text PRIMARY KEY,
  title text NOT NULL,
  tag text NOT NULL,
  outlet text NOT NULL,
  published_on date NOT NULL,
  link text NOT NULL,
  language text NOT NULL,
  summary text NOT NULL
);

CREATE TABLE IF NOT EXISTS statistic (
  key text PRIMARY KEY,
  value text NOT NULL,
  source text NOT NULL,
  year int NOT NULL,
  geography text NOT NULL
);

CREATE TABLE IF NOT EXISTS claim_substantiation (
  reference text PRIMARY KEY,
  claim text NOT NULL,
  route text NOT NULL,
  first_published_on date NOT NULL,
  evidence text NOT NULL,
  evidence_expires_on date,
  method_version text,
  approver text NOT NULL,
  review_on date NOT NULL,
  state text NOT NULL DEFAULT 'published'
);

CREATE TABLE IF NOT EXISTS export (
  reference text PRIMARY KEY,
  scope jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL,
  empty boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS queued_work (
  reference text PRIMARY KEY,
  kind text NOT NULL,
  subject text NOT NULL,
  state text NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mail_log (
  reference text PRIMARY KEY,
  recipient text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  act text NOT NULL,
  object_reference text
);

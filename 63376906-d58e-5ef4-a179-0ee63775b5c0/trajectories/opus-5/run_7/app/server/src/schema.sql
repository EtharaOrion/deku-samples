-- Ravel operational record, engine inputs and issued artefacts.
-- Operational records are writable until closed; versioned definitions are superseded,
-- never overwritten; issued artefacts are immutable; movements are only ever added.

CREATE TABLE IF NOT EXISTS site (
  reference text PRIMARY KEY,
  name text NOT NULL,
  confidence text NOT NULL,
  nameplate_kg bigint NOT NULL,
  contracted_kg bigint NOT NULL,
  certification_state text NOT NULL,
  basis text NOT NULL,
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

CREATE TABLE IF NOT EXISTS app_user (
  email text PRIMARY KEY,
  name text NOT NULL,
  role text NOT NULL,
  person_id text NOT NULL
);

CREATE TABLE IF NOT EXISTS access_grant (
  id bigserial PRIMARY KEY,
  email text NOT NULL REFERENCES app_user(email),
  site text NOT NULL,
  ends_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS party (
  reference text PRIMARY KEY,
  kind text NOT NULL
);

CREATE TABLE IF NOT EXISTS party_version (
  id bigserial PRIMARY KEY,
  party text NOT NULL REFERENCES party(reference),
  name text NOT NULL,
  effective_from date NOT NULL,
  superseded_by bigint,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collector (
  reference text PRIMARY KEY REFERENCES party(reference),
  country text NOT NULL,
  registration text NOT NULL,
  registration_expiry date NOT NULL,
  collection_site_types jsonb NOT NULL DEFAULT '[]',
  declared_streams jsonb NOT NULL DEFAULT '[]',
  scheme_status text NOT NULL
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
  collector text NOT NULL REFERENCES collector(reference),
  batch text,
  description text NOT NULL,
  departure_bp integer,
  raised_on date NOT NULL,
  due_on date,
  state text NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS device (
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
  moisture_bp integer NOT NULL,
  moisture_method text,
  device text REFERENCES device(reference),
  received_on date NOT NULL,
  composition jsonb NOT NULL DEFAULT '{}',
  contamination jsonb NOT NULL DEFAULT '{}',
  accepted_g bigint,
  rejected_g bigint NOT NULL DEFAULT 0,
  rejected_destination text,
  rejected_reason text,
  claimable_from date,
  accepted boolean NOT NULL DEFAULT true,
  closed boolean NOT NULL DEFAULT false,
  event_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  effective_on date NOT NULL,
  booked_by text
);

CREATE TABLE IF NOT EXISTS custody_link (
  id bigserial PRIMARY KEY,
  batch text NOT NULL REFERENCES batch(reference),
  ordinal integer NOT NULL,
  kind text NOT NULL,
  link_date date NOT NULL,
  party text NOT NULL,
  arrived_on date,
  late boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS weighing (
  reference text PRIMARY KEY,
  batch text NOT NULL REFERENCES batch(reference),
  device text NOT NULL REFERENCES device(reference),
  gross_g bigint NOT NULL,
  tare_g bigint NOT NULL,
  net_g bigint NOT NULL,
  calibration_state text NOT NULL,
  weighed_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS recipe_version (
  reference text NOT NULL,
  version integer NOT NULL,
  run_type text NOT NULL,
  set_points jsonb NOT NULL DEFAULT '{}',
  tolerances jsonb NOT NULL DEFAULT '{}',
  reagents jsonb NOT NULL DEFAULT '[]',
  residence_time_minutes integer,
  released_by text,
  released_on date,
  superseded boolean NOT NULL DEFAULT false,
  PRIMARY KEY (reference, version)
);

CREATE TABLE IF NOT EXISTS run (
  reference text PRIMARY KEY,
  run_type text NOT NULL,
  site text NOT NULL REFERENCES site(reference),
  equipment text NOT NULL,
  recipe_version text NOT NULL,
  operator text NOT NULL,
  started_at timestamptz NOT NULL,
  closed_at timestamptz,
  state text NOT NULL DEFAULT 'open',
  losses_g bigint,
  actual_set_points jsonb NOT NULL DEFAULT '{}',
  within_tolerance boolean,
  event_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  effective_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS consumption (
  reference text PRIMARY KEY,
  run text NOT NULL REFERENCES run(reference),
  input_kind text NOT NULL,
  input_ref text NOT NULL,
  mass_g bigint NOT NULL,
  event_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  effective_on date NOT NULL,
  recorded_by text
);

CREATE TABLE IF NOT EXISTS output (
  reference text PRIMARY KEY,
  run text NOT NULL REFERENCES run(reference),
  kind text NOT NULL,
  mass_g bigint NOT NULL,
  disposition text,
  allocation_basis text,
  event_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  effective_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS lot (
  reference text PRIMARY KEY,
  grade text NOT NULL,
  site text NOT NULL REFERENCES site(reference),
  mass_g bigint NOT NULL,
  disposition text NOT NULL DEFAULT 'pending',
  claim_type text NOT NULL,
  run text,
  specification_version integer,
  blended_from jsonb,
  sites jsonb,
  produced_on date NOT NULL,
  dispositioned_by text,
  dispositioned_at timestamptz
);

CREATE TABLE IF NOT EXISTS test_result (
  reference text PRIMARY KEY,
  subject_kind text NOT NULL,
  subject_ref text NOT NULL,
  property text NOT NULL,
  method text NOT NULL,
  instrument text,
  analyst text NOT NULL,
  value text NOT NULL,
  unit text NOT NULL,
  uncertainty_bp integer,
  method_mismatch boolean NOT NULL DEFAULT false,
  usable_for_release boolean NOT NULL DEFAULT true,
  entered_by text NOT NULL,
  entered_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deviation (
  reference text PRIMARY KEY,
  state text NOT NULL DEFAULT 'open',
  runs jsonb NOT NULL DEFAULT '[]',
  lots jsonb NOT NULL DEFAULT '[]',
  description text NOT NULL,
  outcome text,
  raised_by text NOT NULL,
  raised_at timestamptz NOT NULL DEFAULT now(),
  closed_by text,
  closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS separation_override (
  reference text PRIMARY KEY,
  separation text NOT NULL,
  reason text NOT NULL,
  lot text NOT NULL,
  authorised_by text NOT NULL,
  reviewed boolean NOT NULL DEFAULT false,
  reviewed_by text,
  reviewed_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversion_factor (
  reference text PRIMARY KEY,
  site text NOT NULL REFERENCES site(reference),
  version integer NOT NULL DEFAULT 1,
  factor_bp integer NOT NULL,
  derived_from date,
  derived_to date,
  derived_in_g bigint NOT NULL,
  derived_out_g bigint NOT NULL,
  provisional boolean NOT NULL DEFAULT false,
  published_by text,
  published_on date NOT NULL,
  superseded_by text
);

CREATE TABLE IF NOT EXISTS balance_period (
  id text PRIMARY KEY,
  site text NOT NULL REFERENCES site(reference),
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

CREATE TABLE IF NOT EXISTS credit_movement (
  id bigserial PRIMARY KEY,
  period text NOT NULL REFERENCES balance_period(id),
  direction text NOT NULL,
  category text NOT NULL,
  mass_g bigint NOT NULL,
  lot text,
  source_kind text NOT NULL,
  source_ref text,
  movement text,
  origin_site text,
  fresh_credit boolean NOT NULL DEFAULT true,
  derivation jsonb NOT NULL DEFAULT '{}',
  event_at timestamptz NOT NULL DEFAULT now(),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  effective_on date NOT NULL,
  created_by text
);

CREATE TABLE IF NOT EXISTS transfer (
  reference text PRIMARY KEY,
  from_period text NOT NULL REFERENCES balance_period(id),
  to_period text NOT NULL REFERENCES balance_period(id),
  category text NOT NULL,
  mass_g bigint NOT NULL,
  moved_on date NOT NULL,
  recorded_by text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS carbon_method (
  id text NOT NULL,
  version integer NOT NULL,
  standard text NOT NULL,
  functional_unit text NOT NULL,
  boundary text NOT NULL,
  allocation_basis text NOT NULL,
  reviewer text NOT NULL,
  published_on date NOT NULL,
  published_by text,
  data_quality_rules jsonb NOT NULL DEFAULT '[]',
  emission_factors jsonb NOT NULL DEFAULT '[]',
  primary_threshold_bp integer NOT NULL DEFAULT 5000,
  superseded boolean NOT NULL DEFAULT false,
  retired boolean NOT NULL DEFAULT false,
  PRIMARY KEY (id, version)
);

CREATE TABLE IF NOT EXISTS carbon_figure (
  id text PRIMARY KEY,
  lot text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  method_id text NOT NULL,
  method_version integer NOT NULL,
  value_mg_per_kg bigint NOT NULL,
  uncertainty_bp integer NOT NULL,
  primary_share_bp integer NOT NULL,
  boundary text NOT NULL,
  comparator jsonb NOT NULL,
  breakdown jsonb NOT NULL,
  energy jsonb NOT NULL,
  input_versions jsonb NOT NULL DEFAULT '{}',
  cache_valid boolean NOT NULL DEFAULT true,
  superseded_by text,
  reason text,
  computed_by text,
  computed_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS energy_instrument (
  reference text PRIMARY KEY,
  quantity_kwh bigint NOT NULL,
  vintage integer NOT NULL,
  region text NOT NULL,
  state text NOT NULL,
  applied_period text,
  applied_at timestamptz
);

CREATE TABLE IF NOT EXISTS specification (
  grade text NOT NULL,
  version integer NOT NULL,
  issued_on date NOT NULL,
  properties jsonb NOT NULL,
  virgin_reference jsonb NOT NULL,
  superseded boolean NOT NULL DEFAULT false,
  PRIMARY KEY (grade, version)
);

CREATE TABLE IF NOT EXISTS specification_issue (
  id bigserial PRIMARY KEY,
  grade text NOT NULL,
  version integer NOT NULL,
  customer text NOT NULL,
  issued_on date NOT NULL,
  issued_by text NOT NULL
);

CREATE TABLE IF NOT EXISTS customer (
  reference text PRIMARY KEY REFERENCES party(reference),
  contact text NOT NULL,
  holds_specification_grade text NOT NULL,
  holds_specification_version integer NOT NULL,
  application text NOT NULL,
  industry text NOT NULL,
  language text NOT NULL DEFAULT 'en'
);

CREATE TABLE IF NOT EXISTS conformance (
  id bigserial PRIMARY KEY,
  customer text NOT NULL REFERENCES customer(reference),
  application text NOT NULL,
  specification_version integer NOT NULL,
  trials jsonb NOT NULL DEFAULT '[]',
  started_on date,
  completed_on date,
  outcome text NOT NULL
);

CREATE TABLE IF NOT EXISTS change_notice (
  reference text PRIMARY KEY,
  description text NOT NULL,
  parameter text NOT NULL,
  qualification_relevant boolean NOT NULL DEFAULT false,
  specifications_affected jsonb NOT NULL DEFAULT '[]',
  customers_affected jsonb NOT NULL DEFAULT '[]',
  qualifications_affected jsonb NOT NULL DEFAULT '[]',
  notice_period_days integer NOT NULL,
  state text NOT NULL DEFAULT 'raised',
  raised_by text NOT NULL,
  raised_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);

CREATE TABLE IF NOT EXISTS change_notice_act (
  id bigserial PRIMARY KEY,
  notice text NOT NULL REFERENCES change_notice(reference),
  customer text NOT NULL,
  act text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  by_person text
);

CREATE TABLE IF NOT EXISTS contract (
  id text PRIMARY KEY,
  recipient text NOT NULL,
  site text NOT NULL REFERENCES site(reference),
  period text NOT NULL,
  committed_kg bigint NOT NULL,
  floor_bp integer NOT NULL,
  delivered_kg bigint NOT NULL DEFAULT 0,
  shortfall_consequence text NOT NULL,
  unreachable_on date,
  unreachable_allocation text
);

CREATE TABLE IF NOT EXISTS contract_allocation (
  reference text PRIMARY KEY,
  contract text NOT NULL REFERENCES contract(id),
  lot text NOT NULL,
  mass_g bigint NOT NULL,
  content_bp integer NOT NULL,
  decided_by text NOT NULL,
  favoured_over jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS certificate_sequence (
  site text PRIMARY KEY,
  next_number integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS certificate (
  number text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  site text NOT NULL,
  lots jsonb NOT NULL,
  recipient text NOT NULL,
  recipient_name text NOT NULL,
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
  test_results jsonb NOT NULL DEFAULT '[]',
  permitted_statement text NOT NULL,
  prohibited_statement text NOT NULL,
  signer text NOT NULL,
  signer_name text NOT NULL,
  signed_at timestamptz NOT NULL,
  verification_url text NOT NULL,
  state text NOT NULL DEFAULT 'issued',
  provisional_factor boolean NOT NULL DEFAULT false,
  conditions jsonb NOT NULL,
  input_versions jsonb NOT NULL DEFAULT '{}',
  derived_from text,
  document text NOT NULL,
  withdrawal jsonb,
  PRIMARY KEY (number, version)
);

CREATE TABLE IF NOT EXISTS restatement (
  reference text PRIMARY KEY,
  period text NOT NULL,
  reason text NOT NULL,
  revised_factor text,
  certificates jsonb NOT NULL DEFAULT '[]',
  content_movements jsonb NOT NULL DEFAULT '[]',
  state text NOT NULL DEFAULT 'open',
  opened_by text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now()
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
  person text,
  person_id text,
  at timestamptz NOT NULL,
  site text,
  object_kind text,
  object_ref text,
  content jsonb,
  outcome text NOT NULL DEFAULT 'success',
  digest text NOT NULL,
  prev_digest text NOT NULL,
  content_deleted boolean NOT NULL DEFAULT false,
  deleted_on date
);

CREATE TABLE IF NOT EXISTS legal_hold (
  reference text PRIMARY KEY,
  seq bigint NOT NULL,
  placed_by text NOT NULL,
  placed_at timestamptz NOT NULL DEFAULT now(),
  lifted_by text,
  lifted_at timestamptz
);

CREATE TABLE IF NOT EXISTS idempotency (
  key text NOT NULL,
  route text NOT NULL,
  body_hash text NOT NULL,
  status integer NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, route)
);

CREATE TABLE IF NOT EXISTS inbound_record (
  reference text PRIMARY KEY,
  source text NOT NULL,
  received_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  payload_verbatim text NOT NULL,
  stored_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS enquiry (
  reference text PRIMARY KEY,
  type text NOT NULL,
  name text,
  email text NOT NULL,
  organisation text,
  message text,
  destination text NOT NULL,
  response_days integer NOT NULL,
  deadline date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS position (
  id text PRIMARY KEY,
  title text NOT NULL,
  location text NOT NULL,
  department text NOT NULL,
  contract_type text NOT NULL,
  closes_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS news_item (
  id text PRIMARY KEY,
  title text NOT NULL,
  tag text NOT NULL,
  item_date date NOT NULL,
  outlet text NOT NULL,
  link text NOT NULL,
  language text NOT NULL,
  coverage jsonb NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS statistic (
  key text PRIMARY KEY,
  value text NOT NULL,
  source text NOT NULL,
  year integer NOT NULL,
  geography text NOT NULL
);

CREATE TABLE IF NOT EXISTS claim_substantiation (
  id text PRIMARY KEY,
  claim text NOT NULL,
  route text NOT NULL,
  first_published date NOT NULL,
  evidence text NOT NULL,
  method_version text NOT NULL,
  approver text NOT NULL,
  review_date date NOT NULL,
  evidence_expires_on date,
  state text NOT NULL DEFAULT 'published'
);

CREATE TABLE IF NOT EXISTS export (
  reference text PRIMARY KEY,
  scope jsonb NOT NULL,
  requested_by text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  entry_count integer NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS queued_work (
  reference text PRIMARY KEY,
  kind text NOT NULL,
  target text NOT NULL,
  state text NOT NULL DEFAULT 'queued',
  queued_at timestamptz NOT NULL DEFAULT now(),
  detail jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS consumption_run_idx ON consumption(run);
CREATE INDEX IF NOT EXISTS consumption_input_idx ON consumption(input_ref);
CREATE INDEX IF NOT EXISTS output_run_idx ON output(run);
CREATE INDEX IF NOT EXISTS credit_movement_period_idx ON credit_movement(period);
CREATE INDEX IF NOT EXISTS record_entry_at_idx ON record_entry(at);

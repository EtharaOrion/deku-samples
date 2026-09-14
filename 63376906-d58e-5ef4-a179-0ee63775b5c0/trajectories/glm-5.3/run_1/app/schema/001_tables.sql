-- Ravel operational schema. Applied by the image at start.
CREATE TABLE IF NOT EXISTS meta (
  k text PRIMARY KEY,
  v jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  email text PRIMARY KEY,
  name text NOT NULL,
  role text NOT NULL,
  sites text[] NOT NULL,
  grant_ends_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS parties (
  reference text PRIMARY KEY,
  kind text NOT NULL,
  current_name text NOT NULL
);

CREATE TABLE IF NOT EXISTS party_versions (
  reference bigserial PRIMARY KEY,
  party text NOT NULL,
  name text NOT NULL,
  effective_from date NOT NULL
);

CREATE TABLE IF NOT EXISTS sites (
  reference text PRIMARY KEY,
  name text NOT NULL,
  confidence text NOT NULL,
  certification_state text NOT NULL,
  nameplate_kg bigint NOT NULL,
  contracted_kg bigint NOT NULL,
  capacity_basis text NOT NULL,
  last_revised date NOT NULL
);

CREATE TABLE IF NOT EXISTS site_certifications (
  id bigserial PRIMARY KEY,
  site text NOT NULL,
  state text NOT NULL,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  effective_from date,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  lifted boolean NOT NULL DEFAULT false,
  lifted_from date
);

CREATE TABLE IF NOT EXISTS collectors (
  reference text PRIMARY KEY,
  party text NOT NULL,
  country text NOT NULL,
  registration text NOT NULL,
  registration_expiry date NOT NULL,
  site_types text[] NOT NULL,
  streams text[] NOT NULL,
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
  collector text NOT NULL,
  raised_on date NOT NULL,
  detail text NOT NULL,
  open boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS weighing_devices (
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
  accepted_g bigint,
  rejected_g bigint,
  rejected_destination text,
  claimable boolean NOT NULL,
  claimable_reason text,
  claimable_from date,
  composition jsonb NOT NULL,
  contamination jsonb NOT NULL,
  event_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  effective_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS custodies (
  id bigserial PRIMARY KEY,
  batch text NOT NULL,
  kind text NOT NULL,
  occurred_on date NOT NULL,
  party text NOT NULL,
  late boolean NOT NULL DEFAULT false,
  attached_on date
);


CREATE TABLE IF NOT EXISTS recipes (
  version text PRIMARY KEY,
  run_type text NOT NULL,
  set_points jsonb NOT NULL,
  released_by text NOT NULL
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
  closed boolean NOT NULL DEFAULT false,
  losses_g bigint,
  achieved jsonb,
  within_tolerance boolean,
  event_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  effective_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS consumptions (
  id bigserial PRIMARY KEY,
  run text NOT NULL,
  batch text,
  input_output text,
  mass_g bigint NOT NULL,
  effective_on date NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outputs (
  reference text PRIMARY KEY,
  run text NOT NULL,
  kind text NOT NULL,
  mass_g bigint NOT NULL,
  disposition text,
  grade text,
  site text NOT NULL,
  event_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  effective_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS lots (
  reference text PRIMARY KEY,
  site text NOT NULL,
  grade text NOT NULL,
  mass_g bigint NOT NULL,
  disposition text NOT NULL DEFAULT 'pending',
  claim_type text NOT NULL DEFAULT 'mass_balance',
  produced_by text,
  event_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  effective_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS test_results (
  id bigserial PRIMARY KEY,
  subject text NOT NULL,
  property text NOT NULL,
  method text NOT NULL,
  instrument text NOT NULL,
  analyst text NOT NULL,
  value numeric NOT NULL,
  unit text NOT NULL,
  uncertainty_bp integer NOT NULL,
  method_mismatch boolean NOT NULL DEFAULT false,
  usable_for_release boolean NOT NULL DEFAULT true,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deviations (
  reference text PRIMARY KEY,
  state text NOT NULL,
  runs text[] NOT NULL DEFAULT '{}',
  lots text[] NOT NULL DEFAULT '{}',
  outcome text,
  raised_on date NOT NULL,
  closed_on date
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
  state text NOT NULL,
  carry_over_limit_bp integer NOT NULL,
  allocation_basis text NOT NULL DEFAULT 'mass',
  closed_on date,
  cut_off date,
  carbon_method text,
  carbon_method_version integer
);

CREATE TABLE IF NOT EXISTS credit_movements (
  id bigserial PRIMARY KEY,
  balance_period text NOT NULL,
  category text NOT NULL,
  direction text NOT NULL,
  mass_g bigint NOT NULL,
  kind text NOT NULL,
  lot text,
  reference text,
  origin_site text,
  movement text,
  fresh_credit boolean NOT NULL DEFAULT true,
  effective_on date NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  derivation jsonb
);

CREATE TABLE IF NOT EXISTS allocations (
  id bigserial PRIMARY KEY,
  balance_period text NOT NULL,
  lot text NOT NULL,
  category text NOT NULL,
  mass_g bigint NOT NULL,
  decided_by text,
  favoured_over text[],
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversion_factors (
  reference text PRIMARY KEY,
  site text NOT NULL,
  factor_bp integer NOT NULL,
  derived_from date,
  derived_to date,
  derived_in_g bigint NOT NULL,
  derived_out_g bigint NOT NULL,
  provisional boolean NOT NULL DEFAULT false,
  published_by text,
  published_on date NOT NULL
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
  primary_share_threshold_bp integer NOT NULL,
  data_quality jsonb NOT NULL,
  emission_factors jsonb NOT NULL,
  superseded boolean NOT NULL DEFAULT false,
  PRIMARY KEY (id, version)
);

CREATE TABLE IF NOT EXISTS carbon_figures (
  id bigserial PRIMARY KEY,
  lot text NOT NULL,
  version integer NOT NULL,
  value_mg_per_kg bigint NOT NULL,
  boundary text NOT NULL,
  method_version integer NOT NULL,
  uncertainty_bp integer NOT NULL,
  primary_share_bp integer NOT NULL,
  breakdown jsonb NOT NULL,
  comparator jsonb NOT NULL,
  energy_location_mg_per_kg bigint,
  energy_market_mg_per_kg bigint,
  energy jsonb,
  cache_valid boolean NOT NULL DEFAULT true,
  computed_on date NOT NULL,
  computed_by text NOT NULL,
  superseded boolean NOT NULL DEFAULT false,
  input_versions jsonb NOT NULL,
  version_inputs jsonb NOT NULL
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
  balance_period text NOT NULL,
  retired_kwh bigint NOT NULL,
  retired_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS specifications (
  id text NOT NULL,
  version integer NOT NULL,
  issued_on date NOT NULL,
  superseded boolean NOT NULL DEFAULT false,
  rows jsonb NOT NULL,
  virgin_reference jsonb NOT NULL,
  PRIMARY KEY (id, version)
);

CREATE TABLE IF NOT EXISTS specification_issues (
  id bigserial PRIMARY KEY,
  specification text NOT NULL,
  version integer NOT NULL,
  customer text NOT NULL,
  issued_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  reference text PRIMARY KEY,
  party text NOT NULL,
  contact text NOT NULL,
  language text NOT NULL DEFAULT 'en'
);

CREATE TABLE IF NOT EXISTS conformances (
  id bigserial PRIMARY KEY,
  customer text NOT NULL,
  application text NOT NULL,
  industry text NOT NULL,
  specification text NOT NULL,
  specification_version integer NOT NULL,
  trials jsonb NOT NULL,
  outcome text
);

CREATE TABLE IF NOT EXISTS change_notices (
  reference text PRIMARY KEY,
  change text NOT NULL,
  specification text,
  specification_version integer,
  qualification_relevant boolean NOT NULL DEFAULT false,
  derived jsonb NOT NULL,
  raised_on date NOT NULL,
  state text NOT NULL DEFAULT 'proposed',
  released_on date
);

CREATE TABLE IF NOT EXISTS change_notice_acknowledgements (
  id bigserial PRIMARY KEY,
  notice text NOT NULL,
  customer text NOT NULL,
  waived boolean NOT NULL DEFAULT false,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contracts (
  id text PRIMARY KEY,
  recipient text NOT NULL,
  site text NOT NULL,
  period text NOT NULL,
  committed_kg bigint NOT NULL,
  floor_bp integer NOT NULL,
  delivered_kg bigint NOT NULL DEFAULT 0,
  shortfall_consequence text NOT NULL,
  unreachable_on date,
  unreachable_allocation bigint
);

CREATE TABLE IF NOT EXISTS contract_allocations (
  id bigserial PRIMARY KEY,
  contract text NOT NULL,
  lot text NOT NULL,
  decided_by text,
  favoured_over text[],
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS certificates (
  number text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  site text NOT NULL,
  recipient text NOT NULL,
  period text NOT NULL,
  grade text NOT NULL,
  specification text NOT NULL,
  specification_version integer NOT NULL,
  claim_type text NOT NULL,
  content_bp integer NOT NULL,
  category_split jsonb NOT NULL,
  lots jsonb NOT NULL,
  scheme text NOT NULL,
  registration text NOT NULL,
  test_results jsonb NOT NULL,
  permitted_statement text NOT NULL,
  prohibited_statement text NOT NULL,
  signer text NOT NULL,
  signed_at timestamptz NOT NULL,
  verification_url text NOT NULL,
  state text NOT NULL,
  provisional_factor boolean NOT NULL DEFAULT false,
  conditions jsonb NOT NULL,
  carbon jsonb,
  primary_share_bp integer,
  derived_from text,
  derived_resolutions jsonb
);

CREATE TABLE IF NOT EXISTS certificate_sequences (
  site text PRIMARY KEY,
  next_number bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS restatements (
  reference text PRIMARY KEY,
  balance_period text NOT NULL,
  reason text NOT NULL,
  opened_on date NOT NULL,
  state text NOT NULL DEFAULT 'open',
  revised_factor text,
  content_movements jsonb
);

CREATE TABLE IF NOT EXISTS resolutions (
  id bigserial PRIMARY KEY,
  restatement text NOT NULL,
  certificate text NOT NULL,
  outcome text NOT NULL,
  reason text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transfers (
  reference text PRIMARY KEY,
  from_period text NOT NULL,
  to_period text NOT NULL,
  mass_g bigint NOT NULL,
  category text NOT NULL,
  origin_site text NOT NULL,
  effective_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key text NOT NULL,
  route text NOT NULL,
  body_hash text NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, route)
);

CREATE TABLE IF NOT EXISTS inbound_records (
  reference text PRIMARY KEY,
  source text NOT NULL,
  received_at timestamptz,
  payload_verbatim text NOT NULL,
  parsed jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS enquiries (
  reference text PRIMARY KEY,
  type text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  message text,
  destination text NOT NULL,
  response_days integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS record_entries (
  seq bigserial PRIMARY KEY,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  person text,
  site text,
  object text,
  act text NOT NULL,
  content jsonb NOT NULL,
  digest text NOT NULL,
  prev_digest text NOT NULL,
  correction_of bigint,
  deleted_on date,
  retention jsonb
);

CREATE TABLE IF NOT EXISTS legal_holds (
  id bigserial PRIMARY KEY,
  seq bigint NOT NULL,
  placed_on date NOT NULL,
  placed_by text NOT NULL,
  lifted_on date
);

CREATE TABLE IF NOT EXISTS exports (
  reference text PRIMARY KEY,
  scope jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token text PRIMARY KEY,
  email text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
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
  date date NOT NULL,
  link text NOT NULL,
  language text NOT NULL,
  coverage text NOT NULL
);

CREATE TABLE IF NOT EXISTS statistics (
  key text PRIMARY KEY,
  value text NOT NULL,
  source text NOT NULL,
  year integer NOT NULL,
  geography text NOT NULL
);

CREATE TABLE IF NOT EXISTS claim_substantiations (
  id bigserial PRIMARY KEY,
  claim text NOT NULL,
  route text NOT NULL,
  first_published_on date NOT NULL,
  evidence jsonb NOT NULL,
  method_version text,
  approver text NOT NULL,
  review_on date NOT NULL,
  state text NOT NULL DEFAULT 'published'
);

CREATE TABLE IF NOT EXISTS mails (
  id bigserial PRIMARY KEY,
  to_address text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL,
  PRIMARY KEY (bucket, window_start)
);

CREATE TABLE IF NOT EXISTS overrides_review_log (
  id bigserial PRIMARY KEY,
  override text NOT NULL,
  by text NOT NULL,
  refused_reason text
);

CREATE INDEX IF NOT EXISTS idx_custodies_batch ON custodies(batch);
CREATE INDEX IF NOT EXISTS idx_consumptions_run ON consumptions(run);
CREATE INDEX IF NOT EXISTS idx_consumptions_batch ON consumptions(batch);
CREATE INDEX IF NOT EXISTS idx_movements_period ON credit_movements(balance_period);
CREATE INDEX IF NOT EXISTS idx_entries_act ON record_entries(act);
CREATE INDEX IF NOT EXISTS idx_tests_subject ON test_results(subject);
CREATE INDEX IF NOT EXISTS idx_inbound_source ON inbound_records(source);

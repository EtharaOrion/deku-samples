-- Ravel schema. All figures integer; masses in grams (_g), proportions in basis points (_bp),
-- carbon in mg CO2e/kg (_mg_per_kg), energy in whole kWh (_kwh), capacity in kg/yr (_kg).

CREATE TABLE IF NOT EXISTS app_meta (k text PRIMARY KEY, v text NOT NULL);

CREATE TABLE IF NOT EXISTS sites (
  reference text PRIMARY KEY,
  name text NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('commissioned','under_construction','consented','planned')),
  nameplate_kg integer NOT NULL,
  contracted_kg integer NOT NULL,
  certification_state text NOT NULL,
  capacity_basis text NOT NULL,
  last_revised date NOT NULL
);

CREATE TABLE IF NOT EXISTS grants (
  email text NOT NULL, role text NOT NULL, site text NOT NULL, ends_on date NOT NULL,
  PRIMARY KEY (email, role, site));

CREATE TABLE IF NOT EXISTS parties (
  reference text PRIMARY KEY,
  kind text NOT NULL,
  current_name text NOT NULL,
  email text,
  country text,
  registration text,
  registration_expiry date,
  contact text,
  application text,
  industry text,
  region text
);

CREATE TABLE IF NOT EXISTS party_versions (
  id serial PRIMARY KEY,
  party text NOT NULL,
  name text NOT NULL,
  effective_from date NOT NULL
);

CREATE TABLE IF NOT EXISTS collectors_extra (
  reference text PRIMARY KEY,
  site_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  streams jsonb NOT NULL DEFAULT '[]'::jsonb,
  scheme_status text NOT NULL DEFAULT 'unknown'
);

CREATE TABLE IF NOT EXISTS approval_periods (
  id serial PRIMARY KEY,
  collector text NOT NULL,
  state text NOT NULL CHECK (state IN ('approved','conditional','suspended','lapsed')),
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  condition text,
  condition_closes_on date
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
  received_on date NOT NULL,
  gross_g integer NOT NULL,
  tare_g integer NOT NULL,
  net_g integer NOT NULL,
  moisture_bp integer NOT NULL,
  moisture_method text NOT NULL,
  device text NOT NULL,
  composition jsonb NOT NULL,
  contamination jsonb NOT NULL,
  custody jsonb NOT NULL DEFAULT '[]'::jsonb,
  accepted_g integer NOT NULL,
  rejected_g integer NOT NULL DEFAULT 0,
  rejected_destination text,
  rejection_reason text,
  claimable_from date,
  collector_name text,
  created_by text,
  closed boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_batches_collector ON batches (collector);

CREATE TABLE IF NOT EXISTS runs (
  reference text PRIMARY KEY,
  run_type text NOT NULL CHECK (run_type IN ('dissolution','depolymerisation','purification','repolymerisation')),
  site text NOT NULL,
  equipment text NOT NULL,
  recipe_version text NOT NULL,
  operator text NOT NULL,
  started_at timestamptz NOT NULL,
  closed_at timestamptz,
  losses_g integer,
  achieved jsonb,
  within_tolerance boolean,
  annotation text,
  period text
);

CREATE TABLE IF NOT EXISTS consumptions (
  id serial PRIMARY KEY,
  run text NOT NULL,
  input_ref text NOT NULL,
  input_kind text NOT NULL,
  mass_g integer NOT NULL,
  effective_on date NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  event_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consumptions_run ON consumptions (run);
CREATE INDEX IF NOT EXISTS idx_consumptions_input ON consumptions (input_ref);

CREATE TABLE IF NOT EXISTS outputs (
  reference text PRIMARY KEY,
  run text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('intermediate','lot','byproduct')),
  mass_g integer NOT NULL,
  disposition text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_outputs_run ON outputs (run);

CREATE TABLE IF NOT EXISTS lots (
  reference text PRIMARY KEY,
  site text NOT NULL,
  grade text NOT NULL,
  mass_g integer NOT NULL,
  disposition text NOT NULL DEFAULT 'pending',
  claim_type text NOT NULL,
  produced_by text,
  flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text,
  disposition_by text,
  disposition_on date
);
CREATE INDEX IF NOT EXISTS idx_lots_site ON lots (site);

CREATE TABLE IF NOT EXISTS test_results (
  id serial PRIMARY KEY,
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
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed')),
  subjects jsonb NOT NULL DEFAULT '[]'::jsonb,
  description text,
  raised_by text,
  outcome text,
  closed_at timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT now()
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
  reviewed_at timestamptz
);

CREATE TABLE IF NOT EXISTS balance_periods (
  id text PRIMARY KEY,
  site text NOT NULL,
  grade text NOT NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed')),
  carry_over_limit_bp integer NOT NULL,
  closed_on date,
  cut_off date,
  allocation_basis text NOT NULL DEFAULT 'mass',
  carried_forward_g jsonb NOT NULL DEFAULT '{}'::jsonb,
  expired_g jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS credit_movements (
  id serial PRIMARY KEY,
  period text NOT NULL,
  category text NOT NULL CHECK (category IN ('post_consumer','pre_consumer','non_claimable')),
  direction text NOT NULL CHECK (direction IN ('in','out')),
  mass_g integer NOT NULL,
  kind text NOT NULL,
  origin_site text,
  movement_ref text,
  lot text,
  effective_on date NOT NULL,
  event_at timestamptz NOT NULL DEFAULT now(),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credit_period ON credit_movements (period);

CREATE TABLE IF NOT EXISTS conversion_factors (
  reference text PRIMARY KEY,
  site text NOT NULL,
  factor_bp integer NOT NULL,
  derived_from date,
  derived_to date,
  derived_in_g integer NOT NULL DEFAULT 0,
  derived_out_g integer NOT NULL DEFAULT 0,
  provisional boolean NOT NULL DEFAULT false,
  published_by text,
  published_on date NOT NULL DEFAULT CURRENT_DATE
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
  superseded_by integer,
  PRIMARY KEY (id, version)
);

CREATE TABLE IF NOT EXISTS emission_factors (
  id serial PRIMARY KEY,
  method_id text NOT NULL,
  method_version integer NOT NULL,
  line text NOT NULL,
  mg_per_kg integer NOT NULL,
  tag text NOT NULL,
  source text NOT NULL,
  year integer NOT NULL
);

CREATE TABLE IF NOT EXISTS energy_lines (
  method_id text NOT NULL,
  method_version integer NOT NULL,
  energy_location_mg_per_kg integer NOT NULL,
  energy_market_mg_per_kg integer NOT NULL,
  PRIMARY KEY (method_id, method_version)
);

CREATE TABLE IF NOT EXISTS carbon_figures (
  id text PRIMARY KEY,
  lot text NOT NULL,
  value_mg_per_kg integer NOT NULL,
  uncertainty_bp integer NOT NULL,
  primary_share_bp integer NOT NULL,
  boundary text NOT NULL,
  method_id text NOT NULL,
  method_version integer NOT NULL,
  comparator jsonb NOT NULL,
  breakdown jsonb NOT NULL,
  input_versions jsonb NOT NULL,
  cache_valid boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  superseded_by text,
  recomputed_by text,
  recomputed_on date,
  recompute_reason text,
  period text
);

CREATE TABLE IF NOT EXISTS energy_instruments (
  reference text PRIMARY KEY,
  quantity_kwh integer NOT NULL,
  vintage integer NOT NULL,
  region text NOT NULL,
  state text NOT NULL
);

CREATE TABLE IF NOT EXISTS energy_retirements (
  id serial PRIMARY KEY,
  instrument text NOT NULL,
  period text NOT NULL,
  quantity_kwh integer NOT NULL DEFAULT 0,
  retired_on date NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS energy_period_totals (
  period text PRIMARY KEY,
  metered_kwh integer NOT NULL
);

CREATE TABLE IF NOT EXISTS specifications (
  grade text NOT NULL,
  version integer NOT NULL,
  issued_on date NOT NULL,
  virgin_reference text NOT NULL,
  virgin_source text NOT NULL,
  virgin_date date NOT NULL,
  rows jsonb NOT NULL,
  current boolean NOT NULL DEFAULT false,
  PRIMARY KEY (grade, version)
);

CREATE TABLE IF NOT EXISTS spec_issues (
  id serial PRIMARY KEY,
  grade text NOT NULL,
  version integer NOT NULL,
  customer text NOT NULL,
  issued_on date NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS conformances (
  id serial PRIMARY KEY,
  customer text NOT NULL,
  application text NOT NULL,
  grade text NOT NULL,
  version integer NOT NULL,
  trials jsonb NOT NULL DEFAULT '[]'::jsonb,
  outcome text
);

CREATE TABLE IF NOT EXISTS change_notices (
  reference text PRIMARY KEY,
  change text NOT NULL,
  kind text NOT NULL DEFAULT 'recipe_revision',
  subject_ref text,
  proposed_by text NOT NULL,
  proposed_on date NOT NULL DEFAULT CURRENT_DATE,
  notice_period_days integer NOT NULL DEFAULT 30,
  specifications_affected jsonb NOT NULL DEFAULT '[]'::jsonb,
  customers_affected jsonb NOT NULL DEFAULT '[]'::jsonb,
  qualifications_affected jsonb NOT NULL DEFAULT '[]'::jsonb,
  blocked boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed','notified','released')),
  acknowledged jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS contracts (
  id text PRIMARY KEY,
  recipient text NOT NULL,
  site text NOT NULL,
  period text NOT NULL,
  committed_kg integer NOT NULL,
  floor_bp integer NOT NULL,
  delivered_kg integer NOT NULL DEFAULT 0,
  shortfall_consequence text NOT NULL,
  unreachable_on date,
  unreachable_allocation text
);

CREATE TABLE IF NOT EXISTS allocations (
  id serial PRIMARY KEY,
  contract text NOT NULL,
  lot text NOT NULL,
  mass_g integer NOT NULL DEFAULT 0,
  decided_by text,
  favoured_over jsonb NOT NULL DEFAULT '[]'::jsonb,
  allocated_on date NOT NULL DEFAULT CURRENT_DATE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_alloc_lot ON allocations (lot);

CREATE TABLE IF NOT EXISTS certificates (
  number text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  site text NOT NULL,
  lot text NOT NULL,
  lot_mass_g integer NOT NULL,
  recipient text NOT NULL,
  recipient_name text,
  recipient_contact text,
  grade text NOT NULL,
  specification_version integer NOT NULL,
  claim_type text NOT NULL,
  content_bp integer NOT NULL,
  category_split jsonb NOT NULL,
  period text NOT NULL,
  carbon_figure text,
  primary_share_bp integer,
  scheme text NOT NULL,
  registration text NOT NULL,
  test_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  permitted_statement text NOT NULL,
  prohibited_statement text NOT NULL,
  signer text NOT NULL,
  signed_at timestamptz NOT NULL,
  conditions jsonb NOT NULL,
  state text NOT NULL DEFAULT 'issued' CHECK (state IN ('issued','withdrawn')),
  provisional_factor boolean NOT NULL DEFAULT false,
  derived_from text,
  withdrawn_reason text,
  withdrawn_by text,
  withdrawn_on timestamptz,
  notified_recipients jsonb,
  void_statements jsonb,
  derived_certificates jsonb,
  batch_traversal jsonb,
  input_versions jsonb,
  document text
);

CREATE TABLE IF NOT EXISTS cert_sequences (
  site text PRIMARY KEY,
  last integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS restatements (
  reference text PRIMARY KEY,
  period text NOT NULL,
  reason text NOT NULL,
  opened_by text NOT NULL,
  opened_on date NOT NULL DEFAULT CURRENT_DATE,
  revised_factor_bp integer,
  affected_certificates jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_movements jsonb,
  state text NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS resolutions (
  id serial PRIMARY KEY,
  restatement text NOT NULL,
  certificate text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('reissued','withdrawn','unaffected')),
  reason text NOT NULL,
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restatement, certificate)
);

CREATE TABLE IF NOT EXISTS transfers (
  reference text PRIMARY KEY,
  from_period text NOT NULL,
  to_period text NOT NULL,
  mass_g integer NOT NULL,
  category text NOT NULL,
  effective_on date NOT NULL,
  recorded_by text NOT NULL
);

CREATE TABLE IF NOT EXISTS record_entries (
  seq bigserial PRIMARY KEY,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  actor text,
  site text,
  kind text NOT NULL,
  object_ref text,
  content jsonb NOT NULL,
  digest text NOT NULL,
  prev_digest text NOT NULL,
  corrections text,
  content_deleted boolean NOT NULL DEFAULT false,
  content_deleted_on date,
  scheme_months integer NOT NULL DEFAULT 120,
  statutory_months integer NOT NULL DEFAULT 84,
  referenced_until date
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_record_kind_object ON record_entries (kind, object_ref, seq);

CREATE TABLE IF NOT EXISTS legal_holds (
  reference text PRIMARY KEY,
  seq bigint NOT NULL,
  placed_by text NOT NULL,
  placed_on date NOT NULL DEFAULT CURRENT_DATE
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

CREATE TABLE IF NOT EXISTS inbound_records (
  id serial,
  reference text PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('weighbridge','control_system','laboratory','customer_reporting')),
  received_at timestamptz NOT NULL,
  payload_verbatim text NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS enquiries (
  reference text PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('waste_supply','polymer_purchase','partnership','press')),
  name text, email text NOT NULL, organisation text, message text,
  destination text NOT NULL,
  response_days integer NOT NULL,
  deadline date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS positions (
  id serial PRIMARY KEY,
  title text NOT NULL,
  location text NOT NULL,
  department text NOT NULL,
  contract_type text NOT NULL,
  closes_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS news_items (
  id serial PRIMARY KEY,
  tag text NOT NULL CHECK (tag IN ('funding','partnership','technical','recognition')),
  title text NOT NULL,
  outlet text NOT NULL,
  published_on date NOT NULL,
  link text NOT NULL,
  language text NOT NULL DEFAULT 'en'
);

CREATE TABLE IF NOT EXISTS statistics (
  key text PRIMARY KEY,
  value text NOT NULL,
  source text NOT NULL,
  year integer NOT NULL,
  geography text NOT NULL
);

CREATE TABLE IF NOT EXISTS claim_substantiations (
  id serial PRIMARY KEY,
  claim text NOT NULL,
  route text NOT NULL,
  first_published_on date NOT NULL,
  evidence jsonb NOT NULL,
  method_version text,
  approver text NOT NULL,
  review_on date NOT NULL,
  withdrawn boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS recipes (
  version text PRIMARY KEY,
  run_type text NOT NULL,
  set_points jsonb NOT NULL,
  tolerances jsonb NOT NULL,
  reagents jsonb NOT NULL,
  residence_minutes integer NOT NULL,
  released_by text NOT NULL,
  released_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS suspensions (
  id serial PRIMARY KEY,
  site text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('suspension','lift')),
  effective_from date NOT NULL,
  effective_to date,
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collector_findings (
  id serial PRIMARY KEY,
  collector text NOT NULL,
  opened_on date NOT NULL DEFAULT CURRENT_DATE,
  detail jsonb NOT NULL,
  closed boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS exports (
  reference text PRIMARY KEY,
  scope jsonb NOT NULL,
  body jsonb NOT NULL,
  digest text NOT NULL,
  exported_by text NOT NULL,
  exported_at timestamptz NOT NULL DEFAULT now(),
  empty boolean NOT NULL DEFAULT false
);

-- Ravel schema. Operational records are writable until closed, immutable after.
-- Movements are only ever added. Versioned definitions are immutable once computed against.

CREATE TABLE IF NOT EXISTS site (
  reference TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('commissioned','under_construction','consented','planned')),
  certification_state TEXT NOT NULL,
  nameplate_kg BIGINT NOT NULL,
  contracted_kg BIGINT NOT NULL,
  capacity_basis TEXT NOT NULL,
  last_revised TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS party_version (
  id BIGSERIAL PRIMARY KEY,
  reference TEXT NOT NULL,
  name TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS party_version_ref ON party_version(reference, effective_from);

CREATE TABLE IF NOT EXISTS collector (
  reference TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  registration TEXT NOT NULL,
  registration_expiry TEXT NOT NULL,
  site_types TEXT[] NOT NULL DEFAULT '{}',
  streams TEXT[] NOT NULL DEFAULT '{}',
  scheme_status TEXT NOT NULL DEFAULT 'registered'
);

CREATE TABLE IF NOT EXISTS approval_period (
  id BIGSERIAL PRIMARY KEY,
  collector TEXT NOT NULL REFERENCES collector(reference),
  state TEXT NOT NULL CHECK (state IN ('approved','conditional','suspended','lapsed')),
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL,
  condition TEXT,
  condition_closes_on TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by TEXT
);
CREATE INDEX IF NOT EXISTS approval_collector ON approval_period(collector);

CREATE TABLE IF NOT EXISTS finding (
  id BIGSERIAL PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  collector TEXT NOT NULL,
  batch TEXT,
  reason TEXT NOT NULL,
  departure_bp BIGINT,
  raised_on TEXT NOT NULL,
  due_on TEXT,
  state TEXT NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS weighing_device (
  reference TEXT PRIMARY KEY,
  site TEXT NOT NULL REFERENCES site(reference),
  calibrated_on TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS batch (
  reference TEXT PRIMARY KEY,
  collector TEXT NOT NULL REFERENCES collector(reference),
  collector_name TEXT NOT NULL,
  site TEXT NOT NULL REFERENCES site(reference),
  grade TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('post_consumer','pre_consumer')),
  gross_g BIGINT NOT NULL,
  tare_g BIGINT NOT NULL,
  net_g BIGINT NOT NULL,
  moisture_bp BIGINT NOT NULL,
  moisture_method TEXT NOT NULL,
  device TEXT NOT NULL REFERENCES weighing_device(reference),
  received_on TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  composition JSONB NOT NULL DEFAULT '[]',
  contamination JSONB NOT NULL DEFAULT '{}',
  custody JSONB NOT NULL DEFAULT '[]',
  accepted_g BIGINT,
  rejected_g BIGINT NOT NULL DEFAULT 0,
  rejected_destination TEXT,
  reject_reason TEXT,
  claimable_from TEXT,
  booked_by TEXT NOT NULL,
  claimable BOOLEAN,
  state TEXT NOT NULL DEFAULT 'accepted'
);

CREATE TABLE IF NOT EXISTS recipe_version (
  reference TEXT PRIMARY KEY,
  stage TEXT NOT NULL,
  set_points JSONB NOT NULL,
  released_by TEXT NOT NULL,
  released_on TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS run (
  reference TEXT PRIMARY KEY,
  run_type TEXT NOT NULL CHECK (run_type IN ('dissolution','depolymerisation','purification','repolymerisation')),
  site TEXT NOT NULL REFERENCES site(reference),
  equipment TEXT NOT NULL,
  recipe_version TEXT NOT NULL REFERENCES recipe_version(reference),
  operator TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed')),
  losses_g BIGINT,
  mass_in_g BIGINT NOT NULL DEFAULT 0,
  mass_out_g BIGINT NOT NULL DEFAULT 0,
  achieved JSONB
);

CREATE TABLE IF NOT EXISTS consumption (
  reference TEXT PRIMARY KEY,
  run TEXT NOT NULL REFERENCES run(reference),
  input TEXT NOT NULL,
  input_kind TEXT NOT NULL CHECK (input_kind IN ('batch','output')),
  mass_g BIGINT NOT NULL,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_on TEXT NOT NULL,
  recorded_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS consumption_run ON consumption(run);

CREATE TABLE IF NOT EXISTS output (
  reference TEXT PRIMARY KEY,
  run TEXT NOT NULL REFERENCES run(reference),
  kind TEXT NOT NULL CHECK (kind IN ('intermediate','lot','byproduct')),
  mass_g BIGINT NOT NULL,
  disposition TEXT,
  lot TEXT,
  produced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS output_run ON output(run);

CREATE TABLE IF NOT EXISTS lot (
  reference TEXT PRIMARY KEY,
  site TEXT NOT NULL REFERENCES site(reference),
  grade TEXT NOT NULL,
  mass_g BIGINT NOT NULL,
  disposition TEXT NOT NULL DEFAULT 'pending' CHECK (disposition IN ('pending','released','quarantined','rejected')),
  disposition_by TEXT,
  disposition_on TEXT,
  claim_type TEXT NOT NULL DEFAULT 'mass_balance' CHECK (claim_type IN ('physically_segregated','controlled_blending','mass_balance')),
  produced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  produced_by TEXT NOT NULL,
  flags TEXT[] NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS lot_batch_flag (
  lot TEXT NOT NULL,
  batch TEXT NOT NULL,
  PRIMARY KEY (lot, batch)
);

CREATE TABLE IF NOT EXISTS test_result (
  reference TEXT PRIMARY KEY,
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('lot','batch')),
  subject TEXT NOT NULL,
  property TEXT NOT NULL,
  method TEXT NOT NULL,
  instrument TEXT,
  analyst TEXT NOT NULL,
  value NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  uncertainty_bp BIGINT NOT NULL DEFAULT 0,
  method_mismatch BOOLEAN NOT NULL DEFAULT false,
  usable_for_release BOOLEAN NOT NULL DEFAULT true,
  taken_on TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS test_subject ON test_result(subject_kind, subject);

CREATE TABLE IF NOT EXISTS deviation (
  reference TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed')),
  raised_by TEXT NOT NULL,
  raised_on TEXT NOT NULL,
  description TEXT NOT NULL,
  outcome TEXT CHECK (outcome IN ('root_cause_found','cause_not_established')),
  closed_on TEXT,
  closes_run TEXT,
  closes_lot TEXT
);
CREATE TABLE IF NOT EXISTS deviation_subject (
  deviation TEXT NOT NULL,
  subject_kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  PRIMARY KEY (deviation, subject_kind, subject)
);

CREATE TABLE IF NOT EXISTS override (
  reference TEXT PRIMARY KEY,
  separation TEXT NOT NULL,
  reason TEXT NOT NULL,
  lot TEXT NOT NULL,
  authorised_by TEXT NOT NULL,
  authorised_on TEXT NOT NULL,
  reviewed BOOLEAN NOT NULL DEFAULT false,
  reviewed_by TEXT,
  reviewed_on TEXT
);

CREATE TABLE IF NOT EXISTS balance_period (
  id TEXT PRIMARY KEY,
  site TEXT NOT NULL REFERENCES site(reference),
  grade TEXT NOT NULL,
  period_from TEXT NOT NULL,
  period_to TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed')),
  carry_over_limit_bp BIGINT NOT NULL DEFAULT 2000,
  allocation_basis TEXT NOT NULL DEFAULT 'mass' CHECK (allocation_basis IN ('mass','energy','economic')),
  closed_on TEXT,
  closed_by TEXT,
  cut_off TEXT,
  carried_forward JSONB,
  expired JSONB
);

CREATE TABLE IF NOT EXISTS credit_movement (
  id BIGSERIAL PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  period TEXT NOT NULL REFERENCES balance_period(id),
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  category TEXT NOT NULL CHECK (category IN ('post_consumer','pre_consumer')),
  mass_g BIGINT NOT NULL,
  reason TEXT NOT NULL,
  lot TEXT,
  batch TEXT,
  consumption TEXT,
  origin_site TEXT,
  transfer TEXT,
  effective_on TEXT NOT NULL,
  event_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by TEXT NOT NULL,
  derivation JSONB
);
CREATE INDEX IF NOT EXISTS credit_period ON credit_movement(period);

CREATE TABLE IF NOT EXISTS allocation (
  reference TEXT PRIMARY KEY,
  period TEXT NOT NULL REFERENCES balance_period(id),
  lot TEXT NOT NULL,
  category TEXT NOT NULL,
  mass_g BIGINT NOT NULL,
  allocated_by TEXT NOT NULL,
  allocated_on TEXT NOT NULL,
  decided_by TEXT,
  favoured_over TEXT[]
);

CREATE TABLE IF NOT EXISTS conversion_factor (
  reference TEXT PRIMARY KEY,
  site TEXT NOT NULL REFERENCES site(reference),
  factor_bp BIGINT NOT NULL,
  derived_from TEXT,
  derived_to TEXT,
  derived_in_g BIGINT NOT NULL DEFAULT 0,
  derived_out_g BIGINT NOT NULL DEFAULT 0,
  provisional BOOLEAN NOT NULL DEFAULT false,
  published_by TEXT NOT NULL,
  published_on TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS carbon_method (
  id TEXT NOT NULL,
  version BIGINT NOT NULL,
  standard TEXT NOT NULL,
  functional_unit TEXT NOT NULL,
  boundary TEXT NOT NULL,
  allocation_basis TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  published_on TEXT NOT NULL,
  published_by TEXT NOT NULL,
  data_quality JSONB NOT NULL DEFAULT '{}',
  emission_factors JSONB NOT NULL DEFAULT '[]',
  superseded_by BIGINT,
  PRIMARY KEY (id, version)
);

CREATE TABLE IF NOT EXISTS carbon_figure (
  id TEXT PRIMARY KEY,
  lot TEXT NOT NULL,
  value_mg_per_kg BIGINT NOT NULL,
  boundary TEXT NOT NULL,
  method_version TEXT NOT NULL,
  uncertainty_bp BIGINT NOT NULL,
  primary_share_bp BIGINT NOT NULL,
  breakdown JSONB NOT NULL DEFAULT '[]',
  comparator JSONB NOT NULL DEFAULT '{}',
  energy_location_mg_per_kg BIGINT,
  energy_market_mg_per_kg BIGINT,
  metered_kwh BIGINT,
  retired_kwh BIGINT,
  unmatched_kwh BIGINT,
  versions JSONB NOT NULL DEFAULT '{}',
  computed_on TEXT NOT NULL,
  computed_by TEXT NOT NULL,
  superseded_by TEXT,
  cache_valid BOOLEAN NOT NULL DEFAULT true,
  revision BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS energy_instrument (
  reference TEXT PRIMARY KEY,
  quantity_kwh BIGINT NOT NULL,
  vintage TEXT NOT NULL,
  region TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('held','retired'))
);
CREATE TABLE IF NOT EXISTS energy_retirement (
  id BIGSERIAL PRIMARY KEY,
  instrument TEXT NOT NULL REFERENCES energy_instrument(reference),
  period TEXT NOT NULL REFERENCES balance_period(id),
  retired_kwh BIGINT NOT NULL,
  retired_on TEXT NOT NULL,
  retired_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS specification (
  grade TEXT NOT NULL,
  version BIGINT NOT NULL,
  issued_on TEXT NOT NULL,
  virgin_reference TEXT NOT NULL,
  virgin_source TEXT NOT NULL,
  virgin_reference_date TEXT NOT NULL,
  rows JSONB NOT NULL DEFAULT '[]',
  superseded_by BIGINT,
  PRIMARY KEY (grade, version)
);

CREATE TABLE IF NOT EXISTS customer (
  reference TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  holds_specification TEXT NOT NULL,
  holds_version BIGINT NOT NULL,
  application TEXT NOT NULL,
  industry TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS specification_issue (
  id BIGSERIAL PRIMARY KEY,
  grade TEXT NOT NULL,
  version BIGINT NOT NULL,
  customer TEXT NOT NULL,
  issued_on TEXT NOT NULL,
  issued_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conformance (
  id BIGSERIAL PRIMARY KEY,
  customer TEXT NOT NULL,
  grade TEXT NOT NULL,
  version BIGINT NOT NULL,
  application TEXT NOT NULL,
  trials JSONB NOT NULL DEFAULT '[]',
  outcome TEXT,
  opened_on TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS change_notice (
  reference TEXT PRIMARY KEY,
  what TEXT NOT NULL,
  detail TEXT NOT NULL,
  raised_by TEXT NOT NULL,
  raised_on TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed','released')),
  notice_period_days BIGINT NOT NULL,
  specifications_affected TEXT[] NOT NULL DEFAULT '{}',
  customers_affected TEXT[] NOT NULL DEFAULT '{}',
  qualifications_affected TEXT[] NOT NULL DEFAULT '{}',
  blocking TEXT
);
CREATE TABLE IF NOT EXISTS change_ack (
  id BIGSERIAL PRIMARY KEY,
  notice TEXT NOT NULL REFERENCES change_notice(reference),
  customer TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('notified','waived')),
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contract (
  id TEXT PRIMARY KEY,
  recipient TEXT NOT NULL,
  site TEXT NOT NULL REFERENCES site(reference),
  period TEXT NOT NULL,
  committed_kg BIGINT NOT NULL,
  floor_bp BIGINT NOT NULL,
  delivered_kg BIGINT NOT NULL DEFAULT 0,
  shortfall_consequence TEXT NOT NULL,
  unreachable_on TEXT,
  unreachable_allocation TEXT
);

CREATE TABLE IF NOT EXISTS contract_allocation (
  reference TEXT PRIMARY KEY,
  contract TEXT NOT NULL REFERENCES contract(id),
  lot TEXT NOT NULL,
  mass_g BIGINT NOT NULL,
  decided_by TEXT,
  favoured_over TEXT[],
  allocated_on TEXT NOT NULL,
  allocated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS certificate (
  number TEXT PRIMARY KEY,
  version BIGINT NOT NULL DEFAULT 1,
  site TEXT NOT NULL REFERENCES site(reference),
  lots JSONB NOT NULL,
  grade TEXT NOT NULL,
  specification_version BIGINT NOT NULL,
  claim_type TEXT NOT NULL,
  content_bp BIGINT NOT NULL,
  category_split JSONB NOT NULL,
  period TEXT NOT NULL,
  carbon TEXT,
  primary_share_bp BIGINT,
  scheme TEXT NOT NULL,
  registration TEXT NOT NULL,
  test_results JSONB NOT NULL DEFAULT '[]',
  permitted_statement TEXT NOT NULL,
  prohibited_statement TEXT NOT NULL,
  signer TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL,
  conditions JSONB NOT NULL,
  recipient TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'issued' CHECK (state IN ('issued','withdrawn')),
  withdrawn_reason TEXT,
  withdrawn_by TEXT,
  withdrawn_on TEXT,
  withdrawal_notified JSONB,
  verification_url TEXT NOT NULL,
  provisional_factor BOOLEAN NOT NULL DEFAULT false,
  derived_certificates TEXT[] NOT NULL DEFAULT '{}',
  input_versions JSONB NOT NULL DEFAULT '{}',
  reissue_of TEXT
);
CREATE TABLE IF NOT EXISTS certificate_seq (
  site TEXT PRIMARY KEY,
  last BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS restatement (
  reference TEXT PRIMARY KEY,
  period TEXT NOT NULL REFERENCES balance_period(id),
  reason TEXT NOT NULL,
  opened_by TEXT NOT NULL,
  opened_on TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','resolved')),
  revised_factor TEXT,
  content_movements JSONB
);
CREATE TABLE IF NOT EXISTS resolution (
  id BIGSERIAL PRIMARY KEY,
  restatement TEXT NOT NULL REFERENCES restatement(reference),
  certificate TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('reissued','withdrawn','unaffected')),
  reason TEXT NOT NULL,
  resolved_by TEXT NOT NULL,
  resolved_on TEXT NOT NULL,
  UNIQUE (restatement, certificate)
);

CREATE TABLE IF NOT EXISTS record_entry (
  seq BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL,
  act TEXT NOT NULL,
  person TEXT,
  site TEXT,
  object TEXT,
  detail JSONB,
  refused TEXT,
  digest TEXT NOT NULL,
  prev_digest TEXT NOT NULL,
  content TEXT,
  content_deleted_on TEXT,
  retain_until TEXT,
  legal_hold BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS legal_hold (
  reference TEXT PRIMARY KEY,
  seq BIGINT NOT NULL,
  placed_on TEXT NOT NULL,
  placed_by TEXT NOT NULL,
  lifted_on TEXT
);

CREATE TABLE IF NOT EXISTS inbound_record (
  reference TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('weighbridge','control_system','laboratory','customer_reporting')),
  received_at TIMESTAMPTZ NOT NULL,
  payload_verbatim TEXT NOT NULL,
  payload JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transfer (
  reference TEXT PRIMARY KEY,
  from_period TEXT NOT NULL REFERENCES balance_period(id),
  to_period TEXT NOT NULL REFERENCES balance_period(id),
  mass_g BIGINT NOT NULL,
  category TEXT NOT NULL,
  effective_on TEXT NOT NULL,
  moved_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS enquiry (
  reference TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('waste_supply','polymer_purchase','partnership','press')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  destination TEXT NOT NULL,
  response_days BIGINT NOT NULL,
  deadline TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS position (
  reference TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  location TEXT NOT NULL,
  department TEXT NOT NULL,
  contract_type TEXT NOT NULL,
  closes_on TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS news_item (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  tag TEXT NOT NULL CHECK (tag IN ('funding','partnership','technical','recognition')),
  outlet TEXT NOT NULL,
  date TEXT NOT NULL,
  link TEXT NOT NULL,
  language TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS statistic (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  source TEXT NOT NULL,
  year TEXT NOT NULL,
  geography TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS claim_substantiation (
  id BIGSERIAL PRIMARY KEY,
  claim TEXT NOT NULL,
  route TEXT NOT NULL,
  first_published TEXT NOT NULL,
  evidence TEXT NOT NULL,
  method_version TEXT NOT NULL,
  approver TEXT NOT NULL,
  review_date TEXT NOT NULL,
  withdrawn_on TEXT
);

CREATE TABLE IF NOT EXISTS site_certification (
  id BIGSERIAL PRIMARY KEY,
  site TEXT NOT NULL REFERENCES site(reference),
  state TEXT NOT NULL CHECK (state IN ('certified','suspended')),
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  effective_from TEXT NOT NULL,
  recorded_on TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  lifted_on TEXT
);

CREATE TABLE IF NOT EXISTS export_record (
  reference TEXT PRIMARY KEY,
  scope JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL,
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS app_session (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  roles JSONB NOT NULL,
  sites JSONB NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  access_token TEXT
);

CREATE TABLE IF NOT EXISTS idempotency_key (
  key TEXT NOT NULL,
  route TEXT NOT NULL,
  body TEXT NOT NULL,
  response TEXT,
  at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (key, route)
);

CREATE TABLE IF NOT EXISTS access_grant (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  site TEXT NOT NULL,
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collector_account (
  email TEXT NOT NULL,
  collector TEXT NOT NULL REFERENCES collector(reference),
  PRIMARY KEY (email)
);
CREATE TABLE IF NOT EXISTS converter_account (
  email TEXT NOT NULL,
  customer TEXT NOT NULL REFERENCES customer(reference),
  PRIMARY KEY (email)
);

CREATE TABLE IF NOT EXISTS annotation (
  id BIGSERIAL PRIMARY KEY,
  object TEXT NOT NULL,
  note TEXT NOT NULL,
  by TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schema_version (
  version BIGINT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ravel schema. Migration 001. Nothing here is ever rewritten in place:
-- a later migration adds a field, it never changes the meaning of one.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site (
  reference           text PRIMARY KEY,
  name                text NOT NULL,
  confidence          text NOT NULL,
  nameplate_kg        bigint NOT NULL,
  contracted_kg       bigint NOT NULL,
  certification_state text NOT NULL,
  basis               text NOT NULL,
  last_revised        date NOT NULL
);

CREATE TABLE IF NOT EXISTS site_certification (
  reference      text PRIMARY KEY,
  site           text NOT NULL REFERENCES site(reference),
  grade          text,
  state          text NOT NULL,          -- certified | suspended | lifted | not_certified
  effective_from date NOT NULL,
  effective_to   date,
  reason         text,
  recorded_at    timestamptz NOT NULL DEFAULT now(),
  recorded_by    text
);

CREATE TABLE IF NOT EXISTS party_version (
  id             bigserial PRIMARY KEY,
  reference      text NOT NULL,
  kind           text NOT NULL,          -- collector | customer | producer | scheme
  name           text NOT NULL,
  effective_from date NOT NULL,
  superseded_by  bigint,
  recorded_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS party_version_ref ON party_version(reference, effective_from);

CREATE TABLE IF NOT EXISTS collector (
  reference           text PRIMARY KEY,
  name                text NOT NULL,
  country             text NOT NULL,
  registration        text NOT NULL,
  registration_expiry date NOT NULL,
  collection_site_types jsonb NOT NULL DEFAULT '[]',
  declared_streams    jsonb NOT NULL DEFAULT '[]',
  scheme_status       text NOT NULL DEFAULT 'unknown'
);

CREATE TABLE IF NOT EXISTS approval_period (
  reference          text PRIMARY KEY,
  collector          text NOT NULL REFERENCES collector(reference),
  state              text NOT NULL,      -- approved | conditional | suspended | lapsed
  valid_from         date NOT NULL,
  valid_to           date NOT NULL,
  condition          text,
  condition_closes_on date,
  recorded_at        timestamptz NOT NULL DEFAULT now(),
  recorded_by        text
);

CREATE TABLE IF NOT EXISTS finding (
  reference    text PRIMARY KEY,
  collector    text NOT NULL REFERENCES collector(reference),
  batch        text,
  kind         text NOT NULL,
  detail       text NOT NULL,
  departure_bp integer,
  raised_on    date NOT NULL,
  due_on       date,
  state        text NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS weighing_device (
  reference     text PRIMARY KEY,
  site          text NOT NULL REFERENCES site(reference),
  calibrated_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS batch (
  reference        text PRIMARY KEY,
  collector        text NOT NULL REFERENCES collector(reference),
  site             text NOT NULL REFERENCES site(reference),
  grade            text NOT NULL DEFAULT 'N6',
  category         text NOT NULL,         -- post_consumer | pre_consumer
  gross_g          bigint NOT NULL,
  tare_g           bigint NOT NULL,
  net_g            bigint NOT NULL,
  moisture_bp      integer NOT NULL,
  moisture_method  text NOT NULL,
  device           text NOT NULL REFERENCES weighing_device(reference),
  received_on      date NOT NULL,
  composition      jsonb NOT NULL DEFAULT '{}',
  contamination    jsonb NOT NULL DEFAULT '{}',
  accepted         boolean NOT NULL DEFAULT true,
  rejected_g       bigint NOT NULL DEFAULT 0,
  rejected_reason  text,
  rejected_destination text,
  claimable_from   date,
  event_at         timestamptz NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  effective_on     date NOT NULL,
  recorded_by      text NOT NULL
);

CREATE TABLE IF NOT EXISTS custody_link (
  id        bigserial PRIMARY KEY,
  batch     text NOT NULL REFERENCES batch(reference),
  ordinal   integer NOT NULL,
  kind      text NOT NULL,   -- collection_site|collector|transport|arrival|weighing|acceptance
  link_date date NOT NULL,
  party     text NOT NULL,
  late      boolean NOT NULL DEFAULT false,
  arrived_on date
);

CREATE TABLE IF NOT EXISTS weighing (
  reference         text PRIMARY KEY,
  batch             text NOT NULL REFERENCES batch(reference),
  device            text NOT NULL REFERENCES weighing_device(reference),
  gross_g           bigint NOT NULL,
  tare_g            bigint NOT NULL,
  net_g             bigint NOT NULL,
  calibration_state text NOT NULL,
  weighed_at        timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS recipe_version (
  reference     text PRIMARY KEY,
  run_type      text NOT NULL,
  version       integer NOT NULL,
  set_points    jsonb NOT NULL,
  tolerances    jsonb NOT NULL,
  reagents      jsonb NOT NULL DEFAULT '[]',
  residence_min integer NOT NULL,
  released_by   text NOT NULL,
  released_on   date NOT NULL,
  superseded_by text
);

CREATE TABLE IF NOT EXISTS run (
  reference      text PRIMARY KEY,
  run_type       text NOT NULL,
  site           text NOT NULL REFERENCES site(reference),
  equipment      text NOT NULL,
  recipe_version text NOT NULL REFERENCES recipe_version(reference),
  operator       text NOT NULL,
  started_at     timestamptz NOT NULL,
  closed_at      timestamptz,
  state          text NOT NULL DEFAULT 'open',   -- open | closed | queued
  actual_set_points jsonb NOT NULL DEFAULT '{}',
  losses_g       bigint,
  event_at       timestamptz NOT NULL,
  recorded_at    timestamptz NOT NULL DEFAULT now(),
  effective_on   date NOT NULL,
  recorded_by    text NOT NULL
);

CREATE TABLE IF NOT EXISTS consumption (
  reference    text PRIMARY KEY,
  run          text NOT NULL REFERENCES run(reference),
  input_kind   text NOT NULL,     -- batch | output
  input_ref    text NOT NULL,
  mass_g       bigint NOT NULL,
  event_at     timestamptz NOT NULL,
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  effective_on date NOT NULL,
  recorded_by  text NOT NULL
);
CREATE INDEX IF NOT EXISTS consumption_run ON consumption(run);
CREATE INDEX IF NOT EXISTS consumption_input ON consumption(input_ref);

CREATE TABLE IF NOT EXISTS output (
  reference    text PRIMARY KEY,
  run          text NOT NULL REFERENCES run(reference),
  kind         text NOT NULL,     -- intermediate | lot | byproduct
  mass_g       bigint NOT NULL,
  disposition  text,              -- sold | disposed  (byproduct only)
  event_at     timestamptz NOT NULL,
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  effective_on date NOT NULL,
  recorded_by  text NOT NULL
);
CREATE INDEX IF NOT EXISTS output_run ON output(run);

CREATE TABLE IF NOT EXISTS lot (
  reference     text PRIMARY KEY,
  grade         text NOT NULL,
  site          text NOT NULL REFERENCES site(reference),
  mass_g        bigint NOT NULL,
  disposition   text NOT NULL DEFAULT 'pending',
  claim_type    text NOT NULL,
  produced_by   text REFERENCES run(reference),
  output_ref    text,
  blended_from  jsonb,
  sites_named   jsonb NOT NULL DEFAULT '[]',
  event_at      timestamptz NOT NULL,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  effective_on  date NOT NULL,
  recorded_by   text NOT NULL
);

CREATE TABLE IF NOT EXISTS disposition_act (
  reference    text PRIMARY KEY,
  lot          text NOT NULL REFERENCES lot(reference),
  disposition  text NOT NULL,
  reason       text,
  decided_by   text NOT NULL,
  decided_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS test_result (
  reference      text PRIMARY KEY,
  subject_kind   text NOT NULL,   -- lot | batch
  subject_ref    text NOT NULL,
  property       text NOT NULL,
  method         text NOT NULL,
  instrument     text NOT NULL,
  analyst        text NOT NULL,
  value          text NOT NULL,
  unit           text NOT NULL,
  uncertainty_bp integer NOT NULL,
  method_mismatch boolean NOT NULL DEFAULT false,
  usable_for_release boolean NOT NULL DEFAULT true,
  entered_by     text NOT NULL,
  event_at       timestamptz NOT NULL,
  recorded_at    timestamptz NOT NULL DEFAULT now(),
  effective_on   date NOT NULL
);
CREATE INDEX IF NOT EXISTS test_subject ON test_result(subject_ref);

CREATE TABLE IF NOT EXISTS deviation (
  reference   text PRIMARY KEY,
  title       text NOT NULL,
  detail      text NOT NULL,
  state       text NOT NULL DEFAULT 'open',
  outcome     text,
  raised_by   text NOT NULL,
  raised_at   timestamptz NOT NULL,
  closed_by   text,
  closed_at   timestamptz,
  close_reason text
);

CREATE TABLE IF NOT EXISTS deviation_link (
  id        bigserial PRIMARY KEY,
  deviation text NOT NULL REFERENCES deviation(reference),
  kind      text NOT NULL,  -- run | lot
  ref       text NOT NULL
);

CREATE TABLE IF NOT EXISTS override (
  reference     text PRIMARY KEY,
  separation    text NOT NULL,
  reason        text NOT NULL,
  lot           text NOT NULL REFERENCES lot(reference),
  authorised_by text NOT NULL,
  recorded_by   text NOT NULL,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  authorised_on date NOT NULL,
  reviewed      boolean NOT NULL DEFAULT false,
  reviewed_by   text,
  reviewed_at   timestamptz
);

CREATE TABLE IF NOT EXISTS balance_period (
  id                 text PRIMARY KEY,
  site               text NOT NULL REFERENCES site(reference),
  grade              text NOT NULL,
  period_from        date NOT NULL,
  period_to          date NOT NULL,
  state              text NOT NULL DEFAULT 'open',
  carry_over_limit_bp integer NOT NULL,
  allocation_basis   text NOT NULL DEFAULT 'mass',
  closed_on          date,
  cut_off            date,
  closed_by          text,
  carried_forward    jsonb,
  expired            jsonb
);

CREATE TABLE IF NOT EXISTS credit_movement (
  reference     text PRIMARY KEY,
  period        text NOT NULL REFERENCES balance_period(id),
  direction     text NOT NULL,   -- in | out | inbound_transfer | outbound_transfer | carry_forward | expiry
  category      text NOT NULL,   -- post_consumer | pre_consumer
  mass_g        bigint NOT NULL,
  lot           text,
  batch         text,
  consumption   text,
  origin_site   text,
  movement      text,
  fresh_credit  boolean NOT NULL DEFAULT true,
  factor_version text,
  derivation    jsonb NOT NULL DEFAULT '{}',
  event_at      timestamptz NOT NULL,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  effective_on  date NOT NULL,
  recorded_by   text NOT NULL
);
CREATE INDEX IF NOT EXISTS credit_period ON credit_movement(period);

CREATE TABLE IF NOT EXISTS refused_allocation (
  reference    text PRIMARY KEY,
  period       text NOT NULL,
  lot          text NOT NULL,
  category     text NOT NULL,
  requested_g  bigint NOT NULL,
  available_g  bigint NOT NULL,
  refused_at   timestamptz NOT NULL DEFAULT now(),
  refused_for  text NOT NULL
);

CREATE TABLE IF NOT EXISTS conversion_factor (
  reference    text PRIMARY KEY,
  site         text NOT NULL REFERENCES site(reference),
  version      integer NOT NULL,
  factor_bp    integer NOT NULL,
  derived_from date,
  derived_to   date,
  derived_in_g bigint NOT NULL,
  derived_out_g bigint NOT NULL,
  provisional  boolean NOT NULL DEFAULT false,
  superseded_by text,
  published_by text NOT NULL,
  published_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS transfer (
  reference     text PRIMARY KEY,
  from_period   text NOT NULL REFERENCES balance_period(id),
  to_period     text NOT NULL REFERENCES balance_period(id),
  category      text NOT NULL,
  mass_g        bigint NOT NULL,
  moved_on      date NOT NULL,
  recorded_by   text NOT NULL,
  recorded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS carbon_method (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  primary_threshold_bp integer NOT NULL DEFAULT 5000
);

CREATE TABLE IF NOT EXISTS carbon_method_version (
  id              bigserial PRIMARY KEY,
  method          text NOT NULL REFERENCES carbon_method(id),
  version         integer NOT NULL,
  standard        text NOT NULL,
  functional_unit text NOT NULL,
  boundary        text NOT NULL,
  allocation_basis text NOT NULL,
  reviewer        text NOT NULL,
  published_on    date NOT NULL,
  published_by    text NOT NULL,
  data_quality_rules jsonb NOT NULL DEFAULT '[]',
  emission_factors jsonb NOT NULL DEFAULT '[]',
  superseded      boolean NOT NULL DEFAULT false,
  UNIQUE(method, version)
);

CREATE TABLE IF NOT EXISTS carbon_figure (
  id               text PRIMARY KEY,
  lot              text NOT NULL REFERENCES lot(reference),
  figure_version   integer NOT NULL DEFAULT 1,
  method           text NOT NULL,
  method_version   integer NOT NULL,
  value_mg_per_kg  bigint NOT NULL,
  uncertainty_bp   integer NOT NULL,
  primary_share_bp integer NOT NULL,
  boundary         text NOT NULL,
  comparator       jsonb NOT NULL,
  breakdown        jsonb NOT NULL,
  energy           jsonb NOT NULL,
  input_versions   jsonb NOT NULL DEFAULT '{}',
  superseded_by    text,
  cache_valid      boolean NOT NULL DEFAULT true,
  computed_at      timestamptz NOT NULL DEFAULT now(),
  computed_by      text,
  reason           text
);

CREATE TABLE IF NOT EXISTS energy_instrument (
  reference    text PRIMARY KEY,
  quantity_kwh bigint NOT NULL,
  vintage      integer NOT NULL,
  region       text NOT NULL,
  state        text NOT NULL,
  applied_to   text
);

CREATE TABLE IF NOT EXISTS specification (
  grade        text NOT NULL,
  version      integer NOT NULL,
  issued_on    date NOT NULL,
  superseded   boolean NOT NULL DEFAULT false,
  properties   jsonb NOT NULL,
  virgin_reference jsonb NOT NULL,
  PRIMARY KEY (grade, version)
);

CREATE TABLE IF NOT EXISTS specification_issue (
  reference   text PRIMARY KEY,
  grade       text NOT NULL,
  version     integer NOT NULL,
  customer    text NOT NULL,
  issued_by   text NOT NULL,
  issued_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer (
  reference   text PRIMARY KEY,
  name        text NOT NULL,
  contact     text NOT NULL,
  spec_grade  text,
  spec_version integer,
  application text NOT NULL,
  industry    text NOT NULL,
  language    text NOT NULL DEFAULT 'en'
);

CREATE TABLE IF NOT EXISTS conformance (
  reference    text PRIMARY KEY,
  customer     text NOT NULL REFERENCES customer(reference),
  application  text NOT NULL,
  spec_grade   text NOT NULL,
  spec_version integer NOT NULL,
  trials       jsonb NOT NULL DEFAULT '[]',
  outcome      text NOT NULL,
  recorded_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS change_notice (
  reference        text PRIMARY KEY,
  title            text NOT NULL,
  detail           text NOT NULL,
  parameter        text NOT NULL,
  qualification_relevant boolean NOT NULL DEFAULT false,
  notice_period_days integer NOT NULL,
  state            text NOT NULL DEFAULT 'raised',
  raised_by        text NOT NULL,
  raised_at        timestamptz NOT NULL DEFAULT now(),
  released_at      timestamptz,
  released_by      text
);

CREATE TABLE IF NOT EXISTS change_notice_ack (
  id          bigserial PRIMARY KEY,
  notice      text NOT NULL REFERENCES change_notice(reference),
  customer    text NOT NULL,
  kind        text NOT NULL,     -- notified | waived | acknowledged
  at          timestamptz NOT NULL DEFAULT now(),
  by_person   text NOT NULL
);

CREATE TABLE IF NOT EXISTS contract (
  id            text PRIMARY KEY,
  recipient     text NOT NULL REFERENCES customer(reference),
  site          text NOT NULL REFERENCES site(reference),
  period        text NOT NULL,
  committed_kg  bigint NOT NULL,
  floor_bp      integer NOT NULL,
  delivered_kg  bigint NOT NULL DEFAULT 0,
  shortfall_consequence text NOT NULL,
  unreachable_on date,
  unreachable_allocation text
);

CREATE TABLE IF NOT EXISTS allocation (
  reference     text PRIMARY KEY,
  contract      text NOT NULL REFERENCES contract(id),
  lot           text NOT NULL REFERENCES lot(reference),
  mass_g        bigint NOT NULL,
  decided_by    text NOT NULL,
  favoured_over jsonb NOT NULL DEFAULT '[]',
  recorded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS certificate (
  number         text PRIMARY KEY,
  version        integer NOT NULL DEFAULT 1,
  site           text NOT NULL REFERENCES site(reference),
  grade          text NOT NULL,
  recipient      text NOT NULL,
  recipient_name text NOT NULL,
  lots           jsonb NOT NULL,
  specification_version integer NOT NULL,
  claim_type     text NOT NULL,
  content_bp     integer NOT NULL,
  category_split jsonb NOT NULL,
  period         text NOT NULL,
  carbon         jsonb NOT NULL,
  primary_share_bp integer NOT NULL,
  scheme         text NOT NULL,
  registration   text NOT NULL,
  test_results   jsonb NOT NULL DEFAULT '[]',
  permitted_statement text NOT NULL,
  prohibited_statement text NOT NULL,
  signer         text NOT NULL,
  signer_name    text NOT NULL,
  signed_at      timestamptz NOT NULL,
  state          text NOT NULL DEFAULT 'issued',
  provisional_factor boolean NOT NULL DEFAULT false,
  conditions     jsonb NOT NULL,
  input_versions jsonb NOT NULL DEFAULT '{}',
  derived_from   text,
  supersedes     text,
  withdrawn_on   date,
  withdrawn_by   text,
  withdrawal_reason text,
  document       text NOT NULL,
  language       text NOT NULL DEFAULT 'en'
);

CREATE TABLE IF NOT EXISTS certificate_sequence (
  site   text PRIMARY KEY,
  next   integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS certificate_notification (
  id          bigserial PRIMARY KEY,
  certificate text NOT NULL,
  recipient   text NOT NULL,
  recipient_name text NOT NULL,
  subject     text NOT NULL,
  body        text NOT NULL,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  kind        text NOT NULL
);

CREATE TABLE IF NOT EXISTS restatement (
  reference    text PRIMARY KEY,
  period       text NOT NULL REFERENCES balance_period(id),
  reason       text NOT NULL,
  state        text NOT NULL DEFAULT 'open',
  revised_factor text,
  opened_by    text NOT NULL,
  opened_at    timestamptz NOT NULL DEFAULT now(),
  certificates jsonb NOT NULL DEFAULT '[]',
  content_movements jsonb NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS resolution (
  reference    text PRIMARY KEY,
  restatement  text NOT NULL REFERENCES restatement(reference),
  certificate  text NOT NULL,
  outcome      text NOT NULL,
  reason       text NOT NULL,
  recorded_by  text NOT NULL,
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restatement, certificate)
);

CREATE TABLE IF NOT EXISTS record_entry (
  seq          bigint PRIMARY KEY,
  act          text NOT NULL,
  person       text NOT NULL,
  site         text,
  object_kind  text,
  object_ref   text,
  at           timestamptz NOT NULL,
  outcome      text NOT NULL DEFAULT 'success',
  content      jsonb,
  digest       text NOT NULL,
  prev_digest  text NOT NULL,
  content_deleted_on date,
  corrects     bigint
);

CREATE TABLE IF NOT EXISTS legal_hold (
  reference  text PRIMARY KEY,
  seq        bigint NOT NULL,
  placed_by  text NOT NULL,
  placed_at  timestamptz NOT NULL DEFAULT now(),
  lifted_by  text,
  lifted_at  timestamptz,
  active     boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS export (
  reference   text PRIMARY KEY,
  scope       jsonb NOT NULL,
  requested_by text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  entry_count integer NOT NULL DEFAULT 0,
  payload     jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS enquiry (
  reference    text PRIMARY KEY,
  type         text NOT NULL,
  name         text NOT NULL,
  email        text NOT NULL,
  organisation text,
  message      text NOT NULL,
  destination  text NOT NULL,
  response_days integer NOT NULL,
  deadline     date,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS position (
  reference     text PRIMARY KEY,
  title         text NOT NULL,
  location      text NOT NULL,
  department    text NOT NULL,
  contract_type text NOT NULL,
  closes_on     date NOT NULL
);

CREATE TABLE IF NOT EXISTS news_item (
  reference text PRIMARY KEY,
  title     text NOT NULL,
  tag       text NOT NULL,
  outlet    text NOT NULL,
  item_date date NOT NULL,
  link      text NOT NULL,
  language  text NOT NULL,
  summary   text NOT NULL
);

CREATE TABLE IF NOT EXISTS statistic (
  key       text PRIMARY KEY,
  value     text NOT NULL,
  source    text NOT NULL,
  year      integer NOT NULL,
  geography text NOT NULL
);

CREATE TABLE IF NOT EXISTS claim_substantiation (
  reference      text PRIMARY KEY,
  claim          text NOT NULL,
  route          text NOT NULL,
  first_published date NOT NULL,
  evidence       text NOT NULL,
  evidence_expires_on date,
  method_version text NOT NULL,
  approver       text NOT NULL,
  review_date    date NOT NULL,
  state          text NOT NULL DEFAULT 'published'
);

CREATE TABLE IF NOT EXISTS inbound_record (
  reference        text PRIMARY KEY,
  source           text NOT NULL,
  received_at      timestamptz NOT NULL,
  payload_verbatim text NOT NULL,
  payload          jsonb,
  stored_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idempotency (
  key        text NOT NULL,
  route      text NOT NULL,
  body_hash  text NOT NULL,
  status     integer NOT NULL,
  response   jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, route)
);

CREATE TABLE IF NOT EXISTS app_user (
  email  text PRIMARY KEY,
  name   text NOT NULL,
  role   text NOT NULL,
  sites  jsonb NOT NULL,
  grant_ends_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS blend (
  reference text PRIMARY KEY,
  lot_a     text NOT NULL,
  lot_b     text NOT NULL,
  result    text NOT NULL,
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS queued_work (
  reference text PRIMARY KEY,
  kind      text NOT NULL,
  subject   text NOT NULL,
  state     text NOT NULL DEFAULT 'queued',
  queued_at timestamptz NOT NULL DEFAULT now()
);

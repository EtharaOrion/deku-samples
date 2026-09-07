-- Ravel schema. Migration 001.
-- Rule: a migration never changes the meaning of a historical row. Where a
-- field's meaning must change a new field is added and the old one keeps its
-- original meaning.

create table if not exists schema_migrations (
  version    text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists site (
  reference           text primary key,
  name                text not null,
  confidence          text not null check (confidence in ('commissioned','under_construction','consented','planned')),
  nameplate_kg        bigint not null,
  contracted_kg       bigint not null,
  certification_state text not null,
  capacity_basis      text not null,
  last_revised        date not null
);

create table if not exists site_certification (
  reference       text primary key,
  site            text not null references site(reference),
  state           text not null check (state in ('certified','suspended','not_certified')),
  grade           text,
  effective_from  date not null,
  effective_to    date,
  scheme          text,
  reason          text,
  recorded_at     timestamptz not null default now(),
  recorded_by     text
);

create table if not exists party_version (
  id             bigserial primary key,
  reference      text not null,
  party_kind     text not null,
  name           text not null,
  effective_from date not null,
  superseded_by  bigint,
  recorded_at    timestamptz not null default now()
);
create index if not exists party_version_ref on party_version(reference, effective_from);

create table if not exists collector (
  reference           text primary key,
  name                text not null,
  country             text not null,
  registration        text not null,
  registration_expiry date not null,
  collection_site_types jsonb not null default '[]',
  declared_streams    jsonb not null default '[]',
  scheme_status       text not null default 'in_scheme'
);

create table if not exists approval_period (
  reference          text primary key,
  collector          text not null references collector(reference),
  state              text not null check (state in ('approved','conditional','suspended','lapsed')),
  valid_from         date not null,
  valid_to           date not null,
  condition          text,
  condition_closes_on date,
  recorded_at        timestamptz not null default now(),
  recorded_by        text
);
create index if not exists approval_period_col on approval_period(collector, valid_from);

create table if not exists finding (
  reference   text primary key,
  collector   text references collector(reference),
  batch       text,
  kind        text not null,
  detail      text not null,
  raised_on   date not null,
  due_on      date,
  state       text not null default 'open',
  departure_bp integer
);

create table if not exists weighing_device (
  reference     text primary key,
  site          text not null references site(reference),
  calibrated_on date not null
);

create table if not exists batch (
  reference          text primary key,
  collector          text not null references collector(reference),
  collector_name     text not null,
  site               text not null references site(reference),
  grade              text not null default 'N6',
  category           text not null check (category in ('post_consumer','pre_consumer')),
  gross_g            bigint not null,
  tare_g             bigint not null,
  net_g              bigint not null,
  moisture_bp        integer not null,
  moisture_method    text not null,
  device             text references weighing_device(reference),
  received_on        date not null,
  composition        jsonb not null default '{}',
  contamination      jsonb not null default '{}',
  accepted_g         bigint,
  rejected_g         bigint not null default 0,
  rejected_reason    text,
  rejected_destination text,
  claimable_from     date,
  accepted           boolean not null default true,
  closed             boolean not null default false,
  event_at           timestamptz not null,
  recorded_at        timestamptz not null default now(),
  effective_on       date not null,
  recorded_by        text not null
);

create table if not exists weighing (
  reference   text primary key,
  batch       text not null references batch(reference),
  device      text references weighing_device(reference),
  gross_g     bigint not null,
  tare_g      bigint not null,
  net_g       bigint not null,
  calibration_state text not null,
  weighed_at  timestamptz not null
);

create table if not exists custody_link (
  id          bigserial primary key,
  batch       text not null references batch(reference),
  ordinal     integer not null,
  kind        text not null check (kind in ('collection_site','collector','transport','arrival','weighing','acceptance')),
  party       text,
  link_date   date,
  late        boolean not null default false,
  arrived_on  date,
  document    text
);
create index if not exists custody_batch on custody_link(batch);

create table if not exists recipe_version (
  reference    text primary key,
  recipe       text not null,
  version      integer not null,
  run_type     text not null,
  set_points   jsonb not null default '{}',
  tolerances   jsonb not null default '{}',
  reagents     jsonb not null default '[]',
  residence_minutes integer,
  released_by  text,
  released_on  date,
  superseded_by text
);

create table if not exists run (
  reference       text primary key,
  run_type        text not null check (run_type in ('dissolution','depolymerisation','purification','repolymerisation')),
  site            text not null references site(reference),
  equipment       text not null,
  recipe_version  text not null references recipe_version(reference),
  operator        text not null,
  started_at      timestamptz not null,
  closed_at       timestamptz,
  state           text not null default 'open' check (state in ('open','closed','queued')),
  actual_set_points jsonb not null default '{}',
  within_tolerance boolean,
  losses_g        bigint,
  event_at        timestamptz not null,
  recorded_at     timestamptz not null default now(),
  effective_on    date not null,
  recorded_by     text not null
);

create table if not exists consumption (
  reference    text primary key,
  run          text not null references run(reference),
  input_kind   text not null check (input_kind in ('batch','output')),
  input_ref    text not null,
  mass_g       bigint not null,
  event_at     timestamptz not null,
  recorded_at  timestamptz not null default now(),
  effective_on date not null,
  recorded_by  text not null
);
create index if not exists consumption_run on consumption(run);
create index if not exists consumption_input on consumption(input_ref);

create table if not exists output (
  reference    text primary key,
  run          text not null references run(reference),
  kind         text not null check (kind in ('intermediate','lot','byproduct')),
  mass_g       bigint not null,
  disposition  text,
  event_at     timestamptz not null,
  recorded_at  timestamptz not null default now(),
  effective_on date not null,
  recorded_by  text not null
);
create index if not exists output_run on output(run);

create table if not exists lot (
  reference       text primary key,
  grade           text not null,
  site            text not null references site(reference),
  mass_g          bigint not null,
  output_ref      text,
  disposition     text not null default 'pending' check (disposition in ('pending','released','quarantined','rejected')),
  disposition_by  text,
  disposition_at  timestamptz,
  claim_type      text not null check (claim_type in ('physically_segregated','controlled_blending','mass_balance')),
  specification_version integer not null default 3,
  specification   text not null default 'SPEC-N6',
  blended_from    jsonb,
  blended_sites   jsonb,
  produced_on     date not null,
  recorded_by     text
);

create table if not exists test_result (
  reference     text primary key,
  subject_kind  text not null check (subject_kind in ('lot','batch')),
  subject_ref   text not null,
  property      text not null,
  method        text not null,
  instrument    text,
  analyst       text not null,
  value         text not null,
  unit          text not null,
  uncertainty_bp integer,
  method_mismatch boolean not null default false,
  usable_for_release boolean not null default true,
  entered_by    text not null,
  event_at      timestamptz not null,
  recorded_at   timestamptz not null default now(),
  effective_on  date not null
);
create index if not exists test_subject on test_result(subject_ref);

create table if not exists deviation (
  reference    text primary key,
  state        text not null default 'open' check (state in ('open','closed')),
  runs         jsonb not null default '[]',
  lots         jsonb not null default '[]',
  detail       text not null,
  outcome      text check (outcome in ('root_cause_found','cause_not_established')),
  raised_by    text not null,
  raised_at    timestamptz not null,
  closed_by    text,
  closed_at    timestamptz,
  effective_on date not null
);

create table if not exists override_record (
  reference     text primary key,
  separation    text not null,
  reason        text not null,
  lot           text not null,
  authorised_by text not null,
  recorded_by   text not null,
  reviewed      boolean not null default false,
  reviewed_by   text,
  reviewed_at   timestamptz,
  event_at      timestamptz not null,
  recorded_at   timestamptz not null default now(),
  effective_on  date not null
);

create table if not exists conversion_factor (
  reference     text primary key,
  site          text not null references site(reference),
  version       integer not null,
  factor_bp     integer not null,
  derived_from  date,
  derived_to    date,
  derived_in_g  bigint not null default 0,
  derived_out_g bigint not null default 0,
  provisional   boolean not null default false,
  published_by  text,
  published_on  date not null,
  superseded_by text
);

create table if not exists balance_period (
  id                 text primary key,
  site               text not null references site(reference),
  grade              text not null,
  period_from        date not null,
  period_to          date not null,
  state              text not null default 'open' check (state in ('open','closed')),
  carry_over_limit_bp integer not null default 2000,
  allocation_basis   text not null default 'mass',
  closed_on          date,
  closed_by          text,
  cut_off            date,
  metered_kwh        bigint not null default 0,
  carried_forward    jsonb,
  expired            jsonb
);

-- credit_movement is append-only. A balance is the sum of its movements.
create table if not exists credit_movement (
  reference     text primary key,
  seq           bigserial,
  period        text not null references balance_period(id),
  category      text not null check (category in ('post_consumer','pre_consumer')),
  direction     text not null check (direction in ('in','out','carry_in','carry_out','expiry','transfer_in','transfer_out')),
  mass_g        bigint not null,
  source_kind   text not null,
  source_ref    text,
  lot           text,
  origin_site   text,
  fresh_credit  boolean not null default true,
  movement      text,
  derivation    jsonb not null default '{}',
  event_at      timestamptz not null,
  recorded_at   timestamptz not null default now(),
  effective_on  date not null,
  recorded_by   text
);
create index if not exists credit_period on credit_movement(period, category);

create table if not exists transfer (
  reference    text primary key,
  from_period  text not null references balance_period(id),
  to_period    text not null references balance_period(id),
  category     text not null,
  mass_g       bigint not null,
  moved_on     date not null,
  recorded_by  text not null,
  recorded_at  timestamptz not null default now()
);

create table if not exists restatement (
  reference     text primary key,
  period        text references balance_period(id),
  reason        text not null,
  state         text not null default 'open',
  opened_by     text not null,
  opened_at     timestamptz not null default now(),
  certificates  jsonb not null default '[]',
  content_movements jsonb,
  trigger_kind  text
);

create table if not exists resolution (
  reference    text primary key,
  restatement  text not null references restatement(reference),
  certificate  text not null,
  outcome      text not null check (outcome in ('reissued','withdrawn','unaffected')),
  reason       text not null,
  recorded_by  text not null,
  recorded_at  timestamptz not null default now(),
  unique (restatement, certificate)
);

create table if not exists carbon_method (
  id              text primary key,
  standard        text not null,
  functional_unit text not null,
  name            text not null
);

create table if not exists carbon_method_version (
  id                 text not null references carbon_method(id),
  version            integer not null,
  boundary           text not null,
  allocation_basis   text not null,
  reviewer           text not null,
  published_on       date not null,
  published_by       text,
  data_quality_rules jsonb not null default '{}',
  emission_factors   jsonb not null default '[]',
  primary_threshold_bp integer not null default 5000,
  superseded         boolean not null default false,
  state              text not null default 'published',
  primary key (id, version)
);

create table if not exists carbon_figure (
  id               text primary key,
  lot              text not null,
  version          integer not null default 1,
  method_id        text not null,
  method_version   integer not null,
  boundary         text not null,
  value_mg_per_kg  bigint not null,
  uncertainty_bp   integer not null,
  primary_share_bp integer not null,
  comparator       jsonb not null,
  breakdown        jsonb not null,
  energy_location_mg_per_kg bigint not null,
  energy_market_mg_per_kg   bigint not null,
  metered_kwh      bigint not null default 0,
  input_versions   jsonb not null default '{}',
  cache_valid      boolean not null default true,
  superseded_by    text,
  computed_at      timestamptz not null default now(),
  computed_by      text,
  reason           text,
  reproducible     boolean not null default true,
  unreproducible_reason text
);
create index if not exists carbon_lot on carbon_figure(lot);

create table if not exists energy_instrument (
  reference    text primary key,
  quantity_kwh bigint not null,
  vintage      integer not null,
  region       text not null,
  state        text not null check (state in ('retired','held')),
  applied_to   text references balance_period(id),
  applied_at   timestamptz
);

create table if not exists specification (
  grade        text not null,
  version      integer not null,
  issued_on    date not null,
  rows_json    jsonb not null default '[]',
  virgin_reference jsonb not null default '{}',
  superseded   boolean not null default false,
  primary key (grade, version)
);

create table if not exists specification_issue (
  reference   text primary key,
  grade       text not null,
  version     integer not null,
  customer    text not null,
  issued_on   date not null,
  recorded_by text not null
);

create table if not exists customer (
  reference   text primary key,
  name        text not null,
  contact     text not null,
  language    text not null default 'en',
  holds_specification_version integer,
  holds_specification text,
  application text not null,
  industry    text not null
);

create table if not exists conformance (
  reference    text primary key,
  customer     text not null references customer(reference),
  application  text not null,
  spec_grade   text not null,
  spec_version integer not null,
  trials       jsonb not null default '[]',
  outcome      text not null,
  dated        date
);

create table if not exists change_notice (
  reference       text primary key,
  title           text not null,
  detail          text not null,
  parameter       text,
  qualification_relevant boolean not null default false,
  specifications_affected jsonb not null default '[]',
  customers_affected      jsonb not null default '[]',
  qualifications_affected jsonb not null default '[]',
  notice_period_days integer not null default 90,
  state           text not null default 'proposed',
  raised_by       text not null,
  raised_at       timestamptz not null default now(),
  released_at     timestamptz,
  blocking        jsonb not null default '[]'
);

create table if not exists change_notice_ack (
  reference     text primary key,
  change_notice text not null references change_notice(reference),
  customer      text not null,
  kind          text not null check (kind in ('notified','waived','acknowledged')),
  recorded_by   text not null,
  recorded_at   timestamptz not null default now()
);

create table if not exists contract (
  id            text primary key,
  recipient     text not null,
  site          text not null references site(reference),
  period        text not null,
  committed_kg  bigint not null,
  floor_bp      integer not null,
  delivered_kg  bigint not null default 0,
  shortfall_consequence text not null,
  unreachable_on date,
  unreachable_allocation text
);

create table if not exists contract_allocation (
  reference     text primary key,
  contract      text not null references contract(id),
  lot           text not null,
  mass_g        bigint not null,
  content_bp    integer not null,
  decided_by    text,
  favoured_over jsonb not null default '[]',
  recorded_at   timestamptz not null default now()
);

create table if not exists certificate (
  number          text not null,
  version         integer not null default 1,
  site            text not null references site(reference),
  lots            jsonb not null,
  grade           text not null,
  specification   text not null default 'SPEC-N6',
  specification_version integer not null,
  claim_type      text not null,
  content_bp      integer not null,
  category_split  jsonb not null,
  period          text,
  carbon          jsonb not null,
  primary_share_bp integer not null,
  scheme          text not null,
  registration    text not null,
  test_results    jsonb not null default '[]',
  permitted_statement  text not null,
  prohibited_statement text not null,
  signer          text not null,
  signer_name     text not null,
  signed_at       timestamptz not null,
  signed_on       date not null,
  verification_url text not null,
  state           text not null default 'issued' check (state in ('issued','withdrawn','superseded')),
  provisional_factor boolean not null default false,
  recipient       text not null,
  recipient_name  text not null,
  recipient_language text not null default 'en',
  conditions_at_signing jsonb not null,
  input_versions  jsonb not null default '{}',
  document        text not null,
  withdrawal_reason text,
  withdrawn_by    text,
  withdrawn_on    date,
  derived_from    text,
  primary key (number, version)
);
create index if not exists cert_number on certificate(number);

create table if not exists cert_sequence (
  site   text primary key,
  last_n integer not null default 0
);

create table if not exists inbound_record (
  reference        text primary key,
  source           text not null check (source in ('weighbridge','control_system','laboratory','customer_reporting')),
  received_at      timestamptz not null,
  payload          jsonb not null,
  payload_verbatim text not null,
  recorded_at      timestamptz not null default now()
);

create table if not exists enquiry (
  reference     text primary key,
  type          text not null check (type in ('waste_supply','polymer_purchase','partnership','press')),
  name          text not null,
  email         text not null,
  organisation  text,
  message       text not null,
  destination   text not null,
  response_days integer not null,
  deadline      date,
  opened_record text,
  recorded_at   timestamptz not null default now()
);

create table if not exists position_row (
  reference     text primary key,
  title         text not null,
  location      text not null,
  department    text not null,
  contract_type text not null,
  closes_on     date not null
);

create table if not exists news_item (
  reference text primary key,
  title     text not null,
  tag       text not null check (tag in ('funding','partnership','technical','recognition')),
  outlet    text not null,
  dated     date not null,
  link      text not null,
  language  text not null,
  coverage  jsonb not null default '[]'
);

create table if not exists statistic (
  key       text primary key,
  value     text not null,
  source    text not null,
  year      integer not null,
  geography text not null
);

create table if not exists claim_substantiation (
  reference       text primary key,
  claim           text not null,
  route           text not null,
  first_published date not null,
  evidence        text not null,
  evidence_expires date,
  method_version  text not null,
  approver        text not null,
  review_date     date not null,
  state           text not null default 'published'
);

create table if not exists record_entry (
  seq          bigserial primary key,
  reference    text unique,
  act          text not null,
  person       text,
  person_id    text,
  moment       timestamptz not null default now(),
  site         text,
  object_kind  text,
  object_ref   text,
  outcome      text not null default 'success',
  content      jsonb,
  content_deleted boolean not null default false,
  deleted_on   date,
  digest       text not null,
  prev_digest  text not null,
  anchor       text
);

create table if not exists person_directory (
  person_id text primary key,
  email     text not null,
  name      text not null,
  retention_months integer not null default 120
);

create table if not exists legal_hold (
  reference   text primary key,
  seq         bigint not null,
  placed_by   text not null,
  placed_at   timestamptz not null default now(),
  lifted_by   text,
  lifted_at   timestamptz,
  active      boolean not null default true
);

create table if not exists export_record (
  reference   text primary key,
  scope       jsonb not null,
  requested_by text not null,
  requested_at timestamptz not null default now(),
  entry_count integer not null default 0,
  payload     jsonb not null
);

create table if not exists idempotency (
  key          text not null,
  route        text not null,
  body_hash    text not null,
  status       integer not null,
  response     jsonb not null,
  created_at   timestamptz not null default now(),
  primary key (key, route)
);

create table if not exists access_grant (
  reference  text primary key,
  email      text not null,
  role       text not null,
  sites      jsonb not null,
  granted_on date not null,
  ends_on    date not null
);

create table if not exists annotation (
  reference   text primary key,
  object_kind text not null,
  object_ref  text not null,
  note        text not null,
  author      text not null,
  recorded_at timestamptz not null default now()
);

create table if not exists queued_work (
  reference   text primary key,
  kind        text not null,
  payload     jsonb not null,
  state       text not null default 'queued',
  queued_at   timestamptz not null default now()
);

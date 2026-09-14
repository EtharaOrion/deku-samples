// The schema. A migration that changes the meaning of a historical row is not
// permitted; this file is version 1 and any later change adds a field rather
// than rewriting one.
export const SCHEMA_VERSION = "001";

export const DDL = `
create table if not exists sites(
  reference text primary key,
  name text not null,
  confidence text not null check (confidence in ('commissioned','under_construction','consented','planned')),
  nameplate_kg bigint not null,
  contracted_kg bigint not null,
  capacity_basis text not null,
  certification_state text not null,
  last_revised date not null
);

create table if not exists parties(
  reference text primary key,
  kind text not null,
  country text,
  registration text,
  registration_expiry date,
  contact_email text,
  application text,
  industry text,
  collection_site_types jsonb default '[]',
  declared_streams jsonb default '[]',
  scheme_status text,
  current_name text
);

create table if not exists party_versions(
  id bigserial primary key,
  party text not null,
  name text not null,
  effective_from date not null,
  created_at timestamptz default now()
);

create table if not exists approval_periods(
  id bigserial primary key,
  collector text not null,
  state text not null check (state in ('approved','conditional','suspended','lapsed')),
  valid_from date not null,
  valid_to date not null,
  condition text,
  condition_closes_on date,
  created_by text,
  created_at timestamptz default now()
);

create table if not exists findings(
  id bigserial primary key,
  collector text,
  approval_period bigint,
  raised_on date not null,
  basis text,
  departure_bp integer,
  detail text,
  state text not null default 'open',
  review_date date
);

create table if not exists devices(
  reference text primary key,
  site text not null,
  calibrated_on date not null
);

create table if not exists batches(
  reference text primary key,
  collector text not null,
  site text not null,
  grade text not null,
  category text not null,
  gross_g bigint not null,
  tare_g bigint not null,
  net_g bigint not null,
  moisture_bp integer not null,
  moisture_method text,
  device text,
  received_on date not null,
  composition jsonb default '[]',
  contamination jsonb default '{}',
  custody jsonb default '[]',
  accepted_g bigint,
  rejected_g bigint default 0,
  rejected_destination text,
  status text not null default 'accepted',
  created_at timestamptz default now(),
  recorded_at timestamptz default now(),
  effective_on date not null,
  claimable_from date,
  collector_name_at_receipt text
);

create table if not exists runs(
  reference text primary key,
  run_type text not null check (run_type in ('dissolution','depolymerisation','purification','repolymerisation')),
  site text not null,
  equipment text,
  recipe_version text not null,
  operator text not null,
  started_at timestamptz not null,
  closed_at timestamptz,
  losses_g bigint,
  actual_set_points jsonb default '{}',
  within_tolerance boolean default true,
  annotation text,
  queued_close boolean default false,
  close_attempts integer default 0
);

create table if not exists consumptions(
  id bigserial primary key,
  run text not null,
  input_type text not null,
  input_reference text not null,
  mass_g bigint not null,
  credit_g bigint default 0,
  credit_category text,
  event_at timestamptz not null,
  recorded_at timestamptz default now(),
  effective_on date not null,
  period bigint
);

create table if not exists outputs(
  reference text primary key,
  run text not null,
  kind text not null check (kind in ('intermediate','lot','byproduct')),
  mass_g bigint not null,
  disposition text,
  lot text,
  created_at timestamptz default now()
);

create table if not exists lots(
  reference text primary key,
  grade text not null,
  site text not null,
  mass_g bigint not null,
  disposition text not null default 'pending',
  claim_type text not null default 'mass_balance',
  produced_at timestamptz,
  provisional_factor boolean default false,
  period bigint,
  content_bp integer default 0,
  credit_attached_g bigint default 0,
  sites jsonb,
  blended_from jsonb
);

create table if not exists test_results(
  reference text primary key,
  subject_type text not null,
  subject text not null,
  property text not null,
  method text not null,
  instrument text,
  analyst text not null,
  value text not null,
  unit text not null,
  uncertainty_bp integer not null default 0,
  method_mismatch boolean default false,
  usable_for_release boolean default true,
  created_at timestamptz default now()
);

create table if not exists deviations(
  reference text primary key,
  raised_by text not null,
  description text not null,
  affects_runs jsonb default '[]',
  affects_lots jsonb default '[]',
  state text not null default 'open',
  outcome text,
  raised_at timestamptz default now(),
  closed_at timestamptz
);

create table if not exists overrides(
  reference text primary key,
  separation text not null,
  reason text not null,
  lot text not null,
  authorised_by text not null,
  authorised_on date not null,
  reviewed boolean not null default false,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists balance_periods(
  id bigserial primary key,
  label text not null,
  site text not null,
  grade text not null,
  period_from date not null,
  period_to date not null,
  state text not null default 'open',
  carry_over_limit_bp integer not null default 2000,
  allocation_basis text not null default 'mass',
  closed_on date,
  closed_by text,
  cut_off date,
  carried_forward jsonb default '{}',
  expired jsonb default '{}'
);

create table if not exists credit_movements(
  id bigserial primary key,
  period bigint not null,
  kind text not null,
  category text not null,
  mass_g bigint not null,
  reference text,
  origin_site text,
  movement text,
  fresh_credit boolean default true,
  created_at timestamptz default now(),
  effective_on date not null,
  event_at timestamptz not null default now()
);

create table if not exists conversion_factors(
  reference text primary key,
  site text not null,
  factor_bp integer not null,
  derived_from date,
  derived_to date,
  derived_in_g bigint not null default 0,
  derived_out_g bigint not null default 0,
  provisional boolean not null default false,
  published_by text,
  published_on date not null
);

create table if not exists carbon_methods(
  reference text primary key,
  current_version integer not null default 1
);

create table if not exists carbon_method_versions(
  id bigserial primary key,
  method text not null,
  version integer not null,
  standard text not null,
  functional_unit text not null,
  boundary text not null,
  allocation_basis text not null,
  reviewer text not null,
  published_on date not null,
  primary_threshold_bp integer not null default 5000,
  data_quality jsonb default '[]',
  emission_factors jsonb default '[]',
  superseded boolean default false,
  published_by text,
  unique(method, version)
);

create table if not exists carbon_figures(
  id bigserial primary key,
  lot text not null,
  version integer not null default 1,
  value_mg_per_kg bigint not null,
  boundary text not null,
  method_version integer not null,
  uncertainty_bp integer not null,
  primary_share_bp integer not null,
  comparator jsonb,
  breakdown jsonb default '[]',
  energy_location_mg_per_kg bigint,
  energy_market_mg_per_kg bigint,
  metered_kwh bigint,
  retired_kwh bigint,
  unmatched_kwh bigint,
  input_versions jsonb default '{}',
  cache_valid boolean default true,
  computed_by text,
  computed_at timestamptz default now(),
  reason text,
  supersedes bigint,
  cache_locked timestamptz
);

create table if not exists energy_instruments(
  reference text primary key,
  quantity_kwh bigint not null,
  vintage text not null,
  region text not null,
  state text not null default 'held'
);

create table if not exists energy_retirements(
  id bigserial primary key,
  instrument text not null,
  period bigint not null,
  applied_kwh bigint not null,
  created_at timestamptz default now()
);

create table if not exists specifications(
  reference text not null,
  version integer not null,
  grade text not null,
  issued_on date,
  superseded boolean default false,
  virgin_reference jsonb,
  rows jsonb default '[]',
  primary key (reference, version)
);

create table if not exists specification_issues(
  id bigserial primary key,
  specification text not null,
  version integer not null,
  customer text not null,
  issued_on date not null
);

create table if not exists conformances(
  id bigserial primary key,
  customer text not null,
  application text,
  industry text,
  specification text not null,
  version integer not null,
  trials jsonb default '[]',
  outcome text
);

create table if not exists change_notices(
  reference text primary key,
  change text not null,
  reason text not null,
  raised_by text not null,
  specifications_affected jsonb default '[]',
  customers_affected jsonb default '[]',
  qualifications_affected jsonb default '[]',
  notice_period_days integer default 0,
  state text not null default 'proposed',
  created_at timestamptz default now(),
  released_at timestamptz
);

create table if not exists change_acknowledgements(
  id bigserial primary key,
  notice text not null,
  customer text not null,
  kind text not null check (kind in ('notified','waived','acknowledged')),
  recorded_at timestamptz default now()
);

create table if not exists contracts(
  id text primary key,
  recipient text not null,
  site text not null,
  period text not null,
  committed_kg bigint not null,
  floor_bp integer not null,
  delivered_kg bigint not null default 0,
  running_content_bp integer not null default 0,
  state text not null default 'on_track',
  unreachable_since date,
  unreachable_allocation text,
  shortfall_consequence text
);

create table if not exists allocations(
  id bigserial primary key,
  contract text not null,
  lot text not null,
  mass_g bigint not null,
  decided_by text,
  favoured_over jsonb default '[]',
  created_at timestamptz default now()
);

create table if not exists certificates(
  number text primary key,
  version integer not null default 1,
  site text not null,
  grade text not null,
  period bigint,
  lot text not null,
  lot_mass_g bigint not null,
  recipient text not null,
  recipient_name text not null,
  claim_type text not null,
  content_bp integer not null,
  category_split jsonb default '{}',
  specification_version integer,
  carbon_figure bigint,
  carbon jsonb,
  primary_share_bp integer,
  scheme text,
  registration text,
  test_results jsonb default '[]',
  permitted_statement text,
  prohibited_statement text,
  permitted_statement_lang text,
  prohibited_statement_lang text,
  signer text not null,
  signer_name text,
  signed_at timestamptz not null,
  verification_url text,
  state text not null default 'issued',
  withdrawn_reason text,
  withdrawn_by text,
  withdrawn_on timestamptz,
  notified_recipients jsonb default '[]',
  void_statements jsonb default '[]',
  derived_certificates jsonb default '[]',
  batch_traversal jsonb default '{}',
  conditions jsonb default '[]',
  provisional_factor boolean default false,
  derived_from text
);

create table if not exists certificate_counters(
  site text primary key,
  next_number integer not null default 1
);

create table if not exists restatements(
  reference text primary key,
  period bigint not null,
  reason text not null,
  opened_by text not null,
  opened_at timestamptz default now(),
  state text not null default 'open',
  certificates jsonb default '[]',
  content_movements jsonb default '[]',
  factor_reference text,
  factor_bp integer
);

create table if not exists resolutions(
  id bigserial primary key,
  restatement text not null,
  certificate text not null,
  outcome text not null check (outcome in ('reissued','withdrawn','unaffected')),
  reason text not null,
  recorded_by text not null,
  recorded_at timestamptz default now(),
  unique(restatement, certificate)
);

create table if not exists transfers(
  reference text primary key,
  from_period bigint not null,
  to_period bigint not null,
  mass_g bigint not null,
  category text not null,
  effective_on date not null,
  created_by text,
  created_at timestamptz default now()
);

create table if not exists site_certifications(
  id bigserial primary key,
  site text not null,
  state text not null check (state in ('certified','suspended','not_certified')),
  effective_from date not null,
  effective_to date not null,
  recorded_at timestamptz default now()
);

create table if not exists record_entries(
  seq bigserial primary key,
  act text not null,
  person text not null,
  site text,
  object_reference text,
  kind text not null default 'act',
  content jsonb not null default '{}',
  digest text,
  prev_digest text,
  deleted boolean default false,
  deleted_on date,
  created_at timestamptz default now(),
  effective_on date
);

create table if not exists record_holds(
  reference text primary key,
  seq bigint not null,
  placed_by text not null,
  placed_at timestamptz default now(),
  lifted_at timestamptz
);

create table if not exists annotations(
  id bigserial primary key,
  seq bigint not null,
  by_email text not null,
  note text not null,
  created_at timestamptz default now()
);

create table if not exists exports(
  reference text primary key,
  by_email text not null,
  scope jsonb not null,
  created_at timestamptz default now(),
  returned_rows integer,
  bundle jsonb
);

create table if not exists inbound_records(
  reference text primary key,
  source text not null check (source in ('weighbridge','control_system','laboratory','customer_reporting')),
  received_at timestamptz not null,
  payload_verbatim text not null,
  payload jsonb,
  created_at timestamptz default now()
);

create table if not exists enquiries(
  reference text primary key,
  type text not null check (type in ('waste_supply','polymer_purchase','partnership','press')),
  destination text not null,
  response_days integer not null,
  body jsonb,
  created_at timestamptz default now()
);

create table if not exists positions(
  id bigserial primary key,
  title text not null,
  location text not null,
  department text not null,
  contract_type text not null,
  closes_on date not null
);

create table if not exists news_items(
  id bigserial primary key,
  title text not null,
  tag text not null check (tag in ('funding','partnership','technical','recognition')),
  outlet text not null,
  published_on date not null,
  link text not null,
  language text not null
);

create table if not exists statistics(
  key text primary key,
  value text not null,
  source text not null,
  year integer not null,
  geography text not null
);

create table if not exists claim_substantiations(
  key text primary key,
  claim text not null,
  route text not null,
  first_published_on date not null,
  evidence jsonb default '[]',
  method_version text,
  approver text not null,
  review_date date not null,
  withdrawn boolean default false
);

create table if not exists sessions(
  token text primary key,
  email text not null,
  roles jsonb not null,
  sites jsonb not null,
  name text,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists idempotency(
  key text not null,
  route text not null,
  body_hash text not null,
  status integer,
  response jsonb,
  created_at timestamptz default now(),
  primary key (key, route)
);

create table if not exists rate_limits(
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket, window_start)
);

create table if not exists meta(
  key text primary key,
  value text
);

create index if not exists idx_cons_run on consumptions(run);
create index if not exists idx_cons_input on consumptions(input_reference);
create index if not exists idx_out_run on outputs(run);
create index if not exists idx_out_lot on outputs(lot);
create index if not exists idx_lots_site on lots(site);
create index if not exists idx_cert_lot on certificates(lot);
create index if not exists idx_cm_period on credit_movements(period);
`;

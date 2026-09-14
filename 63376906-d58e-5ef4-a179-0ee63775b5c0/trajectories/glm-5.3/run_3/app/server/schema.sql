create table if not exists site (
  reference text primary key, name text not null, confidence text not null,
  nameplate_kg integer not null, contracted_kg integer not null, capacity_basis text not null,
  certification_state text not null, last_revised date not null
);
create table if not exists account (
  email text primary key, name text not null, role text not null,
  keycloak_sub text, created_at timestamptz not null default now()
);
create table if not exists grant_ (
  id serial primary key, email text not null, site text not null, valid_from date not null default '2026-01-01',
  valid_to date not null, created_at timestamptz not null default now()
);
create table if not exists party (
  reference text primary key, kind text not null, email text
);
create table if not exists party_version (
  id serial primary key, party text not null, name text not null, effective_from date not null,
  superseded_by integer, created_at timestamptz not null default now()
);
create table if not exists collector (
  reference text primary key, party text not null, country text not null, registration text not null,
  registration_expiry date not null, collection_site_types jsonb not null default '[]',
  declared_streams jsonb not null default '[]', scheme_status text not null, created_at timestamptz not null default now()
);
create table if not exists approval_period (
  id serial primary key, collector text not null, state text not null, valid_from date not null, valid_to date not null,
  condition text, condition_closes_on date, recorded_at timestamptz not null default now()
);
create table if not exists finding (
  id serial primary key, collector text not null, batch text, kind text not null, detail text not null,
  departure_bp integer, raised_on date not null, review_by date, state text not null default 'open', recorded_at timestamptz not null default now()
);
create table if not exists device (
  reference text primary key, site text not null, calibrated_on date not null
);
create table if not exists batch (
  reference text primary key, collector text not null, site text not null, grade text not null default 'N6', booked_by text,
  category text not null, gross_g integer not null, tare_g integer not null, net_g integer not null,
  moisture_bp integer not null, moisture_method text, device text, received_on date not null,
  composition jsonb not null default '[]', contamination jsonb not null default '{}',
  custody jsonb not null default '[]', accepted boolean not null default true,
  accepted_g integer, rejected_g integer not null default 0, rejected_destination text,
  claimable_from date, status text not null default 'booked', created_at timestamptz not null default now()
);
create table if not exists recipe (
  reference text primary key, run_type text not null, version integer not null,
  set_points jsonb not null, tolerances jsonb not null, reagents jsonb not null,
  residence_minutes integer, released_by text not null, released_on date not null,
  superseded_by_version integer
);
create table if not exists run (
  reference text primary key, run_type text not null, site text not null, equipment text not null,
  recipe_version text not null, operator text not null, started_at timestamptz not null,
  closed_at timestamptz, losses_g integer, state text not null default 'open',
  actual jsonb, within_tolerance boolean, created_at timestamptz not null default now()
);
create table if not exists consumption (
  id serial primary key, run_ref text not null, input_kind text not null, input_ref text not null,
  mass_g integer not null, effective_on date not null, recorded_by text, recorded_at timestamptz not null default now()
);
create table if not exists output (
  reference text primary key, run_ref text not null, kind text not null, mass_g integer not null,
  disposition text, lot text, recorded_by text, recorded_at timestamptz not null default now()
);
create table if not exists lot (
  reference text primary key, site text not null, grade text not null, mass_g integer not null,
  disposition text not null default 'pending', disposition_by text, claim_type text not null, produced_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table if not exists test_result (
  id serial primary key, subject_kind text not null, subject_ref text not null, property text not null,
  method text not null, instrument text, analyst text not null, value integer not null, value_bp integer,
  unit text not null, uncertainty_bp integer not null, method_mismatch boolean not null default false,
  usable_for_release boolean not null default true, recorded_at timestamptz not null default now()
);
create table if not exists deviation (
  reference text primary key, state text not null default 'open', affects_runs text[] not null default '{}',
  affects_lots text[] not null default '{}', description text not null, outcome text,
  raised_on date not null, closed_on date, raised_by text not null, created_at timestamptz not null default now()
);
create table if not exists override (
  reference text primary key, separation text not null, reason text not null, lot text not null,
  authorised_by text not null, authorised_on date not null, reviewed boolean not null default false,
  reviewed_by text, reviewed_on date, created_at timestamptz not null default now()
);
create table if not exists balance_period (
  id text primary key, site text not null, grade text not null, period_from date not null, period_to date not null,
  state text not null default 'open', carry_over_limit_bp integer not null,
  closed_on date, cut_off date, allocation_basis text not null default 'mass',
  carried_forward_g jsonb, expired_g jsonb, created_at timestamptz not null default now()
);
create table if not exists credit_movement (
  id serial primary key, balance_period text not null, direction text not null, category text not null,
  mass_g integer not null, kind text not null, batch text, lot text, origin_site text, movement_ref text,
  event_at timestamptz not null, recorded_at timestamptz not null default now(), effective_on date not null
);
create table if not exists transfer (
  reference text primary key, from_period text not null, to_period text not null, mass_g integer not null,
  category text not null, moved_on date not null, created_at timestamptz not null default now()
);
create table if not exists conversion_factor (
  reference text primary key, site text not null, factor_bp integer not null, derived_from date,
  derived_to date, derived_in_g integer not null, derived_out_g integer not null, provisional boolean not null default false,
  published_by text not null, published_on date not null, created_at timestamptz not null default now()
);
create table if not exists allocation (
  reference text primary key, balance_period text not null, lot text not null, category text not null,
  mass_g integer not null, allocated_by text not null, decided_by text, favoured_over text[], state text not null default 'committed',
  recorded_at timestamptz not null default now(), effective_on date not null
);
create table if not exists carbon_method (
  id text not null, version integer not null, standard text not null, functional_unit text not null,
  boundary text not null, allocation_basis text not null, reviewer text not null, published_on date not null,
  data_quality jsonb not null, emission_factors jsonb not null, primary_share_threshold_bp integer not null,
  superseded_by integer, published_by text not null, created_at timestamptz not null default now(), primary key (id, version)
);
create table if not exists carbon_figure (
  id text primary key, lot text not null, version integer not null default 1, method_id text not null,
  method_version integer not null, value_mg_per_kg integer not null, uncertainty_bp integer not null,
  primary_share_bp integer not null, boundary text not null, comparator jsonb not null,
  breakdown jsonb not null, energy_location_mg_per_kg integer not null, energy_market_mg_per_kg integer not null,
  metered_kwh integer not null, retired_kwh integer not null, unmatched_kwh integer not null,
  cache_valid boolean not null default true, computed_against jsonb not null default '{}',
  recomputed_by text, recomputed_on date, recomputed_reason text, superseded_by text,
  created_at timestamptz not null default now()
);
create table if not exists energy_instrument (
  reference text primary key, quantity_kwh integer not null, vintage text not null, region text not null,
  state text not null, applied_period text, created_at timestamptz not null default now()
);
create table if not exists specification (
  grade text not null, version integer not null, rows jsonb not null, virgin_reference jsonb not null,
  issued_on date, superseded_by integer, created_at timestamptz not null default now(), primary key (grade, version)
);
create table if not exists customer (
  reference text primary key, party text not null, contact_email text not null, holds_spec text not null,
  holds_version integer not null, application text not null, industry text not null, language text not null default 'en',
  created_at timestamptz not null default now()
);
create table if not exists conformance (
  id serial primary key, customer text not null, application text not null, spec_grade text not null,
  spec_version integer not null, trials jsonb not null default '[]', outcome text, dates jsonb,
  created_at timestamptz not null default now()
);
create table if not exists change_notice (
  reference text primary key, change_kind text not null, description text not null, raised_by text not null,
  raised_on date not null, specifications_affected jsonb, customers_affected jsonb, qualifications_affected integer,
  notice_period_days integer, state text not null default 'proposed', released_on date, created_at timestamptz not null default now()
);
create table if not exists change_ack (
  id serial primary key, notice text not null, customer text not null, waived boolean not null default false,
  recorded_at timestamptz not null default now()
);
create table if not exists contract (
  id text primary key, recipient text not null, site text not null, period text not null,
  committed_kg integer not null, floor_bp integer not null, delivered_kg integer not null default 0,
  shortfall_consequence text not null, created_at timestamptz not null default now()
);
create table if not exists contract_allocation (
  reference text primary key, contract text not null, lot text not null, mass_g integer not null,
  decided_by text, favoured_over text[], recorded_at timestamptz not null default now()
);
create table if not exists certificate (
  number text primary key, version integer not null default 1, site text not null, grade text not null,
  lots jsonb not null, recipient text not null, recipient_name text not null, claim_type text not null,
  content_bp integer not null, category_split jsonb not null, period text not null, carbon_figure text,
  primary_share_bp integer, scheme text not null, registration text not null, specification_version integer not null,
  test_results jsonb not null, permitted_statement text not null, prohibited_statement text not null,
  signer text not null, signed_on date not null, signed_at timestamptz not null, verification_url text not null,
  state text not null default 'issued', withdrawal jsonb, conditions jsonb not null,
  provisional_factor boolean not null default false, derived_certificates text[] not null default '{}',
  superseded_version integer, input_versions jsonb not null default '{}', created_at timestamptz not null default now()
);
create table if not exists restatement (
  reference text primary key, balance_period text not null, reason text not null, opened_by text not null,
  opened_on date not null, state text not null default 'open', factor_revised text, old_factor_bp integer, new_factor_bp integer,
  content_movements jsonb, certificates jsonb, resolutions jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create table if not exists legal_hold (
  id serial primary key, reference text not null, record_seq integer not null, placed_on date not null,
  placed_by text not null, lifted_on date, created_at timestamptz not null default now()
);
create table if not exists record_entry (
  seq bigserial primary key, event_at timestamptz not null default now(), recorded_at timestamptz not null default now(),
  effective_on date not null default current_date, actor text not null default 'system', actor_name text,
  site text, object_ref text, kind text not null, summary text not null default '', digest text not null,
  prev_digest text not null, content jsonb not null default '{}', content_deleted_on date,
  legal_hold boolean not null default false
);
create table if not exists idempotency_key (
  key text not null, route text not null, body_hash text not null, status integer not null,
  response jsonb not null, created_at timestamptz not null default now(), primary key (key, route)
);
create table if not exists inbound_record (
  reference text primary key, source text not null, received_at timestamptz not null,
  payload_verbatim jsonb not null, recorded_at timestamptz not null default now()
);
create table if not exists enquiry (
  reference text primary key, kind text not null, name text not null, email text not null, company text,
  message text not null, destination text not null, response_days integer not null, deadline date,
  created_at timestamptz not null default now()
);
create table if not exists position (
  id serial primary key, title text not null, location text not null, department text not null,
  contract_type text not null, closes_on date not null, created_at timestamptz not null default now()
);
create table if not exists news_item (
  id serial primary key, title text not null, tag text not null, outlet text not null, published_on date not null,
  link text not null, language text not null, created_at timestamptz not null default now()
);
create table if not exists statistic (
  key text primary key, value text not null, source text not null, year text not null, geography text not null
);
create table if not exists claim_substantiation (
  id serial primary key, claim text not null, route text not null, first_published_on date not null,
  evidence jsonb not null, method_version text, approver text not null, review_on date not null,
  withdrawn_on date, created_at timestamptz not null default now()
);
create table if not exists certification_period (
  id serial primary key, site text not null, state text not null, effective_from date not null,
  effective_to date not null, recorded_on date not null default current_date, recorded_by text,
  resolutions jsonb
);
create table if not exists export_record (
  reference text primary key, actor text not null, scope jsonb not null, result_count integer not null,
  bundle jsonb not null, created_at timestamptz not null default now()
);
create table if not exists signoff_log (
  id serial primary key, number text not null, reauthenticated boolean not null, at timestamptz not null default now()
);
create table if not exists seed_marker (
  id integer primary key, seeded_at timestamptz not null default now()
);

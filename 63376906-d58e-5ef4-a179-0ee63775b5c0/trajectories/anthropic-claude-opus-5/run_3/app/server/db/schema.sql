-- Ravel schema.
--
-- Every mass column is an integer number of grams and every proportion column is
-- an integer number of basis points. No decimal type appears anywhere in this
-- file on purpose: a numeric column is an invitation to a rounded claim.
--
-- Migrations only ever add. A migration that changes the meaning of a historical
-- row is not permitted, so where a field's meaning must change a new field is
-- added beside it and the old one keeps the meaning it was written under. The
-- schema_migration table below records which steps have run.

CREATE TABLE IF NOT EXISTS schema_migration (
  name        text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- sites

CREATE TABLE IF NOT EXISTS site (
  reference           text PRIMARY KEY,
  name                text NOT NULL,
  confidence          text NOT NULL CHECK (confidence IN ('commissioned','under_construction','consented','planned')),
  nameplate_kg        bigint NOT NULL,
  contracted_kg       bigint NOT NULL,
  certification_state text NOT NULL,
  capacity_basis      text NOT NULL,
  last_revised        date NOT NULL
);

-- A site's certification is a dated period exactly as a collector's approval is.
CREATE TABLE IF NOT EXISTS site_certification (
  reference      text PRIMARY KEY,
  site           text NOT NULL REFERENCES site(reference),
  grade          text,
  state          text NOT NULL CHECK (state IN ('certified','suspended','lifted','not_certified')),
  scheme         text,
  effective_from date NOT NULL,
  effective_to   date,
  reason         text,
  recorded_at    timestamptz NOT NULL DEFAULT now(),
  recorded_by    text
);

-- ------------------------------------------------------- parties and names

-- A party is a collector, a converter, a scheme or the producer itself. The
-- name it held on the date of an act is a version, never an overwrite.
CREATE TABLE IF NOT EXISTS party_version (
  id             bigserial PRIMARY KEY,
  reference      text NOT NULL,
  kind           text NOT NULL,
  name           text NOT NULL,
  identifier     text,
  effective_from date NOT NULL,
  superseded_on  date,
  recorded_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS party_version_ref ON party_version(reference, effective_from);

CREATE TABLE IF NOT EXISTS collector (
  reference           text PRIMARY KEY,
  country             text NOT NULL,
  registration        text NOT NULL,
  registration_expiry date NOT NULL,
  collection_site_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  declared_streams    jsonb NOT NULL DEFAULT '[]'::jsonb,
  scheme_status       text NOT NULL DEFAULT 'unknown'
);

CREATE TABLE IF NOT EXISTS approval_period (
  reference          text PRIMARY KEY,
  collector          text NOT NULL REFERENCES collector(reference),
  state              text NOT NULL CHECK (state IN ('approved','conditional','suspended','lapsed')),
  valid_from         date NOT NULL,
  valid_to           date NOT NULL,
  condition          text,
  condition_closes_on date,
  recorded_at        timestamptz NOT NULL DEFAULT now(),
  recorded_by        text
);
CREATE INDEX IF NOT EXISTS approval_collector ON approval_period(collector, valid_from);

CREATE TABLE IF NOT EXISTS finding (
  reference    text PRIMARY KEY,
  collector    text REFERENCES collector(reference),
  batch        text,
  kind         text NOT NULL,
  detail       text NOT NULL,
  departure_bp integer,
  raised_on    date NOT NULL,
  due_on       date,
  state        text NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed'))
);

-- --------------------------------------------------------------- feedstock

CREATE TABLE IF NOT EXISTS weighing_device (
  reference     text PRIMARY KEY,
  site          text NOT NULL REFERENCES site(reference),
  calibrated_on date NOT NULL
);

CREATE TABLE IF NOT EXISTS batch (
  reference      text PRIMARY KEY,
  collector      text NOT NULL REFERENCES collector(reference),
  site           text NOT NULL REFERENCES site(reference),
  grade          text NOT NULL DEFAULT 'N6',
  category       text NOT NULL CHECK (category IN ('post_consumer','pre_consumer')),
  gross_g        bigint NOT NULL,
  tare_g         bigint NOT NULL,
  net_g          bigint NOT NULL,
  moisture_bp    integer NOT NULL,
  moisture_method text NOT NULL,
  device         text NOT NULL REFERENCES weighing_device(reference),
  received_on    date NOT NULL,
  composition    jsonb NOT NULL DEFAULT '{}'::jsonb,
  contamination  jsonb NOT NULL DEFAULT '{}'::jsonb,
  accepted_g     bigint,
  rejected_g     bigint NOT NULL DEFAULT 0,
  rejected_reason text,
  rejected_destination text,
  claimable_from date,
  accepted       boolean NOT NULL DEFAULT true,
  event_at       timestamptz NOT NULL,
  recorded_at    timestamptz NOT NULL DEFAULT now(),
  effective_on   date NOT NULL,
  recorded_by    text NOT NULL
);

-- A weighing lands with its batch or neither lands.
CREATE TABLE IF NOT EXISTS weighing (
  reference     text PRIMARY KEY,
  batch         text NOT NULL REFERENCES batch(reference),
  device        text NOT NULL REFERENCES weighing_device(reference),
  gross_g       bigint NOT NULL,
  tare_g        bigint NOT NULL,
  net_g         bigint NOT NULL,
  calibrated_on date NOT NULL,
  calibration_state text NOT NULL,
  weighed_at    timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS custody_link (
  id          bigserial PRIMARY KEY,
  batch       text NOT NULL REFERENCES batch(reference),
  kind        text NOT NULL CHECK (kind IN ('collection_site','collector','transport','arrival','weighing','acceptance')),
  party       text NOT NULL,
  link_date   date NOT NULL,
  arrived_on  date,          -- when late evidence reached the plant, if it was late
  ordinal     integer NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS custody_batch ON custody_link(batch);

-- -------------------------------------------------- runs, consumptions, outputs

CREATE TABLE IF NOT EXISTS recipe_version (
  reference      text PRIMARY KEY,
  run_type       text NOT NULL,
  version        integer NOT NULL,
  set_points     jsonb NOT NULL DEFAULT '{}'::jsonb,
  tolerances     jsonb NOT NULL DEFAULT '{}'::jsonb,
  reagents       jsonb NOT NULL DEFAULT '[]'::jsonb,
  residence_minutes integer,
  released_by    text NOT NULL,
  released_on    date NOT NULL,
  superseded_by  text
);

CREATE TABLE IF NOT EXISTS run (
  reference      text PRIMARY KEY,
  run_type       text NOT NULL CHECK (run_type IN ('dissolution','depolymerisation','purification','repolymerisation')),
  site           text NOT NULL REFERENCES site(reference),
  equipment      text NOT NULL,
  recipe_version text NOT NULL REFERENCES recipe_version(reference),
  operator       text NOT NULL,
  started_at     timestamptz NOT NULL,
  closed_at      timestamptz,
  state          text NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed','queued')),
  actual_set_points jsonb NOT NULL DEFAULT '{}'::jsonb,
  losses_g       bigint,
  close_queued   boolean NOT NULL DEFAULT false,
  event_at       timestamptz NOT NULL,
  recorded_at    timestamptz NOT NULL DEFAULT now(),
  effective_on   date NOT NULL,
  recorded_by    text NOT NULL
);

-- A consumption is a row of its own carrying a mass, which is what lets one
-- batch reach many lots and one lot descend from many batches across four hops.
CREATE TABLE IF NOT EXISTS consumption (
  reference    text PRIMARY KEY,
  run          text NOT NULL REFERENCES run(reference),
  input_kind   text NOT NULL CHECK (input_kind IN ('batch','output')),
  input_ref    text NOT NULL,
  mass_g       bigint NOT NULL CHECK (mass_g >= 0),
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
  kind         text NOT NULL CHECK (kind IN ('intermediate','lot','byproduct')),
  mass_g       bigint NOT NULL CHECK (mass_g >= 0),
  disposition  text CHECK (disposition IN ('sold','disposed')),
  allocation_basis text,
  event_at     timestamptz NOT NULL,
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  effective_on date NOT NULL,
  recorded_by  text NOT NULL
);
CREATE INDEX IF NOT EXISTS output_run ON output(run);

CREATE TABLE IF NOT EXISTS lot (
  reference       text PRIMARY KEY,
  output_ref      text REFERENCES output(reference),
  grade           text NOT NULL,
  site            text NOT NULL REFERENCES site(reference),
  mass_g          bigint NOT NULL,
  disposition     text NOT NULL DEFAULT 'pending' CHECK (disposition IN ('pending','released','quarantined','rejected')),
  claim_type      text NOT NULL CHECK (claim_type IN ('physically_segregated','controlled_blending','mass_balance')),
  specification_version integer NOT NULL DEFAULT 3,
  specification   text NOT NULL DEFAULT 'SPEC-N6',
  blended_from    jsonb,
  blended_sites   jsonb,
  balance_period  text,
  event_at        timestamptz NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  effective_on    date NOT NULL,
  recorded_by     text NOT NULL
);

CREATE TABLE IF NOT EXISTS disposition_act (
  id           bigserial PRIMARY KEY,
  lot          text NOT NULL REFERENCES lot(reference),
  disposition  text NOT NULL,
  decided_by   text NOT NULL,
  decided_at   timestamptz NOT NULL DEFAULT now(),
  reason       text
);

-- ----------------------------------------------- tests, deviations, overrides

CREATE TABLE IF NOT EXISTS test_result (
  reference      text PRIMARY KEY,
  subject_kind   text NOT NULL CHECK (subject_kind IN ('lot','batch')),
  subject_ref    text NOT NULL,
  property       text NOT NULL,
  method         text NOT NULL,
  instrument     text,
  analyst        text NOT NULL,
  value          text NOT NULL,
  unit           text NOT NULL,
  uncertainty_bp integer,
  method_mismatch boolean NOT NULL DEFAULT false,
  usable_for_release boolean NOT NULL DEFAULT true,
  entered_by     text NOT NULL,
  event_at       timestamptz NOT NULL,
  recorded_at    timestamptz NOT NULL DEFAULT now(),
  effective_on   date NOT NULL
);
CREATE INDEX IF NOT EXISTS test_subject ON test_result(subject_ref);

CREATE TABLE IF NOT EXISTS deviation (
  reference    text PRIMARY KEY,
  state        text NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed')),
  title        text NOT NULL,
  detail       text,
  runs         jsonb NOT NULL DEFAULT '[]'::jsonb,
  lots         jsonb NOT NULL DEFAULT '[]'::jsonb,
  outcome      text CHECK (outcome IN ('root_cause_found','cause_not_established')),
  raised_by    text NOT NULL,
  closed_by    text,
  event_at     timestamptz NOT NULL,
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  effective_on date NOT NULL,
  closed_at    timestamptz
);

CREATE TABLE IF NOT EXISTS separation_override (
  reference     text PRIMARY KEY,
  separation    text NOT NULL,
  reason        text NOT NULL,
  lot           text NOT NULL,
  authorised_by text NOT NULL,
  reviewed      boolean NOT NULL DEFAULT false,
  reviewed_by   text,
  reviewed_at   timestamptz,
  recorded_by   text NOT NULL,
  event_at      timestamptz NOT NULL,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  effective_on  date NOT NULL
);

-- ------------------------------------------------------------- the ledger

CREATE TABLE IF NOT EXISTS conversion_factor (
  reference     text PRIMARY KEY,
  site          text NOT NULL REFERENCES site(reference),
  version       integer NOT NULL,
  factor_bp     integer NOT NULL,
  derived_from  date,
  derived_to    date,
  derived_in_g  bigint NOT NULL,
  derived_out_g bigint NOT NULL,
  provisional   boolean NOT NULL DEFAULT false,
  superseded_by text,
  published_by  text NOT NULL,
  published_on  date NOT NULL,
  recorded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS balance_period (
  id                  text PRIMARY KEY,
  site                text NOT NULL REFERENCES site(reference),
  grade               text NOT NULL,
  period_from         date NOT NULL,
  period_to           date NOT NULL,
  state               text NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed')),
  carry_over_limit_bp integer NOT NULL DEFAULT 2000,
  allocation_basis    text NOT NULL DEFAULT 'mass' CHECK (allocation_basis IN ('mass','energy','economic')),
  closed_on           date,
  closed_by           text,
  cut_off             date,
  metered_kwh         bigint NOT NULL DEFAULT 0,
  carried_forward     jsonb,
  expired             jsonb
);

-- Movements are only ever added. A balance is the sum of its movements and is
-- never held as a total anywhere.
CREATE TABLE IF NOT EXISTS credit_movement (
  reference      text PRIMARY KEY,
  balance_period text NOT NULL REFERENCES balance_period(id),
  direction      text NOT NULL CHECK (direction IN ('in','out')),
  category       text NOT NULL CHECK (category IN ('post_consumer','pre_consumer')),
  mass_g         bigint NOT NULL CHECK (mass_g >= 0),
  movement       text NOT NULL,   -- consumption | allocation | transfer_in | transfer_out | carry_forward | expiry
  source_kind    text,
  source_ref     text,
  lot            text,
  origin_site    text,
  fresh_credit   boolean NOT NULL DEFAULT true,
  factor_ref     text,
  derivation     jsonb NOT NULL DEFAULT '{}'::jsonb,
  decided_by     text,
  favoured_over  jsonb,
  event_at       timestamptz NOT NULL,
  recorded_at    timestamptz NOT NULL DEFAULT now(),
  effective_on   date NOT NULL,
  recorded_by    text NOT NULL
);
CREATE INDEX IF NOT EXISTS movement_period ON credit_movement(balance_period, category, direction);
CREATE INDEX IF NOT EXISTS movement_lot ON credit_movement(lot);

CREATE TABLE IF NOT EXISTS transfer (
  reference      text PRIMARY KEY,
  from_period    text NOT NULL REFERENCES balance_period(id),
  to_period      text NOT NULL REFERENCES balance_period(id),
  category       text NOT NULL,
  mass_g         bigint NOT NULL,
  moved_on       date NOT NULL,
  recorded_by    text NOT NULL,
  recorded_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS restatement (
  reference      text PRIMARY KEY,
  balance_period text REFERENCES balance_period(id),
  reason         text NOT NULL,
  state          text NOT NULL DEFAULT 'open' CHECK (state IN ('open','resolved')),
  certificates   jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_movements jsonb,
  opened_by      text NOT NULL,
  opened_at      timestamptz NOT NULL DEFAULT now(),
  effective_on   date NOT NULL
);

CREATE TABLE IF NOT EXISTS resolution (
  id           bigserial PRIMARY KEY,
  restatement  text NOT NULL REFERENCES restatement(reference),
  certificate  text NOT NULL,
  outcome      text NOT NULL CHECK (outcome IN ('reissued','withdrawn','unaffected')),
  reason       text NOT NULL,
  recorded_by  text NOT NULL,
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restatement, certificate)
);

-- ------------------------------------------------------------------ carbon

CREATE TABLE IF NOT EXISTS carbon_method (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  standard        text NOT NULL,
  functional_unit text NOT NULL,
  primary_threshold_bp integer NOT NULL DEFAULT 5000
);

CREATE TABLE IF NOT EXISTS carbon_method_version (
  method            text NOT NULL REFERENCES carbon_method(id),
  version           integer NOT NULL,
  boundary          text NOT NULL,
  allocation_basis  text NOT NULL CHECK (allocation_basis IN ('mass','energy','economic')),
  reviewer          text NOT NULL,
  published_on      date NOT NULL,
  published_by      text NOT NULL,
  data_quality_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  emission_factors  jsonb NOT NULL DEFAULT '[]'::jsonb,
  superseded_by     integer,
  PRIMARY KEY (method, version)
);

CREATE TABLE IF NOT EXISTS carbon_figure (
  id                text PRIMARY KEY,
  lot               text NOT NULL,
  version           integer NOT NULL DEFAULT 1,
  method            text NOT NULL,
  method_version    integer NOT NULL,
  value_mg_per_kg   bigint NOT NULL,
  uncertainty_bp    integer NOT NULL,
  primary_share_bp  integer NOT NULL,
  boundary          text NOT NULL,
  comparator        jsonb NOT NULL,
  breakdown         jsonb NOT NULL,
  energy_location_mg_per_kg bigint NOT NULL,
  energy_market_mg_per_kg   bigint NOT NULL,
  input_versions    jsonb NOT NULL DEFAULT '{}'::jsonb,
  cache_valid       boolean NOT NULL DEFAULT true,
  superseded_by     text,
  computed_at       timestamptz NOT NULL DEFAULT now(),
  computed_by       text,
  recompute_reason  text
);
CREATE INDEX IF NOT EXISTS figure_lot ON carbon_figure(lot);

CREATE TABLE IF NOT EXISTS energy_instrument (
  reference     text PRIMARY KEY,
  quantity_kwh  bigint NOT NULL,
  vintage       integer NOT NULL,
  region        text NOT NULL,
  state         text NOT NULL CHECK (state IN ('retired','held')),
  applied_to    text REFERENCES balance_period(id),
  applied_at    timestamptz
);

-- --------------------------------------- specifications, customers, changes

CREATE TABLE IF NOT EXISTS specification (
  grade             text NOT NULL,
  version           integer NOT NULL,
  issued_on         date NOT NULL,
  properties        jsonb NOT NULL,
  virgin_reference  jsonb NOT NULL,
  superseded_by     integer,
  PRIMARY KEY (grade, version)
);

CREATE TABLE IF NOT EXISTS customer (
  reference   text PRIMARY KEY,
  contact     text NOT NULL,
  application text NOT NULL,
  industry    text NOT NULL,
  language    text NOT NULL DEFAULT 'en',
  holds_specification_version integer
);

CREATE TABLE IF NOT EXISTS specification_issue (
  id          bigserial PRIMARY KEY,
  grade       text NOT NULL,
  version     integer NOT NULL,
  customer    text NOT NULL REFERENCES customer(reference),
  issued_on   date NOT NULL,
  issued_by   text NOT NULL
);

CREATE TABLE IF NOT EXISTS conformance (
  id            bigserial PRIMARY KEY,
  customer      text NOT NULL REFERENCES customer(reference),
  application   text NOT NULL,
  specification_version integer NOT NULL,
  trials        jsonb NOT NULL DEFAULT '[]'::jsonb,
  outcome       text NOT NULL,
  recorded_on   date NOT NULL
);

CREATE TABLE IF NOT EXISTS change_notice (
  reference       text PRIMARY KEY,
  title           text NOT NULL,
  detail          text NOT NULL,
  parameter       text,
  qualification_relevant boolean NOT NULL DEFAULT false,
  specifications_affected jsonb NOT NULL DEFAULT '[]'::jsonb,
  customers_affected jsonb NOT NULL DEFAULT '[]'::jsonb,
  qualifications_affected jsonb NOT NULL DEFAULT '[]'::jsonb,
  notice_period_days integer NOT NULL,
  state           text NOT NULL DEFAULT 'raised' CHECK (state IN ('raised','notified','released','blocked')),
  raised_by       text NOT NULL,
  raised_at       timestamptz NOT NULL DEFAULT now(),
  released_at     timestamptz,
  effective_on    date NOT NULL
);

CREATE TABLE IF NOT EXISTS change_notification (
  id            bigserial PRIMARY KEY,
  change_notice text NOT NULL REFERENCES change_notice(reference),
  customer      text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('notified','waived','acknowledged')),
  recorded_by   text NOT NULL,
  recorded_at   timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------ contracts and offtake

CREATE TABLE IF NOT EXISTS contract (
  id                   text PRIMARY KEY,
  recipient            text NOT NULL REFERENCES customer(reference),
  site                 text NOT NULL REFERENCES site(reference),
  period               text NOT NULL,
  committed_kg         bigint NOT NULL,
  floor_bp             integer NOT NULL,
  shortfall_consequence text NOT NULL,
  signed_on            date NOT NULL,
  unreachable_on       date,
  unreachable_allocation text
);

CREATE TABLE IF NOT EXISTS allocation (
  reference     text PRIMARY KEY,
  contract      text NOT NULL REFERENCES contract(id),
  lot           text NOT NULL REFERENCES lot(reference),
  mass_g        bigint NOT NULL,
  decided_by    text NOT NULL,
  favoured_over jsonb NOT NULL DEFAULT '[]'::jsonb,
  event_at      timestamptz NOT NULL,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  effective_on  date NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS allocation_one_contract_per_lot ON allocation(lot);

-- ------------------------------------------------------------- certificates

CREATE TABLE IF NOT EXISTS certificate_sequence (
  site       text PRIMARY KEY REFERENCES site(reference),
  last_number integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS certificate (
  number             text PRIMARY KEY,
  version            integer NOT NULL DEFAULT 1,
  site               text NOT NULL REFERENCES site(reference),
  recipient          text NOT NULL,
  recipient_name     text NOT NULL,
  grade              text NOT NULL,
  lots               jsonb NOT NULL,
  specification_version integer NOT NULL,
  claim_type         text NOT NULL,
  content_bp         integer NOT NULL,
  category_split     jsonb NOT NULL,
  period             text NOT NULL,
  carbon             jsonb NOT NULL,
  primary_share_bp   integer NOT NULL,
  scheme             text NOT NULL,
  registration       text NOT NULL,
  test_results       jsonb NOT NULL DEFAULT '[]'::jsonb,
  permitted_statement text NOT NULL,
  prohibited_statement text NOT NULL,
  signer             text NOT NULL,
  signer_name        text NOT NULL,
  signed_at          timestamptz NOT NULL,
  issued_on          date NOT NULL,
  verification_url   text NOT NULL,
  state              text NOT NULL DEFAULT 'issued' CHECK (state IN ('issued','withdrawn','superseded')),
  provisional_factor boolean NOT NULL DEFAULT false,
  conditions_at_signing jsonb NOT NULL,
  input_versions     jsonb NOT NULL DEFAULT '{}'::jsonb,
  derived_from       text,
  supersedes         text,
  document           text NOT NULL,
  withdrawn_on       date,
  withdrawn_by       text,
  withdrawal_reason  text,
  deviations         jsonb NOT NULL DEFAULT '[]'::jsonb,
  language           text NOT NULL DEFAULT 'en'
);

CREATE TABLE IF NOT EXISTS certificate_notification (
  id          bigserial PRIMARY KEY,
  certificate text NOT NULL REFERENCES certificate(number),
  recipient   text NOT NULL,
  recipient_name text NOT NULL,
  subject     text NOT NULL,
  body        text NOT NULL,
  kind        text NOT NULL,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  delivered   boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------- the record

CREATE TABLE IF NOT EXISTS record_entry (
  seq          bigserial PRIMARY KEY,
  act          text NOT NULL,
  person       text,            -- an identifier; the name resolves elsewhere
  site         text,
  object_kind  text,
  object_ref   text,
  outcome      text NOT NULL DEFAULT 'success' CHECK (outcome IN ('success','refused')),
  content      jsonb,
  content_deleted boolean NOT NULL DEFAULT false,
  content_deleted_on date,
  digest       text NOT NULL,
  prev_digest  text NOT NULL,
  event_at     timestamptz NOT NULL,
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  effective_on date NOT NULL,
  anchor_ref   text
);
CREATE INDEX IF NOT EXISTS record_act ON record_entry(act);
CREATE INDEX IF NOT EXISTS record_person ON record_entry(person);
CREATE INDEX IF NOT EXISTS record_object ON record_entry(object_ref);

-- A person inside the record is referenced by an identifier, and the identifier
-- resolves to a name through a separate store with its own retention.
CREATE TABLE IF NOT EXISTS person_directory (
  identifier  text PRIMARY KEY,
  email       text NOT NULL,
  name        text NOT NULL,
  roles       jsonb NOT NULL DEFAULT '[]'::jsonb,
  sites       jsonb NOT NULL DEFAULT '[]'::jsonb,
  grant_ends_on date NOT NULL,
  retired_on  date
);

CREATE TABLE IF NOT EXISTS legal_hold (
  reference   text PRIMARY KEY,
  record_seq  bigint NOT NULL,
  reason      text NOT NULL,
  placed_by   text NOT NULL,
  placed_at   timestamptz NOT NULL DEFAULT now(),
  lifted_by   text,
  lifted_at   timestamptz
);

CREATE TABLE IF NOT EXISTS export (
  reference   text PRIMARY KEY,
  scope       jsonb NOT NULL,
  requested_by text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  entry_count integer NOT NULL,
  payload     jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS annotation (
  id          bigserial PRIMARY KEY,
  object_kind text NOT NULL,
  object_ref  text NOT NULL,
  note        text NOT NULL,
  author      text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------- integrations

CREATE TABLE IF NOT EXISTS inbound_record (
  reference        text PRIMARY KEY,
  source           text NOT NULL CHECK (source IN ('weighbridge','control_system','laboratory','customer_reporting')),
  received_at      timestamptz NOT NULL,
  payload          jsonb NOT NULL,
  payload_verbatim text NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inbound_source ON inbound_record(source, received_at);

-- -------------------------------------------------------------- public site

CREATE TABLE IF NOT EXISTS statistic (
  key       text PRIMARY KEY,
  value     text NOT NULL,
  source    text NOT NULL,
  year      integer NOT NULL,
  geography text NOT NULL
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
  reference  text PRIMARY KEY,
  title      text NOT NULL,
  tag        text NOT NULL CHECK (tag IN ('funding','partnership','technical','recognition')),
  outlet     text NOT NULL,
  published_on date NOT NULL,
  link       text NOT NULL,
  language   text NOT NULL
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
  review_on      date NOT NULL,
  state          text NOT NULL DEFAULT 'published' CHECK (state IN ('published','withdrawn'))
);

CREATE TABLE IF NOT EXISTS enquiry (
  reference     text PRIMARY KEY,
  type          text NOT NULL CHECK (type IN ('waste_supply','polymer_purchase','partnership','press')),
  name          text NOT NULL,
  email         text NOT NULL,
  organisation  text,
  message       text NOT NULL,
  destination   text NOT NULL,
  response_days integer NOT NULL,
  deadline      date,
  opened_record text,
  received_at   timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------- idempotency

CREATE TABLE IF NOT EXISTS idempotency (
  key         text NOT NULL,
  route       text NOT NULL,
  body_hash   text NOT NULL,
  status      integer NOT NULL,
  response    jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, route)
);

-- -------------------------------------------------- immutability, enforced

-- These triggers are the reason "immutable" is a property of the system rather
-- than a promise in a document. An UPDATE or a DELETE against an append-only
-- table raises, whatever route reached it and whoever was signed in.

CREATE OR REPLACE FUNCTION refuse_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'append_only: % rows are added and never altered or removed', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS record_entry_no_delete ON record_entry;
CREATE TRIGGER record_entry_no_delete BEFORE DELETE ON record_entry
  FOR EACH ROW EXECUTE FUNCTION refuse_change();

-- The one edit the record permits is the retention route blanking a content
-- payload; the position, the digest and the chain survive it untouched.
CREATE OR REPLACE FUNCTION record_entry_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.seq IS DISTINCT FROM OLD.seq
     OR NEW.digest IS DISTINCT FROM OLD.digest
     OR NEW.prev_digest IS DISTINCT FROM OLD.prev_digest
     OR NEW.act IS DISTINCT FROM OLD.act
     OR NEW.event_at IS DISTINCT FROM OLD.event_at THEN
    RAISE EXCEPTION 'record_entry is append only: a correction is a new entry naming what it corrects'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.content_deleted THEN
    RAISE EXCEPTION 'record_entry content was already deleted under retention'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT NEW.content_deleted THEN
    RAISE EXCEPTION 'record_entry content changes only by expiry under retention'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS record_entry_no_update ON record_entry;
CREATE TRIGGER record_entry_no_update BEFORE UPDATE ON record_entry
  FOR EACH ROW EXECUTE FUNCTION record_entry_guard();

DROP TRIGGER IF EXISTS credit_movement_immutable ON credit_movement;
CREATE TRIGGER credit_movement_immutable BEFORE UPDATE OR DELETE ON credit_movement
  FOR EACH ROW EXECUTE FUNCTION refuse_change();

DROP TRIGGER IF EXISTS consumption_immutable ON consumption;
CREATE TRIGGER consumption_immutable BEFORE UPDATE OR DELETE ON consumption
  FOR EACH ROW EXECUTE FUNCTION refuse_change();

DROP TRIGGER IF EXISTS inbound_immutable ON inbound_record;
CREATE TRIGGER inbound_immutable BEFORE UPDATE OR DELETE ON inbound_record
  FOR EACH ROW EXECUTE FUNCTION refuse_change();

DROP TRIGGER IF EXISTS resolution_immutable ON resolution;
CREATE TRIGGER resolution_immutable BEFORE UPDATE OR DELETE ON resolution
  FOR EACH ROW EXECUTE FUNCTION refuse_change();

-- An issued certificate is immutable without qualification. A withdrawal is a
-- new fact recorded about the document, not a rewrite of it, so only the four
-- withdrawal columns and the state may move, and never back.
CREATE OR REPLACE FUNCTION certificate_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.number IS DISTINCT FROM OLD.number
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.content_bp IS DISTINCT FROM OLD.content_bp
     OR NEW.claim_type IS DISTINCT FROM OLD.claim_type
     OR NEW.document IS DISTINCT FROM OLD.document
     OR NEW.carbon IS DISTINCT FROM OLD.carbon
     OR NEW.lots IS DISTINCT FROM OLD.lots
     OR NEW.signer IS DISTINCT FROM OLD.signer
     OR NEW.signed_at IS DISTINCT FROM OLD.signed_at
     OR NEW.conditions_at_signing IS DISTINCT FROM OLD.conditions_at_signing THEN
    RAISE EXCEPTION 'an issued certificate is immutable; a re-issue is a new version at a new address'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.state = 'withdrawn' AND NEW.state <> 'withdrawn' THEN
    RAISE EXCEPTION 'a withdrawal is a fact about a document; the remedy is a new certificate'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS certificate_no_delete ON certificate;
CREATE TRIGGER certificate_no_delete BEFORE DELETE ON certificate
  FOR EACH ROW EXECUTE FUNCTION refuse_change();

DROP TRIGGER IF EXISTS certificate_immutable ON certificate;
CREATE TRIGGER certificate_immutable BEFORE UPDATE ON certificate
  FOR EACH ROW EXECUTE FUNCTION certificate_guard();

-- A batch category can never be changed after acceptance, by anybody, through
-- any route. The database is the last place that rule is enforced and the only
-- one that cannot be bypassed by a new handler.
CREATE OR REPLACE FUNCTION batch_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.category IS DISTINCT FROM OLD.category THEN
    RAISE EXCEPTION 'category_immutable_after_acceptance'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.reference IS DISTINCT FROM OLD.reference
     OR NEW.received_on IS DISTINCT FROM OLD.received_on
     OR NEW.net_g IS DISTINCT FROM OLD.net_g
     OR NEW.collector IS DISTINCT FROM OLD.collector THEN
    RAISE EXCEPTION 'the batch record captures the mass as the weighbridge reported it'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS batch_immutable_bits ON batch;
CREATE TRIGGER batch_immutable_bits BEFORE UPDATE ON batch
  FOR EACH ROW EXECUTE FUNCTION batch_guard();

-- A closed run refuses every write.
CREATE OR REPLACE FUNCTION run_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.state = 'closed' AND NEW.state = 'closed'
     AND (NEW.losses_g IS DISTINCT FROM OLD.losses_g OR NEW.closed_at IS DISTINCT FROM OLD.closed_at) THEN
    RAISE EXCEPTION 'run_closed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS run_closed_guard ON run;
CREATE TRIGGER run_closed_guard BEFORE UPDATE ON run
  FOR EACH ROW EXECUTE FUNCTION run_guard();

-- A closed balance period refuses every further write and refuses to reopen.
CREATE OR REPLACE FUNCTION balance_period_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.state = 'closed' THEN
    RAISE EXCEPTION 'period_closed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS balance_period_closed_guard ON balance_period;
CREATE TRIGGER balance_period_closed_guard BEFORE UPDATE ON balance_period
  FOR EACH ROW EXECUTE FUNCTION balance_period_guard();

-- A published method version is immutable once anything has been computed
-- against it; a new version supersedes rather than overwrites. The superseded_by
-- pointer is the one column that may be set, because it points forward.
CREATE OR REPLACE FUNCTION method_version_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.boundary IS DISTINCT FROM OLD.boundary
     OR NEW.allocation_basis IS DISTINCT FROM OLD.allocation_basis
     OR NEW.emission_factors IS DISTINCT FROM OLD.emission_factors
     OR NEW.published_on IS DISTINCT FROM OLD.published_on THEN
    RAISE EXCEPTION 'a published method version is superseded by a new version, never overwritten'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS method_version_immutable ON carbon_method_version;
CREATE TRIGGER method_version_immutable BEFORE UPDATE ON carbon_method_version
  FOR EACH ROW EXECUTE FUNCTION method_version_guard();

-- A conversion factor and a specification are versioned definitions too.
CREATE OR REPLACE FUNCTION factor_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.factor_bp IS DISTINCT FROM OLD.factor_bp
     OR NEW.derived_in_g IS DISTINCT FROM OLD.derived_in_g
     OR NEW.derived_out_g IS DISTINCT FROM OLD.derived_out_g THEN
    RAISE EXCEPTION 'a conversion factor version is superseded, never overwritten'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS factor_immutable ON conversion_factor;
CREATE TRIGGER factor_immutable BEFORE UPDATE ON conversion_factor
  FOR EACH ROW EXECUTE FUNCTION factor_guard();

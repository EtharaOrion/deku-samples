-- Community Calendar schema. Applied idempotently at startup.
CREATE TABLE IF NOT EXISTS accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name  text NOT NULL,
  handle        text NOT NULL UNIQUE,
  role          text NOT NULL CHECK (role IN ('host','guest')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendars (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name             text NOT NULL,
  slug             text NOT NULL UNIQUE,
  category         text NOT NULL,
  city             text NOT NULL,
  is_public        boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS calendars_owner_idx ON calendars(owner_account_id);

CREATE TABLE IF NOT EXISTS events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id       uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  title             text NOT NULL,
  slug              text NOT NULL UNIQUE,
  category          text NOT NULL,
  city              text NOT NULL,
  time_zone         text NOT NULL DEFAULT 'UTC',
  cover_seed        text NOT NULL DEFAULT '',
  theme_hex         text NOT NULL,
  description       text,
  starts_at         timestamptz NOT NULL,
  ends_at           timestamptz NOT NULL,
  capacity          integer NOT NULL CHECK (capacity BETWEEN 1 AND 500),
  approval_required boolean NOT NULL DEFAULT false,
  waitlist_enabled  boolean NOT NULL DEFAULT false,
  state             text NOT NULL DEFAULT 'draft'
                    CHECK (state IN ('draft','published','registration_closed','cancelled')),
  published_at      timestamptz,
  cancelled_at      timestamptz,
  cancel_reason     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_state_starts_idx ON events(state, starts_at, slug);
CREATE INDEX IF NOT EXISTS events_calendar_idx ON events(calendar_id);

CREATE TABLE IF NOT EXISTS registrations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  account_id    uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'pending_approval'
                CHECK (status IN ('pending_approval','confirmed','waitlisted','declined',
                                  'cancelled_by_guest','cancelled_by_host','checked_in')),
  waitlist_position integer CHECK (waitlist_position IS NULL OR waitlist_position >= 1),
  ticket_code   text UNIQUE,
  checked_in_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT one_seat_per_account UNIQUE (event_id, account_id),
  CONSTRAINT waitlist_position_iff_waitlisted
    CHECK ((status = 'waitlisted') = (waitlist_position IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS registrations_event_idx ON registrations(event_id);
CREATE INDEX IF NOT EXISTS registrations_account_idx ON registrations(account_id);
CREATE INDEX IF NOT EXISTS registrations_ticket_idx ON registrations(ticket_code);

CREATE TABLE IF NOT EXISTS email_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid REFERENCES registrations(id) ON DELETE SET NULL,
  event_id        uuid REFERENCES events(id) ON DELETE SET NULL,
  recipient       text NOT NULL,
  subject        text NOT NULL,
  sent_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Single root namespace for handles, calendar slugs and event slugs.
-- ---------------------------------------------------------------------------
-- The root namespace as one addressable set. It is a view, not a table:
-- the data contract is the five tables above.
CREATE OR REPLACE VIEW root_namespace AS
  SELECT slug AS value, 'event'::text AS kind FROM events
  UNION ALL
  SELECT slug, 'calendar' FROM calendars
  UNION ALL
  SELECT handle, 'account' FROM accounts;

-- Cross-table uniqueness plus "never reused", enforced by the database.
-- The advisory lock serialises concurrent claims of the same value.
CREATE OR REPLACE FUNCTION claim_root_value() RETURNS trigger AS $$
DECLARE
  mine text;
BEGIN
  IF TG_TABLE_NAME = 'accounts' THEN mine := NEW.handle; ELSE mine := NEW.slug; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('root_ns'), hashtext(mine));
  IF EXISTS (SELECT 1 FROM events    WHERE slug   = mine AND (TG_TABLE_NAME <> 'events'    OR id <> NEW.id))
  OR EXISTS (SELECT 1 FROM calendars WHERE slug   = mine AND (TG_TABLE_NAME <> 'calendars' OR id <> NEW.id))
  OR EXISTS (SELECT 1 FROM accounts  WHERE handle = mine AND (TG_TABLE_NAME <> 'accounts'  OR id <> NEW.id)) THEN
    RAISE EXCEPTION 'root_value_taken:%', mine USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ns_event ON events;
CREATE TRIGGER trg_ns_event BEFORE INSERT OR UPDATE OF slug ON events
  FOR EACH ROW EXECUTE FUNCTION claim_root_value('event');

DROP TRIGGER IF EXISTS trg_ns_calendar ON calendars;
CREATE TRIGGER trg_ns_calendar BEFORE INSERT OR UPDATE OF slug ON calendars
  FOR EACH ROW EXECUTE FUNCTION claim_root_value('calendar');

DROP TRIGGER IF EXISTS trg_ns_account ON accounts;
CREATE TRIGGER trg_ns_account BEFORE INSERT OR UPDATE OF handle ON accounts
  FOR EACH ROW EXECUTE FUNCTION claim_root_value('account');

-- ---------------------------------------------------------------------------
-- The seat invariant, enforced by the database itself.
-- The trigger below runs FOR EACH ROW on any insert or status update that
-- would create or keep a seat. If the event is already full the statement
-- raises, which aborts the surrounding transaction and leaves no partial row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_seats() RETURNS trigger AS $$
DECLARE
  seats int;
  cap   int;
BEGIN
  SELECT capacity INTO cap FROM events WHERE id = NEW.event_id;
  SELECT count(*) INTO seats
    FROM registrations
   WHERE event_id = NEW.event_id
     AND status IN ('confirmed','checked_in')
     AND id <> NEW.id;
  IF seats >= cap THEN
    RAISE EXCEPTION 'event_full' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_seats ON registrations;
CREATE TRIGGER trg_seats
BEFORE INSERT OR UPDATE OF status, event_id ON registrations
FOR EACH ROW WHEN (NEW.status IN ('confirmed','checked_in'))
EXECUTE FUNCTION check_seats();

-- One live ticket code per registration, and a code belongs to exactly one row.
CREATE OR REPLACE FUNCTION check_ticket_code() RETURNS trigger AS $$
BEGIN
  IF NEW.ticket_code IS NOT NULL AND NEW.status NOT IN ('confirmed','checked_in') THEN
    RAISE EXCEPTION 'ticket_without_seat' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ticket ON registrations;
CREATE TRIGGER trg_ticket
BEFORE INSERT OR UPDATE OF ticket_code, status ON registrations
FOR EACH ROW EXECUTE FUNCTION check_ticket_code();

export const SCHEMA_SQL = `
-- gen_random_uuid() is built in from PostgreSQL 13; no extension needed

CREATE TABLE IF NOT EXISTS accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text NOT NULL,
  display_name  text NOT NULL,
  handle        text NOT NULL UNIQUE,
  role          text NOT NULL CHECK (role IN ('host','guest')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendars (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  name             text NOT NULL,
  slug             text NOT NULL UNIQUE,
  category         text NOT NULL,
  city             text NOT NULL,
  is_public        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS calendars_owner_idx ON calendars(owner_account_id);

CREATE TABLE IF NOT EXISTS events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id       uuid NOT NULL REFERENCES calendars(id) ON DELETE RESTRICT,
  title             text NOT NULL,
  slug              text NOT NULL UNIQUE,
  category          text NOT NULL,
  city              text NOT NULL DEFAULT '',
  time_zone         text NOT NULL DEFAULT 'UTC',
  cover_seed        text NOT NULL,
  theme_hex         text NOT NULL CHECK (theme_hex ~ '^#[0-9a-f]{6}$'),
  description       text NOT NULL DEFAULT '',
  starts_at         timestamptz,
  ends_at           timestamptz,
  capacity          integer CHECK (capacity IS NULL OR (capacity >= 1 AND capacity <= 500)),
  approval_required boolean NOT NULL DEFAULT false,
  waitlist_enabled  boolean NOT NULL DEFAULT true,
  state             text NOT NULL CHECK (state IN ('draft','published','registration_closed','cancelled')),
  published_at      timestamptz,
  cancelled_at      timestamptz,
  cancel_reason     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_times_ordered CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS events_calendar_idx ON events(calendar_id);
CREATE INDEX IF NOT EXISTS events_discovery_idx ON events(state, starts_at, slug);
CREATE INDEX IF NOT EXISTS events_category_idx ON events(category);

CREATE TABLE IF NOT EXISTS registrations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  account_id        uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  status            text NOT NULL CHECK (status IN ('pending_approval','confirmed','waitlisted','declined','cancelled_by_guest','cancelled_by_host','checked_in')),
  waitlist_position integer,
  ticket_code       text UNIQUE,
  checked_in_at     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT registrations_one_per_account UNIQUE (event_id, account_id),
  CONSTRAINT registrations_ticket_iff_seated
    CHECK ((status IN ('confirmed','checked_in')) = (ticket_code IS NOT NULL)),
  CONSTRAINT registrations_ticket_shape
    CHECK (ticket_code IS NULL OR ticket_code ~ '^TKT-[A-Z0-9]{8}$'),
  CONSTRAINT registrations_position_iff_waitlisted
    CHECK ((status = 'waitlisted') = (waitlist_position IS NOT NULL)),
  CONSTRAINT registrations_position_positive
    CHECK (waitlist_position IS NULL OR waitlist_position >= 1),
  -- deferred so a renumbering pass may swap positions inside one transaction
  CONSTRAINT registrations_waitlist_slot UNIQUE (event_id, waitlist_position)
    DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS registrations_event_status_idx ON registrations(event_id, status);
CREATE INDEX IF NOT EXISTS registrations_account_idx ON registrations(account_id);

CREATE TABLE IF NOT EXISTS email_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid REFERENCES registrations(id) ON DELETE SET NULL,
  event_id        uuid REFERENCES events(id) ON DELETE SET NULL,
  recipient       text NOT NULL,
  subject         text NOT NULL,
  sent_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_log_event_idx ON email_log(event_id);

-- Database-level enforcement of the capacity invariant. Any transaction that
-- seats a guest must first take the event row lock; the trigger re-counts the
-- seats actually stored and refuses the write when the event is already full.
-- Two concurrent seat writes therefore serialise on the event row and the
-- second one is rejected, so a stored over-sell is impossible.
CREATE OR REPLACE FUNCTION registrations_enforce_capacity() RETURNS trigger AS $fn$
DECLARE
  ev_capacity integer;
  seated      integer;
BEGIN
  IF NEW.status NOT IN ('confirmed','checked_in') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('confirmed','checked_in') THEN
    RETURN NEW;
  END IF;

  SELECT capacity INTO ev_capacity FROM events WHERE id = NEW.event_id FOR UPDATE;
  IF ev_capacity IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO seated
    FROM registrations
   WHERE event_id = NEW.event_id
     AND status IN ('confirmed','checked_in')
     AND id <> NEW.id;

  IF seated >= ev_capacity THEN
    RAISE EXCEPTION 'capacity_exceeded' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS registrations_capacity_guard ON registrations;
CREATE TRIGGER registrations_capacity_guard
  BEFORE INSERT OR UPDATE ON registrations
  FOR EACH ROW EXECUTE FUNCTION registrations_enforce_capacity();

-- Lowering capacity below the seats already stored is refused by the database
-- as well as by the application.
CREATE OR REPLACE FUNCTION events_enforce_capacity() RETURNS trigger AS $fn$
DECLARE
  seated integer;
BEGIN
  IF NEW.capacity IS NULL OR (OLD.capacity IS NOT NULL AND NEW.capacity >= OLD.capacity) THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO seated
    FROM registrations
   WHERE event_id = NEW.id AND status IN ('confirmed','checked_in');
  IF seated > NEW.capacity THEN
    RAISE EXCEPTION 'capacity_below_confirmed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_capacity_guard ON events;
CREATE TRIGGER events_capacity_guard
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION events_enforce_capacity();
`;

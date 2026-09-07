-- Gather schema. Five tables, snake_case, plural names, timestamps as timestamptz.

CREATE TABLE IF NOT EXISTS accounts (
  id            text PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name  text NOT NULL,
  handle        text NOT NULL UNIQUE,
  role          text NOT NULL CHECK (role IN ('host','guest')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendars (
  id               text PRIMARY KEY,
  owner_account_id text NOT NULL REFERENCES accounts(id),
  name             text NOT NULL,
  slug             text NOT NULL UNIQUE,
  category         text NOT NULL,
  city             text NOT NULL,
  is_public        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id                text PRIMARY KEY,
  calendar_id       text NOT NULL REFERENCES calendars(id),
  title             text NOT NULL,
  slug              text NOT NULL UNIQUE,
  category          text NOT NULL,
  city              text NOT NULL,
  time_zone         text NOT NULL DEFAULT 'UTC',
  cover_seed        text NOT NULL,
  theme_hex         text NOT NULL,
  description       text NOT NULL DEFAULT '',
  starts_at         timestamptz NOT NULL,
  ends_at           timestamptz NOT NULL,
  capacity          integer NOT NULL CHECK (capacity >= 1 AND capacity <= 500),
  approval_required boolean NOT NULL DEFAULT false,
  waitlist_enabled  boolean NOT NULL DEFAULT false,
  state             text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','registration_closed','cancelled')),
  published_at      timestamptz,
  cancelled_at      timestamptz,
  cancel_reason     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

-- One registration per account per event, enforced by the database.
CREATE TABLE IF NOT EXISTS registrations (
  id                text PRIMARY KEY,
  event_id          text NOT NULL REFERENCES events(id),
  account_id        text NOT NULL REFERENCES accounts(id),
  status            text NOT NULL CHECK (status IN
                      ('pending_approval','confirmed','waitlisted','declined',
                       'cancelled_by_guest','cancelled_by_host','checked_in')),
  waitlist_position integer CHECK (waitlist_position IS NULL OR waitlist_position >= 1),
  ticket_code       text UNIQUE,
  checked_in_at     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, account_id),
  CHECK (ticket_code IS NOT NULL OR status NOT IN ('confirmed','checked_in'))
);

CREATE INDEX IF NOT EXISTS idx_registrations_event ON registrations (event_id);
CREATE INDEX IF NOT EXISTS idx_registrations_account ON registrations (account_id);
CREATE INDEX IF NOT EXISTS idx_registrations_ticket ON registrations (ticket_code);

CREATE TABLE IF NOT EXISTS email_log (
  id              text PRIMARY KEY,
  registration_id text,
  event_id        text,
  recipient       text NOT NULL,
  subject         text NOT NULL,
  sent_at         timestamptz NOT NULL DEFAULT now()
);

-- Concurrent registration: at most `capacity` seats per event, held at the row
-- of the event itself so two transactions cannot both pass the count.
CREATE OR REPLACE FUNCTION gather_seat_invariant() RETURNS trigger AS $$
BEGIN
  IF NEW.status IN ('confirmed','checked_in') THEN
    PERFORM 1 FROM events e WHERE e.id = NEW.event_id FOR UPDATE;
    IF (SELECT count(*) FROM registrations r
        WHERE r.event_id = NEW.event_id
          AND r.status IN ('confirmed','checked_in')
          AND r.id <> NEW.id) + 1 > (SELECT capacity FROM events WHERE id = NEW.event_id) THEN
      RAISE EXCEPTION 'GATHER_EVENT_FULL'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gather_seat_invariant ON registrations;
CREATE TRIGGER trg_gather_seat_invariant
  BEFORE INSERT OR UPDATE OF status ON registrations
  FOR EACH ROW EXECUTE FUNCTION gather_seat_invariant();

-- No two rows may hold the same waitlist position on one event.
CREATE OR REPLACE FUNCTION gather_waitlist_unique() RETURNS trigger AS $$
BEGIN
  IF NEW.waitlist_position IS NOT NULL THEN
    PERFORM 1 FROM events e WHERE e.id = NEW.event_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM registrations r
               WHERE r.event_id = NEW.event_id
                 AND r.waitlist_position = NEW.waitlist_position
                 AND r.id <> NEW.id) THEN
      RAISE EXCEPTION 'GATHER_WAITLIST_TAKEN' USING ERRCODE = 'unique_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gather_waitlist_unique ON registrations;
CREATE TRIGGER trg_gather_waitlist_unique
  BEFORE INSERT OR UPDATE OF waitlist_position ON registrations
  FOR EACH ROW EXECUTE FUNCTION gather_waitlist_unique();

-- Keep a waitlist_position from surviving on a non-waitlisted row.
CREATE OR REPLACE FUNCTION gather_waitlist_status_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.waitlist_position IS NOT NULL AND NEW.status <> 'waitlisted' THEN
    NEW.waitlist_position := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gather_waitlist_status_guard ON registrations;
CREATE TRIGGER trg_gather_waitlist_status_guard
  BEFORE INSERT OR UPDATE OF waitlist_position, status ON registrations
  FOR EACH ROW EXECUTE FUNCTION gather_waitlist_status_guard();

-- Index only the registrations that can be checked in at a door.
CREATE INDEX IF NOT EXISTS idx_registrations_seats ON registrations (event_id) WHERE status IN ('confirmed','checked_in');

-- Bearer tokens (hashed). Not part of the five-table data contract surface.
CREATE TABLE IF NOT EXISTS auth_tokens (
  token_hash text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts(id),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_account ON auth_tokens (account_id);

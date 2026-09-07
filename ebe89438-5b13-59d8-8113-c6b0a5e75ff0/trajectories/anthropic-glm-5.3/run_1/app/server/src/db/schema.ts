/* eslint-disable */
// The schema, embedded so the compiled server carries it.
export const SCHEMA_SQL = `-- Idempotent: runs on every boot. Never drops anything.

CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  handle        TEXT NOT NULL UNIQUE,
  role          TEXT NOT NULL CHECK (role IN ('host','guest')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendars (
  id               TEXT PRIMARY KEY,
  owner_account_id TEXT NOT NULL REFERENCES accounts(id),
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,
  category         TEXT NOT NULL,
  city             TEXT NOT NULL,
  is_public        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id               TEXT PRIMARY KEY,
  calendar_id      TEXT NOT NULL REFERENCES calendars(id),
  title            TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,
  category         TEXT NOT NULL,
  city             TEXT NOT NULL,
  time_zone        TEXT NOT NULL DEFAULT 'UTC',
  cover_seed       TEXT NOT NULL,
  theme_hex        TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  starts_at        TIMESTAMPTZ NOT NULL,
  ends_at          TIMESTAMPTZ NOT NULL,
  capacity         INTEGER NOT NULL CHECK (capacity >= 1 AND capacity <= 500),
  approval_required BOOLEAN NOT NULL DEFAULT false,
  waitlist_enabled BOOLEAN NOT NULL DEFAULT false,
  state            TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','registration_closed','cancelled')),
  published_at     TIMESTAMPTZ,
  cancelled_at     TIMESTAMPTZ,
  cancel_reason    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT events_ends_after_starts CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS registrations (
  id            TEXT PRIMARY KEY,
  event_id      TEXT NOT NULL REFERENCES events(id),
  account_id    TEXT NOT NULL REFERENCES accounts(id),
  status        TEXT NOT NULL CHECK (status IN ('pending_approval','confirmed','waitlisted','declined','cancelled_by_guest','cancelled_by_host','checked_in')),
  waitlist_position INTEGER CHECK (waitlist_position >= 1),
  ticket_code   TEXT UNIQUE,
  checked_in_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- a waiting-list place is the only status that carries a position
  CONSTRAINT registrations_waitlist_position_rule CHECK (
    (status = 'waitlisted' AND waitlist_position IS NOT NULL)
    OR (status <> 'waitlisted' AND waitlist_position IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS email_log (
  id              TEXT PRIMARY KEY,
  registration_id TEXT,
  event_id        TEXT,
  recipient       TEXT NOT NULL,
  subject         TEXT NOT NULL,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- one registration per account per event, in any status
CREATE UNIQUE INDEX IF NOT EXISTS registrations_event_account_uidx
  ON registrations (event_id, account_id);

-- no ticket code is ever held by two registrations
CREATE UNIQUE INDEX IF NOT EXISTS registrations_ticket_uidx
  ON registrations (ticket_code) WHERE ticket_code IS NOT NULL;

-- waitlist positions never repeat
CREATE UNIQUE INDEX IF NOT EXISTS registrations_waitlist_uidx
  ON registrations (event_id, waitlist_position) WHERE status = 'waitlisted';

CREATE INDEX IF NOT EXISTS events_discovery_idx
  ON events (starts_at, slug);

-- The database itself holds the seat invariants. These are constraint
-- triggers: they run inside PostgreSQL, in the same transaction that writes
-- the row, and the transaction is rolled back whole if one raises.
CREATE OR REPLACE FUNCTION registrations_invariants() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  seats integer;
  ev_state text;
  ev_capacity integer;
BEGIN
  SELECT state, capacity INTO ev_state, ev_capacity FROM events WHERE id = NEW.event_id;

  -- a ticket code exists exactly when the status holds a seat
  IF (NEW.status IN ('confirmed','checked_in')) <> (NEW.ticket_code IS NOT NULL) THEN
    RAISE EXCEPTION 'ticket code must exist exactly when the registration holds a seat';
  END IF;

  -- a closed event accepts no new seat and never gains one
  IF ev_state = 'registration_closed'
     AND NEW.status IN ('confirmed','checked_in')
     AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('confirmed','checked_in')) THEN
    RAISE EXCEPTION 'registration is closed for this event';
  END IF;

  IF NEW.status IN ('confirmed','checked_in') THEN
    SELECT count(*) INTO seats FROM registrations
    WHERE event_id = NEW.event_id AND status IN ('confirmed','checked_in');
    -- the row itself will occupy one of those seats: on an update whose old
    -- row already held a seat, that seat is already in the count
    IF TG_OP = 'UPDATE' AND OLD.status IN ('confirmed','checked_in') THEN
      seats := seats - 1;
    END IF;
    IF seats >= ev_capacity THEN
      RAISE EXCEPTION 'event capacity exceeded';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS registrations_invariants_trg ON registrations;
CREATE TRIGGER registrations_invariants_trg
  BEFORE INSERT OR UPDATE OF status, ticket_code, waitlist_position, event_id ON registrations
  FOR EACH ROW EXECUTE FUNCTION registrations_invariants();

CREATE TABLE IF NOT EXISTS auth_tokens (
  token_hash BYTEA PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES accounts(id),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_tokens_account_idx ON auth_tokens (account_id);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limits_key_at_idx ON rate_limits (key, at);
`;

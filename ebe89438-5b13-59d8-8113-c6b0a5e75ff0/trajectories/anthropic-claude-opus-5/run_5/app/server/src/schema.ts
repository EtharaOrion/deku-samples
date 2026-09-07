export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS accounts (
  id            bigserial PRIMARY KEY,
  email         text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text NOT NULL,
  display_name  text NOT NULL,
  handle        text NOT NULL UNIQUE,
  role          text NOT NULL CHECK (role IN ('host','guest')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendars (
  id               bigserial PRIMARY KEY,
  owner_account_id bigint NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name             text NOT NULL,
  slug             text NOT NULL UNIQUE,
  category         text NOT NULL,
  city             text NOT NULL,
  is_public        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS calendars_owner_idx ON calendars(owner_account_id);

CREATE TABLE IF NOT EXISTS events (
  id                bigserial PRIMARY KEY,
  calendar_id       bigint NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  title             text NOT NULL,
  slug              text NOT NULL UNIQUE,
  category          text,
  city              text,
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
  CONSTRAINT events_times_ordered CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT events_cancel_reason_present CHECK (state <> 'cancelled' OR (cancel_reason IS NOT NULL AND length(btrim(cancel_reason)) > 0))
);
CREATE INDEX IF NOT EXISTS events_calendar_idx ON events(calendar_id);
CREATE INDEX IF NOT EXISTS events_discovery_idx ON events(state, starts_at, slug);
CREATE INDEX IF NOT EXISTS events_category_idx ON events(category);
CREATE INDEX IF NOT EXISTS events_city_idx ON events(lower(city));

CREATE TABLE IF NOT EXISTS registrations (
  id                bigserial PRIMARY KEY,
  event_id          bigint NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  account_id        bigint NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status            text NOT NULL CHECK (status IN ('pending_approval','confirmed','waitlisted','declined','cancelled_by_guest','cancelled_by_host','checked_in')),
  waitlist_position integer,
  ticket_code       text UNIQUE,
  checked_in_at     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT registrations_one_per_account UNIQUE (event_id, account_id),
  CONSTRAINT registrations_ticket_matches_status CHECK (
    (status IN ('confirmed','checked_in')) = (ticket_code IS NOT NULL)
  ),
  CONSTRAINT registrations_ticket_shape CHECK (ticket_code IS NULL OR ticket_code ~ '^TKT-[A-Z0-9]{8}$'),
  CONSTRAINT registrations_waitlist_position_matches_status CHECK (
    (status = 'waitlisted') = (waitlist_position IS NOT NULL)
  ),
  CONSTRAINT registrations_waitlist_position_positive CHECK (waitlist_position IS NULL OR waitlist_position >= 1)
);
CREATE INDEX IF NOT EXISTS registrations_event_idx ON registrations(event_id);
CREATE INDEX IF NOT EXISTS registrations_account_idx ON registrations(account_id);
CREATE INDEX IF NOT EXISTS registrations_seat_idx ON registrations(event_id) WHERE status IN ('confirmed','checked_in');

CREATE TABLE IF NOT EXISTS email_log (
  id              bigserial PRIMARY KEY,
  registration_id bigint REFERENCES registrations(id) ON DELETE SET NULL,
  event_id        bigint REFERENCES events(id) ON DELETE SET NULL,
  recipient       text NOT NULL,
  subject         text NOT NULL,
  sent_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_log_event_idx ON email_log(event_id);
`;

// Constraints and triggers that must exist but cannot be expressed with
// CREATE ... IF NOT EXISTS are added defensively.
export const CONSTRAINTS_SQL = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registrations_waitlist_position_unique') THEN
    ALTER TABLE registrations
      ADD CONSTRAINT registrations_waitlist_position_unique
      UNIQUE (event_id, waitlist_position) DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- The capacity invariant lives in the database, not only in the application.
-- The trigger takes the event row lock before counting, so two transactions
-- racing for the last seat are serialised by PostgreSQL itself: the second one
-- waits for the first to commit, then sees its row and is refused. A refused
-- insert aborts the whole statement, so no partial row is ever left behind.
CREATE OR REPLACE FUNCTION registrations_enforce_capacity() RETURNS trigger AS $fn$
DECLARE
  cap integer;
  taken integer;
BEGIN
  IF NEW.status NOT IN ('confirmed','checked_in') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('confirmed','checked_in') THEN
    RETURN NEW;
  END IF;

  SELECT capacity INTO cap FROM events WHERE id = NEW.event_id FOR UPDATE;
  IF cap IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO taken
    FROM registrations
   WHERE event_id = NEW.event_id
     AND status IN ('confirmed','checked_in')
     AND id IS DISTINCT FROM NEW.id;

  IF taken >= cap THEN
    RAISE EXCEPTION 'event_capacity_exceeded'
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'registrations_capacity';
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS registrations_capacity_guard ON registrations;
CREATE TRIGGER registrations_capacity_guard
  BEFORE INSERT OR UPDATE ON registrations
  FOR EACH ROW EXECUTE FUNCTION registrations_enforce_capacity();
`;

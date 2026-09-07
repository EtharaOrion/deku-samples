export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  handle        TEXT NOT NULL UNIQUE,
  role          TEXT NOT NULL CHECK (role IN ('host','guest')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendars (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_account_id UUID NOT NULL REFERENCES accounts(id),
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,
  category         TEXT NOT NULL,
  city             TEXT NOT NULL,
  is_public        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id       UUID NOT NULL REFERENCES calendars(id),
  title             TEXT NOT NULL,
  slug              TEXT NOT NULL UNIQUE,
  category          TEXT NOT NULL,
  city              TEXT NOT NULL,
  time_zone         TEXT NOT NULL DEFAULT 'UTC',
  cover_seed        TEXT NOT NULL,
  theme_hex         TEXT NOT NULL,
  description       TEXT,
  starts_at         TIMESTAMPTZ NOT NULL,
  ends_at           TIMESTAMPTZ NOT NULL,
  capacity          INTEGER NOT NULL CHECK (capacity >= 1 AND capacity <= 500),
  approval_required BOOLEAN NOT NULL DEFAULT false,
  waitlist_enabled  BOOLEAN NOT NULL DEFAULT false,
  state             TEXT NOT NULL DEFAULT 'draft'
                    CHECK (state IN ('draft','published','registration_closed','cancelled')),
  published_at      TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  cancel_reason     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT events_window CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS registrations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id           UUID NOT NULL REFERENCES events(id),
  account_id         UUID NOT NULL REFERENCES accounts(id),
  status             TEXT NOT NULL
                     CHECK (status IN ('pending_approval','confirmed','waitlisted','declined',
                                       'cancelled_by_guest','cancelled_by_host','checked_in')),
  waitlist_position  INTEGER,
  ticket_code        TEXT UNIQUE,
  checked_in_at      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT one_registration_per_account UNIQUE (event_id, account_id),
  CONSTRAINT waitlist_position_only_when_waitlisted
    CHECK ((status = 'waitlisted' AND waitlist_position >= 1)
        OR (status <> 'waitlisted' AND waitlist_position IS NULL))
);

CREATE TABLE IF NOT EXISTS email_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID,
  event_id        UUID,
  recipient       TEXT NOT NULL,
  subject         TEXT NOT NULL,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_state_starts ON events (state, starts_at, slug);
CREATE INDEX IF NOT EXISTS idx_registrations_event ON registrations (event_id, status);
CREATE INDEX IF NOT EXISTS idx_registrations_waitlist ON registrations (event_id, waitlist_position)
  WHERE status = 'waitlisted';

-- ---------------------------------------------------------------------------
-- Database-level invariants. Application logic cannot bypass these.
-- ---------------------------------------------------------------------------

-- A registration holds a seat only when confirmed or checked_in, and the
-- number of seats on an event can never exceed that event's capacity.
DROP FUNCTION IF EXISTS seats_taken(UUID) CASCADE;
CREATE OR REPLACE FUNCTION seats_taken(p_event_id UUID, p_exclude UUID DEFAULT NULL) RETURNS INTEGER
LANGUAGE sql STABLE AS $$
  SELECT count(*)::int FROM registrations
  WHERE event_id = p_event_id AND status IN ('confirmed','checked_in')
    AND (p_exclude IS NULL OR id <> p_exclude);
$$;

DROP FUNCTION IF EXISTS enforce_seat_capacity() CASCADE;
CREATE OR REPLACE FUNCTION enforce_seat_capacity() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  cap INTEGER;
  taken INTEGER;
  holder INTEGER;
BEGIN
  SELECT capacity INTO cap FROM events WHERE id = NEW.event_id;
  IF cap IS NULL THEN
    RAISE EXCEPTION 'event_not_found';
  END IF;
  -- On an update the row's own seat is not competition with itself.
  taken := seats_taken(NEW.event_id, NEW.id);
  IF NEW.status IN ('confirmed','checked_in') AND taken >= cap THEN
    -- Re-presenting a registration an account already holds is not a new
    -- seat: the insert is skipped by the unique constraint anyway.
    SELECT 1 INTO holder FROM registrations
     WHERE event_id = NEW.event_id AND account_id = NEW.account_id
       AND status IN ('confirmed','checked_in');
    IF holder IS NULL THEN
      RAISE EXCEPTION 'event_full' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seat_capacity ON registrations;
CREATE TRIGGER trg_seat_capacity
BEFORE INSERT OR UPDATE OF status, event_id ON registrations
FOR EACH ROW EXECUTE FUNCTION enforce_seat_capacity();

-- waitlist_position is owned by the database: null unless waitlisted, and
-- always the next integer when a row joins a waiting list.
CREATE OR REPLACE FUNCTION enforce_waitlist_position() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'waitlisted' THEN
    IF NEW.waitlist_position IS NULL THEN
      SELECT COALESCE(MAX(waitlist_position), 0) + 1 INTO NEW.waitlist_position
      FROM registrations
      WHERE event_id = NEW.event_id AND status = 'waitlisted'
        AND id <> NEW.id;
    END IF;
  ELSE
    NEW.waitlist_position := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_waitlist_position ON registrations;
CREATE TRIGGER trg_waitlist_position
BEFORE INSERT OR UPDATE OF status ON registrations
FOR EACH ROW EXECUTE FUNCTION enforce_waitlist_position();

-- A ticket code exists exactly when a seat is held.
CREATE OR REPLACE FUNCTION enforce_ticket_code() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('confirmed','checked_in') THEN
    IF NEW.ticket_code IS NULL OR NEW.ticket_code !~ '^TKT-[A-Z0-9]{8}$' THEN
      RAISE EXCEPTION 'bad_ticket_code';
    END IF;
  ELSE
    NEW.ticket_code := NULL;
  END IF;
  IF NEW.status <> 'checked_in' THEN
    NEW.checked_in_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ticket_code ON registrations;
CREATE TRIGGER trg_ticket_code
BEFORE INSERT OR UPDATE OF status, ticket_code ON registrations
FOR EACH ROW EXECUTE FUNCTION enforce_ticket_code();

-- Waiting-list positions stay 1..n with no gaps and no repeats.
CREATE OR REPLACE FUNCTION renumber_waitlist() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE registrations r
  SET waitlist_position = s.rn, updated_at = now()
  FROM (
    SELECT id, row_number() OVER (ORDER BY waitlist_position, created_at) AS rn
    FROM registrations
    WHERE event_id = NEW.event_id AND status = 'waitlisted'
  ) s
  WHERE r.id = s.id AND r.waitlist_position IS DISTINCT FROM s.rn;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_renumber_waitlist ON registrations;
CREATE TRIGGER trg_renumber_waitlist
AFTER INSERT OR UPDATE OR DELETE ON registrations
FOR EACH ROW EXECUTE FUNCTION renumber_waitlist();

-- updated_at is maintained by the database.
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'events' THEN
    NEW.updated_at := now();
  ELSE
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_updated ON events;
CREATE TRIGGER trg_events_updated
BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_registrations_updated ON registrations;
CREATE TRIGGER trg_registrations_updated
BEFORE UPDATE ON registrations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Root namespace: a handle, a calendar slug and an event slug are one namespace.
CREATE OR REPLACE FUNCTION forbid_slug_collision() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  conflict TEXT;
BEGIN
  IF TG_TABLE_NAME = 'calendars' THEN
    SELECT slug INTO conflict FROM events WHERE slug = NEW.slug;
    IF conflict IS NOT NULL THEN RAISE EXCEPTION 'slug_taken'; END IF;
    SELECT handle INTO conflict FROM accounts WHERE handle = NEW.slug;
    IF conflict IS NOT NULL THEN RAISE EXCEPTION 'slug_taken'; END IF;
  ELSE
    SELECT slug INTO conflict FROM calendars WHERE slug = NEW.slug;
    IF conflict IS NOT NULL THEN RAISE EXCEPTION 'slug_taken'; END IF;
    SELECT handle INTO conflict FROM accounts WHERE handle = NEW.slug;
    IF conflict IS NOT NULL THEN RAISE EXCEPTION 'slug_taken'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calendars_slug ON calendars;
CREATE TRIGGER trg_calendars_slug
BEFORE INSERT OR UPDATE OF slug ON calendars
FOR EACH ROW EXECUTE FUNCTION forbid_slug_collision();

DROP TRIGGER IF EXISTS trg_events_slug ON events;
CREATE TRIGGER trg_events_slug
BEFORE INSERT OR UPDATE OF slug ON events
FOR EACH ROW EXECUTE FUNCTION forbid_slug_collision();
`;

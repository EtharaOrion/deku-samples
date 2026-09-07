export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS accounts (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text NOT NULL,
  display_name  text NOT NULL,
  handle        text NOT NULL UNIQUE,
  role          text NOT NULL CHECK (role IN ('host','guest')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendars (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  calendar_id       bigint NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  title             text NOT NULL,
  slug              text NOT NULL UNIQUE,
  category          text NOT NULL,
  city              text NOT NULL,
  location          text NOT NULL DEFAULT '',
  time_zone         text NOT NULL DEFAULT 'UTC',
  cover_seed        text NOT NULL,
  theme_hex         text NOT NULL CHECK (theme_hex ~* '^#[0-9a-f]{6}$'),
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
  CONSTRAINT events_ends_after_starts CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS events_calendar_idx ON events(calendar_id);
CREATE INDEX IF NOT EXISTS events_discovery_idx ON events(state, starts_at, slug);

CREATE TABLE IF NOT EXISTS registrations (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id          bigint NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  account_id        bigint NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status            text NOT NULL CHECK (status IN ('pending_approval','confirmed','waitlisted','declined','cancelled_by_guest','cancelled_by_host','checked_in')),
  waitlist_position integer,
  ticket_code       text UNIQUE CHECK (ticket_code IS NULL OR ticket_code ~ '^TKT-[A-Z0-9]{8}$'),
  checked_in_at     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT registrations_one_per_account UNIQUE (event_id, account_id),
  CONSTRAINT registrations_ticket_matches_status CHECK (
    (status IN ('confirmed','checked_in') AND ticket_code IS NOT NULL)
    OR (status NOT IN ('confirmed','checked_in') AND ticket_code IS NULL)
  ),
  CONSTRAINT registrations_waitlist_position_matches_status CHECK (
    (status = 'waitlisted' AND waitlist_position IS NOT NULL AND waitlist_position >= 1)
    OR (status <> 'waitlisted' AND waitlist_position IS NULL)
  ),
  -- Deferred so a whole renumbering pass is judged once, at commit, rather than
  -- row by row while the list is being shifted up.
  CONSTRAINT registrations_waitlist_unique UNIQUE (event_id, waitlist_position)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS registrations_event_idx ON registrations(event_id);
CREATE INDEX IF NOT EXISTS registrations_account_idx ON registrations(account_id);
CREATE INDEX IF NOT EXISTS registrations_seats_idx
  ON registrations(event_id) WHERE status IN ('confirmed','checked_in');

CREATE TABLE IF NOT EXISTS email_log (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  registration_id bigint REFERENCES registrations(id) ON DELETE SET NULL,
  event_id        bigint REFERENCES events(id) ON DELETE SET NULL,
  recipient       text NOT NULL,
  subject         text NOT NULL,
  sent_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_log_event_idx ON email_log(event_id);

/*
 * The last seat, guarded by the database itself.
 *
 * Any statement about to hand a seat out takes the row lock on the event first,
 * so a second transaction doing the same blocks until the first has committed
 * and then counts the seat the first one handed out. Two callers can never both
 * pass the check. The guard belongs to the table, not to the application, so it
 * holds for every client of this database, and the raise aborts the statement,
 * which leaves no partial row behind.
 */
CREATE OR REPLACE FUNCTION registrations_capacity_guard() RETURNS trigger AS $fn$
DECLARE
  cap   integer;
  taken integer;
BEGIN
  IF NEW.status NOT IN ('confirmed','checked_in') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('confirmed','checked_in') AND OLD.event_id = NEW.event_id THEN
    RETURN NEW;
  END IF;

  SELECT capacity INTO cap FROM events WHERE id = NEW.event_id FOR UPDATE;
  IF cap IS NULL THEN
    RAISE EXCEPTION 'event % has no capacity and can hold no seat', NEW.event_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO taken FROM registrations
    WHERE event_id = NEW.event_id
      AND status IN ('confirmed','checked_in')
      AND id IS DISTINCT FROM NEW.id;

  IF taken + 1 > cap THEN
    RAISE EXCEPTION 'event % is full: % of % seats are taken', NEW.event_id, taken, cap
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS registrations_capacity_guard_trg ON registrations;
CREATE TRIGGER registrations_capacity_guard_trg
  BEFORE INSERT OR UPDATE ON registrations
  FOR EACH ROW EXECUTE FUNCTION registrations_capacity_guard();

-- Capacity may never drop below the seats already handed out.
CREATE OR REPLACE FUNCTION events_capacity_not_below_seats() RETURNS trigger AS $fn$
DECLARE
  taken integer;
BEGIN
  IF NEW.capacity IS NOT DISTINCT FROM OLD.capacity THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO taken FROM registrations
    WHERE event_id = NEW.id AND status IN ('confirmed','checked_in');
  IF NEW.capacity IS NULL OR NEW.capacity < taken THEN
    RAISE EXCEPTION 'capacity % is below the % seats already confirmed on event %', NEW.capacity, taken, NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_capacity_not_below_seats_trg ON events;
CREATE TRIGGER events_capacity_not_below_seats_trg
  BEFORE UPDATE OF capacity ON events
  FOR EACH ROW EXECUTE FUNCTION events_capacity_not_below_seats();

/*
 * The root namespace: a handle, a calendar slug and an event slug are one pool
 * of names, and a name once taken is never handed out again.
 */
CREATE TABLE IF NOT EXISTS namespace_names (
  name       text PRIMARY KEY,
  kind       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION namespace_claim() RETURNS trigger AS $fn$
DECLARE
  claimed text;
BEGIN
  IF TG_TABLE_NAME = 'accounts' THEN claimed := NEW.handle; ELSE claimed := NEW.slug; END IF;
  INSERT INTO namespace_names(name, kind) VALUES (claimed, TG_TABLE_NAME)
    ON CONFLICT (name) DO NOTHING;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS accounts_namespace_trg ON accounts;
CREATE TRIGGER accounts_namespace_trg AFTER INSERT OR UPDATE OF handle ON accounts
  FOR EACH ROW EXECUTE FUNCTION namespace_claim();
DROP TRIGGER IF EXISTS calendars_namespace_trg ON calendars;
CREATE TRIGGER calendars_namespace_trg AFTER INSERT OR UPDATE OF slug ON calendars
  FOR EACH ROW EXECUTE FUNCTION namespace_claim();
DROP TRIGGER IF EXISTS events_namespace_trg ON events;
CREATE TRIGGER events_namespace_trg AFTER INSERT OR UPDATE OF slug ON events
  FOR EACH ROW EXECUTE FUNCTION namespace_claim();
`;

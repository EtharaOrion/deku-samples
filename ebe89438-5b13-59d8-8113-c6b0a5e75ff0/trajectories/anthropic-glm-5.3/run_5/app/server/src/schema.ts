export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  handle text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('host','guest')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  category text NOT NULL,
  city text NOT NULL,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  category text NOT NULL,
  city text NOT NULL,
  time_zone text NOT NULL DEFAULT 'UTC',
  cover_seed text NOT NULL,
  theme_hex text NOT NULL,
  description text NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 500),
  approval_required boolean NOT NULL DEFAULT false,
  waitlist_enabled boolean NOT NULL DEFAULT false,
  state text NOT NULL CHECK (state IN ('draft','published','registration_closed','cancelled')),
  published_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending_approval','confirmed','waitlisted','declined','cancelled_by_guest','cancelled_by_host','checked_in')),
  waitlist_position integer,
  ticket_code text UNIQUE,
  checked_in_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT one_seat_per_account UNIQUE (event_id, account_id),
  CONSTRAINT ticket_status_link CHECK (
    (status IN ('confirmed','checked_in') AND ticket_code IS NOT NULL)
    OR (status NOT IN ('confirmed','checked_in') AND ticket_code IS NULL)
  ),
  CONSTRAINT waitlist_position_shape CHECK (
    (status = 'waitlisted' AND waitlist_position >= 1)
    OR (status <> 'waitlisted' AND waitlist_position IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS registrations_event_status_idx ON registrations (event_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS registrations_ticket_code_idx ON registrations (ticket_code);
CREATE UNIQUE INDEX IF NOT EXISTS registrations_no_gap_left ON registrations (event_id, waitlist_position) WHERE status = 'waitlisted';
CREATE INDEX IF NOT EXISTS events_state_starts_idx ON events (state, starts_at, slug);

CREATE TABLE IF NOT EXISTS email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid REFERENCES registrations(id) ON DELETE SET NULL,
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  recipient text NOT NULL,
  subject text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

-- The database, not the application, refuses an eleventh confirmed guest.
CREATE OR REPLACE FUNCTION registrations_seat_guard() RETURNS trigger AS $$
DECLARE
  taken integer;
  cap integer;
BEGIN
  SELECT capacity INTO cap FROM events WHERE id = NEW.event_id;
  SELECT count(*) INTO taken
    FROM registrations
   WHERE event_id = NEW.event_id
     AND status IN ('confirmed','checked_in')
     AND (TG_OP = 'INSERT' OR id <> NEW.id);
  IF taken >= cap THEN
    RAISE EXCEPTION 'EVENT_FULL: capacity reached'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS registrations_seat_guard_trg ON registrations;
CREATE TRIGGER registrations_seat_guard_trg
BEFORE INSERT OR UPDATE OF status, event_id ON registrations
FOR EACH ROW WHEN (NEW.status IN ('confirmed','checked_in'))
EXECUTE FUNCTION registrations_seat_guard();

CREATE TABLE IF NOT EXISTS auth_tokens (
  token text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_tokens_account_idx ON auth_tokens (account_id);
`;

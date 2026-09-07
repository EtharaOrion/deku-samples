import pg from 'pg';
import { env, log } from './env.js';

pg.types.setTypeParser(1114, (v: string) => v); // timestamp without tz (unused)

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30_000,
});

export type Client = pg.PoolClient;

export async function query<T extends pg.QueryResultRow = any>(text: string, params: any[] = []) {
  return pool.query<T>(text, params);
}

export async function withTx<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

const SCHEMA = `
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
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS registrations (
  id                bigserial PRIMARY KEY,
  event_id          bigint NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  account_id        bigint NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status            text NOT NULL CHECK (status IN ('pending_approval','confirmed','waitlisted','declined','cancelled_by_guest','cancelled_by_host','checked_in')),
  waitlist_position integer,
  seat_no           integer,
  ticket_code       text UNIQUE CHECK (ticket_code IS NULL OR ticket_code ~ '^TKT-[A-Z0-9]{8}$'),
  checked_in_at     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT registrations_one_per_account UNIQUE (event_id, account_id),
  CONSTRAINT registrations_seat_matches_status CHECK ((status IN ('confirmed','checked_in')) = (seat_no IS NOT NULL)),
  CONSTRAINT registrations_ticket_matches_status CHECK ((status IN ('confirmed','checked_in')) = (ticket_code IS NOT NULL)),
  CONSTRAINT registrations_waitlist_matches_status CHECK ((status = 'waitlisted') = (waitlist_position IS NOT NULL)),
  CONSTRAINT registrations_seat_positive CHECK (seat_no IS NULL OR seat_no >= 1),
  CONSTRAINT registrations_waitlist_positive CHECK (waitlist_position IS NULL OR waitlist_position >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS registrations_seat_unique ON registrations (event_id, seat_no) WHERE seat_no IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS registrations_waitlist_unique ON registrations (event_id, waitlist_position) WHERE waitlist_position IS NOT NULL;
CREATE INDEX IF NOT EXISTS registrations_event_idx ON registrations (event_id);
CREATE INDEX IF NOT EXISTS registrations_account_idx ON registrations (account_id);
CREATE INDEX IF NOT EXISTS events_discovery_idx ON events (state, starts_at, slug);
CREATE INDEX IF NOT EXISTS events_calendar_idx ON events (calendar_id);

CREATE TABLE IF NOT EXISTS email_log (
  id              bigserial PRIMARY KEY,
  registration_id bigint REFERENCES registrations(id) ON DELETE SET NULL,
  event_id        bigint REFERENCES events(id) ON DELETE SET NULL,
  recipient       text NOT NULL,
  subject         text NOT NULL,
  sent_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id       bigserial PRIMARY KEY,
  bucket   text NOT NULL,
  hit_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_rate_limits_bucket_idx ON auth_rate_limits (bucket, hit_at);

-- Database-level capacity guard: a seat number may never exceed the event capacity.
CREATE OR REPLACE FUNCTION registrations_seat_within_capacity() RETURNS trigger AS $fn$
DECLARE cap integer;
BEGIN
  IF NEW.seat_no IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT capacity INTO cap FROM events WHERE id = NEW.event_id;
  IF cap IS NULL THEN
    RAISE EXCEPTION 'event % has no capacity; seat cannot be granted', NEW.event_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.seat_no > cap THEN
    RAISE EXCEPTION 'seat % exceeds capacity % for event %', NEW.seat_no, cap, NEW.event_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS registrations_seat_capacity_trg ON registrations;
CREATE TRIGGER registrations_seat_capacity_trg
  BEFORE INSERT OR UPDATE OF seat_no, event_id ON registrations
  FOR EACH ROW EXECUTE FUNCTION registrations_seat_within_capacity();

-- Lowering capacity below the seats already handed out is refused by the database too.
CREATE OR REPLACE FUNCTION events_capacity_not_below_seats() RETURNS trigger AS $fn$
DECLARE taken integer;
BEGIN
  IF NEW.capacity IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO taken FROM registrations WHERE event_id = NEW.id AND seat_no IS NOT NULL;
  IF taken > NEW.capacity THEN
    RAISE EXCEPTION 'capacity % is below the % seats already confirmed', NEW.capacity, taken
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_capacity_guard_trg ON events;
CREATE TRIGGER events_capacity_guard_trg
  BEFORE UPDATE OF capacity ON events
  FOR EACH ROW EXECUTE FUNCTION events_capacity_not_below_seats();
`;

export async function migrate() {
  await query(SCHEMA);
  log('info', 'schema ready');
}

export async function waitForDb(attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      await query('SELECT 1');
      return;
    } catch (e) {
      log('warn', 'database not ready, retrying', { attempt: i + 1 });
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('database unreachable');
}

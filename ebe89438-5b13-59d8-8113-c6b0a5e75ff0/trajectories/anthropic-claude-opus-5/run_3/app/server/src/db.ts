import pg from 'pg';
import { log } from './log.js';

const { Pool } = pg;

pg.types.setTypeParser(1114, (v: string) => new Date(v + 'Z').toISOString());
pg.types.setTypeParser(1184, (v: string) => new Date(v).toISOString());

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 12),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => log.error('pg_pool_error', { message: err.message }));

export type Client = pg.PoolClient;

/** The narrow surface a query runner needs: the pool and a client both satisfy it. */
export type Runner = {
  query<T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>>;
};

export async function query<T extends pg.QueryResultRow = any>(text: string, params: any[] = []) {
  return pool.query<T>(text, params);
}

/** Runs fn inside a transaction, retrying on serialization / unique-violation races. */
export async function tx<T>(fn: (c: Client) => Promise<T>, attempts = 6): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (err: any) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* connection already gone */
      }
      lastErr = err;
      const retryable = err?.code === '40001' || err?.code === '40P01' || err?.code === '23505';
      if (!retryable) throw err;
      await new Promise((r) => setTimeout(r, 12 * (i + 1) + Math.random() * 25));
    } finally {
      client.release();
    }
  }
  throw lastErr;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id             BIGSERIAL PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash  TEXT NOT NULL,
  display_name   TEXT NOT NULL,
  handle         TEXT NOT NULL UNIQUE,
  role           TEXT NOT NULL CHECK (role IN ('host','guest')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendars (
  id                BIGSERIAL PRIMARY KEY,
  owner_account_id  BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  slug              TEXT NOT NULL UNIQUE,
  category          TEXT NOT NULL,
  city              TEXT NOT NULL,
  is_public         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS calendars_owner_idx ON calendars(owner_account_id);

CREATE TABLE IF NOT EXISTS events (
  id                 BIGSERIAL PRIMARY KEY,
  calendar_id        BIGINT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  slug               TEXT NOT NULL UNIQUE,
  category           TEXT NOT NULL,
  city               TEXT NOT NULL DEFAULT '',
  time_zone          TEXT NOT NULL DEFAULT 'UTC',
  cover_seed         TEXT NOT NULL,
  theme_hex          TEXT NOT NULL CHECK (theme_hex ~ '^#[0-9a-f]{6}$'),
  description        TEXT NOT NULL DEFAULT '',
  location           TEXT NOT NULL DEFAULT '',
  starts_at          TIMESTAMPTZ,
  ends_at            TIMESTAMPTZ,
  capacity           INTEGER CHECK (capacity IS NULL OR (capacity >= 1 AND capacity <= 500)),
  approval_required  BOOLEAN NOT NULL DEFAULT false,
  waitlist_enabled   BOOLEAN NOT NULL DEFAULT true,
  state              TEXT NOT NULL CHECK (state IN ('draft','published','registration_closed','cancelled')),
  published_at       TIMESTAMPTZ,
  cancelled_at       TIMESTAMPTZ,
  cancel_reason      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_calendar_idx ON events(calendar_id);
CREATE INDEX IF NOT EXISTS events_discovery_idx ON events(state, starts_at, slug);

CREATE TABLE IF NOT EXISTS registrations (
  id                BIGSERIAL PRIMARY KEY,
  event_id          BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  account_id        BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status            TEXT NOT NULL CHECK (status IN
                      ('pending_approval','confirmed','waitlisted','declined',
                       'cancelled_by_guest','cancelled_by_host','checked_in')),
  seat_no           INTEGER CHECK (seat_no IS NULL OR seat_no >= 1),
  waitlist_position INTEGER CHECK (waitlist_position IS NULL OR waitlist_position >= 1),
  ticket_code       TEXT UNIQUE CHECK (ticket_code IS NULL OR ticket_code ~ '^TKT-[A-Z0-9]{8}$'),
  checked_in_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- a seat is held exactly when the status says a seat is held
  CONSTRAINT reg_seat_matches_status CHECK
    ((status IN ('confirmed','checked_in')) = (seat_no IS NOT NULL)),
  -- a ticket code exists exactly when the status is confirmed or checked_in
  CONSTRAINT reg_ticket_matches_status CHECK
    ((status IN ('confirmed','checked_in')) = (ticket_code IS NOT NULL)),
  -- a waitlist position exists exactly when the registration is waitlisted
  CONSTRAINT reg_waitpos_matches_status CHECK
    ((status = 'waitlisted') = (waitlist_position IS NOT NULL)),
  -- at most one registration per event per account, in any status
  CONSTRAINT reg_one_per_event_account UNIQUE (event_id, account_id)
);

-- Two registrations can never hold the same seat on the same event.
CREATE UNIQUE INDEX IF NOT EXISTS reg_event_seat_uniq
  ON registrations(event_id, seat_no) WHERE seat_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS reg_event_status_idx ON registrations(event_id, status);
CREATE INDEX IF NOT EXISTS reg_account_idx ON registrations(account_id);

CREATE TABLE IF NOT EXISTS email_log (
  id               BIGSERIAL PRIMARY KEY,
  registration_id  BIGINT REFERENCES registrations(id) ON DELETE SET NULL,
  event_id         BIGINT REFERENCES events(id) ON DELETE SET NULL,
  recipient        TEXT NOT NULL,
  subject          TEXT NOT NULL,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_log_event_idx ON email_log(event_id);
`;

/**
 * Waiting-list positions are 1..n with no repeats. Deferred so a renumbering
 * pass may pivot rows through each other's positions inside one transaction.
 */
const DEFERRED_WAITLIST_UNIQUE = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reg_event_waitpos_uniq') THEN
    ALTER TABLE registrations
      ADD CONSTRAINT reg_event_waitpos_uniq UNIQUE (event_id, waitlist_position)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;
`;

/**
 * The last seat, enforced by the database itself.
 *
 * Every seated registration holds a distinct seat number in 1..capacity on its
 * event. The unique index above makes two rows holding the same seat
 * impossible; this trigger makes a seat outside 1..capacity impossible. Their
 * conjunction bounds the number of seated rows by capacity no matter how many
 * transactions race, because application-level counting cannot: two requests
 * can both pass a check before either one writes.
 */
const CAPACITY_TRIGGER = `
CREATE OR REPLACE FUNCTION enforce_seat_within_capacity() RETURNS trigger AS $$
DECLARE
  cap INTEGER;
BEGIN
  IF NEW.seat_no IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT capacity INTO cap FROM events WHERE id = NEW.event_id;
  IF cap IS NULL THEN
    RAISE EXCEPTION 'capacity_undefined' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.seat_no > cap THEN
    RAISE EXCEPTION 'capacity_exceeded' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS registrations_seat_capacity ON registrations;
CREATE TRIGGER registrations_seat_capacity
  BEFORE INSERT OR UPDATE OF seat_no, event_id ON registrations
  FOR EACH ROW EXECUTE FUNCTION enforce_seat_within_capacity();

CREATE OR REPLACE FUNCTION enforce_capacity_not_below_seated() RETURNS trigger AS $$
DECLARE
  seated INTEGER;
BEGIN
  IF NEW.capacity IS NOT NULL AND (OLD.capacity IS NULL OR NEW.capacity < OLD.capacity) THEN
    SELECT count(*) INTO seated FROM registrations
      WHERE event_id = NEW.id AND status IN ('confirmed','checked_in');
    IF seated > NEW.capacity THEN
      RAISE EXCEPTION 'capacity_below_confirmed' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_capacity_guard ON events;
CREATE TRIGGER events_capacity_guard
  BEFORE UPDATE OF capacity ON events
  FOR EACH ROW EXECUTE FUNCTION enforce_capacity_not_below_seated();
`;

export async function migrate() {
  await query(SCHEMA);
  await query(DEFERRED_WAITLIST_UNIQUE);
  await query(CAPACITY_TRIGGER);
  log.info('migrations_applied');
}

export async function waitForDb(timeoutMs = 60000) {
  const started = Date.now();
  let lastErr: any;
  while (Date.now() - started < timeoutMs) {
    try {
      await query('SELECT 1');
      return;
    } catch (err: any) {
      lastErr = err;
      log.warn('db_not_ready', { message: err.message });
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}

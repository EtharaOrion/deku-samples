import { Pool, PoolClient } from 'pg';
import { log } from './util.js';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 12),
  application_name: 'community-calendar',
});

pool.on('error', (err) => log('error', 'pg_pool_error', { message: err.message }));

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* connection already gone */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * The seat invariant lives here, not in application logic.
 *
 * `registrations_seat_guard` locks the event row before counting, so two
 * transactions racing for the last seat are serialised by Postgres itself:
 * the second one to arrive sees the first one's committed row and is refused
 * with SQLSTATE 23514. An application check alone cannot do this, because both
 * requests can pass it before either writes.
 */
const SCHEMA = `
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
  city              text NOT NULL,
  time_zone         text NOT NULL DEFAULT 'UTC',
  cover_seed        text NOT NULL,
  theme_hex         text NOT NULL CHECK (theme_hex ~ '^#[0-9a-f]{6}$'),
  description       text NOT NULL DEFAULT '',
  starts_at         timestamptz,
  ends_at           timestamptz,
  capacity          integer CHECK (capacity IS NULL OR (capacity >= 1 AND capacity <= 500)),
  approval_required boolean NOT NULL DEFAULT false,
  waitlist_enabled  boolean NOT NULL DEFAULT true,
  state             text NOT NULL DEFAULT 'draft'
                    CHECK (state IN ('draft','published','registration_closed','cancelled')),
  published_at      timestamptz,
  cancelled_at      timestamptz,
  cancel_reason     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_calendar_idx ON events(calendar_id);
CREATE INDEX IF NOT EXISTS events_discovery_idx ON events(state, starts_at, slug);
CREATE INDEX IF NOT EXISTS events_category_idx ON events(category);
CREATE INDEX IF NOT EXISTS events_city_idx ON events(lower(city));

CREATE TABLE IF NOT EXISTS registrations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  account_id        uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  status            text NOT NULL CHECK (status IN (
                      'pending_approval','confirmed','waitlisted','declined',
                      'cancelled_by_guest','cancelled_by_host','checked_in')),
  waitlist_position integer,
  ticket_code       text UNIQUE,
  checked_in_at     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- at most one registration per event per account, in any status
  CONSTRAINT registrations_one_per_account UNIQUE (event_id, account_id),
  -- a ticket code exists exactly when the status holds a seat
  CONSTRAINT registrations_ticket_iff_seat CHECK (
    (status IN ('confirmed','checked_in') AND ticket_code IS NOT NULL)
    OR (status NOT IN ('confirmed','checked_in') AND ticket_code IS NULL)),
  CONSTRAINT registrations_ticket_shape CHECK (
    ticket_code IS NULL OR ticket_code ~ '^TKT-[A-Z0-9]{8}$'),
  -- a waitlist position exists exactly when waitlisted, and is 1-based
  CONSTRAINT registrations_position_iff_waitlisted CHECK (
    (status = 'waitlisted' AND waitlist_position IS NOT NULL AND waitlist_position >= 1)
    OR (status <> 'waitlisted' AND waitlist_position IS NULL)),
  -- positions are 1..n with no repeats; deferred so a renumbering pass may
  -- shuffle rows inside one transaction without tripping mid-statement
  CONSTRAINT registrations_waitlist_slot UNIQUE (event_id, waitlist_position)
    DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS registrations_event_idx ON registrations(event_id, status);
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

CREATE OR REPLACE FUNCTION registrations_seat_guard() RETURNS trigger AS $$
DECLARE
  seat_cap  integer;
  taken     integer;
BEGIN
  IF NEW.status NOT IN ('confirmed','checked_in') THEN
    RETURN NEW;
  END IF;

  -- Serialise every seat-taking write on this event behind one row lock.
  SELECT capacity INTO seat_cap FROM events WHERE id = NEW.event_id FOR UPDATE;

  IF seat_cap IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO taken
    FROM registrations
   WHERE event_id = NEW.event_id
     AND status IN ('confirmed','checked_in')
     AND id <> NEW.id;

  IF taken + 1 > seat_cap THEN
    RAISE EXCEPTION 'event % is at capacity (% of %)', NEW.event_id, taken, seat_cap
      USING ERRCODE = 'check_violation', CONSTRAINT = 'registrations_capacity';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS registrations_seat_guard_ins ON registrations;
CREATE TRIGGER registrations_seat_guard_ins
  BEFORE INSERT ON registrations
  FOR EACH ROW EXECUTE FUNCTION registrations_seat_guard();

DROP TRIGGER IF EXISTS registrations_seat_guard_upd ON registrations;
CREATE TRIGGER registrations_seat_guard_upd
  BEFORE UPDATE OF status, event_id ON registrations
  FOR EACH ROW
  WHEN (NEW.status IN ('confirmed','checked_in'))
  EXECUTE FUNCTION registrations_seat_guard();
`;

export async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    // gen_random_uuid() is built into Postgres 13+; the extension is only a
    // fallback and the app user may not be allowed to create it.
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    } catch (err) {
      log('info', 'pgcrypto_skipped', { message: (err as Error).message });
    }
    await client.query(SCHEMA);
    log('info', 'migrate_complete');
  } finally {
    client.release();
  }
}

export async function waitForDatabase(attempts = 60): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      log('warn', 'db_wait', { attempt: i, message: (err as Error).message });
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('database unreachable');
}

/** Serialises namespace writes so two slugs cannot be taken at the same instant. */
export async function lockNamespace(client: PoolClient, name: string) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`ns:${name}`]);
}

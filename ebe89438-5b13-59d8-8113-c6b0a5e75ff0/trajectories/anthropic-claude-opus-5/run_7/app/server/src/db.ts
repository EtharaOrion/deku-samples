import pg from 'pg';
import { env, log } from './env.js';

const { Pool } = pg;

// node-postgres hands int8 back as a string to protect precision. Every
// identifier here is a bigserial well inside Number's safe range, and reading
// them as numbers keeps ownership comparisons (id === owner_account_id) honest.
pg.types.setTypeParser(20, (v: string) => parseInt(v, 10));

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 12,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => log('error', 'pg pool error', { err: String(err) }));

export type Db = pg.PoolClient | pg.Pool;

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
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
      /* connection already gone */
    }
    throw e;
  } finally {
    client.release();
  }
}

/**
 * The seat invariant lives here, in the schema, not in application code.
 *
 * `registrations.seat_no` is non-null exactly for the statuses that hold a
 * seat. It is bounded by the owning event's capacity through a composite
 * foreign key onto `events (id, capacity)` carrying a CHECK, and it is unique
 * per event. Two concurrent registrations therefore cannot both end up holding
 * the same seat, and no event can ever hold more seated registrations than its
 * capacity, whatever the application layer believes.
 */
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
  CONSTRAINT events_id_capacity_key UNIQUE (id, capacity)
);
CREATE INDEX IF NOT EXISTS events_calendar_idx ON events(calendar_id);
CREATE INDEX IF NOT EXISTS events_discovery_idx ON events(state, starts_at, slug);

CREATE TABLE IF NOT EXISTS registrations (
  id                bigserial PRIMARY KEY,
  event_id          bigint NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  account_id        bigint NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status            text NOT NULL CHECK (status IN
                      ('pending_approval','confirmed','waitlisted','declined',
                       'cancelled_by_guest','cancelled_by_host','checked_in')),
  waitlist_position integer,
  ticket_code       text UNIQUE CHECK (ticket_code IS NULL OR ticket_code ~ '^TKT-[A-Z0-9]{8}$'),
  checked_in_at     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- seat bookkeeping: the columns that carry the capacity invariant
  seat_no           integer,
  event_capacity    integer,
  CONSTRAINT registrations_event_account_key UNIQUE (event_id, account_id),
  CONSTRAINT registrations_seat_matches_status CHECK (
    (status IN ('confirmed','checked_in') AND seat_no IS NOT NULL)
    OR (status NOT IN ('confirmed','checked_in') AND seat_no IS NULL)
  ),
  CONSTRAINT registrations_ticket_matches_status CHECK (
    (status IN ('confirmed','checked_in') AND ticket_code IS NOT NULL)
    OR (status NOT IN ('confirmed','checked_in') AND ticket_code IS NULL)
  ),
  CONSTRAINT registrations_waitlist_matches_status CHECK (
    (status = 'waitlisted' AND waitlist_position IS NOT NULL AND waitlist_position >= 1)
    OR (status <> 'waitlisted' AND waitlist_position IS NULL)
  ),
  CONSTRAINT registrations_seat_within_capacity CHECK (
    seat_no IS NULL OR (seat_no >= 1 AND event_capacity IS NOT NULL AND seat_no <= event_capacity)
  ),
  CONSTRAINT registrations_capacity_fk FOREIGN KEY (event_id, event_capacity)
    REFERENCES events(id, capacity) ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS registrations_seat_unique
  ON registrations(event_id, seat_no) WHERE seat_no IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS registrations_waitlist_unique
  ON registrations(event_id, waitlist_position) WHERE waitlist_position IS NOT NULL;
CREATE INDEX IF NOT EXISTS registrations_account_idx ON registrations(account_id);
CREATE INDEX IF NOT EXISTS registrations_event_status_idx ON registrations(event_id, status);

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

export async function migrate(): Promise<void> {
  await pool.query(SCHEMA);
  log('info', 'schema ready');
}

export async function waitForDb(attempts = 60): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (e) {
      log('warn', 'database not ready, retrying', { attempt: i });
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('database never became reachable');
}

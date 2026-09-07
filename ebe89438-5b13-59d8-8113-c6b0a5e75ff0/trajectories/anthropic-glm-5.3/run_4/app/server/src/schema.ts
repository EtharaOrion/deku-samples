import type { Pool } from 'pg';
import { query } from './db.js';
import { log } from './util.js';

const SCHEMA = `
create table if not exists accounts (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  display_name text not null,
  handle text not null unique,
  role text not null check (role in ('host','guest')),
  created_at timestamptz not null default now()
);

create table if not exists calendars (
  id text primary key,
  owner_account_id text not null references accounts(id),
  name text not null,
  slug text not null unique,
  category text not null,
  city text not null,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id text primary key,
  calendar_id text not null references calendars(id),
  title text not null,
  slug text not null unique,
  category text not null,
  city text not null,
  time_zone text not null default 'UTC',
  cover_seed text not null,
  theme_hex text not null,
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null check (capacity between 1 and 500),
  approval_required boolean not null default false,
  waitlist_enabled boolean not null default false,
  state text not null check (state in ('draft','published','registration_closed','cancelled')),
  published_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists registrations (
  id text primary key,
  event_id text not null references events(id),
  account_id text not null references accounts(id),
  status text not null check (status in
    ('pending_approval','confirmed','waitlisted','declined',
     'cancelled_by_guest','cancelled_by_host','checked_in')),
  waitlist_position integer,
  ticket_code text unique,
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists email_log (
  id bigserial primary key,
  registration_id text,
  event_id text not null,
  recipient text not null,
  subject text not null,
  sent_at timestamptz not null default now()
);

create unique index if not exists registrations_one_per_account
  on registrations (event_id, account_id);

-- The database-level guarantee that seats are bounded by capacity. Any insert
-- or update that would push the holding statuses past capacity fails here,
-- whatever the application logic does.
create or replace function enforce_event_capacity() returns trigger as $$
declare
  held integer;
  cap integer;
begin
  select capacity into cap from events where id = new.event_id;
  select count(*) into held from registrations
    where event_id = new.event_id
      and status in ('confirmed','checked_in')
      and id <> new.id;
  if held + 1 > cap then
    raise exception 'EVENT_FULL:%', cap using errcode = 'check_violation';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists registrations_capacity_gate on registrations;
create trigger registrations_capacity_gate
  before insert or update of status, event_id on registrations
  for each row
  when (new.status in ('confirmed','checked_in'))
  execute function enforce_event_capacity();

-- A ticket code exists exactly when the registration holds a seat.
create or replace function enforce_ticket_status() returns trigger as $$
begin
  if new.status in ('confirmed','checked_in') then
    if new.ticket_code is null then
      raise exception 'TICKET_REQUIRED' using errcode = 'check_violation';
    end if;
  else
    if new.ticket_code is not null then
      raise exception 'TICKET_FORBIDDEN' using errcode = 'check_violation';
    end if;
    if new.status <> 'waitlisted' and new.waitlist_position is not null then
      raise exception 'POSITION_FORBIDDEN' using errcode = 'check_violation';
    end if;
  end if;
  if new.status = 'waitlisted' and new.waitlist_position is null then
    raise exception 'POSITION_REQUIRED' using errcode = 'check_violation';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists registrations_ticket_gate on registrations;
create trigger registrations_ticket_gate
  before insert or update of status, ticket_code, waitlist_position on registrations
  for each row execute function enforce_ticket_status();

-- Waitlist positions are unique per event.
create unique index if not exists registrations_waitlist_pos_idx
  on registrations (event_id, waitlist_position)
  where status = 'waitlisted';

create index if not exists registrations_event_status on registrations (event_id, status);
create index if not exists events_state_starts on events (state, starts_at);
create index if not exists events_category on events (category);

-- Bearer tokens are session state, kept outside the five-table data contract.
create table if not exists auth_tokens (
  token text primary key,
  account_id text not null references accounts(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists auth_tokens_account on auth_tokens (account_id);
`;

export async function migrate(pool: Pool): Promise<void> {
  await query(pool, SCHEMA);
  log({ level: 'info', msg: 'schema ready' });
}

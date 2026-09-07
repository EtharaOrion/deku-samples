-- Community Calendar schema. Applied idempotently at startup.
create table if not exists accounts (
  id bigserial primary key,
  email text not null unique,
  password_hash text not null,
  display_name text not null,
  handle text not null unique,
  role text not null check (role in ('host','guest')),
  created_at timestamptz not null default now()
);
create unique index if not exists accounts_email_lc on accounts (lower(email));
create unique index if not exists accounts_handle_lc on accounts (lower(handle));

create table if not exists calendars (
  id bigserial primary key,
  owner_account_id bigint not null references accounts(id) on delete cascade,
  name text not null,
  slug text not null unique,
  category text not null,
  city text not null,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists calendars_slug_lc on calendars (lower(slug));

create table if not exists events (
  id bigserial primary key,
  calendar_id bigint not null references calendars(id) on delete cascade,
  title text not null,
  slug text not null unique,
  category text not null,
  city text not null,
  time_zone text not null default 'UTC',
  cover_seed text not null default '',
  theme_hex text not null default '#146aeb',
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null check (capacity between 1 and 500),
  approval_required boolean not null default false,
  waitlist_enabled boolean not null default false,
  state text not null default 'draft' check (state in ('draft','published','registration_closed','cancelled')),
  published_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists events_slug_lc on events (lower(slug));
create index if not exists events_state_starts on events (state, starts_at, slug);

create table if not exists registrations (
  id bigserial primary key,
  event_id bigint not null references events(id) on delete cascade,
  account_id bigint not null references accounts(id) on delete cascade,
  status text not null check (status in ('pending_approval','confirmed','waitlisted','declined','cancelled_by_guest','cancelled_by_host','checked_in')),
  waitlist_position integer,
  ticket_code text unique,
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint one_registration_per_event unique (event_id, account_id),
  constraint waitlist_position_only_when_waitlisted
    check ((status = 'waitlisted' and waitlist_position >= 1) or (status <> 'waitlisted' and waitlist_position is null)),
  constraint ticket_when_seat_held check (
    (status in ('confirmed','checked_in') and ticket_code is not null)
    or (status not in ('confirmed','checked_in') and ticket_code is null)
  )
);
create index if not exists registrations_event_status on registrations (event_id, status);
create index if not exists registrations_account on registrations (account_id);

-- Hard ceiling on seats: an event can never hold more confirmed/checked_in rows
-- than its capacity. Enforced by the database itself, so it holds even if two
-- writers race past an application-level check. Writers additionally serialise
-- on the event row (`select ... for update`), which makes the count in this
-- trigger see the other transaction's committed row before it decides.
create or replace function cc_check_seats() returns trigger as $$
declare
  held int;
  cap int;
begin
  select capacity into cap from events where id = NEW.event_id;
  select count(*) into held
    from registrations
   where event_id = NEW.event_id
     and status in ('confirmed','checked_in')
     and (TG_OP <> 'UPDATE' or id <> NEW.id);
  if held + 1 > cap then
    raise exception 'SEAT_LIMIT event_id=% capacity=% held=%', NEW.event_id, cap, held
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists seats_within_capacity on registrations;
create trigger seats_within_capacity
  before insert or update of status, event_id on registrations
  for each row
  when (NEW.status in ('confirmed','checked_in'))
  execute function cc_check_seats();

-- Waiting-list positions are 1..n with no gaps and no repeats.
create or replace function cc_check_waitlist_position() returns trigger as $$
declare
  taken int;
begin
  if NEW.status = 'waitlisted' then
    select count(*) into taken from registrations
     where event_id = NEW.event_id and status = 'waitlisted'
       and (TG_OP <> 'UPDATE' or id <> NEW.id)
       and waitlist_position = NEW.waitlist_position;
    if taken > 0 then
      raise exception 'WAITLIST_TAKEN event_id=% position=%', NEW.event_id, NEW.waitlist_position
        using errcode = 'check_violation';
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists waitlist_position_unique on registrations;
create trigger waitlist_position_unique
  before insert or update of status, waitlist_position, event_id on registrations
  for each row
  when (NEW.status = 'waitlisted')
  execute function cc_check_waitlist_position();

create table if not exists email_log (
  id bigserial primary key,
  registration_id bigint references registrations(id) on delete set null,
  event_id bigint references events(id) on delete set null,
  recipient text not null,
  subject text not null,
  sent_at timestamptz not null default now()
);
create index if not exists email_log_event on email_log (event_id);

# Deku — Community Calendar Hosting

A hosting tool for small public gatherings. A host keeps a calendar, publishes an
event at its own short address, and collects guests. A guest browses, opens an
event and registers, which reserves a seat and issues a ticket.

The app is a single-page Angular client over a Hono JSON API on the same origin,
backed by PostgreSQL and sending real mail over SMTP to Mailpit.

## Signing in

Every seeded account uses the same password. It is benchmark fixture data, not a
secret.

Role: host
Email: host@example.com
Password: deku-demo-pw-2026

Role: host
Email: host2@example.com
Password: deku-demo-pw-2026

Role: guest
Email: guest@example.com
Password: deku-demo-pw-2026

Role: guest
Email: guest2@example.com
Password: deku-demo-pw-2026

Role: guest
Email: guest3@example.com
Password: deku-demo-pw-2026

The same accounts, side by side:

| Role | Email | Password | Name | Handle |
|---|---|---|---|---|
| host | host@example.com | deku-demo-pw-2026 | Priya Raman | priya-raman |
| host | host2@example.com | deku-demo-pw-2026 | Marcus Bell | marcus-bell |
| guest | guest@example.com | deku-demo-pw-2026 | Amina Osei | amina-osei |
| guest | guest2@example.com | deku-demo-pw-2026 | Tomas Vidal | tomas-vidal |
| guest | guest3@example.com | deku-demo-pw-2026 | Ines Duarte | ines-duarte |

Signup at `/signup` is open to anyone and always creates a `guest`. Host accounts
are seeded only.

## Where to look first

| What | Where |
|---|---|
| The landing wall | `/` |
| Discovery, filters in the address | `/discover?category=running&city=Berlin` |
| An event with one seat free | `/thursday-night-5k` |
| The last seat under contention | `/riverside-track-session` (capacity 2, one seat taken) |
| An event that needs approval | `/sunrise-long-run` |
| Registration already closed | `/riverside-winter-time-trial` |
| An event called off, with its reason | `/autumn-book-swap` |
| A draft, visible to `host@example.com` alone | `/harbour-loop-recovery-jog` |
| A calendar | `/riverside-run-club` |
| A profile | `/priya-raman` |
| A category | `/running` |
| The host's dashboard | `/event/thursday-night-5k/manage/overview` |
| The guest list, the queue and the door | `/event/sunrise-long-run/manage/guests` |
| Capacity and approval | `/event/thursday-night-5k/manage/registration` |

## The last seat

`riverside-track-session` has a capacity of `2` with one seat already taken. Sign
in as two different guests in two browsers, open that address in both, and press
register at the same instant: one is handed a ticket code and the other a
waiting-list place. The count of seats stored never reaches three.

The invariant is held by the database, not by the application. Every seat
decision takes `SELECT ... FOR UPDATE` on the event row, and a trigger on
`registrations` re-counts the seats actually stored before allowing the write, so
two requests that both pass an application check cannot both commit. A refused
attempt leaves no row behind.

## Mail

Every registration outcome is sent over ordinary SMTP from the request that
causes the transition, to that guest alone, with no cc and no bcc. Sends are
recorded in `email_log` only after the SMTP conversation has returned, so a
missing row is proof the app never sent. Read the mailbox in Mailpit.

## Running it

The image serves the app in the foreground on the container-internal port `4173`,
bound to `0.0.0.0`, and reads every service address from the environment:

- `DATABASE_URL` — the PostgreSQL instance
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — the Mailpit SMTP server
- `APP_PUBLIC_URL`, `APP_PUBLIC_PORT` — how the outside world reaches it
- `PORT` — the container-internal port, defaulting to `4173`

The container applies its own schema and seed at start, idempotently, so
restarting it never duplicates a row.

`GET /api/health` returns `200` once the app is ready.

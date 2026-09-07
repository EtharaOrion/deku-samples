# Deku Events - how to sign in

The app is a single-page Angular front end over a Hono JSON API on the same
origin. It is reachable at `APP_PUBLIC_URL`; the API lives under `/api` and
`GET /api/health` answers `200` once the app is ready.

## Accounts

Every seeded account uses the same password. It is benchmark fixture data, not
a secret.

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

The same accounts, in a table:

| Role | Email | Password | Name | Handle |
|---|---|---|---|---|
| host | host@example.com | deku-demo-pw-2026 | Priya Raman | priya-raman |
| host | host2@example.com | deku-demo-pw-2026 | Marcus Bell | marcus-bell |
| guest | guest@example.com | deku-demo-pw-2026 | Amina Osei | amina-osei |
| guest | guest2@example.com | deku-demo-pw-2026 | Tomas Vidal | tomas-vidal |
| guest | guest3@example.com | deku-demo-pw-2026 | Ines Duarte | ines-duarte |

Signing up at `/signup` is open to anyone and always creates a `guest`. Host
accounts are seeded only.

## Where to look first

| Address | What is there |
|---|---|
| `/` | The landing wall and the twelve categories |
| `/discover` | Published events; the filters live in the query string |
| `/thursday-night-5k` | A published event with exactly one free seat |
| `/riverside-track-session` | A published event with exactly one free seat |
| `/sunrise-long-run` | Approval is on; `guest3@example.com` is waiting in the queue |
| `/winter-reading-night` | Marcus Bell's event, no registrations |
| `/riverside-winter-time-trial` | Seeded closed, so the closed panel is reachable at once |
| `/autumn-book-swap` | Cancelled, carrying its reason |
| `/harbour-loop-recovery-jog` | A draft: not-found to everyone but its host |

Signed in as a host, each event carries `/event/<slug>/manage/overview`,
`/event/<slug>/manage/guests` and `/event/<slug>/manage/registration`.
A ticket is presentable without an account at `/t/<ticket-code>`.

## The last seat

Seats are numbered rows, not a counter. A registration claims the lowest free
`seat_no` in `1..capacity`, and a unique index on `(event_id, seat_no)` plus a
trigger checking the seat against the event's capacity mean the database itself
refuses a second occupant. When two guests race for the last seat, one insert
wins, the other retries, finds no free seat and takes a waiting-list place, so
the count of `confirmed` and `checked_in` registrations can never exceed
`capacity`. A refused attempt is rolled back and leaves no row.

## Mail

Every transition sends one message per recipient over real SMTP to the Mailpit
server at `SMTP_HOST`:`SMTP_PORT`, synchronously from the request that causes
it. The `email_log` row is written only after the SMTP send returns. Mailpit's
own web interface is the place to read what was sent.

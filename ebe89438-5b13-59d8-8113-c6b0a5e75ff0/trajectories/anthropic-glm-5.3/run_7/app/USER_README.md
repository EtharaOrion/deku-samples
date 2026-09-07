# Community Calendar

A hosting tool for people who run small public gatherings. A host keeps a
calendar, publishes an event at its own short address and collects guests. A
guest browses, registers and holds a ticket.

## Sign-in accounts

Every seeded account uses the same password: `deku-demo-pw-2026`

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

New accounts created through `/signup` are always `guest` accounts, as the
brief requires; host accounts exist only as seed data.

## Where to look

| Address | What it is |
|---|---|
| `/` | Landing wall with drifting posters |
| `/discover` | Published events, filters carried in the address |
| `/running` | A category page (twelve exist) |
| `/thursday-night-5k` | A published event with one seat left |
| `/riverside-track-session` | Capacity 2, one seat left, waiting list on |
| `/sunrise-long-run` | Approval required; a pending request is seeded |
| `/winter-reading-night` | No registrations yet |
| `/riverside-winter-time-trial` | Registration is closed |
| `/harbour-loop-recovery-jog` | A draft; only its host can open it |
| `/autumn-book-swap` | Cancelled, reason shown on the page |
| `/t/<ticket-code>` | One ticket, presentable without an account |

## Seeded host calendars

| Calendar | Owner | Category | City |
|---|---|---|---|
| `riverside-run-club` | host@example.com | running | Berlin |
| `northside-reading-nights` | host2@example.com | books | Lisbon (private) |

## Running it

The container serves the app and the JSON API on one origin, port 4173,
bound to `0.0.0.0`. It reads `DATABASE_URL`, `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASS` and `APP_PUBLIC_URL` from the environment, applies
its schema and seeds on boot, and answers `GET /api/health` once ready.

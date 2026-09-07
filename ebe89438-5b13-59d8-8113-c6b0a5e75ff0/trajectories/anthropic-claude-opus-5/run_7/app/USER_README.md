# Deku Events

A hosting tool for small public gatherings. A **host** keeps a calendar,
publishes an event at its own short address, and collects guests. A **guest**
browses by category or city, opens an event, and registers, which reserves a
seat and issues a ticket.

The app is served at `APP_PUBLIC_URL` on the container-internal port `4173`.
The JSON API lives on the same origin under `/api`, and
`GET /api/health` answers `200` once the app is ready.

---

## Sign in

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

The same accounts, side by side:

| Role | Email | Password | Name | Handle |
|---|---|---|---|---|
| host | host@example.com | deku-demo-pw-2026 | Priya Raman | `priya-raman` |
| host | host2@example.com | deku-demo-pw-2026 | Marcus Bell | `marcus-bell` |
| guest | guest@example.com | deku-demo-pw-2026 | Amina Osei | `amina-osei` |
| guest | guest2@example.com | deku-demo-pw-2026 | Tomas Vidal | `tomas-vidal` |
| guest | guest3@example.com | deku-demo-pw-2026 | Ines Duarte | `ines-duarte` |

Signup at `/signup` is open and always creates a `guest`. Host accounts are
seeded only.

---

## The five journeys

1. **Register for an event.** Sign in as `guest@example.com`, open
   `/thursday-night-5k` and press **Register**. The panel answers with a
   `TKT-XXXXXXXX` code and a real confirmation email arrives at that address.
2. **The last seat under contention.** `/riverside-track-session` has capacity
   `2` with one seat already taken. Two guests registering at the same instant
   produce exactly one `confirmed` registration and one waiting-list place —
   never two seats.
3. **Work the approval queue.** As `host@example.com`, open
   `/event/sunrise-long-run/manage/guests`. That event has approval switched
   on, so the seeded request from Ines Duarte sits in the queue. **Approve**
   flips the row to confirmed and mails the guest.
4. **Cancelling passes the seat on.** A confirmed guest cancels from `/home`;
   the head of that event's waiting list is confirmed in the same request,
   issued a ticket, and emailed.
5. **Call an event off.** As `host2@example.com`, open
   `/event/winter-reading-night/manage/registration` and use **Cancel Event**.
   The reason must be typed before the action unlocks, and every guest still
   holding a place is emailed that reason word for word.

## Where to look

| Route | What it is | Who |
|---|---|---|
| `/` | Landing wall and categories | anyone |
| `/discover` | Published events; all filters live in the query string | anyone |
| `/running`, `/books`, … | One of the twelve categories | anyone |
| `/<slug>` | An event, a calendar or an account handle | anyone |
| `/t/<ticket-code>` | One ticket, readable without an account | anyone |
| `/home` | The guest's own registrations | signed in |
| `/calendars` | Calendars owned | host |
| `/create` | The event composer | host |
| `/event/<slug>/manage/overview` | Dashboard | owning host |
| `/event/<slug>/manage/guests` | Guest list, approval queue and the door | owning host |
| `/event/<slug>/manage/registration` | Capacity, approval, open/closed | owning host |
| `/settings/profile` | Name and handle | signed in |

## Seeded data

Two calendars: **Riverside Run Club** (`/riverside-run-club`, Priya, Berlin,
public) and **Northside Reading Nights** (`/northside-reading-nights`, Marcus,
Lisbon, unlisted).

| Event | Address | Capacity | State | Notes |
|---|---|---|---|---|
| Thursday Night 5K | `/thursday-night-5k` | 3 | published | two seats taken, one guest waiting: one seat free |
| Riverside Track Session | `/riverside-track-session` | 2 | published | one seat taken: one seat free, for the race |
| Sunrise Long Run | `/sunrise-long-run` | 20 | published | approval required, one request pending |
| Harbour Loop Recovery Jog | `/harbour-loop-recovery-jog` | 12 | draft | not found to anyone but Priya |
| Winter Reading Night | `/winter-reading-night` | 12 | published | no registrations |
| Autumn Book Swap | `/autumn-book-swap` | 20 | cancelled | reason: *The venue lost its lease.* |
| Riverside Winter Time Trial | `/riverside-winter-time-trial` | 8 | registration_closed | the closed panel, reachable on the first run |

Seeding is idempotent: restarting the app never duplicates a row.

## Email

Mail is sent over ordinary SMTP to the Mailpit instance at `SMTP_HOST` and
`SMTP_PORT`, synchronously from the request that causes the transition, to that
guest alone with no cc and no bcc. Read the messages in the Mailpit web
interface. Each transition owns one subject:

| Transition | Subject |
|---|---|
| Registration confirmed outright | `You're going to <title>` |
| Registration awaiting the host | `Your request to join <title>` |
| Host approves a pending request | `You're in: <title>` |
| Host declines a pending request | `About your request to join <title>` |
| Registration takes a waiting-list place | `You're on the waiting list for <title>` |
| Waiting-list place becomes a seat | `A spot opened up for <title>` |
| Host calls the event off | `<title> has been cancelled` |

A guest cancelling their own registration sends no mail.

## How the last seat is protected

The seat count is not a number the application keeps. Each seated registration
holds a `seat_no` bounded by its event's capacity through a composite foreign
key onto `events (id, capacity)` carrying a `CHECK`, and unique per event
through a partial index. Two requests that both believe a seat is free cannot
both write it: PostgreSQL refuses the second, and the transaction rolls back
leaving no row, no held seat and no ticket. Lowering capacity below the seats
already held is refused by the same constraint.

## Notes for a reviewer

- **Stack.** Angular (production builder, served as static output) in front of
  Hono on Node 20, PostgreSQL at `DATABASE_URL`, Mailpit at `SMTP_HOST`.
  Every address is read from the environment; none is hardcoded.
- **Theme.** Each event's palette is derived on the server from its
  `theme_hex` and written into the first document, so an event page arrives
  already wearing its colours rather than painting grey and repainting.
- **Zero image assets.** Every cover, avatar, category glyph, brand mark and
  scan code is drawn from geometry in code. The two typefaces, Inter and
  Source Serif 4, are self-hosted under the SIL Open Font License 1.1, with
  their licences beside the files; nothing is fetched at run time.
- **Rate limits.** Login and registration accept ten requests per minute per
  account; over that the request is refused as a client error stating the
  limit.

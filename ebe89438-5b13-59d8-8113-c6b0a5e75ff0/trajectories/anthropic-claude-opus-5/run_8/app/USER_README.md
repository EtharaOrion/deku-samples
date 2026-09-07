# Deku — Community Calendar Hosting

A hosting tool for small public gatherings. A **host** keeps a calendar and
publishes events at their own short addresses; a **guest** browses, opens an
event and registers, which reserves a seat and issues a ticket code.

The app is served at `APP_PUBLIC_URL`. The JSON API lives on that same origin
under `/api`, and `GET /api/health` answers `200` once the app is ready.

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

Signing up at `/signup` is open to anyone and always creates a **guest**
account. Host accounts are seeded only.

---

## Seeded data

Two calendars: **Riverside Run Club** (`/riverside-run-club`, owned by
`host@example.com`, public) and **Northside Reading Nights**
(`/northside-reading-nights`, owned by `host2@example.com`, not public).

| Event | Address | Capacity | State | Notes |
|---|---|---|---|---|
| Thursday Night 5K | `/thursday-night-5k` | 3 | published | 2 confirmed, 1 waiting — **one free seat** |
| Riverside Track Session | `/riverside-track-session` | 2 | published | 1 confirmed — **one free seat** |
| Sunrise Long Run | `/sunrise-long-run` | 20 | published | approval required, 1 request in the queue |
| Harbour Loop Recovery Jog | `/harbour-loop-recovery-jog` | 12 | draft | not-found to everyone but its host |
| Winter Reading Night | `/winter-reading-night` | 12 | published | no registrations |
| Autumn Book Swap | `/autumn-book-swap` | 20 | cancelled | reason: *The venue lost its lease.* |
| Riverside Winter Time Trial | `/riverside-winter-time-trial` | 8 | registration_closed | the closed panel, from the first run |

Seeding is idempotent: restarting the app does not duplicate a row.

---

## The five journeys

1. **Register and get a ticket.** Sign in as `guest@example.com`, open
   `/thursday-night-5k`, press **Register**. The panel flips to *You're Going*
   and shows a `TKT-XXXXXXXX` code; a real confirmation email arrives at that
   address over SMTP with the subject `You're going to Thursday Night 5K`.

2. **The last seat, twice at once.** `/riverside-track-session` has capacity 2
   and one confirmed guest, so exactly one seat is free. Two guests registering
   at the same instant produce exactly one `confirmed` and one `waitlisted`
   registration — never two seats. The guarantee is a property of the database
   (a unique index on the seat number plus a capacity trigger), not of the
   request handler.

3. **Work the queue.** Sign in as `host@example.com`, open
   `/event/sunrise-long-run/manage/guests`, press **Approve** on the pending
   row. It flips to *Confirmed* with a ticket, and the guest is mailed
   `You're in: Sunrise Long Run`.

4. **Cancel and promote.** A confirmed guest cancels from `/home`. The seat is
   freed in that same request, the head of that waiting list becomes confirmed
   with its own ticket, and only the promoted guest is mailed
   (`A spot opened up for …`). A guest cancelling their own place is sent
   nothing.

5. **Call an event off.** Sign in as `host2@example.com`, open
   `/event/winter-reading-night/manage/overview` and press **Cancel Event**.
   The action stays disabled until a reason is typed. Every guest still holding
   a place is mailed that reason word for word, and the public page keeps its
   address and shows the notice instead of the registration panel.

---

## What is where

| Route | Purpose | Who |
|---|---|---|
| `/` | Landing wall and categories | anyone |
| `/discover` | Published events, filters in the query string | anyone |
| `/<category>` | One of the twelve categories | anyone |
| `/<slug>` | An event, a calendar or a profile | anyone |
| `/login`, `/signup` | Sign in, new guest account | anyone |
| `/app` | Get-the-app page with a drawn scan code | anyone |
| `/t/<ticket-code>` | One ticket, no account needed | anyone with the code |
| `/home` | The guest's registrations | signed in |
| `/settings/profile` | Name and handle | signed in |
| `/calendars` | Calendars owned | host |
| `/create` | The event composer | host |
| `/event/<slug>/manage/overview` | Dashboard | the owning host |
| `/event/<slug>/manage/guests` | Guest list, queue and door | the owning host |
| `/event/<slug>/manage/registration` | Capacity and approval | the owning host |

A guest at `/calendars` or a manage route gets the ordinary not-found page, as
does anyone reading a draft event who does not host it — the wording never
differs, because wording that differed would confirm a private record exists.

---

## Mail

Every transition mails the guest alone, over real SMTP, from the request that
caused it. Subjects are exact:

| Transition | Subject |
|---|---|
| Confirmed outright | `You're going to <title>` |
| Awaiting the host | `Your request to join <title>` |
| Host approves | `You're in: <title>` |
| Host declines | `About your request to join <title>` |
| Takes a waiting-list place | `You're on the waiting list for <title>` |
| Waiting list becomes a seat | `A spot opened up for <title>` |
| Host calls the event off | `<title> has been cancelled` |

Sent mail is visible in Mailpit's own web interface.

---

## Running it

The image starts from the environment with no manual steps. It reads
`DATABASE_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and
`APP_PUBLIC_URL` from the environment at container start, applies its schema
and seed, and serves the production Angular build together with the JSON API
from one Node process on container-internal port `4173`, bound to `0.0.0.0`.

```
docker build -t deku /app
docker run --rm -p ${APP_PUBLIC_PORT}:4173 \
  -e DATABASE_URL -e SMTP_HOST -e SMTP_PORT -e SMTP_USER -e SMTP_PASS \
  -e APP_PUBLIC_URL deku
```

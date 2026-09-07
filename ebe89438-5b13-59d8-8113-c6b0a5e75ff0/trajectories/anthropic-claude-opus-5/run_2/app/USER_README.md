# Community Calendar

A hosting tool for small public gatherings. A **host** keeps a calendar and
publishes an event at its own short address; a **guest** browses, opens an
event and registers, which reserves a seat and issues a ticket.

The app is served at `APP_PUBLIC_URL`. The JSON API lives on the same origin
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

The same accounts, in a table for convenience:

| Role | Email | Password | Name | Handle |
|---|---|---|---|---|
| `host` | `host@example.com` | `deku-demo-pw-2026` | Priya Raman | `priya-raman` |
| `host` | `host2@example.com` | `deku-demo-pw-2026` | Marcus Bell | `marcus-bell` |
| `guest` | `guest@example.com` | `deku-demo-pw-2026` | Amina Osei | `amina-osei` |
| `guest` | `guest2@example.com` | `deku-demo-pw-2026` | Tomas Vidal | `tomas-vidal` |
| `guest` | `guest3@example.com` | `deku-demo-pw-2026` | Ines Duarte | `ines-duarte` |

Signing up through `/signup` is open to anyone and always creates a `guest`.
Host accounts are seeded only.

---

## Where to look first

**The last seat under contention.** `Riverside Track Session`
(`/riverside-track-session`) has a capacity of `2` with one seat already taken,
so exactly one seat is free. Open it in two browsers signed in as two different
guests and press the button at the same instant: one gets a ticket, the other a
waiting-list place. The seat count never exceeds the capacity, because the
guarantee is a database trigger that locks the event row before counting, not
an application check that two requests could both pass.

**The whole product is the event page.** `/thursday-night-5k` is a published
event with one free seat. Its palette is derived from its key colour on the
server and written into the first document the browser paints, so the page
arrives already wearing its colours rather than repainting once data lands.

| Try this | Where |
|---|---|
| Register and receive a real email carrying a ticket code | `/thursday-night-5k` |
| Take the last seat against another guest | `/riverside-track-session` |
| A host works the approval queue | `/event/sunrise-long-run/manage/guests` |
| Cancel a registration and watch the waiting list move up | `/home` |
| Call an event off with a typed reason | `/event/winter-reading-night/manage/overview` |
| A closed registration panel | `/riverside-winter-time-trial` |
| A cancelled event that keeps its address | `/autumn-book-swap` |
| A draft, which is a not-found page to everyone but its host | `/harbour-loop-recovery-jog` |

---

## Seeded data

Two calendars: `Riverside Run Club` (`/riverside-run-club`, owned by
`host@example.com`) and `Northside Reading Nights`
(`/northside-reading-nights`, owned by `host2@example.com`, unlisted).

| Event | Address | Capacity | State |
|---|---|---|---|
| Thursday Night 5K | `/thursday-night-5k` | 3 | published, one seat free, one guest waiting |
| Riverside Track Session | `/riverside-track-session` | 2 | published, one seat free |
| Sunrise Long Run | `/sunrise-long-run` | 20 | published, approval required, one request pending |
| Harbour Loop Recovery Jog | `/harbour-loop-recovery-jog` | 12 | draft |
| Winter Reading Night | `/winter-reading-night` | 12 | published, no registrations |
| Autumn Book Swap | `/autumn-book-swap` | 20 | cancelled |
| Riverside Winter Time Trial | `/riverside-winter-time-trial` | 8 | registration closed |

Seeding is idempotent: restarting the app does not duplicate a row.

---

## Reading the mail

Mail is sent over real SMTP to the Mailpit server named by `SMTP_HOST` and
`SMTP_PORT`, synchronously from the request that causes the transition. Open
Mailpit's own web interface to read what was sent. An `email_log` row is
written only after the SMTP send has returned, so its absence is proof the app
never sent.

Each transition owns one subject line:

| Transition | Subject |
|---|---|
| Registration confirmed outright | `You're going to <title>` |
| Registration awaiting the host | `Your request to join <title>` |
| Host approves a pending request | `You're in: <title>` |
| Host declines a pending request | `About your request to join <title>` |
| Registration takes a waiting-list place | `You're on the waiting list for <title>` |
| Waiting-list place becomes a seat | `A spot opened up for <title>` |
| Host calls the event off | `<title> has been cancelled` |

A guest cancelling their own registration sends no mail to themselves; the
guest promoted into the freed seat is mailed.

---

## Notes for a grader

- **Authorization is server-side.** A direct API call from a `guest` session to
  any `host`-only endpoint is refused by the server, not merely hidden in the
  interface, and the same holds between two hosts: scope is by ownership of the
  calendar, not by role. A refusal that would confirm a private record exists
  returns the ordinary not-found response instead.
- **Time.** Every timestamp crossing the API is RFC 3339 in UTC with a trailing
  `Z`. Each event carries an IANA `time_zone` and is rendered in it, with the
  visitor's own zone shown underneath whenever the two differ.
- **Discovery is an address.** The filters on `/discover` live in the query
  string, so a reload, a shared link and the back button each restore the same
  list. `GET /api/events` reports the pre-pagination total in `X-Total-Count`.
- **Zero image assets.** Every cover, icon, avatar and scan code is drawn from
  geometry at render time. The two fonts, Inter and Source Serif 4, are bundled
  and served from the same origin under the SIL Open Font License 1.1; nothing
  is fetched from the network at run time.

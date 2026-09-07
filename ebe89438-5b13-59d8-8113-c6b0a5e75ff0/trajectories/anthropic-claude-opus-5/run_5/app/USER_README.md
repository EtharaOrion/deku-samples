# Deku — Community Calendar Hosting

A hosting tool for small public gatherings. A **host** keeps a calendar,
publishes an event at its own short address, and collects guests. A **guest**
browses by category or city, opens an event, and registers, which reserves a
seat and issues a ticket.

The app is reachable at `APP_PUBLIC_URL`. The container serves both the
application shell and the JSON API on that one origin: the API lives under
`/api`, and `GET /api/health` returns `200` once the app is ready.

---

## Sign-in credentials

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

| Role  | Email               | Name         | Handle       | Password            |
| ----- | ------------------- | ------------ | ------------ | ------------------- |
| host  | host@example.com    | Priya Raman  | priya-raman  | deku-demo-pw-2026   |
| host  | host2@example.com   | Marcus Bell  | marcus-bell  | deku-demo-pw-2026   |
| guest | guest@example.com   | Amina Osei   | amina-osei   | deku-demo-pw-2026   |
| guest | guest2@example.com  | Tomas Vidal  | tomas-vidal  | deku-demo-pw-2026   |
| guest | guest3@example.com  | Ines Duarte  | ines-duarte  | deku-demo-pw-2026   |

Signing up at `/signup` is open and always creates a `guest`. Host accounts are
seeded only.

---

## Where to look first

**The last seat under contention.** `/riverside-track-session` holds two seats
and one is already taken. Open it in two browsers signed in as two different
guests and register at the same instant: one gets a ticket, the other a
waiting-list place, never two seats. The rule is enforced in PostgreSQL by a
trigger that takes the event row lock before counting, so two requests that both
pass an application check cannot both write.

**A confirmed guest cancels.** From `/home`, cancelling a confirmed
registration frees the seat in that same request and promotes waiting-list
position `1` to confirmed with its own ticket code, mailing that guest. The
guest who cancelled is sent nothing.

**The approval queue.** `/sunrise-long-run` has one request waiting. Sign in as
`host@example.com` and open `/event/sunrise-long-run/manage/guests`.

**Registration closed.** `/riverside-winter-time-trial` is seeded in
`registration_closed`, so that state of the public panel is reachable on the
first run without any host changing anything.

**A cancelled event.** `/autumn-book-swap` carries the reason
`The venue lost its lease.`

**A draft.** `/harbour-loop-recovery-jog` is a draft. It returns the not-found
page to everybody but `host@example.com`.

---

## Seeded content

Two calendars: `Riverside Run Club` at `/riverside-run-club`, owned by
`host@example.com`; and `Northside Reading Nights` at
`/northside-reading-nights`, owned by `host2@example.com` and not public.

| Event                        | Address                        | Capacity | State                 |
| ---------------------------- | ------------------------------ | -------- | --------------------- |
| Thursday Night 5K            | `/thursday-night-5k`           | 3        | published             |
| Riverside Track Session      | `/riverside-track-session`     | 2        | published             |
| Sunrise Long Run             | `/sunrise-long-run`            | 20       | published, approval   |
| Harbour Loop Recovery Jog    | `/harbour-loop-recovery-jog`   | 12       | draft                 |
| Winter Reading Night         | `/winter-reading-night`        | 12       | published             |
| Autumn Book Swap             | `/autumn-book-swap`            | 20       | cancelled             |
| Riverside Winter Time Trial  | `/riverside-winter-time-trial` | 8        | registration_closed   |

Seeding is idempotent: restarting the app does not duplicate rows, and does not
disturb registrations taken since.

---

## Mail

Every transition mails the guest it concerns over real SMTP at `SMTP_HOST` and
`SMTP_PORT`, synchronously from the request that caused it. Messages land in
Mailpit, whose own web interface shows them.

| Transition                     | Subject                                |
| ------------------------------ | -------------------------------------- |
| Registration confirmed outright| `You're going to <title>`              |
| Registration awaiting the host | `Your request to join <title>`         |
| Host approves a pending request| `You're in: <title>`                   |
| Host declines a pending request| `About your request to join <title>`   |
| Registration takes a place     | `You're on the waiting list for <title>` |
| Waiting-list place becomes seat| `A spot opened up for <title>`         |
| Host calls the event off       | `<title> has been cancelled`           |

A guest cancelling their own registration sends no mail.

---

## How it is built

- **Frontend:** Angular, TypeScript, built with its production builder and
  served as static output on the container-internal port `4173`.
- **Backend:** Hono on Node 20, TypeScript, REST over JSON under `/api`.
  Registration, approval and check-in are synchronous and transactional.
- **Database:** PostgreSQL at `DATABASE_URL`. The schema and seed are applied by
  the image itself at container start.
- **Email:** Mailpit over ordinary SMTP. No mail vendor, no queue, no batching.
- **Auth:** in-app email and password, bearer tokens, scrypt-hashed passwords.

Every address is read from the environment; no host or port is hardcoded, and
the server binds `0.0.0.0`.

The product ships no image files. Covers, category glyphs, avatars, the brand
mark and the scan codes are all drawn from geometry by the code. The two type
families, Inter and Source Serif 4, are bundled under the SIL Open Font
License 1.1 and their licence texts ship beside them in `/fonts`, so nothing is
fetched from the network at run time.

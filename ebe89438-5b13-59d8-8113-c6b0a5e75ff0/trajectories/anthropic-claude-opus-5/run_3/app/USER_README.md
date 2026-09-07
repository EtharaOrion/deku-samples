# Deku — Community Calendar Hosting

A hosting tool for people who run small public gatherings. A host keeps a
calendar, publishes an event at its own short address, and collects guests. A
guest browses by category or city, opens an event, and registers, which reserves
a seat and issues a ticket.

The app is served at `APP_PUBLIC_URL`. The JSON API lives on the same origin
under `/api`, and `GET /api/health` answers `200` once the app is ready.

---

## Sign in

Every seeded account uses the password `deku-demo-pw-2026`. It is benchmark
fixture data, not a secret. Signing up is open to anyone and always creates a
`guest`; the two `host` accounts below are seeded and cannot be created from the
sign-up form.

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

A sign-in lands on `next` when the address carries one, and otherwise on `/home`
for a guest and `/calendars` for a host.

---

## The five journeys

1. **A guest registers.** Sign in as `guest@example.com`, open
   `/thursday-night-5k` and press Register. The panel answers with the ticket
   code, and the confirmation reaches that inbox over real SMTP.
2. **The last seat under contention.** `/riverside-track-session` has capacity
   `2` and is seeded with one seat taken. Two guests pressing Register at the
   same instant produce exactly one `confirmed` registration and one
   `waitlisted` place — never two seats.
3. **The approval queue.** Sign in as `host@example.com` and open
   `/event/sunrise-long-run/manage/guests`. That event has `approval_required`
   on, so the seeded request from Ines Duarte sits in the queue; Approve flips
   the row to confirmed and mails her a ticket.
4. **A cancel promotes the waiting list.** As `guest@example.com`, cancel the
   Thursday Night 5K registration from `/home`. The head of that waiting list is
   confirmed in the same request, is issued a ticket code, and is mailed.
5. **A host calls an event off.** As `host2@example.com`, open
   `/event/winter-reading-night/manage/overview` and cancel it with a typed
   reason. Every guest still holding a place is mailed that reason word for
   word, and the public page keeps its address while showing the notice instead
   of the registration panel.

## Seeded data worth knowing

- `thursday-night-5k` — capacity `3`, two seats taken and one guest waiting, so
  exactly one seat is free.
- `riverside-track-session` — capacity `2` with one seat taken: the last-seat
  race is reachable immediately.
- `sunrise-long-run` — approval required, with one request already pending.
- `riverside-winter-time-trial` — seeded in `registration_closed`, so the closed
  panel is reachable on the first run without any host changing anything.
- `harbour-loop-recovery-jog` — a `draft`, which answers everyone but its owning
  host exactly as a slug that never existed does.
- `autumn-book-swap` — `cancelled`, carrying the reason `The venue lost its
  lease.`

Seeding is idempotent: restarting the app never duplicates a row.

---

## Where the last seat is actually enforced

The guarantee is in PostgreSQL, not in application logic, because two requests
can both pass an application check before either one writes:

- Every seated registration holds a distinct `seat_no` in `1..capacity`, and a
  partial unique index on `(event_id, seat_no)` makes two rows holding the same
  seat impossible.
- A `BEFORE INSERT OR UPDATE` trigger refuses any `seat_no` above the event's
  capacity.
- Registration runs in one transaction, which picks the lowest free seat and
  writes it. The loser of a race is rejected by the index, rolls back whole —
  leaving no partial row — and is retried, where it now sees the seat taken and
  takes the waiting list instead.
- Table constraints keep the rest honest: a ticket code exists exactly when the
  status is `confirmed` or `checked_in`, a waitlist position exists exactly when
  the status is `waitlisted`, and one account holds at most one registration per
  event in any status.

## Mail

Mail is sent synchronously over real SMTP from the request that causes the
transition, to `SMTP_HOST` and `SMTP_PORT`. A row in `email_log` is written only
after the SMTP send returns, so its absence is proof the app never sent. Each
transition owns one subject line, with the event title substituted for
`<title>`:

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

---

## Running it

The image starts from the environment with no manual steps. It reads every
address from the environment at container start and binds `0.0.0.0` on the
container-internal port `4173`:

- `DATABASE_URL` — PostgreSQL. The schema, its constraints and the idempotent
  seed are applied by the image itself on start.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — Mailpit.
- `APP_PUBLIC_URL` — the address the app is reachable at, used for the links
  inside outgoing mail.

```
docker build -t deku /app
docker run --rm -p "${APP_PUBLIC_PORT}:4173" \
  -e DATABASE_URL -e SMTP_HOST -e SMTP_PORT -e SMTP_USER -e SMTP_PASS \
  -e APP_PUBLIC_URL deku
```

There are no background jobs and no queues: registration, approval and check-in
are synchronous and transactional.

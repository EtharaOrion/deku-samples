# Community Calendar

A hosting tool for small public gatherings. A host keeps a calendar, publishes an
event at its own short address, and collects guests. A guest browses by category
or city, opens an event, and registers, which reserves a seat and issues a
ticket.

The app is served at `APP_PUBLIC_URL`. The JSON API is on the same origin under
`/api`, and `GET /api/health` answers `200` once the schema, the seed and the
listener are all up.

---

## Sign in

Every seeded account uses the password `deku-demo-pw-2026`. It is benchmark
fixture data, not a secret; it is stored hashed, and the literal below works at
`/login`.

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

---

## Where to start

| I want to see | Go to | As |
|---|---|---|
| The landing wall | `/` | anyone |
| Published events, filtered by an address | `/discover?category=running&city=Berlin` | anyone |
| An event page wearing its own key colour | `/thursday-night-5k` | anyone |
| The last seat under contention | `/riverside-track-session` | two guests at once |
| A host approving a request | `/event/sunrise-long-run/manage/guests` | host@example.com |
| The guest list, the queue and the door | `/event/thursday-night-5k/manage/guests` | host@example.com |
| Capacity, approval and closing registration | `/event/thursday-night-5k/manage/registration` | host@example.com |
| A registration that is closed | `/riverside-winter-time-trial` | anyone |
| An event that was called off | `/autumn-book-swap` | anyone |
| Your own registrations | `/home` | any signed-in account |
| A ticket, presentable without an account | `/t/<ticket-code>` | anyone with the code |

## The five journeys

1. **Register.** Open `/thursday-night-5k`, sign in as `guest@example.com`, and
   press Register. The panel shows a ticket code of the shape `TKT-XXXXXXXX`, and
   a real confirmation lands in that inbox with the subject
   `You're going to Thursday Night 5K`.
2. **The last seat.** `/riverside-track-session` is seeded with exactly one free
   seat. Two guests registering at the same instant produce one `confirmed`
   registration and one `waitlisted` place, never two seats. The guard is a
   trigger on the `registrations` table that takes the row lock on the event
   before any seat arithmetic, so it holds for every client of the database, not
   only for this application.
3. **Approve.** `Sunrise Long Run` runs with approval on and has a pending
   request from `guest3@example.com`. As `host@example.com`, approve it at
   `/event/sunrise-long-run/manage/guests` and the row flips to confirmed with a
   ticket, and the guest is mailed `You're in: Sunrise Long Run`.
4. **Cancel and promote.** A confirmed guest cancelling from `/home` frees the
   seat in that same request; waiting-list position 1 becomes confirmed, is
   issued its own code, and is mailed `A spot opened up for <title>`. The guest
   who cancelled is sent nothing.
5. **Call it off.** As `host2@example.com`, cancel `Winter Reading Night` with a
   typed reason. The page keeps its own address and shows the notice instead of
   the panel, and every guest still holding a place is mailed the reason word for
   word.

## Reading the mail

Mail is sent over ordinary SMTP to the Mailpit server at `SMTP_HOST`, from the
request that causes the transition, with no queue and no batching. Open Mailpit
to read what was sent; the `email_log` table records a row only after the send
has returned, so its absence is proof the app never sent.

## Notes a grader may want

- Every timestamp crossing the API is an instant in UTC written as RFC 3339 with
  a trailing `Z`. Each event also carries `time_zone`, and the interface renders
  the event in that zone with the visitor's own zone beneath it whenever the two
  differ.
- `GET /api/events` carries `X-Total-Count` on every response, including an empty
  page, where it reads `0`.
- `GET /api/events/{slug}/registrations.csv` is the guest list as a file named
  after the event, under the header
  `email,display_name,status,waitlist_position,ticket_code`.
- Login and registration accept at most 10 requests a minute per account; over
  that the request is refused as a client error stating the limit.
- A guest, or a host who does not own the calendar, meets the ordinary not-found
  response at any host-only endpoint, so no refusal confirms a record exists.
- The product ships no image files. Every cover, glyph, avatar, brand mark and
  scan code is drawn from geometry at render time.

# Gather — sign-in information

Every seeded account uses the same password: `deku-demo-pw-2026`.
There is no admin account and no other way in: signup always creates a guest.

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

## What each account can reach

- `host@example.com` (Priya Raman) owns the calendar `Riverside Run Club` and
  its events, including `Thursday Night 5K`, `Riverside Track Session`,
  `Sunrise Long Run`, `Harbour Loop Recovery Jog` (a draft) and
  `Riverside Winter Time Trial` (registration closed).
- `host2@example.com` (Marcus Bell) owns `Northside Reading Nights` and its
  events, `Winter Reading Night` and the cancelled `Autumn Book Swap`.
- The three guest accounts hold the seeded registrations:
  `guest@example.com` and `guest2@example.com` are confirmed on
  `Thursday Night 5K`; `guest3@example.com` is first on its waiting list;
  `guest2@example.com` holds the only confirmed seat on
  `Riverside Track Session`; `guest3@example.com` is awaiting approval on
  `Sunrise Long Run`.

A new account created at `/signup` is always a guest account. Host accounts are
seeded only.

## Handy addresses

- `/` — the landing wall
- `/discover` — published events, with filters in the address
- `/thursday-night-5k` — an event at its own short address
- `/riverside-winter-time-trial` — an event whose registration is closed
- `/calendars` — the host's calendars (host only)
- `/home` — the guest's registrations

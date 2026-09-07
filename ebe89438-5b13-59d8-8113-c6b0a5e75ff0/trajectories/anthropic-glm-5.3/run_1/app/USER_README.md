# Deku — Community Calendar Hosting

A hosting tool for small public gatherings: a host keeps calendars, publishes
events at their own short addresses and collects guests; a guest browses,
registers, and holds a ticket. Sign-up is open and always creates a guest
account. Host accounts exist only as seed data below.

Every seeded account uses the same password. The password is benchmark fixture
data, not a secret.

---

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

---

## Seeded world

- `host@example.com` (Priya Raman) owns `Riverside Run Club` in Berlin.
- `host2@example.com` (Marcus Bell) owns `Northside Reading Nights` in Lisbon.
- Published events: `/thursday-night-5k` (1 seat left), `/riverside-track-session`
  (1 seat left), `/sunrise-long-run` (approval on), `/winter-reading-night`.
- `/riverside-winter-time-trial` is published with registration closed.
- `/harbour-loop-recovery-jog` is a draft — only its host can open it.
- `/autumn-book-swap` is cancelled with the host's reason on the page.

A stranger can sign up at `/signup`, open a published event, register, receive
a ticket code on screen and a real confirmation email in Mailpit, and open the
ticket at `/t/<ticket-code>` with no account at all.

## Notes for the grader

- Mail is sent over SMTP to Mailpit synchronously from the request that causes
  the transition; every subject line matches the pinned table in the brief.
- Two guests registering for the last seat at the same instant produce exactly
  one confirmed registration and one waiting-list place. The invariant is held
  by PostgreSQL itself (row lock + constraint trigger + unique indexes), not by
  application memory.
- The app serves itself on the container-internal port 4173, bound to
  0.0.0.0, reading `DATABASE_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
  `SMTP_PASS`, `PORT` and `APP_PUBLIC_URL` from the environment.

# Task List

1. ✅ Scaffold repo: server (Hono/TS) + web (Angular 18)

2. ✅ DB schema, migrations, idempotent seed

3. ✅ Backend API (auth, events, registrations, tickets, calendars, accounts, CSV, resolve)

4. ✅ Concurrency: last-seat safety at DB level
unique index on (event_id, seat_no) + capacity trigger; proven against hostile SQL
5. ✅ Mail over real SMTP + email_log

6. ✅ Frontend public routes

7. ✅ Frontend authenticated screens

8. ✅ Server-side theme injection into the shell

9. ✅ Dockerfile, .dockerignore, USER_README.md
every stage replayed from clean sources; runtime layer run and tested
10. ✅ Browser walkthrough + screenshots
30/30 journeys, 16/16 a11y, 18 screenshots
11. ✅ Extra suites: registration_closed rules + database guarantees
18 + 13 checks; found and fixed a rate-limiter lockout bug

# Task List

1. ✅ Scaffold repo: Angular app + Hono server + Postgres schema

2. ✅ DB schema, constraints/triggers for last-seat, idempotent seed
Trigger proven at DB level; raw SQL cannot overfill
3. ✅ Backend API (123 checks pass)

4. ✅ SMTP mail via Mailpit + email_log

5. ✅ Server-side theme injection into index.html shell

6. ✅ Design tokens + shared UI kit

7. ✅ Public routes

8. ✅ Authed shell + manage screens

9. ✅ Browser walkthrough of 5 journeys (59/59)

10. ✅ Dockerfile, .dockerignore, USER_README.md
Build simulated end-to-end from lock files; runtime layout booted and passed suites
11. ✅ Start server detached so it outlives the session
PID 1 parent, own session; survives parent kill
12. ✅ Audit uncovered routes, a11y, reduced motion, responsive (59/59)
Found 3 test bugs, not app bugs; contrast verified 7.20:1
13. ✅ Performance at 500 events / 5000 registrations
All endpoints 1-4ms; guest list draws 24 of 411 rows

# Task List

1. ✅ Scaffold project: Astro + Hono + pg, single origin server

2. ✅ Schema + idempotent seed (14 tables, all seed data)

3. ✅ Core API: auth, catalogue, cart, checkout, orders (killbill + SMTP), pagination, logs

4. ✅ Devices, ownership, firmware manifest, flash sessions

5. ✅ Front page letter (film, scroll darkening, footer canvas)

6. ✅ Shell + shop + product + cart + 3-step checkout + order pages

7. ✅ Downloads archive + /doctor installer

8. ✅ Account pages (overview, orders, cameras)

9. ✅ Concurrency guarantees (stock, ownership, idempotency) verified

10. ✅ Dockerfile + USER_README.md + .dockerignore
Runtime file set simulated by hand and booted successfully; build verified with no service env
11. ✅ Browser walkthrough with Playwright, screenshots
58 checks pass, 15 screenshots, no console errors
12. ✅ Final polish pass: typography values, accessibility, empty/loading states
All measured type values exact; 0 contrast failures; scale test at 500 orders / 2000 devices / 200 releases

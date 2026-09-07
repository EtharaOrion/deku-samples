# Task List

1. ✅ Explore environment & verify backing services

2. ✅ Prototype killbill account + invoice creation

3. ✅ Scaffold: Astro SSR + Hono one origin

4. ✅ Database schema + idempotent seed (14 tables)

5. ✅ Backend API: full surface

6. ✅ Killbill + SMTP, idempotency, concurrency

7. ✅ Frontend: letter page + footer canvas + scroll driver

8. ✅ Frontend: shop, product, cart, checkout, orders

9. ✅ Frontend: downloads, doctor, account, sign-in/up

10. ✅ Verify e2e: order -> killbill invoice -> mailpit
VE-2026-0002 / $415.80 / exactly 1 invoice / exactly 1 mail
11. ✅ Concurrency + idempotency + authz verification

12. ✅ Dockerfile + USER_README.md + .dockerignore
Verified by replaying every COPY/RUN into a clean tree with no services present
13. ✅ Browser walkthrough, 19 screenshots
Every check passed; 4 real bugs found and fixed
14. ✅ Deploy persistent server bound 0.0.0.0:4173
ppid=1, own session, reachable at APP_PUBLIC_URL
15. ✅ Verify measured type scale, frame tokens, reduced motion, no-JS
46.8/118.8/48.932px and 14.625/37.125/20.9709px land exactly; film dropped under reduced motion but darkening kept; letter complete with JS disabled
16. ✅ Verify accessibility + colour discipline contract
All text >= 6.0:1 (AA); 2px solid focus ring at offset 2px on every control, never the accent; accent exactly once on the letter (the closing line) and nowhere else

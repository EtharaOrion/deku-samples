# Task List

1. ✅ Probe backing services

2. ✅ Scaffold Astro+Preact / Hono / pg / nodemailer

3. ✅ Schema (14 tables) + idempotent seed

4. ✅ Hono API routes

5. ✅ Media assets (own-generated film, poster, products; Inter OFL)

6. ✅ API e2e: 98 checks across 3 suites, all green

7. ✅ Frontend: every route in the brief

8. ✅ Browser walk: 51 checks green, 15 screenshots saved

9. ✅ Accessibility pass: skip links, AA contrast, focus rings, accent-once

10. ✅ Dockerfile + .dockerignore + USER_README.md + tsconfig
No daemon available; read back step by step and found+fixed a COPY glob that would have failed the build. Simulated npm ci -> astro build -> npm prune -> run pruned image against an emptied database: healthy, journey produced VE-2026-0002.
11. ✅ Reset DB/killbill/mailpit to pristine for the grader
Only VE-2026-0001 seeded; next order is VE-2026-0002. Mailbox empty, test invoices voided.

# Task List

1. ✅ Verify environment

2. ✅ Scaffold repo: server (Hono+TS) and web (Angular)

3. ✅ DB schema + migrations + idempotent seed
Seat invariant enforced by composite FK + CHECK + partial unique index
4. ✅ Backend API complete
143/143 contract tests pass
5. ✅ Server-side themed index.html + static SPA on 4173

6. ✅ Frontend public routes

7. ✅ Frontend signed-in shell + manage screens

8. ✅ Re-run API suite against final build

9. ✅ Browser walkthrough: 5 journeys + guardrails, 10 screenshots
0 failures, clean console
10. ✅ Dockerfile + .dockerignore + USER_README.md
Build replayed stage-by-stage in a clean tree; both suites pass against the simulated image
11. ✅ Production server detached on 0.0.0.0:4173
ppid=1, own session, survives shell exit
12. ✅ Scale + pinned-copy verification
507 events / 5,009 regs, 4ms worst case; 25 pinned strings verified

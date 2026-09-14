# Ravel — credentials and access

There is **no signup and no self-service account creation**. Seven seeded accounts are
the only accounts; each authenticates at the identity provider and every one signs in
with the same password:

| Email | Role | Sites |
|---|---|---|
| `plant@example.com` | Plant operator | SITE-DEMO, SITE-PILOT |
| `analyst@example.com` | Laboratory analyst | SITE-DEMO, SITE-PILOT |
| `quality@example.com` | Quality manager | SITE-DEMO, SITE-PILOT |
| `claims@example.com` | Claims manager | SITE-DEMO, SITE-PILOT |
| `signer@example.com` | Certificate signer | SITE-DEMO, SITE-PILOT |
| `signer2@example.com` | Certificate signer (SITE-PILOT only) | SITE-PILOT |
| `auditor@example.com` | Auditor (read and export only) | SITE-DEMO, SITE-PILOT |

**Password for every account:** `deku-demo-pw-2026`

- Public site: `/`, `/product`, `/technology`, `/about`, `/careers`, `/news`,
  `/contact`, `/privacy`, and the public `/verify/{number}` — no session needed.
- Console: `/console` and everything under it (a session is required; an anonymous
  reader is redirected to `/login`).
- Health: `GET /api/health` returns `200` once the app is ready and needs no session.
- A session expires twelve hours after issue. Signing a certificate re-authenticates
  with the password again: a session alone is not a signing credential.

The container reads every service address from the environment at start
(`DATABASE_URL`, `AUTH_ISSUER_URL`, `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`,
`SMTP_HOST`, `SMTP_PORT`, `APP_PUBLIC_URL`, `APP_PUBLIC_PORT`, `PORT`), applies its
schema, seeds the exact rows the product expects, and serves the production build and
the API from one origin on port 4173 bound to 0.0.0.0.

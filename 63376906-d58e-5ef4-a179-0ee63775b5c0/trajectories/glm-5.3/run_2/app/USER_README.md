# Ravel

Chemical recycling of polyamide: the operational record, the arithmetic behind
every claim, and the public site in front of it.

## Running

The container serves the app in the foreground on port `4173` (override with
`PORT`), bound to `0.0.0.0`, at `APP_PUBLIC_URL`. `GET /api/health` returns
`200` once the schema has been applied and the seed has run. The database is
created from scratch by the image on first start: migrations and seed are
applied by the container itself.

Environment the app reads: `DATABASE_URL`, `AUTH_ISSUER_URL`, `AUTH_CLIENT_ID`,
`AUTH_CLIENT_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `APP_PUBLIC_URL`, `PORT`.

## Login credentials

Signup is closed. These seven accounts are the only accounts; each
authenticates at keycloak and every one signs in with the same password:

| Email | Role | Sites |
|---|---|---|
| `plant@example.com` | plant operator | SITE-DEMO, SITE-PILOT |
| `analyst@example.com` | laboratory analyst | SITE-DEMO, SITE-PILOT |
| `quality@example.com` | quality manager | SITE-DEMO, SITE-PILOT |
| `claims@example.com` | claims manager | SITE-DEMO, SITE-PILOT |
| `signer@example.com` | certificate signer | SITE-DEMO, SITE-PILOT |
| `signer2@example.com` | certificate signer | SITE-PILOT only |
| `auditor@example.com` | auditor | SITE-DEMO, SITE-PILOT |

Password for every account: `deku-demo-pw-2026`.

Every grant ends on 2027-06-30. A session lasts twelve hours. Signing a
certificate asks for the password again at the moment of signing.

## Certificates

- `CERT-PILOT-000001` — withdrawn on 2026-04-18, reason "A collector category
  was corrected after acceptance". Its address resolves forever at
  `/verify/CERT-PILOT-000001`.
- `CERT-PILOT-000002` — issued.
- The `SITE-DEMO` sequence has issued nothing; the first signed there is
  `CERT-DEMO-000001`.

# Ravel — mass-balance attestation

Ravel is the operational record, arithmetic engine and public site of a
chemical-recycling plant that produces recycled Nylon 6 by mass balance.

## Running

The application is one Node 20 process serving the public site, the console
and the API from a single origin on port `4173` (`APP_PUBLIC_PORT`).

```
npm ci
npm run build          # vite build (client) + esbuild (server)
node dist/server.js    # binds 0.0.0.0:4173
```

On boot the server creates the schema (36 tables) in the Postgres database at
`DATABASE_URL` (or `DB_URL`) if it does not exist and seeds the pinned
operational record once. Identity is exchanged at the Keycloak realm named by
`AUTH_ISSUER_URL` with `AUTH_CLIENT_ID` / `AUTH_CLIENT_SECRET`. Mail leaves
through `SMTP_HOST:SMTP_PORT`. Nothing is hard-coded.

`GET /api/health` answers `200` without a session.

## Accounts

Sign-up is closed. Seven accounts exist; every password is
`deku-demo-pw-2026`. Grants are scoped to sites and end on 2027-06-30.

| Email                | Name             | Role                | Sites                |
| -------------------- | ---------------- | ------------------- | -------------------- |
| plant@example.com    | Ines Bekele      | plant_operator      | SITE-DEMO, SITE-PILOT |
| analyst@example.com  | Tomas Vlach      | lab_analyst         | SITE-DEMO, SITE-PILOT |
| quality@example.com  | Marit Solheim    | quality_manager     | SITE-DEMO, SITE-PILOT |
| claims@example.com   | Osei Danquah     | claims_manager      | SITE-DEMO, SITE-PILOT |
| signer@example.com   | Hana Ferreira    | certificate_signer  | SITE-DEMO, SITE-PILOT |
| signer2@example.com  | Pavel Ostrowski  | certificate_signer  | SITE-PILOT            |
| auditor@example.com  | Ruth Lindqvist   | auditor             | SITE-DEMO, SITE-PILOT |

Sign in at `/login`. `POST /api/auth/login` with `{ "email", "password" }`
answers `{ "access_token", "token_type" }`; send it as a bearer token. Sessions
last twelve hours. Signing a certificate carries the password again.

## Routes

Public: `/`, `/product`, `/technology`, `/about`, `/careers`, `/news`,
`/contact`, `/privacy`, `/verify/{number}`.

Console (session required): `/console` (run board), `/console/intake`,
`/console/record`, `/console/reconciliation`, `/console/certificates`,
`/console/balance/{period}`, `/console/lots/{lot}/genealogy`,
`/console/certificates/new/{lot|claim|recipient|review}`,
`/console/certificates/{number}`.

API under `/api`. Every write requires an `Idempotency-Key` header. Masses
are integer grams (`_g`); proportions are integer basis points (`_bp`).

## Seeded references

Sites `SITE-PILOT`, `SITE-DEMO`, `SITE-COMM`; collectors `COL-ALDER`,
`COL-BRINE`, `COL-CINDER`; batches `BATCH-1001` … `BATCH-1005`; runs
`RUN-D-0001` … `RUN-R-0001`; lots `LOT-N6-0001` … `LOT-N6-0003`; balance
periods `BP-DEMO-N6-2025H2` (closed), `BP-DEMO-N6-2026H1`,
`BP-PILOT-N6-2026H1`; certificates `CERT-PILOT-000001` (withdrawn),
`CERT-PILOT-000002`; customers `CUS-HELIOS`, `CUS-VANTA`.

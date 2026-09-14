# Ravel

Chemical recycling production and attestation system: a Preact single-page
application, a Hono HTTP API, and the public site in front of them.

## Running

The app is served as one production build from one origin. The container
listens on `0.0.0.0:4173` (mapped to `${APP_PUBLIC_PORT}` outside) and reads
every backing service from the environment at start:

| Variable | Meaning |
|---|---|
| `APP_PUBLIC_URL` | the app's public origin |
| `APP_PUBLIC_PORT` | the port mapped outside the container |
| `DATABASE_URL` | postgres connection string |
| `AUTH_ISSUER_URL` | keycloak realm issuer |
| `AUTH_CLIENT_ID` / `AUTH_CLIENT_SECRET` | keycloak client credentials |
| `SMTP_HOST` / `SMTP_PORT` | mailpit SMTP endpoint |

`GET /api/health` returns `200` once the schema and seed have been applied and
the listener is up. The database is created from scratch by the image itself:
schema, migrations and seed are applied under an advisory lock on first start.

## Login credentials

Signup is closed. These seven seeded accounts are the only accounts, each
authenticates at keycloak, and every one signs in with the same password:

| Email | Name | Role | Sites | Grant ends |
|---|---|---|---|---|
| `plant@example.com` | Ines Bekele | plant operator | SITE-DEMO, SITE-PILOT | 2027-06-30 |
| `analyst@example.com` | Tomas Vlach | lab analyst | SITE-DEMO, SITE-PILOT | 2027-06-30 |
| `quality@example.com` | Marit Solheim | quality manager | SITE-DEMO, SITE-PILOT | 2027-06-30 |
| `claims@example.com` | Osei Danquah | claims manager | SITE-DEMO, SITE-PILOT | 2027-06-30 |
| `signer@example.com` | Hana Ferreira | certificate signer | SITE-DEMO, SITE-PILOT | 2027-06-30 |
| `signer2@example.com` | Pavel Ostrowski | certificate signer | SITE-PILOT | 2027-06-30 |
| `auditor@example.com` | Ruth Lindqvist | auditor | SITE-DEMO, SITE-PILOT | 2027-06-30 |

**Password for every account: `deku-demo-pw-2026`**

Sign in at `/login`; the console opens at `/console`. A session expires twelve
hours after issue. Signing a certificate asks for the password again.

## Certificates

Two are seeded:

- `CERT-PILOT-000001` — withdrawn 2026-04-18, address resolves forever at
  `/verify/CERT-PILOT-000001` (public, no session).
- `CERT-PILOT-000002` — issued.

The `SITE-DEMO` sequence has issued nothing, so the first certificate signed
there is `CERT-DEMO-000001`.

## Rebuilding from source

```
docker build /app
docker run -p ${APP_PUBLIC_PORT}:4173 -e DATABASE_URL=... -e AUTH_ISSUER_URL=... \
  -e AUTH_CLIENT_ID=... -e AUTH_CLIENT_SECRET=... -e SMTP_HOST=... -e SMTP_PORT=... <image>
```

The client is built with Vite into `dist/` and served by the Hono server on the
same origin; there is no dev server in production.

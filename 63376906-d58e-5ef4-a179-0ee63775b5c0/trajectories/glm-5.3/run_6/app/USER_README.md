# Ravel

Chemical recycling of polyamide: a production and attestation system (Preact + Hono + postgres + keycloak + mailpit) and the public site in front of it.

## Accounts

Signup is closed. The seven seeded accounts are the only accounts; every one signs in with `deku-demo-pw-2026`.

| Email | Role | Sites |
|---|---|---|
| `plant@example.com` | plant operator | SITE-DEMO, SITE-PILOT |
| `analyst@example.com` | laboratory analyst | SITE-DEMO, SITE-PILOT |
| `quality@example.com` | quality manager | SITE-DEMO, SITE-PILOT |
| `claims@example.com` | claims manager | SITE-DEMO, SITE-PILOT |
| `signer@example.com` | certificate signer | SITE-DEMO, SITE-PILOT |
| `signer2@example.com` | certificate signer | SITE-PILOT only |
| `auditor@example.com` | auditor | SITE-DEMO, SITE-PILOT |

Signing a certificate re-authenticates: the signing act carries the password again.

## Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | postgres, holding every record |
| `AUTH_ISSUER_URL`, `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET` | keycloak realm and client |
| `SMTP_HOST`, `SMTP_PORT` | mailpit over SMTP |
| `APP_PUBLIC_URL`, `APP_PUBLIC_PORT` | where the app is reachable |
| `PORT` | container-internal listen port, `4173` |

Schema and seed are applied by the image itself on first start; no manual step.

## Endpoints

- `GET /api/health` — `200` once ready, no session.
- `/` … `/privacy`, `/verify/{number}` — the public site, no account.
- `/console` — the console, session required; an anonymous reader is redirected to `/login`.

# Vela storefront

Cameras built and sold directly. One origin serves the site and the HTTP API
under `/api`.

## Sign in

Two seeded accounts. The password for both is:

```
deku-demo-pw-2026
```

| Email | Name |
|---|---|
| `customer@example.com` | Iris Vantaa |
| `customer2@example.com` | Rune Halden |

Use either address with the password above at `/sign-in`. Signup is also open at
`/sign-up`.

Guest checkout needs no account: the confirmation link carries an access token,
so an order can be read back without signing in.

## Seeded data worth knowing

- Order `VE-2026-0001` belongs to `customer@example.com` (confirmed, fulfilled).
- Camera serials: `VC2609PVDA7Q` (Cricket, owned by `customer@example.com`),
  `VA2609NRWB2Z` (A1, owned by `customer2@example.com`),
  `VA2609KTMHX4` (A1, unowned, ready to register),
  `VC2609WJ3DKT` (blocked, `reported_stolen`).
- Firmware for the Vela Cricket reaches `7.2`; the browser installer is at `/doctor`.

## Services

Read from the environment at start: `DATABASE_URL`, `PAYMENTS_API_URL` (killbill),
`SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` (Mailpit). The container
listens on `0.0.0.0:4173`.

# Vela storefront

Vela designs two cameras, has them built, and sells them directly. The site is
one origin: the letter on the front page, the shop, the cart and checkout, the
`Arranger` download archive with its firmware, and the browser firmware
installer at `/doctor`.

## Signing in

Signup is open. Two benchmark accounts are seeded so the ownership boundary
between customers is real. Every seeded account uses the same password:

    customer@example.com   Iris Vantaa    deku-demo-pw-2026
    customer2@example.com  Rune Halden    deku-demo-pw-2026

Sign in at `/sign-in`. Guest checkout works without an account.

## The graded walk

1. Read the letter at `/`. Follow `Shop` in the footer.
2. Add a Graphite `Vela Cricket` and a `Travel Case`; `/cart` reads `$378.00`.
3. Check out as a guest at `customer@example.com` on `Standard`: tax `$37.80`,
   total `$415.80`, landing on `/orders/VE-2026-0002`.
4. Sign in as `customer@example.com` and register `VA2609KTMHX4`
   on `/account/cameras`.
5. Expand `Arranger 1.4.3` on `/downloads`, then take `/doctor` to a session for
   `VC2609PVDA7Q` at `7.2`.

## Seeded cameras

| Serial | Model | State |
|---|---|---|
| `VC2609PVDA7Q` | Vela Cricket, Graphite | registered to `customer@example.com` from `VE-2026-0001`, firmware `7.0` |
| `VA2609NRWB2Z` | Vela A1, Sand | registered to `customer2@example.com`, firmware `2.4` |
| `VA2609KTMHX4` | Vela A1, Graphite | sold, no owner |
| `VC2609WJ3DKT` | Vela Cricket, Yellow | blocked (`reported_stolen`) |

A serial is twelve characters: two letters of model code, two digits of year,
two digits of production week, then six characters drawn from `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`.

## The API

The HTTP API is served on the same origin under `/api`. `GET /api/health`
answers `200` once the app is ready. Every list endpoint takes `page_size`
(default 20, capped at 100) and returns `{ data, next_cursor, has_more }` with a
keyset cursor. Every mutating account route takes a bearer token from
`POST /api/auth/login` or `POST /api/auth/signup`.

## Environment

| Variable | Used for |
|---|---|
| `DATABASE_URL` | PostgreSQL |
| `PAYMENTS_API_URL`, `PAYMENTS_API_KEY`, `PAYMENTS_API_SECRET`, `PAYMENTS_ADMIN_USER`, `PAYMENTS_ADMIN_PASSWORD` | killbill |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Mailpit over real SMTP |
| `APP_PUBLIC_URL`, `APP_PUBLIC_PORT` | where the app is reached |

The container listens on `0.0.0.0:4173`; `APP_PUBLIC_PORT` is what the outside
world uses. Schema, migrations and the idempotent seed are applied by the image
itself at start.

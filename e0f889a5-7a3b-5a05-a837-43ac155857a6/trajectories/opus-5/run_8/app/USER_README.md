# Vela — how to sign in and what to try

The app serves server-rendered HTML and its JSON API from one origin. The API
lives under `/api`. `GET /api/health` answers `200` once the app is ready.

## Accounts

Both seeded accounts use the same password. This is benchmark fixture data, not
a secret.

| Email | Name | Password |
|---|---|---|
| `customer@example.com` | Iris Vantaa | `deku-demo-pw-2026` |
| `customer2@example.com` | Rune Halden | `deku-demo-pw-2026` |

Signup is open at `/sign-up`, and **buying needs no account at all**: guest
checkout is the default.

## The journeys

**Read the letter and buy something as a guest.** Open `/`, read the letter,
follow `Shop` in the footer. Add a Graphite `Vela Cricket` and a `Travel Case`;
`/cart` reads `$378.00`. Check out as `customer@example.com` on `Standard`: the
tax line reads `$37.80` and the total `$415.80`. You land on `/orders/VE-2026-0002`.

The invoice for that order is a real record in killbill, on the account whose
`externalKey` is `customer@example.com`, and the confirmation is a real message
in the mail server with the subject `Order confirmed: VE-2026-0002`. Submitting
the same order twice produces one order, one invoice and one mail.

**Register a camera.** Sign in as `customer@example.com`, open
`/account/cameras`, and register `VA2609KTMHX4`. Registering a serial that
belongs to somebody else, such as `VA2609NRWB2Z`, is refused; an unknown one is
refused; the blocked `VC2609WJ3DKT` is refused as blocked.

**Write firmware.** Open `/downloads`, expand `Arranger 1.4.3`, then take
`/doctor`. Accept the warning, connect `VC2609PVDA7Q` and write `7.2`. The
version recorded afterwards is the one the camera reported, not the one asked for.

## Seeded data worth knowing

- Serials: `VC2609PVDA7Q` (Iris, firmware `7.0`), `VA2609NRWB2Z` (Rune),
  `VA2609KTMHX4` (sold, unowned, free to register), `VC2609WJ3DKT` (blocked).
- `VELA-A1-YELLOW` has one unit in stock, which is the row two concurrent
  checkouts race for.
- `VELA-CRICKET-YELLOW` is the seeded sold-out variant; `Monitor Mount` is the
  seeded discontinued product.
- Order `VE-2026-0001` already belongs to `customer@example.com`, so the first
  order placed against a fresh database is `VE-2026-0002`.

## Environment

Every host and port is read from the environment at start: `DATABASE_URL`,
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `PAYMENTS_API_URL`,
`PAYMENTS_API_KEY`, `PAYMENTS_API_SECRET`, `PAYMENTS_ADMIN_USER`,
`PAYMENTS_ADMIN_PASSWORD`. The app binds `0.0.0.0` on the container-internal
port `4173`. The schema and the seed are applied by the app itself at start, and
the seed is idempotent, so restarting duplicates nothing.

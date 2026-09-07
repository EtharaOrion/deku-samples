# Vela — how to open it

The site is served on one origin. The pages are server-rendered HTML; the HTTP API
sits under `/api` on that same origin. `GET /api/health` answers `200` once the app
is ready.

Start at `/`, which is the letter. The way out of it is the footer.

## Accounts

Both seeded accounts use the same password. It is benchmark fixture data, not a
secret.

| Email | Name | Password |
|---|---|---|
| `customer@example.com` | Iris Vantaa | `deku-demo-pw-2026` |
| `customer2@example.com` | Rune Halden | `deku-demo-pw-2026` |

Signing up is open at `/sign-up`, and buying needs no account at all: guest
checkout is the default.

`customer@example.com` owns the camera `VC2609PVDA7Q` and the order
`VE-2026-0001`. `customer2@example.com` owns `VA2609NRWB2Z`. Those two accounts
exist so the ownership boundary is real: neither can read, register, rename,
release or flash the other's camera, and neither can read the other's orders.

## The journeys

**Buy something as a visitor.** `/` → `Shop` in the footer → `Vela Cricket` →
add the Graphite one → `Travel Case` → add it → `/cart` reads `$378.00` →
check out as `customer@example.com` with `Standard` delivery → tax `$37.80`,
total `$415.80` → you land on `/orders/VE-2026-0002`.

That order is not only a row here. A `killbill` account keyed by the order email
lowercased carries one invoice for `415.80` `USD`, and one confirmation mail
reaches that address alone with the subject `Order confirmed: VE-2026-0002`.
Submitting the same order twice with the same `Idempotency-Key` returns the first
order and creates no second invoice and no second mail.

**Register a camera.** Sign in, go to `/account/cameras`, and register
`VA2609KTMHX4` in the row at the top of the grid. `VA2609NRWB2Z` belongs to the
other account and is refused with `That camera is registered to someone else.`
`VC2609WJ3DKT` is blocked. Anything else is `We do not recognise that serial
number.`

**Write firmware.** `/downloads` carries Arranger and the whole release archive,
newest build first. `/doctor` is the browser installer for a camera Arranger
cannot see. In a browser with a serial port API it talks to the camera over the
cable. Without one it offers the recovery channel: accept the warning, type the
serial (`VC2609PVDA7Q`), choose the recommended image and write. The page closes
with the version the camera reported, which is what the server records.

## Serial numbers on hand

| Serial | Camera | State |
|---|---|---|
| `VC2609PVDA7Q` | Vela Cricket, Graphite | registered to `customer@example.com`, firmware `7.0` |
| `VA2609NRWB2Z` | Vela A1, Sand | registered to `customer2@example.com`, firmware `2.4` |
| `VA2609KTMHX4` | Vela A1, Graphite | sold, no owner — this is the one to register |
| `VC2609WJ3DKT` | Vela Cricket, Yellow | blocked, reported stolen |

## Environment

Everything is read from the environment at container start and nothing is
hardcoded: `DATABASE_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
`PAYMENTS_API_URL`, `PAYMENTS_API_KEY`, `PAYMENTS_API_SECRET`,
`PAYMENTS_ADMIN_USER`, `PAYMENTS_ADMIN_PASSWORD`, `APP_PUBLIC_URL` and `PORT`
(container-internal `4173`). The schema and the seed are applied by the image on
boot, and seeding is idempotent: restarting duplicates nothing.

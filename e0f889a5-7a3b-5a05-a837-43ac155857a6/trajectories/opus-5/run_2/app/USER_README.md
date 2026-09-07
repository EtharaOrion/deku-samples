# Vela

Vela designs two cameras, has them built and sells them directly. This app is
the whole storefront: the letter on the front page, the catalogue, the cart and
checkout, the release archive, the browser firmware installer, and the account
where a camera lives after the sale.

## Sign in

Both seeded accounts use the same password. It is benchmark fixture data, not a
secret.

| Email | Name | Password |
|---|---|---|
| `customer@example.com` | Iris Vantaa | `deku-demo-pw-2026` |
| `customer2@example.com` | Rune Halden | `deku-demo-pw-2026` |

Sign in at `/sign-in`. Signup is open at `/sign-up`, and **you do not need an
account to buy anything**: guest checkout is the default.

The two accounts exist so the ownership boundary is real. `customer@example.com`
holds the camera `VC2609PVDA7Q`; `customer2@example.com` holds `VA2609NRWB2Z`.
Neither can read, register, rename, release or see the other's camera or orders.

## The journey this was built for

1. Read the letter at `/`, then follow **Shop** in the footer.
2. Add a **Vela Cricket** in Graphite and a **Travel Case**. `/cart` reads `$378.00`.
3. Check out as a guest at `customer@example.com` on **Standard** delivery.
   Tax is `$37.80` and the total is `$415.80`.
4. You land on `/orders/VE-2026-0002`, which reads
   `Order VE-2026-0002 is confirmed. We have emailed customer@example.com.`
5. Sign in and register `VA2609KTMHX4` at `/account/cameras`.
6. Expand `Arranger 1.4.3` at `/downloads`, then take `/doctor` and run a
   session for `VC2609PVDA7Q` up to firmware `7.2`.

The money and the hardware are real records held outside this app's own screens:

- The invoice lives in **killbill**, on the account whose `externalKey` is the
  order email lowercased, for the order total in `USD`.
- The confirmation mail is delivered over real SMTP to **Mailpit**, addressed to
  the order's email alone, with no cc and no bcc. Its subject is
  `Order confirmed: VE-2026-0002`.
- The orders, stock, devices and flash sessions live in **PostgreSQL**.

Submitting the same order twice, with the same `Idempotency-Key`, produces one
order, one invoice and one mail.

## Serial numbers you can use

| Serial | Camera | State |
|---|---|---|
| `VA2609KTMHX4` | Vela A1, Graphite | sold, unowned — **register this one** |
| `VC2609PVDA7Q` | Vela Cricket, Graphite | owned by `customer@example.com`, firmware `7.0` |
| `VA2609NRWB2Z` | Vela A1, Sand | owned by `customer2@example.com`, firmware `2.4` |
| `VC2609WJ3DKT` | Vela Cricket, Yellow | blocked, `reported_stolen` |

A serial is twelve characters: two letters of model code (`VA`, `VC`), two
digits of year, two of production week, then six characters drawn from
`23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, which omits `I`, `O`, `0` and `1`.

## Where things are

| Route | What it is |
|---|---|
| `/` | the letter, the film, the footer |
| `/shop`, `/shop/<handle>` | the catalogue and one product |
| `/cart` | the cart |
| `/checkout/where-it-goes`, `/checkout/how-it-gets-there`, `/checkout/payment` | the three steps |
| `/orders/<number>` | one order by its access token |
| `/downloads`, `/downloads/<version>` | Arranger and the whole release archive |
| `/doctor` | the browser firmware installer |
| `/account`, `/account/orders`, `/account/cameras` | the account |
| `/api/health` | `200` once the app is ready |

The HTTP API is on the same origin under `/api`. Every list endpoint takes
`page_size` (default `20`, capped at `100`) and returns `data`, `next_cursor`
and `has_more`, with a keyset cursor over a stable ordering key.

## Notes for anyone reading the code

- Money is an integer count of minor units in `usd` in every layer, including the
  browser. The only decimal in the system is the string handed to killbill.
- Tax is ten percent of the line subtotal, on integers, truncated toward zero.
  Shipment protection is excluded from tax.
- Single-winner rules are enforced by the store, not by application checks: a
  partial unique index gives a device at most one live owner and a device at most
  one `started` flash session, and a guarded `UPDATE` commits stock so
  `available` can never go negative.
- A flash session records the version the camera reported, never the one asked
  for. A failed session leaves the firmware as it was.
- Seeding is idempotent, so restarting the app never duplicates a row.

## Running it

The image needs `DATABASE_URL`, `PAYMENTS_API_URL`, `PAYMENTS_API_KEY`,
`PAYMENTS_API_SECRET`, `PAYMENTS_ADMIN_USER`, `PAYMENTS_ADMIN_PASSWORD`,
`SMTP_HOST` and `SMTP_PORT` (with `SMTP_USER` and `SMTP_PASS` where the mail
server wants them). It listens on `0.0.0.0` at the port in `PORT`, which
defaults to `4173`, and applies its schema and seed itself on start.

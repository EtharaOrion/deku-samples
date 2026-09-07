# Vela Electronics storefront

Vela designs two cameras, has them built and sells them directly. The app serves
the front page, the shop, the cart and checkout, the download archive, the
browser firmware installer and the customer account from one origin.

The HTTP API is served on that same origin under `/api`. `GET /api/health`
answers `200` once the app is ready.

## Signing in

**Every seeded account uses the password `deku-demo-pw-2026`.** It is benchmark
fixture data, not a secret.

| Email | Name | What it holds |
|---|---|---|
| `customer@example.com` | Iris Vantaa | Order `VE-2026-0001`, camera `VC2609PVDA7Q` |
| `customer2@example.com` | Rune Halden | Camera `VA2609NRWB2Z` |

Signup is open at `/sign-up`, and **guest checkout is the default** — you do not
need an account to buy a camera. You need one to register a serial.

## The graded journey

1. Read the letter at `/`, then follow **Shop** in the footer.
2. Add a **Graphite Vela Cricket** and a **Travel Case**. `/cart` reads `$378.00`.
3. Check out as a guest at `customer@example.com` on **Standard** delivery.
   The tax line reads `$37.80` and the total `$415.80`.
4. Placing the order lands on `/orders/VE-2026-0002`.

That order raises **one invoice for `415.80 USD` in killbill**, on the account
whose `externalKey` is `customer@example.com`, and sends **one confirmation
mail** with the subject `Order confirmed: VE-2026-0002` to that address alone.
Submitting the same order twice, with the same `Idempotency-Key`, returns the
first order and creates no second invoice and no second mail.

Reading the invoice back from killbill:

```
GET /1.0/kb/accounts?externalKey=customer@example.com
GET /1.0/kb/accounts/{accountId}/invoices?includeInvoiceComponents=true
```

Two things worth knowing about reading killbill back:

- `/1.0/kb/invoices/pagination` returns *shallow* invoices, whose `amount` reads
  `0.0` because the items are not loaded on that path. The account endpoint
  above, or `GET /1.0/kb/invoices/{invoiceId}`, reports the real figure.
- The account for `customer@example.com` carries some `VOID` invoices from the
  journeys run while building this. Voided invoices are excluded by default, so
  the account endpoint above shows only the live one. Pass
  `includeVoidedInvoices=true` if you want to see them.

## Serials to try

| Serial | State |
|---|---|
| `VA2609KTMHX4` | Sold, no owner. Registers cleanly to any account. |
| `VC2609PVDA7Q` | Owned by `customer@example.com`, running firmware `7.0`. |
| `VA2609NRWB2Z` | Owned by `customer2@example.com`. Refused to anyone else. |
| `VC2609WJ3DKT` | Blocked, `reported_stolen`. Refused as blocked. |

A serial is twelve characters: two letters of model code (`VA`, `VC`), two
digits of year, two of production week, then six from an alphabet that omits
`I`, `O`, `0` and `1`.

## The firmware installer

`/doctor` writes firmware to a camera Arranger cannot see. Accept the warning,
enter `VC2609PVDA7Q`, and write firmware `7.2`. The session records the version
the camera reports back rather than the version that was asked for, and a
refused or failed write leaves the firmware exactly as it was.

Ownership and warranty are not conditions of repair: a camera registered to
somebody else, and one out of warranty, are both repaired.

## Environment

Every host and port is read from the environment; none is hardcoded.

| Variable | Used for |
|---|---|
| `DATABASE_URL` | PostgreSQL. Schema and seed are applied at start and are idempotent. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Real SMTP for the confirmation mail. |
| `PAYMENTS_API_URL`, `PAYMENTS_API_KEY`, `PAYMENTS_API_SECRET`, `PAYMENTS_ADMIN_USER`, `PAYMENTS_ADMIN_PASSWORD` | killbill. |
| `PORT` | Container-internal listening port. Defaults to `4173`. |
| `HOST` | Bind address. Defaults to `0.0.0.0`. |

The container listens on `4173` and binds `0.0.0.0`. `APP_PUBLIC_PORT` is what
the outside world maps onto that and is never read by the app.

## Notes on the build

- **Astro with islands** renders every route as server HTML. Only the scroll
  driver, the cart controls, the installer, the buy control and the register row
  become client islands; the markup is complete on first paint everywhere.
- **Hono** serves the API under `/api` on the same origin.
- **PostgreSQL** holds the orders, the stock, the devices and the sessions.
  Single-winner rules are held by the store — partial unique indexes for one
  live device owner and one started flash session per device, and a row lock
  plus a guarded update for stock — rather than by application checks alone.
- Money is an integer count of minor units in `usd` in every layer including the
  browser. Tax is ten percent of the line subtotal, truncated toward zero.
- Logs are one line of JSON per request on stdout, carrying `request_id`, which
  is the same reference returned in the body of every error response.
- The type is Archivo (SIL Open Font License 1.1, Omnibus-Type), self-hosted in
  weights 400 and 700. The workshop film and its still frame were generated for
  this project with PIL and ffmpeg and are ours to ship.

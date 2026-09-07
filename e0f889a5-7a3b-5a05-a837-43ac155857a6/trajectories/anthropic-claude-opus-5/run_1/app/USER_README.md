# Vela — how to open it

Vela designs two cameras, has them built and sells them directly. The site
states what the company is, sells the hardware, ships the free application
`Arranger` with its whole release archive, and keeps a camera alive after the
sale through an account and a browser-based firmware installer.

The app is reachable at `APP_PUBLIC_URL`. The HTTP API is served on that same
origin under the `/api` prefix, and `GET /api/health` answers `200` once the app
is ready.

## Sign in

**Every seeded account uses the password `deku-demo-pw-2026`.** It is benchmark
fixture data, not a secret. It is stored hashed and the literal below works at
`/sign-in`.

| Email | Name | Password | What they hold |
|---|---|---|---|
| `customer@example.com` | Iris Vantaa | `deku-demo-pw-2026` | Order `VE-2026-0001`, camera `VC2609PVDA7Q` |
| `customer2@example.com` | Rune Halden | `deku-demo-pw-2026` | Camera `VA2609NRWB2Z` |

Signup is open at `/sign-up`, and **buying needs no account at all** — guest
checkout is the default.

## The journey the brief describes

1. Read the letter at `/`. Scroll it: the film darkens in exact proportion to
   how far down you are, and lifts again when you scroll back.
2. Follow **Shop** in the footer to `/shop`.
3. Open `Vela Cricket`, keep **Graphite**, add it. Open `Travel Case`, add it.
4. `/cart` reads `$378.00`.
5. Check out as a guest at `customer@example.com`, on **Standard** delivery. Tax
   is `$37.80` and the total is `$415.80`.
6. Placing the order lands on `/orders/VE-2026-0002`.
7. Sign in, then register `VA2609KTMHX4` at `/account/cameras`.
8. Expand `Arranger 1.4.3` at `/downloads`, then take `/doctor` and run a
   session for `VC2609PVDA7Q` up to `7.2`.

## Where the facts actually live

Nothing in this app is a mock, and the app's own screens are never the evidence:

- **Orders, stock, cameras and flash sessions** live in PostgreSQL at
  `DATABASE_URL`.
- **The money** lives in `killbill` at `PAYMENTS_API_URL`. A confirmed order
  creates or reuses one account keyed by the order email lowercased, and raises
  one invoice on it for the order total in `USD`. After the journey above, the
  account whose `externalKey` is `customer@example.com` carries one committed
  invoice for `415.80 USD`.
- **The confirmation mail** is sent over real SMTP to Mailpit at `SMTP_HOST`.
  The subject is `Order confirmed: VE-2026-0002`, it goes to the order's address
  alone with no cc and no bcc, and the body names each line, its quantity and
  the total.

Reading the invoice back: `killbill`'s `GET /1.0/kb/invoices/pagination` returns
*shallow* invoices, whose `amount` is reported as `0.00` because the items are
not loaded. The amount is carried by
`GET /1.0/kb/accounts/{accountId}/invoices?includeInvoiceComponents=true` and by
`GET /1.0/kb/invoices/{invoiceId}`, both of which report `415.80`.

## Submitting the same order twice

`POST /api/orders` takes an `Idempotency-Key` header. Replaying a key returns
the original order and creates no second account, invoice, mail or ownership
row. The checkout page mints one key per rendering, so a double-click or a
re-submitted form is one order.

## Notes

- Money is an integer count of minor units in `usd` in every layer, including
  the browser. Tax is ten percent of the line subtotal on integers, truncated
  toward zero, so `37800` gives `3780`. Shipment protection is excluded from tax.
- Timestamps are UTC.
- Logs are one line of JSON per request on stdout, each carrying a `request_id`
  that also appears in the body of every error response.
- Seeding is idempotent: restarting the app duplicates no rows.
- The display face is Archivo (SIL OFL 1.1), subset and self-hosted; the licence
  sits at `public/fonts/OFL.txt`. The film and its still frame are drawn
  procedurally by `scripts/make-media.py` and contain no third-party asset.

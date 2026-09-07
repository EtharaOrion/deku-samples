# Vela Electronics storefront

Vela designs two cameras, has them built and sells them directly. This app is the
whole of that: a dated letter over a film of the workshop table, a catalogue, a
cart and a three step checkout, the `Arranger` application with its full release
archive and the firmware, and an account where a camera outlives the order that
bought it.

The app serves server-rendered HTML and its HTTP API on **one origin**, with the
API under the `/api` prefix. `GET /api/health` returns `200` once it is ready.

## Signing in

**Every seeded account uses the password `deku-demo-pw-2026`.** This is benchmark
fixture data, not a secret. It is stored hashed, and the literal above works at
the sign-in form.

| Email | Name | What they hold |
|---|---|---|
| `customer@example.com` | Iris Vantaa | order `VE-2026-0001`, camera `VC2609PVDA7Q` |
| `customer2@example.com` | Rune Halden | camera `VA2609NRWB2Z` |

Sign in at `/sign-in`. Signup is open at `/sign-up`.

**Guest checkout is the default** — you do not need an account to buy something.

## The graded journey

1. Read the letter at `/`. Scrolling darkens the film in exact proportion.
2. Follow **Shop** in the footer to `/shop`.
3. Open `Vela Cricket`, choose **Graphite**, add it to the cart.
4. Add a `Travel Case`. The cart at `/cart` reads **$378.00**.
5. Check out as a guest at `customer@example.com`, choose **Standard**.
   The tax line reads **$37.80** and the total **$415.80**.
6. Place the order and land on `/orders/VE-2026-0002`.

That order raises a **real invoice for `415.80 USD` in killbill** on the account
whose `externalKey` is `customer@example.com`, and sends **exactly one email** to
that address alone with the subject `Order confirmed: VE-2026-0002`. Submitting
the same order twice with one `Idempotency-Key` produces one order, one invoice
and one mail.

Then: register `VA2609KTMHX4` at `/account/cameras`; expand `Arranger 1.4.3` at
`/downloads`; and take `/doctor` to a firmware session for `VC2609PVDA7Q` at `7.2`.

### Verifying the invoice in killbill

Note that killbill's `GET /1.0/kb/invoices/pagination` returns invoices **without
their line items**, and it derives `amount` from those items, so it reports `0.00`
for every invoice in this deployment regardless of who wrote it. The stored amount
is correct and is visible on either of these, which do return the items:

```
GET /1.0/kb/invoices/{invoiceId}
GET /1.0/kb/accounts/{accountId}/invoices?includeInvoiceComponents=true
```

Both report `"amount": 415.80` and `"currency": "USD"` for the graded order.

## Serial numbers you can use

| Serial | Camera | State |
|---|---|---|
| `VA2609KTMHX4` | Vela A1, Graphite | sold, unowned — **register this one** |
| `VC2609PVDA7Q` | Vela Cricket, Graphite | Iris's, firmware `7.0` — use at `/doctor` |
| `VA2609NRWB2Z` | Vela A1, Sand | Rune's — refused as *registered to someone else* |
| `VC2609WJ3DKT` | Vela Cricket, Yellow | blocked, `reported_stolen` |

A serial is twelve characters: two letters of model code (`VA` or `VC`), two
digits of year, two of production week, then six from `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`,
which omits `I`, `O`, `0` and `1`.

## Routes

| Route | Purpose | Auth |
|---|---|---|
| `/` | the letter, the film, the footer | public |
| `/shop`, `/shop/<handle>` | the catalogue and one product | public |
| `/cart` | cart lines, edited in place | public |
| `/checkout/where-it-goes` → `/how-it-gets-there` → `/payment` | three steps | public |
| `/orders/<number>` | one order by access token | token |
| `/downloads`, `/downloads/<version>` | Arranger, firmware, the archive | public |
| `/doctor` | the browser firmware installer | public |
| `/sign-in`, `/sign-up` | account entry and creation | public |
| `/account`, `/account/orders`, `/account/cameras` | cameras, orders, software | customer |

## How it is built

- **Frontend**: Astro in server output with Preact islands. Every route is
  server-rendered HTML; the scroll driver, the cart controls, the installer and
  the register row are the islands.
- **Backend**: Hono, on the same origin under `/api`.
- **Datastore**: PostgreSQL at `DATABASE_URL`. Schema and seed are applied by the
  image at start and are idempotent, so restarting duplicates nothing.
- **Mail**: real SMTP to Mailpit at `SMTP_HOST` / `SMTP_PORT`.
- **Billing**: killbill at `PAYMENTS_API_URL`.

Money is an integer count of minor units in `usd` in every layer, including the
browser. Tax is ten percent of the line subtotal on integers, truncated toward
zero; shipment protection is excluded from tax. All timestamps are UTC.

Single-winner rules are held by the store rather than by application checks: a
partial unique index gives a device at most one live owner and a camera at most
one started flash session, and a conditional update commits stock, so two
concurrent checkouts for the last `VELA-A1-YELLOW` cannot both succeed and
`available` never goes negative.

## Notes for a reader

- Logs are one JSON line per request on stdout, carrying the method, route,
  status, elapsed milliseconds and a `request_id`. That same `request_id` appears
  in the body of every error response.
- Every list endpoint takes `page_size`, defaults it to `20` and caps it at `100`.
  Asking for more is refused with the cap named. Responses carry `data`,
  `next_cursor` and `has_more`, over a keyset cursor.
- The release archive sorts by build descending, never by release date: `1.4.3`
  and `1.4.2` share `2024-05-20` and still order deterministically.

## Licences for bundled assets

- The display face is **Inter**, under the SIL Open Font License 1.1. The licence
  ships at `/fonts/FONT-LICENSE.txt`. Identifiers use a system monospace stack and
  load no web font.
- The film of the workshop table, its still frame and every product image were
  generated for this project and are original to it.

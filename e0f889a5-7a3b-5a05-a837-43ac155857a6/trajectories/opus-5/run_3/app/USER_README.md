# Vela Electronics storefront

Vela designs two cameras, has them built and sells them directly. This app is
the whole of that: the letter on the front page, the catalogue and checkout, the
`Arranger` release archive and firmware, and the account where a camera lives
after the sale.

The site is served on one origin. The HTTP API is on that same origin under the
`/api` prefix. `GET /api/health` returns `200` once the app is ready.

## Signing in

**Every seeded account uses the password `deku-demo-pw-2026`.**
It is benchmark fixture data, not a secret.

| Email | Name | What is on the account |
|---|---|---|
| `customer@example.com` | Iris Vantaa | Order `VE-2026-0001`, and the camera `VC2609PVDA7Q` |
| `customer2@example.com` | Rune Halden | The camera `VA2609NRWB2Z` |

Sign in at `/sign-in`. Signup is open at `/sign-up`, and **guest checkout is the
default**, so no account is needed to buy anything.

## The journey this was built for

1. Read the letter at `/`, then follow `Shop` in the footer.
2. Add a `Vela Cricket` in **Graphite** and a `Travel Case`. `/cart` reads
   `$378.00`.
3. Check out as a guest at `customer@example.com` on **Standard** delivery: tax
   `$37.80`, total `$415.80`.
4. Land on `/orders/VE-2026-0002`, which reads
   `Order VE-2026-0002 is confirmed. We have emailed customer@example.com.`
5. Sign in, then register `VA2609KTMHX4` on `/account/cameras`.
6. Expand `Arranger 1.4.3` on `/downloads`.
7. Take `/doctor` to a firmware session for `VC2609PVDA7Q` at `7.2`.

The order is not only a row in this app. A confirmed order raises **one invoice
in killbill** on the account whose `externalKey` is the order email lowercased,
for the order total in `USD`, and sends **one confirmation mail** over SMTP to
that address alone, subject `Order confirmed: VE-2026-0002`. Submitting the same
order twice, with the same `Idempotency-Key`, produces one order, one invoice and
one mail.

### Reading the invoice back from killbill

Note that killbill's `GET /1.0/kb/invoices/pagination` returns *shallow*
invoices: it does not load the line items, and it therefore reports `amount` as
`0.00` for every invoice in the tenant. That is the platform's behaviour, not
this app's. The figure is visible wherever the items are loaded, for example:

```
GET /1.0/kb/accounts/{accountId}/invoices?includeInvoiceComponents=true
GET /1.0/kb/invoices/{invoiceId}?withItems=true
```

Both report `"amount": 415.80` with `"currency": "USD"` for the graded order.

## Serial numbers to hand

| Serial | Model | State |
|---|---|---|
| `VC2609PVDA7Q` | Vela Cricket, Graphite | Registered to `customer@example.com`, running `7.0` |
| `VA2609NRWB2Z` | Vela A1, Sand | Registered to `customer2@example.com`, running `2.4` |
| `VA2609KTMHX4` | Vela A1, Graphite | Sold, **no owner**, free to register |
| `VC2609WJ3DKT` | Vela Cricket, Yellow | Blocked, `reported_stolen` |

A serial is twelve characters: two letters of model code (`VA`, `VC`), two
digits of year, two of production week, then six characters drawn from
`23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, which omits `I`, `O`, `0` and `1`.

## The boundary between customers

Authorization is enforced on the server for every mutating endpoint, not by
hiding a control. A direct API call from a signed-out session to a customer-only
endpoint is rejected and changes nothing.

- Registering a camera someone else owns is refused with
  `That camera is registered to someone else.` and writes no ownership row.
- Another customer's camera or order reads as **not found**, never forbidden.
- Two simultaneous registrations of one serial: exactly one wins, the other gets
  a `409`.
- Two concurrent checkouts for the last `VELA-A1-YELLOW`: one wins, the other is
  refused before any invoice exists, and stock never goes negative.

## Configuration

Every host, port and credential is read from the environment at container start;
none is baked into the image.

| Variable | What it is |
|---|---|
| `DATABASE_URL` | PostgreSQL. The schema and seed are applied at start and are idempotent. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Mail. `SMTP_USER` and `SMTP_PASS` are used only when set. |
| `PAYMENTS_API_URL`, `PAYMENTS_API_KEY`, `PAYMENTS_API_SECRET`, `PAYMENTS_ADMIN_USER`, `PAYMENTS_ADMIN_PASSWORD` | killbill. |
| `PORT` | The port to bind. Defaults to `4173`, which is the container-internal port. |
| `AUTH_SECRET` | Optional. Signs bearer tokens; derived from `DATABASE_URL` when unset. |

## Notes on the build

- **Astro with islands** renders every route as server HTML. Only the scroll
  driver, the cart controls, the installer and the register row are client
  islands, plus the footer field and the rail control.
- **Hono** serves the API under `/api` on the same origin, in the same process.
- Money is an integer count of minor units in `usd` in every layer, including
  the browser. Tax is ten percent of the line subtotal, on integers, truncated.
  Shipment protection is excluded from tax.
- Logs are one line of JSON per request on stdout, carrying the method, route,
  status, elapsed milliseconds and a `request_id`. The same `request_id` appears
  in the body of every error response.
- The display face is **Archivo**, used under the SIL Open Font License, subset
  to Latin and shipped in weights 400 and 700 only. Its licence is at
  `/fonts/OFL.txt`. The film behind the letter, its still frame and the product
  images were generated for this app and are not anyone else's work.

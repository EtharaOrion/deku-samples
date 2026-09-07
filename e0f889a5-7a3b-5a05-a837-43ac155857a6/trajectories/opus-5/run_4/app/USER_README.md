# Vela — how to sign in and what to try

The app serves both the site and its HTTP API on one origin. The API lives
under `/api`, and `GET /api/health` answers `200` once the app is ready.

## Accounts

Guest checkout is the default, so **you do not need an account to buy
anything**. Two accounts are seeded so the ownership boundary between two
customers is real.

**Every seeded account uses the password `deku-demo-pw-2026`.** This is
benchmark fixture data, not a secret.

| Email | Name | Password | Holds |
|---|---|---|---|
| `customer@example.com` | Iris Vantaa | `deku-demo-pw-2026` | order `VE-2026-0001`, camera `VC2609PVDA7Q` |
| `customer2@example.com` | Rune Halden | `deku-demo-pw-2026` | camera `VA2609NRWB2Z` |

Sign in at `/sign-in`. Signup is open at `/sign-up`.

## The graded journey

1. Read the letter at `/`, then follow **Shop** in the footer.
2. Add a **Vela Cricket** in **Graphite** and a **Travel Case**. `/cart` reads
   `$378.00`.
3. Check out as a guest with `customer@example.com` on **Standard** delivery.
   Tax is `$37.80` and the total is `$415.80`.
4. You land on `/orders/VE-2026-0002`, which reads
   `Order VE-2026-0002 is confirmed. We have emailed customer@example.com.`

That order is real outside this app:

- **killbill** holds an account whose `externalKey` is `customer@example.com`
  and one committed invoice on it for `415.80` `USD`.
- **Mailpit** holds exactly one message, to that address alone with no cc and
  no bcc, subject `Order confirmed: VE-2026-0002`.

Submitting the same order twice produces one order, one invoice and one mail:
the browser sends a fixed `Idempotency-Key` for each rendering of the payment
step, and a replay returns the original order.

> Note on reading the invoice back from killbill: this tenant runs Kill Bill
> `0.24.21`, whose `GET /1.0/kb/invoices/pagination` returns invoices without
> their items and therefore reports `amount` as `0.0` for every invoice,
> including ones created by other means. The amount is reported correctly by
> `GET /1.0/kb/invoices/{invoiceId}` and by
> `GET /1.0/kb/accounts/{accountId}/invoices?includeInvoiceComponents=true`,
> both of which show `415.80`. That is a property of the platform's list
> endpoint, not of what was written.

## Other things to try

**Register a camera.** Sign in as `customer@example.com`, go to
`/account/cameras` and register `VA2609KTMHX4`. It is a real device with no
live owner, so it registers.

The ownership boundary is enforced server-side, not by hiding controls:

- `VA2609NRWB2Z` belongs to the other customer and is refused with
  `That camera is registered to someone else.`
- `VC2609WJ3DKT` is blocked and is refused as blocked.
- Any serial that is not a real one reads
  `We do not recognise that serial number.`
- A serial that is not twelve characters of the right shape is refused before
  any lookup happens.

**The archive.** `/downloads` lists every release newest build first. `1.4.3`
and `1.4.2` share the release date `2024-05-20` and still order deterministically,
because the sort key is the build number. Expand `Arranger 1.4.3`, or open
`/downloads/1.4.3` for the same release expanded on its own address.

**The firmware installer.** `/doctor` writes firmware to a camera Arranger
cannot reach. Accept the warning, then enter `VC2609PVDA7Q` and write `7.2`.
The session records the version the camera reports back, not the one that was
asked for. Ownership and warranty are not conditions of repair, so this works
signed out.

## Environment

Every host, port and credential is read from the environment at container
start: `DATABASE_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
`PAYMENTS_API_URL`, `PAYMENTS_API_KEY`, `PAYMENTS_API_SECRET`,
`PAYMENTS_ADMIN_USER` and `PAYMENTS_ADMIN_PASSWORD`. The app listens on
`0.0.0.0` at the container-internal port `4173`.

The app applies its own schema and seed on boot, inside an advisory lock, and
seeding is idempotent, so restarting it never duplicates a row and a database
created from scratch needs no manual step.

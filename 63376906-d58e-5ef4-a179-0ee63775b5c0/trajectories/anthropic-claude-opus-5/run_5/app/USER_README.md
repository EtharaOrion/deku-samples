# Ravel

Ravel records what a chemical recycling plant did, after the run, and produces
the claims and the certificates a customer files with their own regulator. It
controls no equipment, reads no live sensor and raises no alarm.

## Signing in

**Signup is closed.** The seven seeded accounts below are the only accounts.
There is no password reset and no self-service account creation.

Every account signs in with the same password: `deku-demo-pw-2026`

| Email | Name | Role | Sites |
|---|---|---|---|
| `plant@example.com` | Ines Bekele | plant operator | `SITE-DEMO`, `SITE-PILOT` |
| `analyst@example.com` | Tomas Vlach | laboratory analyst | `SITE-DEMO`, `SITE-PILOT` |
| `quality@example.com` | Marit Solheim | quality manager | `SITE-DEMO`, `SITE-PILOT` |
| `claims@example.com` | Osei Danquah | claims manager | `SITE-DEMO`, `SITE-PILOT` |
| `signer@example.com` | Hana Ferreira | certificate signer | `SITE-DEMO`, `SITE-PILOT` |
| `signer2@example.com` | Pavel Ostrowski | certificate signer | `SITE-PILOT` only |
| `auditor@example.com` | Ruth Lindqvist | auditor | `SITE-DEMO`, `SITE-PILOT` |

Every grant ends on `2027-06-30`. Nothing renews silently.

Sign in at `/login`. The console is at `/console`; an anonymous reader is
redirected to `/login`.

## The routes with no account

`/`, `/product`, `/technology`, `/about`, `/careers`, `/news`, `/contact`,
`/privacy`, and the public verification address `/verify/{number}`.

Two certificates exist to try:

- `/verify/CERT-PILOT-000001` — withdrawn on 2026-04-18, and says so.
- `/verify/CERT-DEMO-999999` — no such certificate, in the same layout.

## Five journeys worth walking

**A claims manager allocates and is refused.** Sign in as `claims@example.com`,
open `/console/balance/BP-DEMO-N6-2026H1`, and read credits in, credits out and
credits available per category. Attach more post-consumer claim to
`LOT-N6-0001` than the ledger holds — 500000 g against 360000 g available. The
allocation does not happen, an inline banner names both masses, and the figures
on the screen are unchanged.

**A signer meets a blocking condition.** Sign in as `signer@example.com` and
walk `/console/certificates/new/lot`, `/claim`, `/recipient`, `/review`. Choose
`LOT-N6-0001`. Each step is at its own address and each shows the eight
conditions as they stand. `OVR-0001` is unreviewed and blocks. Nothing on the
screen dismisses it. It clears when somebody other than its authoriser reviews
it — `claims@example.com` can, `quality@example.com` cannot.

**A withdrawal shows its blast radius.** Sign in as `signer2@example.com`, open
`/console/certificates/CERT-PILOT-000002` and begin a withdrawal. Before
confirming, the screen names the recipients by name, not by count, and lists the
statements the recipient must stop making. After confirming, the certificate
address still resolves and states the withdrawal.

**An auditor reads and exports.** Sign in as `auditor@example.com`, open
`/console/lots/LOT-N6-0001/genealogy`, and read the same facts twice — as the
graph and as a nested list. `BATCH-1001` appears once at 450000 g although it
reaches the lot by two paths. Export it. Every mutating control is absent, and
the export is itself an entry.

**Signing a certificate re-authenticates.** The signing act carries the password
again. A session alone is not a signing credential.

## Notes for a reader

- No route accepts a recycled-content percentage, a carbon value or a loss
  figure. Every one is computed, and the input controls that would permit one do
  not exist.
- Every mass is an integer number of grams, every proportion an integer number
  of basis points. Every derived integer is floored.
- Every write carries an `Idempotency-Key` header. A write with no key is
  refused, so a retry can never be indistinguishable from a second act.
- `GET /api/health` needs no session and answers `200` once the app is ready.
- Mail leaves through mailpit on four acts only: a certificate signed, a
  certificate withdrawn, a change notice needing acknowledgement, and an enquiry
  received. Allocating claim, closing a period, opening a restatement, reviewing
  an override and setting a disposition all send nothing.

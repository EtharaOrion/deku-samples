# Ravel

Ravel returns mixed polyamide waste to virgin-quality pellet. This application is the
production and attestation record behind that plant, and the public site in front of it.

The material is deliberately indistinguishable from the incumbent, so the buyer is not
paying for the pellet. The buyer is paying for origin, and origin exists only as a record.

## Signing in

Signup is closed. There is no password reset and no self-service account creation. The
seven seeded accounts are the only accounts, they authenticate at `keycloak`, and every one
signs in with the same password:

**Password for every account: `deku-demo-pw-2026`**

| Email | Name | Role | Sites |
|---|---|---|---|
| `plant@example.com` | Ines Bekele | Plant operator | `SITE-DEMO`, `SITE-PILOT` |
| `analyst@example.com` | Tomas Vlach | Laboratory analyst | `SITE-DEMO`, `SITE-PILOT` |
| `quality@example.com` | Marit Solheim | Quality manager | `SITE-DEMO`, `SITE-PILOT` |
| `claims@example.com` | Osei Danquah | Claims manager | `SITE-DEMO`, `SITE-PILOT` |
| `signer@example.com` | Hana Ferreira | Certificate signer | `SITE-DEMO`, `SITE-PILOT` |
| `signer2@example.com` | Pavel Ostrowski | Certificate signer | `SITE-PILOT` only |
| `auditor@example.com` | Ruth Lindqvist | Auditor | `SITE-DEMO`, `SITE-PILOT` |

Every grant ends on `2027-06-30`. A session expires twelve hours after it is issued, and
nothing renews silently.

The public routes and `/verify/{number}` need no account at all.

## Where to start

### The public site, with no session

`/` · `/product` · `/technology` · `/about` · `/careers` · `/news` · `/contact` · `/privacy`

`/verify/CERT-PILOT-000001` resolves without a session and states that the certificate was
withdrawn, on what date and for what reason. It offers no forwarding to a replacement.
`/verify/CERT-DEMO-999999` reads the same layout saying there is no such certificate.

### Four journeys worth walking

**A claims manager allocates and is refused.** Sign in as `claims@example.com`, open
`/console/balance/BP-DEMO-N6-2026H1` and read credits in, out and available per category.
The ledger holds `360000` g of post-consumer credit. Ask for `500000` g against
`LOT-N6-0001`: the allocation does not happen, an inline banner names the available and the
requested mass, and the figures on the screen do not move.

**A signer meets a blocking condition.** Sign in as `signer@example.com` and walk
`/console/certificates/new/lot` → `/claim` → `/recipient` → `/review`. Each step is at its
own address and each shows the eight conditions. Choose `LOT-N6-0001` and one condition is
unsatisfied: override `OVR-0001` is unreviewed. The screen links to the record that would
resolve it, and no control on the screen dismisses it. Clearing it needs a review by
somebody other than its authoriser — sign in as `claims@example.com`, open
`/console/overrides/OVR-0001` and review it. (`quality@example.com` authorised it and is
refused their own review.)

**A withdrawal shows its blast radius.** Sign in as `signer2@example.com`, open
`/console/certificates/CERT-PILOT-000002` and begin a withdrawal. Before confirming, the
screen names the recipients who will be notified — by name, not as a count — and the
downstream statements the recipient must stop making. After confirming, the address still
resolves and states the withdrawal.

**An auditor reads and exports.** Sign in as `auditor@example.com` and open
`/console/lots/LOT-N6-0001/genealogy`. The same facts appear twice, as a graph and as a
nested list. `BATCH-1001` reaches the lot by two paths and appears once, at `450000` g.
Export it; the export is itself an entry in the record. Every mutating control is absent.

### The console

`/console` is a board with one column per process stage and one card per run. Its other
top-level sections are `/console/intake`, `/console/record`, `/console/reconciliation` and
`/console/certificates`. `/console` and everything under it redirect an anonymous reader to
`/login`.

## Two rules that do most of the work

**Losses reduce the claim.** Material that disappears in processing does not carry its claim
forward.

**No claim percentage is ever accepted from a person, on any route, in any form.** Every
percentage is computed from the ledger. A route handed a `content_bp` refuses it with
`percentage_not_accepted`.

Every derived integer is floored, never rounded: a batch of `12345` g at `5000` basis points
of moisture is `6172` g dry, not `6173`, and `200000` g of claim on a `300000` g lot is
`6666` basis points, not `6667`.

## Talking to the API

Every write carries an `Idempotency-Key` header. The same key with the same body returns the
original result; the same key with a different body answers `409 idempotency_key_reuse`; a
write with no key at all is refused.

```bash
# sign in
curl -s -X POST "$APP_PUBLIC_URL/api/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"claims@example.com","password":"deku-demo-pw-2026"}'

# the public verification answer, no session
curl -s "$APP_PUBLIC_URL/api/verify/CERT-PILOT-000001"

# a certificate document, as plain text and byte-stable across reads
curl -s "$APP_PUBLIC_URL/api/certificates/CERT-PILOT-000001/document"

# readiness
curl -s "$APP_PUBLIC_URL/api/health"
```

## What this system does not do

It controls no equipment, holds no set point, drives no valve and raises no alarm. It reads
the control system's record after the fact and shows the disagreement rather than resolving
it. It builds no life-cycle model, issues no invoice and holds no price. It sends mail for
exactly four acts: a certificate signed, a certificate withdrawn, a change notice needing
acknowledgement and an enquiry received. Allocating claim, closing a period, opening a
restatement, reviewing an override and setting a disposition all send nothing.

## Fonts

Three variable faces are served from this origin, subset to the characters the site uses:
Source Serif 4, Inter and JetBrains Mono. All three are under the SIL Open Font License 1.1
and are redistributable.

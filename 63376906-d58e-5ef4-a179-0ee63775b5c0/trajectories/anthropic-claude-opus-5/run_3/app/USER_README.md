# Ravel

A chemical recycling plant's production and attestation system, and the public
site in front of it.

Waste arrives in batches from named collectors. Timed process runs consume those
batches across four stages and produce lots of polymer. Every lot carries two
claims that are worth money and are not properties of the material: how much
recycled input it represents, and what it emitted. Both are allocated by
arithmetic, and both end up on a certificate a customer files with their own
regulator.

The unit of work is the lot. The unit of value is the certificate.

## Signing in

Signup is closed. There is no password reset and no self-service account
creation. The seven seeded accounts below are the only accounts, they all
authenticate at `keycloak`, and **every one signs in with the password
`deku-demo-pw-2026`**.

| Email | Name | Role | Sites in scope |
|---|---|---|---|
| `plant@example.com` | Ines Bekele | plant operator | `SITE-DEMO`, `SITE-PILOT` |
| `analyst@example.com` | Tomas Vlach | laboratory analyst | `SITE-DEMO`, `SITE-PILOT` |
| `quality@example.com` | Marit Solheim | quality manager | `SITE-DEMO`, `SITE-PILOT` |
| `claims@example.com` | Osei Danquah | claims manager | `SITE-DEMO`, `SITE-PILOT` |
| `signer@example.com` | Hana Ferreira | certificate signer | `SITE-DEMO`, `SITE-PILOT` |
| `signer2@example.com` | Pavel Ostrowski | certificate signer | `SITE-PILOT` only |
| `auditor@example.com` | Ruth Lindqvist | auditor | `SITE-DEMO`, `SITE-PILOT` |

Every grant ends on `2027-06-30`. Nothing renews silently: past that date an
account signs in and carries no roles.

Sign in at `/login`. The console is at `/console`; it and everything under it
redirect an anonymous reader to `/login`.

## Where to start

The public site needs no account at all:

- `/` `/product` `/technology` `/about` `/careers` `/news` `/contact` `/privacy`
- `/verify/{number}` — public certificate verification. Try
  `/verify/CERT-PILOT-000001`, which resolves and states its withdrawal, and
  `/verify/CERT-DEMO-999999`, which reads the same layout and says there is no
  such certificate.

The console has five top-level sections, reachable from the persistent top bar:

- `/console` — the run board, one column per process stage, one card per run
- `/console/intake` — the batch register
- `/console/record` — the append-only record and the nine questions it answers
- `/console/reconciliation` — six figures, not six verdicts
- `/console/certificates` — the certificate register and the issuing wizard

## Four journeys worth walking

**A claims manager is refused an allocation.** Sign in as `claims@example.com`
and open `/console/balance/BP-DEMO-N6-2026H1`. The period holds `360000` g of
post-consumer credit. Try to allocate `400000` g to `LOT-N6-0001`. The
allocation does not happen, an inline banner names the available mass and the
requested mass, and the figures on the screen are unchanged. Allocate `360000` g
instead and the lot reads `90.00%`, computed from the ledger — no route in this
product accepts a percentage from anybody.

**A signer meets a blocking condition.** Sign in as `signer@example.com` and open
`/console/certificates/new/lot`. Choose `LOT-N6-0001`, then walk
`/console/certificates/new/claim`, `/…/recipient` and `/…/review`. Each of the
four steps is reachable at its own address and each shows the same eight
conditions. `OVR-0001`, an unreviewed override, blocks, and links to the record
that would resolve it. No control on the screen dismisses it. It clears only when
somebody other than its authoriser reviews it at `/console/overrides/OVR-0001` —
`quality@example.com` authorised it, so `quality@example.com` cannot.

**A withdrawal shows its blast radius.** Sign in as `signer2@example.com`, open
`/console/certificates/CERT-PILOT-000002` and begin a withdrawal. Before
confirming, the screen lists the recipients who will be notified *by name*, not
as a count, and the downstream statements the recipient must stop making. After
confirming, the certificate's address still resolves and states the withdrawal.

**An auditor reads and exports.** Sign in as `auditor@example.com` and open
`/console/lots/LOT-N6-0001/genealogy`. The same facts render twice, as the graph
and as the nested list. `BATCH-1001` reaches the lot by two paths and appears
exactly once, at `450000` g. Export it: the export is itself an entry in the
record. Every mutating control is absent, and every mutating route refuses this
account.

## Things worth knowing

- **Every figure is computed and floored.** Never rounded, never carried at half.
  A batch of `12345` g at `5000` basis points of moisture is `6172` g dry, not
  `6173`. `200000` g of claim on a lot of `300000` g is `6666` basis points, not
  `6667`.
- **No decimal crosses the wire.** Mass is integer grams (`_g`), proportion is
  integer basis points (`_bp`, `10000` is one hundred per cent), carbon is
  integer mg CO2e per kg (`_mg_per_kg`).
- **Every write needs an `Idempotency-Key` header.** A write without one is
  refused, so a retry is never indistinguishable from a second act. The same key
  with a different body answers `409`.
- **A refusal is an answer.** It names what was refused and what would change it,
  and it is recorded in the append-only record alongside the successes.
- **Nothing is green.** No state anywhere is signalled by colour alone: a
  non-claimable batch, a lapsed calibration, an open deviation, an unreviewed
  override, a withdrawn certificate and a planned capacity row each carry their
  word.

## Health

`GET /api/health` returns `200` once the app is ready, and needs no session.

## Configuration

Every address is read from the environment at container start and none is
hardcoded:

| Variable | What it reaches |
|---|---|
| `DATABASE_URL` | `postgres`, which holds every record |
| `AUTH_ISSUER_URL`, `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET` | `keycloak`, which holds the accounts and the roles |
| `SMTP_HOST`, `SMTP_PORT` | `mailpit`, through which every mail leaves |

The app serves on container port `4173`, bound to `0.0.0.0`. The HTTP API is on
that same origin under `/api`. The schema and the seed are applied by the image
on first start; a restart against a seeded database leaves it alone.

Four acts send mail and nothing else does: a certificate is signed, a certificate
is withdrawn, a change notice needs acknowledgement, and an enquiry is received.
Allocating claim, closing a period, opening a restatement, reviewing an override
and setting a disposition all send nothing.

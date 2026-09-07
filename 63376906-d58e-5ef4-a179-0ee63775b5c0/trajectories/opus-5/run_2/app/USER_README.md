# Ravel

Ravel records the production of virgin-quality recycled polyamide and issues the
certificates that state where it came from.

The public site needs no account. The console at `/console` needs one, and signup
is closed: the seven seeded accounts below are the only accounts.

## Sign in

Every account signs in with the same password: `deku-demo-pw-2026`

| Email | Name | Role | Sites |
|---|---|---|---|
| `plant@example.com` | Ines Bekele | Plant operator | SITE-DEMO, SITE-PILOT |
| `analyst@example.com` | Tomas Vlach | Laboratory analyst | SITE-DEMO, SITE-PILOT |
| `quality@example.com` | Marit Solheim | Quality manager | SITE-DEMO, SITE-PILOT |
| `claims@example.com` | Osei Danquah | Claims manager | SITE-DEMO, SITE-PILOT |
| `signer@example.com` | Hana Ferreira | Certificate signer | SITE-DEMO, SITE-PILOT |
| `signer2@example.com` | Pavel Ostrowski | Certificate signer | SITE-PILOT only |
| `auditor@example.com` | Ruth Lindqvist | Auditor | SITE-DEMO, SITE-PILOT |

Every grant ends on `2027-06-30`. A session expires twelve hours after issue.

## Public routes, no account needed

`/` · `/product` · `/technology` · `/about` · `/careers` · `/news` · `/contact` ·
`/privacy`, and the public verification address `/verify/{number}`.

Try `/verify/CERT-PILOT-000001` — a withdrawn certificate that states its
withdrawal — and `/verify/CERT-DEMO-999999`, which reads the same layout saying
there is no such certificate.

## Four things worth walking

**A claims manager is refused an allocation.** Sign in as `claims@example.com`,
open `/console/balance/BP-DEMO-N6-2026H1` and read credits in, out and available
per category. Attach more post-consumer claim to `LOT-N6-0001` than the ledger
holds: the allocation does not happen, an inline banner names the available and
the requested mass, and the figures on the screen are unchanged.

**A signer meets a blocking condition.** Sign in as `signer@example.com` and walk
`/console/certificates/new/lot` → `/claim` → `/recipient` → `/review`, choosing
`LOT-N6-0001`. Each step is its own address and each shows the eight conditions.
One is unsatisfied — the unreviewed override `OVR-0001` — and no control on the
screen dismisses it. It clears when somebody other than its authoriser reviews it,
which `claims@example.com` can do.

**A withdrawal shows its blast radius.** Sign in as `signer2@example.com`, open
`/console/certificates/CERT-PILOT-000002` and begin a withdrawal. Before
confirming, the screen names the recipients who will be notified and the
statements that become void. Afterwards the address still resolves and states the
withdrawal.

**An auditor reads and exports.** Sign in as `auditor@example.com` and open
`/console/lots/LOT-N6-0001/genealogy`. The same facts appear twice, as a graph and
as a nested list. Export it; the export is itself an entry in the record. Every
mutating control is absent.

## Notes on the figures

Mass is integer grams (`_g`), proportion is integer basis points (`_bp`, where
10000 is one hundred per cent), carbon is milligrams of CO2e per kilogram
(`_mg_per_kg`), energy is kilowatt hours (`_kwh`) and capacity is kilograms per
year (`_kg`). No figure crosses the wire as a decimal.

Every derived integer is floored, never rounded. No route accepts a recycled
content percentage, a carbon value or a loss figure from a caller: all of them are
computed, and the input controls that would permit one do not exist.

`GET /api/health` answers 200 once the app is ready and needs no session.

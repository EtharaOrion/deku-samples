# Ravel

Ravel returns mixed polyamide waste to virgin-quality pellet, and records what
each run did after the run. The product does not run the plant: it reads no
sensor, holds no set point and raises no alarm.

## Signing in

Signup is closed. These seven seeded accounts are the only accounts. Every one
authenticates at `keycloak` and every one signs in with the same password.

**Password for every account: `deku-demo-pw-2026`**

| Email | Name | Role | Sites | Grant ends |
|---|---|---|---|---|
| `plant@example.com` | Ines Bekele | Plant operator | `SITE-DEMO`, `SITE-PILOT` | 2027-06-30 |
| `analyst@example.com` | Tomas Vlach | Laboratory analyst | `SITE-DEMO`, `SITE-PILOT` | 2027-06-30 |
| `quality@example.com` | Marit Solheim | Quality manager | `SITE-DEMO`, `SITE-PILOT` | 2027-06-30 |
| `claims@example.com` | Osei Danquah | Claims manager | `SITE-DEMO`, `SITE-PILOT` | 2027-06-30 |
| `signer@example.com` | Hana Ferreira | Certificate signer | `SITE-DEMO`, `SITE-PILOT` | 2027-06-30 |
| `signer2@example.com` | Pavel Ostrowski | Certificate signer | `SITE-PILOT` only | 2027-06-30 |
| `auditor@example.com` | Ruth Lindqvist | Auditor | `SITE-DEMO`, `SITE-PILOT` | 2027-06-30 |

There is no password reset and no self-service account creation. A session
expires twelve hours after it is issued. Signing a certificate re-authenticates:
the signing act carries the password again, because a session alone is not a
signing credential.

## The public site, with no account

| Route | What it is |
|---|---|
| `/` | Home |
| `/product` | The two grades, the specification and the claim |
| `/technology` | The four process steps and the capacity table |
| `/about` | The published figures with their sources |
| `/careers` | Open roles |
| `/news` | Coverage |
| `/contact` | Four enquiry types, four stated response times |
| `/privacy` | Controller, retention per purpose, rights address |
| `/verify/{number}` | Public certificate verification, no session |

Two verification addresses worth trying:

- `/verify/CERT-PILOT-000001` — a withdrawn certificate. It states the
  withdrawal, its date and its reason, and offers no forwarding to a
  replacement.
- `/verify/CERT-DEMO-999999` — an unknown number. The same layout, saying there
  is no such certificate.

## The console

`/console` and everything under it need a session; an anonymous reader is sent
to `/login`.

| Route | What it is |
|---|---|
| `/console` | A board, one column per process stage, one card per run |
| `/console/intake` | Feedstock arrival: batches, collectors, approval periods |
| `/console/record` | The append-only record, the digest chain and the nine queries |
| `/console/reconciliation` | Six figures, refreshed on a schedule |
| `/console/certificates` | The certificate register |
| `/console/balance/{id}` | The ledger for one period |
| `/console/lots/{ref}/genealogy` | The graph and the same facts as a nested list |
| `/console/certificates/new/{step}` | The four-step signing wizard |

## Four journeys to walk

**A claims manager allocates and is refused.** Sign in as `claims@example.com`,
open `/console/balance/BP-DEMO-N6-2026H1` and read credits in, credits out and
credits available per category. Allocate more post-consumer claim to
`LOT-N6-0001` than the ledger holds — try 900000 g against the 360000 g
available. The allocation does not happen, an inline banner names both masses,
and the figures on the screen are unchanged.

**A signer meets a blocking condition.** Sign in as `signer@example.com` and
open `/console/certificates/new/lot`. Choose `LOT-N6-0001`, then walk `claim`,
`recipient` and `review`. Each step is at its own address and each shows the
eight conditions. The unreviewed override `OVR-0001` blocks, and no control on
the screen dismisses it. Clear it by having somebody other than its authoriser
review it: sign in as `claims@example.com` and open `/console/overrides/OVR-0001`.

**A withdrawal shows its blast radius.** Sign in as `signer2@example.com` and
open `/console/certificates/CERT-PILOT-000002`. Begin a withdrawal. Before
confirming, the screen lists the recipients by name and the statements that
become void. After confirming, the address still resolves and states the
withdrawal.

**An auditor reads and exports.** Sign in as `auditor@example.com` and open
`/console/lots/LOT-N6-0001/genealogy`. Read the same facts twice, as the graph
and as the nested list, then export. Every mutating control is absent, and the
export is itself an entry in the record.

## Two rules that do most of the work

**Losses reduce the claim.** Material that disappears in processing does not
carry its claim forward.

**No claim percentage is ever accepted from a person, on any route, in any
form.** Every percentage is computed from the ledger. The input controls that
would permit one do not exist.

## Units

| Quantity | Suffix | Unit |
|---|---|---|
| Mass | `_g` | integer grams |
| Proportion, content, factor, uncertainty | `_bp` | integer basis points, 10000 is one hundred per cent |
| Carbon | `_mg_per_kg` | integer mg CO₂e per kg of product |
| Energy | `_kwh` | integer kilowatt hours |
| Capacity | `_kg` | integer kilograms per year |

No figure crosses the wire as a decimal, and every derived integer is floored —
never rounded, never carried at half.

## Services

Read from the environment at container start, never hardcoded:
`DATABASE_URL`, `AUTH_ISSUER_URL`, `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`,
`SMTP_HOST`, `SMTP_PORT`.

`GET /api/health` returns `200` once the schema is applied and the seed has run.

Mail leaves through `mailpit` on exactly four acts: a certificate is signed, a
certificate is withdrawn, a change notice needs acknowledgement, and an enquiry
is received. Nothing else sends mail.

# Ravel

Ravel records the production and attestation of recycled polyamide: batches in from named
collectors, timed process runs through four stages, lots out, and a certificate a customer
files with their own regulator.

## Signing in

Signup is closed. The seven seeded accounts below are the only accounts. They authenticate at
`keycloak`, and **every one signs in with the password `deku-demo-pw-2026`**.

| Email | Name | Role | Sites |
|---|---|---|---|
| `plant@example.com` | Ines Bekele | Plant operator | `SITE-DEMO`, `SITE-PILOT` |
| `analyst@example.com` | Tomas Vlach | Laboratory analyst | `SITE-DEMO`, `SITE-PILOT` |
| `quality@example.com` | Marit Solheim | Quality manager | `SITE-DEMO`, `SITE-PILOT` |
| `claims@example.com` | Osei Danquah | Claims manager | `SITE-DEMO`, `SITE-PILOT` |
| `signer@example.com` | Hana Ferreira | Certificate signer | `SITE-DEMO`, `SITE-PILOT` |
| `signer2@example.com` | Pavel Ostrowski | Certificate signer | `SITE-PILOT` only |
| `auditor@example.com` | Ruth Lindqvist | Auditor | `SITE-DEMO`, `SITE-PILOT` |

Every grant ends on `2027-06-30`. Signing a certificate re-authenticates: the signing act
carries the password again, because a session alone is not a signing credential.

## Where to start

The public site needs no account: `/`, `/product`, `/technology`, `/about`, `/careers`,
`/news`, `/contact`, `/privacy`, and the public `/verify/{number}`.

The console opens at `/console` and redirects an anonymous reader to `/login`.

- `/console` — the run board, one column per process stage.
- `/console/intake` — feedstock arrival, claimability and collector approvals.
- `/console/lots` — the lot register.
- `/console/balance` and `/console/balance/BP-DEMO-N6-2026H1` — the ledger.
- `/console/certificates` — issued certificates, and the four-step wizard at
  `/console/certificates/new/lot`.
- `/console/record` — the append-only record and the nine questions it answers.
- `/console/reconciliation` — six figures, refreshed on a schedule.

## Four journeys worth walking

1. **A claims manager allocates and is refused.** Sign in as `claims@example.com`, open
   `/console/balance/BP-DEMO-N6-2026H1` and press *Attach more than the ledger holds*. The
   allocation does not happen; an inline banner names the available mass and the requested
   mass, and the figures are unchanged.
2. **A signer meets a blocking condition.** Sign in as `signer@example.com` and walk
   `/console/certificates/new/lot` → `claim` → `recipient` → `review` with `LOT-N6-0001`.
   Override `OVR-0001` is unreviewed and blocks signing. Nothing on the screen dismisses it;
   a review by somebody other than its authoriser clears it.
3. **A withdrawal shows its blast radius.** Sign in as `signer2@example.com`, open
   `/console/certificates/CERT-PILOT-000002` and begin a withdrawal. The recipients are named
   rather than counted, and the statements that become void are listed.
4. **A visitor checks a certificate.** Open `/verify/CERT-PILOT-000001` with no session, then
   `/verify/CERT-DEMO-999999` for the same layout saying there is no such certificate.

## Services

Every address is read from the environment at container start and none is hardcoded:
`DATABASE_URL`, `AUTH_ISSUER_URL`, `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`, `SMTP_HOST` and
`SMTP_PORT`. Mail leaves through `mailpit` for exactly four acts: a certificate signed, a
certificate withdrawn, a change notice needing acknowledgement, and an enquiry received.

`GET /api/health` answers `200` once the app is ready and needs no session.

## Two rules

Losses reduce the claim: material that disappears in processing does not carry its claim
forward. And no claim percentage is ever accepted from a person, on any route, in any form —
every percentage is computed from the ledger, floored, never rounded.

## Third-party assets

The three typefaces are subset and served from this origin, all under the SIL Open Font
Licence 1.1, which permits redistribution: Source Serif 4, Archivo and JetBrains Mono. No
photograph, partner mark or named individual appears anywhere; the process diagram and the
four interface marks are drawn as inline vectors from the app's own data.

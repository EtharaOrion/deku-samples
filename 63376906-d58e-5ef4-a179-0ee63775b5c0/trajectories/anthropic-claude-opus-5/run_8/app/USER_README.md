# Ravel

Ravel records what a chemical recycling plant did, after the run, and issues the
certificates that carry the claims a customer files with their own regulator.

The app is served as one production build from one origin. The HTTP API is under
`/api` on that same origin. `GET /api/health` answers `200` once the database is
migrated, the seed is applied and the client is on disk.

## Signing in

Signup is closed. These seven accounts are the only accounts, and **every one of
them signs in with the password `deku-demo-pw-2026`**.

| Email | Name | Role | Sites |
|---|---|---|---|
| `plant@example.com` | Ines Bekele | Plant operator | `SITE-DEMO`, `SITE-PILOT` |
| `analyst@example.com` | Tomas Vlach | Laboratory analyst | `SITE-DEMO`, `SITE-PILOT` |
| `quality@example.com` | Marit Solheim | Quality manager | `SITE-DEMO`, `SITE-PILOT` |
| `claims@example.com` | Osei Danquah | Claims manager | `SITE-DEMO`, `SITE-PILOT` |
| `signer@example.com` | Hana Ferreira | Certificate signer | `SITE-DEMO`, `SITE-PILOT` |
| `signer2@example.com` | Pavel Ostrowski | Certificate signer | `SITE-PILOT` only |
| `auditor@example.com` | Ruth Lindqvist | Auditor | `SITE-DEMO`, `SITE-PILOT` |

Every grant ends on `2027-06-30`. A session lasts twelve hours from issue. There
is no signup, no password reset and no self-service account creation.

Signing a certificate re-authenticates: the signing step asks for the password
again, because a session alone is not a signing credential.

## Where to start

The public site needs no account at all:

- `/` the home page, `/product`, `/technology`, `/about`, `/careers`, `/news`,
  `/contact`, `/privacy`
- `/verify/CERT-PILOT-000001` — a withdrawn certificate, stating its withdrawal,
  its date and its reason
- `/verify/CERT-DEMO-999999` — the same layout saying there is no such certificate

The console opens at `/console` and needs a session; anything under it sends an
anonymous reader to `/login`.

Four journeys worth walking:

1. **An allocation is refused.** Sign in as `claims@example.com`, open
   `/console/balance/BP-DEMO-N6-2026H1`, and allocate `500000` g of post-consumer
   claim to `LOT-N6-0001`. The ledger holds `360000` g. The allocation does not
   happen, the banner names both masses, and the figures on the screen do not move.
2. **A signer meets a blocking condition.** Sign in as `signer@example.com` and
   walk `/console/certificates/new/lot`, `/claim`, `/recipient`, `/review`. Each
   step is its own address and each shows the same eight conditions. `OVR-0001`
   on `LOT-N6-0001` is unreviewed and blocks. Nothing on the screen dismisses it;
   a second person reviewing the override at `/console/overrides/OVR-0001` clears it.
3. **A withdrawal shows its blast radius.** Sign in as `signer2@example.com`, open
   `/console/certificates/CERT-PILOT-000002` and begin a withdrawal. The recipients
   are named rather than counted, and the statements that become void are listed.
   After confirming, the address still resolves and states the withdrawal.
4. **An auditor reads and exports.** Sign in as `auditor@example.com` and open
   `/console/lots/LOT-N6-0001/genealogy`. The same facts read twice, as the graph
   and as a nested list. Export it; the export is itself an entry in the record.

## What this system does not do

It controls no equipment, holds no set point, drives no valve and raises no alarm.
It reads the control system's record after the fact and shows the disagreement
rather than resolving it. It issues no invoice and holds no price. It sends mail
for exactly four acts: a certificate signed, a certificate withdrawn, a change
notice needing acknowledgement, and an enquiry received.

## Configuration

Every service address is read from the environment at container start and none is
hardcoded: `DATABASE_URL`, `AUTH_ISSUER_URL`, `AUTH_CLIENT_ID`,
`AUTH_CLIENT_SECRET`, `SMTP_HOST` and `SMTP_PORT`. The app listens on `0.0.0.0`
at the container-internal port `4173`.

The schema and the seed are applied by the app on first start. The seed runs once
and only into an empty database.

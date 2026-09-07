# Ravel

Ravel returns mixed polyamide waste to virgin-quality pellet, and issues the certificate that
proves where it came from. This app records what a run did, after the run; it controls no
equipment, reads no live sensor and raises no alarm.

## Signing in

Signup is closed. The seven seeded accounts below are the only accounts, and every one of them
signs in with the same password. There is no password reset and no self-service account creation.

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

Every grant ends on `2027-06-30`. A session expires twelve hours after it is issued. Signing a
certificate asks for the password again, because a session alone is not a signing credential.

## Where to start

The public site needs no account at all:

- `/` `/product` `/technology` `/about` `/careers` `/news` `/contact` `/privacy`
- `/verify/CERT-PILOT-000001` — a withdrawn certificate, stating its withdrawal, its date and its
  reason. Try `/verify/CERT-DEMO-999999` for the same layout saying there is no such certificate.

The console opens at `/console` and needs a session; anonymous readers are sent to `/login`.

## Five journeys worth walking

**A claims manager allocates and is refused.** Sign in as `claims@example.com`, open
`/console/balance/BP-DEMO-N6-2026H1` and read credits in, out and available per category. Try to
allocate `500000` g of post-consumer claim to `LOT-N6-0001`, which holds `360000` g. The
allocation does not happen, an inline banner names the available and the requested mass, and the
figures on the screen are unchanged. Allocating exactly `360000` g leaves `content_bp` of `9000`
on a lot of `400000` g and `0` g available; a further allocation is refused.

**A signer meets a blocking condition.** Sign in as `signer@example.com` and walk
`/console/certificates/new/lot`, `/claim`, `/recipient`, `/review`. Choose `LOT-N6-0001`. Each of
the four steps is a separate address and each shows the same eight conditions. One is unsatisfied:
the override `OVR-0001` on that lot is unreviewed. No control on any of the four screens dismisses
it. Sign in as `claims@example.com`, open `/console/lots/LOT-N6-0001` and review the override —
`quality@example.com` authorised it and is refused its review — then sign as `signer@example.com`.
The certificate takes the number `CERT-DEMO-000001`.

**A withdrawal shows its blast radius.** Sign in as `signer2@example.com`, open
`/console/certificates/CERT-PILOT-000002` and begin a withdrawal. Before confirming, the screen
names the recipients by name rather than by count, and enumerates the statements the recipient is
now obliged to stop making. After confirming, the address still resolves and states the withdrawal.

**A visitor checks a certificate.** Open `/verify/CERT-PILOT-000001` with no session.

**An auditor reads and exports.** Sign in as `auditor@example.com` and open
`/console/lots/LOT-N6-0001/genealogy`. The same facts read twice, as a graph and as a nested list;
`BATCH-1001` appears once at `450000` g although it reaches the lot by two paths. Export it. Every
mutating control is absent, and the export is itself an entry in the record.

## Mail

Four acts send mail, through `mailpit`, to exactly one recipient with no copies: a certificate is
signed, a certificate is withdrawn, a change notice needs acknowledgement, an enquiry is received.
Nothing else sends mail. Read it in the mailpit web interface.

## Two rules that do most of the work

Losses reduce the claim: material that disappears in processing does not carry its claim forward.
And no claim percentage is ever accepted from a person, on any route, in any form — every one is
computed, and the input controls that would permit one do not exist.

## Notes for an operator

- The app serves the client and the API from one origin. The API is under `/api`.
- `GET /api/health` answers `200` once the schema is applied and the seed is present.
- Every service address is read from the environment at container start:
  `DATABASE_URL`, `AUTH_ISSUER_URL`, `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`, `SMTP_HOST`,
  `SMTP_PORT`. No host is hardcoded.
- The schema and the seed are applied by the image itself on first start. The seed is written
  once; a restart against a populated database leaves it alone.
- Every write to the API carries an `Idempotency-Key` header. A write without one is refused, so
  a retry can never be indistinguishable from a second act.

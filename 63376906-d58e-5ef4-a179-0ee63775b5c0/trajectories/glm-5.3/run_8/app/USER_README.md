# Ravel — sign-in

There is no signup and no self-service account creation. Seven accounts exist, all
in `keycloak`, and all use the same password: `deku-demo-pw-2026`.

| Email | Role | Sites |
|---|---|---|
| `plant@example.com` | Plant operator (Ines Bekele) | SITE-DEMO, SITE-PILOT |
| `analyst@example.com` | Laboratory analyst (Tomas Vlach) | SITE-DEMO, SITE-PILOT |
| `quality@example.com` | Quality manager (Marit Solheim) | SITE-DEMO, SITE-PILOT |
| `claims@example.com` | Claims manager (Osei Danquah) | SITE-DEMO, SITE-PILOT |
| `signer@example.com` | Certificate signer (Hana Ferreira) | SITE-DEMO, SITE-PILOT |
| `signer2@example.com` | Second certificate signer (Pavel Ostrowski) | SITE-PILOT only |
| `auditor@example.com` | Auditor (Ruth Lindqvist) | SITE-DEMO, SITE-PILOT |

Sign in at `/login`. The public site (`/`, `/product`, `/technology`, `/about`,
`/careers`, `/news`, `/contact`, `/privacy`) and `/verify/{number}` need no account.
Signing or withdrawing a certificate asks for the password again: a session alone
is not a signing credential.

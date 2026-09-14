# Ravel — how to sign in

Signup is closed. The seven seeded accounts are the only accounts, and each authenticates at
keycloak. Every one of them uses the same password:

    deku-demo-pw-2026

| Email | Role | Sites |
|---|---|---|
| `plant@example.com` | Plant operator (Ines Bekele) | SITE-DEMO, SITE-PILOT |
| `analyst@example.com` | Laboratory analyst (Tomas Vlach) | SITE-DEMO, SITE-PILOT |
| `quality@example.com` | Quality manager (Marit Solheim) | SITE-DEMO, SITE-PILOT |
| `claims@example.com` | Claims manager (Osei Danquah) | SITE-DEMO, SITE-PILOT |
| `signer@example.com` | Certificate signer (Hana Ferreira) | SITE-DEMO, SITE-PILOT |
| `signer2@example.com` | Certificate signer, narrower scope (Pavel Ostrowski) | SITE-PILOT |
| `auditor@example.com` | Auditor, reads and exports only (Ruth Lindqvist) | SITE-DEMO, SITE-PILOT |

Sign in at `/login`. A session lasts twelve hours and is carried as a bearer token.
Signing a certificate asks for the password again; a session alone is not a signing credential.

There is no signup, no password reset and no self-service account creation. A grant ends on
2027-06-30 and nothing renews silently.

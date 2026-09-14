# Cirrus — accounts

Every seeded account uses the password `deku-demo-pw-2026`.

| Account | Role | House |
|---|---|---|
| `producer@example.com` | producer | `cirrus` (the house this deployment publishes) |
| `producer.meridian@example.com` | producer | `meridian` |
| `viewer@example.com` | viewer | none |

Sign in at `/studio/login`. A viewer account can read the public site and
nothing more: every `/api/studio/` endpoint refuses it.

Signup at `/signup` is open and always issues a viewer with no house.

There is no other way in: no admin account, no seeded secret.

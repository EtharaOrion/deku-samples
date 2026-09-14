# Vela storefront — how to sign in

## Accounts

Both seeded accounts use the same password.

| Email | Name | Password |
|---|---|---|
| `customer@example.com` | Iris Vantaa | `deku-demo-pw-2026` |
| `customer2@example.com` | Rune Halden | `deku-demo-pw-2026` |

Sign in at `/sign-in`. Signup is open at `/sign-up` and needs no invitation.

## Guest checkout

No account is needed to buy. Check out as a guest and the order confirmation is
reachable afterwards by its access token, from the link shown after placing.

## Seeded camera serials

| Serial | Model | State |
|---|---|---|
| `VC2609PVDA7Q` | Vela Cricket, Graphite | registered to `customer@example.com`, running 7.0 |
| `VA2609NRWB2Z` | Vela A1, Sand | registered to `customer2@example.com`, running 2.4 |
| `VA2609KTMHX4` | Vela A1, Graphite | sold, no owner |
| `VC2609WJ3DKT` | Vela Cricket, Yellow | blocked (`reported_stolen`) |

## Notes

- The password above is benchmark fixture data, not a secret.
- `/api/health` returns `200` once the app has applied its schema and seed.

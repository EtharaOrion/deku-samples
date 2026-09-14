# Vela storefront — accounts

Both seeded accounts use the same password. It is benchmark fixture data, not a secret.

| Email | Name | Password |
|---|---|---|
| `customer@example.com` | Iris Vantaa | `deku-demo-pw-2026` |
| `customer2@example.com` | Rune Halden | `deku-demo-pw-2026` |

Sign in at `/sign-in`. Signup is open at `/sign-up`. Guest checkout needs no account.

## Seeded order

`VE-2026-0001` belongs to `customer@example.com` and is confirmed and delivered.

## Seeded cameras

| Serial | Camera | State |
|---|---|---|
| `VC2609PVDA7Q` | Vela Cricket, Graphite | registered to `customer@example.com` |
| `VA2609NRWB2Z` | Vela A1, Sand | registered to `customer2@example.com` |
| `VA2609KTMHX4` | Vela A1, Graphite | sold, no owner (register it from `/account/cameras`) |
| `VC2609WJ3DKT` | Vela Cricket, Yellow | blocked (`reported_stolen`) |

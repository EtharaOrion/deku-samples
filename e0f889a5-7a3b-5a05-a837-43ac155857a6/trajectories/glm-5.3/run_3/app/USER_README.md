# Vela storefront — how to sign in

## Customer accounts

Both seeded accounts use the same password.

| Email | Name | Password |
|---|---|---|
| `customer@example.com` | Iris Vantaa | `deku-demo-pw-2026` |
| `customer2@example.com` | Rune Halden | `deku-demo-pw-2026` |

Sign in at `/sign-in`. Guest checkout needs no account: the graded journey
checks out as a guest at `customer@example.com` without signing in.

## Seeded fixtures worth knowing

- Order `VE-2026-0001` belongs to `customer@example.com` (confirmed, fulfilled).
- Serial `VC2609PVDA7Q` (Vela Cricket, Graphite) is registered to `customer@example.com`.
- Serial `VA2609NRWB2Z` (Vela A1, Sand) is registered to `customer2@example.com`.
- Serial `VA2609KTMHX4` (Vela A1, Graphite) is sold but unregistered.
- Serial `VC2609WJ3DKT` (Vela Cricket, Yellow) is blocked (`reported_stolen`).

There is no staff console and no other credential of any kind.

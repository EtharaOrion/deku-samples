# Vela storefront — sign in

Signup is open. Two accounts are seeded so the ownership boundary between
customers is real.

**Every seeded account uses the same password: `deku-demo-pw-2026`**

| Email | Name | Notes |
|---|---|---|
| `customer@example.com` | Iris Vantaa | Owns serial `VC2609PVDA7Q` from order `VE-2026-0001` |
| `customer2@example.com` | Rune Halden | Owns serial `VA2609NRWB2Z` |

Sign in at `/sign-in` with an address and the password above. Guest checkout
needs no account at all.

## Useful seeded records

- Order `VE-2026-0001` — confirmed and fulfilled, belongs to
  `customer@example.com`, one `VELA-CRICKET-GRAPHITE` at `29900`, tax `2990`,
  total `32890`.
- Serial `VA2609KTMHX4` — a `Vela A1` in Graphite, sold but not yet
  registered, so it can be registered by any signed-in customer.
- Serial `VC2609WJ3DKT` — blocked, reason `reported_stolen`.

## Endpoints

- `GET /api/health` returns `200` once the app is ready.
- The HTTP API is on the same origin under `/api`.

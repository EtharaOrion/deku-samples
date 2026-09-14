# Cirrus — accounts

The app creates its schema and seeds its data on startup; no manual steps.

All seeded accounts use the password:

    deku-demo-pw-2026

| Account | Role | House | Where it signs in |
|---|---|---|---|
| `producer@example.com` | producer | `cirrus` | `/studio/login` |
| `producer.meridian@example.com` | producer | `meridian` | `/studio/login` |
| `viewer@example.com` | viewer | none | `/studio/login` |

- A producer reaches the studio palette at `/studio` and works inside their own
  house only. A producer of `meridian` is answered "not found" for any record of
  `cirrus`, at every studio address.
- A viewer can read everything public and nothing else: every `/api/studio/`
  call with a viewer token is refused by the server.
- Signup at `/signup` is open and always creates a viewer with no house.
- Sign out from the studio palette (`SIGN OUT`); `/studio` is unreachable at
  once afterwards.

## Local development

The container serves on `0.0.0.0:4173` (`APP_PUBLIC_PORT` maps to it from
outside). `GET /api/health` answers `200` once the roster can be read.
`DATABASE_URL` addresses the PostgreSQL instance; no other service is used.

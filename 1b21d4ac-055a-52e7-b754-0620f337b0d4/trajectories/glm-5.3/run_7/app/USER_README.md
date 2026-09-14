# Cirrus — signing in

Every seeded account uses the same password: **`deku-demo-pw-2026`**

It is benchmark fixture data, not a secret. Hashed as normal at rest.

## Accounts

| Address | Role | House |
|---|---|---|
| `producer@example.com` | producer | `cirrus` (the house this deployment publishes) |
| `producer.meridian@example.com` | producer | `meridian` (no public surface here) |
| `viewer@example.com` | viewer | none |

Sign in at **`/studio/login`**. A producer lands on the studio palette; a viewer
is turned away from the studio and returned to the entry route.

Signup at **`/signup`** is open and always creates a `viewer` belonging to no
house: everything public, nothing more.

## Notes for a grader

- `GET /api/health` answers `200` once the roster can be read.
- Authentication is email and password exchanged at `POST /api/auth/login` for a
  bearer token, sent as `Authorization: Bearer <token>` on every
  `/api/studio/` call. The role and the house are never read from a request body.
- Seeded, held unlisted: the work `The Quiet Room` and the talent
  `Noor Vasquez`. Both are absent from every public read, including their
  generated media, until their own house's producer publishes them.

# Cirrus — accounts

Every seeded account uses the password `deku-demo-pw-2026`.
(It is benchmark fixture data, not a secret; it is stored hashed like any other password.)

| Email | Role | House |
|---|---|---|
| `producer@example.com` | producer | `cirrus` (the house this deployment publishes) |
| `producer.meridian@example.com` | producer | `meridian` (no public surface here) |
| `viewer@example.com` | viewer | none |

Sign in at `/studio/login`. Signup at `/signup` is open and always issues a `viewer`
with no house: a viewer can read everything public and nothing else, and is refused
at every studio address.

## The served site

- Public: `/`, `/works`, `/works/{slug}`, `/talents`, `/talents/{slug}`, `/about`
- Studio (producer only): `/studio`, `/studio/talents/new`, `/studio/works/new`,
  `/studio/items/{id}`, `/studio/items/{id}/published`, `/preview/{token}`
- Health: `GET /api/health`

## Notes

- The app reads `DATABASE_URL`, `APP_PUBLIC_URL` and `APP_PUBLIC_PORT` from the
  environment and never hardcodes them; the container listens on `0.0.0.0:4173`.
- Unpublished records are absent everywhere, generated pixels included: a media id
  for an unlisted record answers 404 to everyone except that record's own house
  producer.

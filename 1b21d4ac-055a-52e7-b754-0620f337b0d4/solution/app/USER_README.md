# Cirrus

A production house for picture and its makers.

This deployment publishes the house `cirrus`. A second house, `meridian`, exists
because its producer signs in to the same studio; it has no public surface here.

## Accounts

Every seeded account uses the same password.

| Email | Password | Role | House |
| --- | --- | --- | --- |
| `producer@example.com` | `deku-demo-pw-2026` | `producer` | `cirrus` |
| `producer.meridian@example.com` | `deku-demo-pw-2026` | `producer` | `meridian` |
| `viewer@example.com` | `deku-demo-pw-2026` | `viewer` | none |

The password is benchmark fixture data, not a secret. Sign in at `/studio/login`.

## What each role reaches

- A **producer** reaches `/studio` and sees only their own house's records.
  Asking for another house's record is answered exactly as a record that does
  not exist, at every studio address, reads included.
- A **viewer** is refused at the studio page and at every `/api/studio/`
  endpoint alike. A viewer can read everything a signed-out visitor can read,
  and nothing more.
- **`/signup`** is open and always creates a `viewer` belonging to no house,
  whatever the request body asks for.

## Public routes

| Route | What it is |
| --- | --- |
| `/` | the entry cluster |
| `/works` | the numbered work index |
| `/works/{slug}` | one film |
| `/talents` | the roster and its discipline filter |
| `/talents/{slug}` | one talent |
| `/about` | the house speaking |
| `/preview/{token}` | one unlisted record, for its own house's producer only |

## API

The JSON API is on the same origin under `/api`. `GET /api/health` answers `200`
once the roster can be read. Every `/api/studio/` endpoint requires a bearer
token from `POST /api/auth/login`; nothing else does.
